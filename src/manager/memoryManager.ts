import { IConnectData, IPublishData, QoSType } from '../interface';
import { encodePublishPacket } from '../parse';
import { ClientIdentifierManager, Manager, TClient, TClientSubscription, TIdentifier, TSubscribeData, TTopic } from './manager';

interface IRoute {
	[key: string]: {
		clients: Map<TClient, TTopic>;
		child?: IRoute;
	};
}

interface ISessionData {
	subscription: TClientSubscription;
	sessionExpiryInterval: number;
	expireAt?: number;
}

/**
 * In-memory MQTT client and session manager backed by a topic trie for subscription routing.
 *
 * Features:
 * - Route-based topic matching via a trie (`+` single-level, `#` multi-level)
 * - Session persistence with optional expiry after disconnect when `sessionExpiryInterval` is greater than 0
 * - Retain messages with TTL and periodic cleanup
 * - Shared subscriptions: round-robin selection per group using an internal cursor map
 * - Timers: retain cleanup (~1 min), keep-alive expiry (~1 s), session cleanup (~10 s)
 */
export class MemoryManager extends Manager {
	readonly clientIdentifierManager: ClientIdentifierManager;
	private readonly retainMessage = new Map<string, { data: IPublishData; TTL: number }>();
	private readonly connectDataMap = new Map<TClient, { data: IConnectData; expire: number }>();
	private readonly sessionStore = new Map<string, ISessionData>();
	private readonly retainCleanupTimer: NodeJS.Timeout;
	private readonly keepAliveTimer: NodeJS.Timeout;
	private readonly sessionCleanupTimer: NodeJS.Timeout;

	private readonly clientDataMap = new Map<
		TClient,
		{
			subscription: TClientSubscription;
		}
	>();
	private route: IRoute = {};
	private readonly sharedCursor = new Map<string, number>();

	/**
	 * Creates the manager, wires {@link ClientIdentifierManager}, and starts retain, keep-alive, and session cleanup intervals.
	 */
	constructor() {
		super();
		this.clientIdentifierManager = new ClientIdentifierManager();

		this.retainCleanupTimer = setInterval(() => {
			const timestamp = Math.floor(Date.now() / 1000);
			this.retainMessage.forEach((value, key) => {
				if (timestamp > value.TTL) {
					this.retainMessage.delete(key);
				}
			});
		}, 1000 * 60);

		this.keepAliveTimer = setInterval(() => {
			const timestamp = Math.floor(Date.now() / 1000);
			this.connectDataMap.forEach((value, key) => {
				if (timestamp > value.expire) {
					this.disconnect(key);
				}
			});
		}, 1000);

		this.sessionCleanupTimer = setInterval(() => {
			const timestamp = Math.floor(Date.now() / 1000);
			this.sessionStore.forEach((session, identifier) => {
				if (session.expireAt !== undefined && timestamp > session.expireAt) {
					this.clearSubscribeBySession(identifier);
					this.sessionStore.delete(identifier);
				}
			});
		}, 1000 * 10);
	}

	/**
	 * Clears all periodic timers used by this manager.
	 *
	 * @returns Resolves when cleanup is complete.
	 */
	public override async dispose(): Promise<void> {
		clearInterval(this.retainCleanupTimer);
		clearInterval(this.keepAliveTimer);
		clearInterval(this.sessionCleanupTimer);
	}

	/**
	 * Resolves the live socket for a client identifier, if connected.
	 *
	 * @param clientIdentifier - MQTT client id string.
	 * @returns The client socket, or `undefined` if unknown.
	 */
	getClient(clientIdentifier: TIdentifier) {
		return this.clientIdentifierManager.getIdentifier(clientIdentifier);
	}

	isConnected(key: TClient): Promise<boolean>;
	isConnected(key: TIdentifier): Promise<boolean>;
	/**
	 * Returns whether the given client socket or client id currently has an active in-memory session.
	 *
	 * @param key - Connected socket or client identifier string.
	 * @returns `true` if the client is tracked in the in-memory client map.
	 */
	async isConnected(key: TClient | TIdentifier): Promise<boolean> {
		if (typeof key === 'string') {
			const client = this.clientIdentifierManager.getIdentifier(key);
			if (client) {
				return this.clientDataMap.has(client);
			}
			return false;
		} else {
			return this.clientDataMap.has(key);
		}
	}

	/**
	 * Registers a new connection: maps the identifier to the socket, initializes or restores session state, and updates the session store.
	 *
	 * If a persisted session exists and `cleanStart` is false, subscriptions are restored into the trie; otherwise a fresh subscription map is created.
	 *
	 * @param clientIdentifier - MQTT client id.
	 * @param connData - CONNECT packet payload (keep-alive, flags, properties).
	 * @param client - Underlying TCP socket.
	 */
	public async connect(clientIdentifier: string, connData: IConnectData, client: TClient): Promise<void> {
		this.clientIdentifierManager.set(clientIdentifier, client);
		this.connectDataMap.set(client, { data: connData, expire: Date.now() / 1000 + connData.header.keepAlive * 1.5 });

		const existingSession = this.sessionStore.get(clientIdentifier);
		if (existingSession && !connData.connectFlags.cleanStart) {
			existingSession.expireAt = undefined;
			this.clientDataMap.set(client, { subscription: existingSession.subscription });
			existingSession.subscription.forEach((_data, topic) => {
				this.addRouteForClient(client, topic);
			});
		} else {
			this.clientDataMap.set(client, { subscription: new Map() });
		}

		const sessionExpiryInterval = connData.properties?.sessionExpiryInterval ?? 0;
		this.sessionStore.set(clientIdentifier, {
			subscription: this.clientDataMap.get(client)!.subscription,
			sessionExpiryInterval,
		});
	}

	/**
	 * Refreshes the keep-alive deadline for a connected client (extends expiry by `keepAlive * 1.5` seconds).
	 *
	 * @param clientIdentifier - MQTT client id.
	 */
	public async ping(clientIdentifier: string): Promise<void> {
		const client = this.clientIdentifierManager.getIdentifier(clientIdentifier);
		if (client) {
			const connData = this.connectDataMap.get(client);
			if (connData) {
				connData.expire = Date.now() / 1000 + connData.data.header.keepAlive * 1.5;
			}
		}
	}

	/**
	 * Tears down a connection: removes keep-alive tracking and either schedules session expiry or fully clears subscriptions and session.
	 *
	 * When `sessionExpiryInterval` is greater than 0, routes are removed and `expireAt` is set; otherwise subscriptions and session row are deleted immediately.
	 *
	 * @param clientIdentifier - Client id string or connected socket.
	 */
	public clearConnect(clientIdentifier: TClient | TIdentifier): void {
		const identifier = typeof clientIdentifier === 'string' ? clientIdentifier : this.clientIdentifierManager.getClient(clientIdentifier)?.identifier;
		const client = typeof clientIdentifier === 'string' ? this.clientIdentifierManager.getIdentifier(clientIdentifier) : clientIdentifier;
		if (client && identifier) {
			this.clearPendingClient(client);
			this.connectDataMap.delete(client);

			const session = this.sessionStore.get(identifier);
			if (session && session.sessionExpiryInterval > 0) {
				this.removeRouteForClient(client);
				this.clientDataMap.delete(client);
				session.expireAt = Math.floor(Date.now() / 1000) + session.sessionExpiryInterval;
			} else {
				this.clearSubscribe(identifier);
				this.sessionStore.delete(identifier);
			}

			this.clientIdentifierManager.delete(client);
		}
	}

	/**
	 * Returns whether a non-expired session row exists for the client id (may be disconnected but not past `expireAt`).
	 *
	 * @param clientIdentifier - MQTT client id.
	 * @returns `true` if session metadata is present and not expired; stale rows are removed and yield `false`.
	 */
	public async hasSession(clientIdentifier: string): Promise<boolean> {
		const session = this.sessionStore.get(clientIdentifier);
		if (!session) return false;
		if (session.expireAt !== undefined && Math.floor(Date.now() / 1000) > session.expireAt) {
			this.sessionStore.delete(clientIdentifier);
			return false;
		}
		return true;
	}

	/**
	 * Inserts the client's subscription topic filter into the trie so publish matching can find this client.
	 *
	 * @param client - Connected socket.
	 * @param topic - Topic filter string (path segments separated by `/`).
	 */
	private addRouteForClient(client: TClient, topic: string) {
		const nodes = topic.split('/');
		function push(nodeList: Array<string>, index: number, route: IRoute) {
			if (!route[nodeList[index]]) {
				route[nodeList[index]] = { clients: new Map() };
			}
			if (nodeList.length === index + 1) {
				route[nodeList[index]].clients.set(client, topic);
			} else {
				const cur = route[nodeList[index]];
				if (!cur.child) cur.child = {};
				push(nodeList, index + 1, cur.child);
			}
		}
		push(nodes, 0, this.route);
	}

	/**
	 * Removes this client from every trie node (and prunes empty branches).
	 *
	 * @param client - Connected socket.
	 */
	private removeRouteForClient(client: TClient) {
		const removeFromRoute = (route: IRoute) => {
			for (const key of Object.keys(route)) {
				route[key].clients.delete(client);
				if (route[key].child) {
					removeFromRoute(route[key].child!);
				}
				if (!Object.keys(route[key].child ?? {}).length && !route[key].clients.size) {
					delete route[key];
				}
			}
		};
		removeFromRoute(this.route);
	}

	/**
	 * Clears subscription entries in the session store when the session expires (timer-driven), without touching live sockets.
	 *
	 * @param identifier - MQTT client id.
	 */
	private clearSubscribeBySession(identifier: string) {
		const session = this.sessionStore.get(identifier);
		if (session) {
			session.subscription.clear();
		}
	}

	/**
	 * Unsubscribes all topics for the client id and drops local subscription state.
	 *
	 * @param clientIdentifier - MQTT client id.
	 */
	public async clearSubscribe(clientIdentifier: string): Promise<void> {
		const client = this.clientIdentifierManager.getIdentifier(clientIdentifier);
		if (client) {
			this.clientDataMap.get(client)?.subscription.forEach((_value, key) => {
				this.unsubscribe(clientIdentifier, key);
			});

			this.clientDataMap.delete(client);
		}
	}

	/**
	 * Records a subscription for the client and adds the topic filter to the trie.
	 *
	 * @param clientIdentifier - MQTT client id.
	 * @param topic - Topic filter.
	 * @param data - Subscription options (QoS, flags, shared group, etc.).
	 */
	public async subscribe(clientIdentifier: string, topic: string, data: TSubscribeData): Promise<void> {
		const client = this.clientIdentifierManager.getIdentifier(clientIdentifier);
		if (client) {
			if (this.clientDataMap.has(client)) {
				this.clientDataMap.get(client)?.subscription.set(topic, data);
			}

			function push(nodes: Array<string>, index: number, route: IRoute) {
				if (!route[nodes[index]]) {
					route[nodes[index]] = {
						clients: new Map(),
					};
				}
				const currentRouter = route[nodes[index]];
				if (nodes.length === index + 1) {
					if (client) {
						route[nodes[index]].clients.set(client, topic);
					}
				} else {
					if (!currentRouter.child) {
						currentRouter.child = {};
					}
					push(nodes, index + 1, currentRouter.child);
				}
			}

			const nodes = topic.split('/');
			push(nodes, 0, this.route);
		}
	}

	/**
	 * Removes one subscription from the client map and prunes the trie along that topic path.
	 *
	 * @param clientIdentifier - MQTT client id.
	 * @param topic - Topic filter to remove.
	 */
	public async unsubscribe(clientIdentifier: string, topic: string): Promise<void> {
		const client = this.clientIdentifierManager.getIdentifier(clientIdentifier);
		if (client) {
			if (this.clientDataMap.has(client)) {
				this.clientDataMap.get(client)?.subscription.delete(topic);
			}
			function pop(nodes: Array<string>, index: number, route: IRoute) {
				const currentRouter = route[nodes[index]];
				if (currentRouter) {
					if (nodes.length === index + 1 && route[nodes[index]]) {
						if (client) {
							route[nodes[index]].clients.delete(client);
						}
					} else if (currentRouter.child) {
						pop(nodes, index + 1, currentRouter.child);
					}

					if (!Object.keys(currentRouter.child ?? {}).length && !currentRouter.clients.size) {
						delete route[nodes[index]];
					}
				}
			}
			const nodes = topic.split('/');
			pop(nodes, 0, this.route);
		}
	}

	/**
	 * Fan-out: matches `topic` against the trie (`+` / `#`), applies no-local and shared-subscription rules, encodes PUBLISH packets, and writes to subscribers.
	 *
	 * Shared groups pick one subscriber per group via round-robin; QoS is the minimum of subscription and publish QoS.
	 *
	 * @param clientIdentifier - Publisher's client id (used for no-local checks).
	 * @param topic - Publish topic name.
	 * @param pubData - PUBLISH payload and headers.
	 */
	public publish(clientIdentifier: string, topic: string, pubData: IPublishData) {
		const pubClient = this.getClient(clientIdentifier);
		const matchedByClient = new Map<TClient, TSubscribeData[]>();
		const putMatch = (client: TClient, subFlags: TSubscribeData) => {
			const list = matchedByClient.get(client) ?? [];
			list.push(subFlags);
			matchedByClient.set(client, list);
		};

		const match = (nodes: Array<string>, index: number, route: IRoute) => {
			for (const node of [nodes[index], '+']) {
				const currentRoute = route[node];
				if (currentRoute) {
					if (nodes.length === index + 1) {
						currentRoute.clients.forEach((topic, client) => {
							const data = this.clientDataMap.get(client)?.subscription.get(topic);
							if (data) {
								putMatch(client, data);
							}
						});

						if (nodes.length == index + 1 && route[nodes[index]]) {
							const childRoute = route[nodes[index]].child;
							if (childRoute && childRoute['#']) {
								childRoute['#'].clients.forEach((topic, client) => {
									const data = this.clientDataMap.get(client)?.subscription.get(topic);
									if (data) {
										putMatch(client, data);
									}
								});
							}
						}
					} else if (currentRoute.child) {
						match(nodes, index + 1, currentRoute.child);
					}
				}
			}
			// `#` at this level matches the rest of the topic in one step
			if (route['#']) {
				route['#'].clients.forEach((topic, client) => {
					const data = this.clientDataMap.get(client)?.subscription.get(topic);
					if (data) {
						putMatch(client, data);
					}
				});
			}
		};
		const nodes = topic.split('/');
		match(nodes, 0, this.route);
		for (const [client, subscriptions] of matchedByClient.entries()) {
			const candidates = subscriptions.filter((sub) => !(sub.noLocal && client === pubClient));
			if (!candidates.length) {
				continue;
			}
			const common = candidates.filter((sub) => !sub.sharedGroup);
			const sharedBuckets = new Map<string, TSubscribeData[]>();
			for (const sub of candidates) {
				if (!sub.sharedGroup) continue;
				const key = sub.sharedGroup;
				const list = sharedBuckets.get(key) ?? [];
				list.push(sub);
				sharedBuckets.set(key, list);
			}
			const selected: TSubscribeData[] = [...common];
			for (const [group, list] of sharedBuckets.entries()) {
				if (!list.length) continue;
				const cursor = this.sharedCursor.get(group) ?? 0;
				selected.push(list[cursor % list.length]);
				this.sharedCursor.set(group, (cursor + 1) % list.length);
			}
			const distributeData: IPublishData = JSON.parse(JSON.stringify(pubData));
			if (distributeData.properties.messageExpiryTimestamp && Date.now() > distributeData.properties.messageExpiryTimestamp) {
				continue;
			}
			const minQoS = Math.min(...selected.map((sub) => sub.qos || 0), pubData.header.qosLevel);
			if (minQoS > QoSType.QoS0) {
				distributeData.header.packetIdentifier = this.newPacketIdentifier(client);
				distributeData.header.dupFlag = false;
			} else {
				delete distributeData.header.packetIdentifier;
			}
			distributeData.header.qosLevel = minQoS;
			distributeData.header.retain = selected.some((sub) => sub.retainAsPublished) ? distributeData.header.retain : false;
			const identifiers = selected
				.flatMap((sub) =>
					Array.isArray(sub.subscriptionIdentifier) ? sub.subscriptionIdentifier : sub.subscriptionIdentifier !== undefined ? [sub.subscriptionIdentifier] : [],
				)
				.filter((value, index, arr) => arr.indexOf(value) === index);
			if (identifiers.length) {
				distributeData.properties.subscriptionIdentifier = identifiers;
			} else {
				delete distributeData.properties.subscriptionIdentifier;
			}
			const protocolVersion = selected[0].protocolVersion;
			const pubPacket = encodePublishPacket(distributeData, protocolVersion);
			client.write(pubPacket);
			if (minQoS > QoSType.QoS0 && distributeData.header.packetIdentifier !== undefined) {
				this.registerPendingPacket(client, distributeData.header.packetIdentifier, pubPacket, 'publish');
			}
		}
	}

	/**
	 * Returns whether the client has an active subscription entry for the exact topic filter string.
	 *
	 * @param clientIdentifier - MQTT client id.
	 * @param topic - Topic filter to check.
	 * @returns `true` if the subscription map contains `topic`.
	 */
	public async isSubscribe(clientIdentifier: string, topic: string) {
		const client = this.clientIdentifierManager.getIdentifier(clientIdentifier);
		if (client) {
			return !!this.clientDataMap.get(client)?.subscription.has(topic);
		}
		return false;
	}

	/**
	 * Returns subscription options for a topic filter, if present.
	 *
	 * @param clientIdentifier - MQTT client id.
	 * @param topic - Topic filter.
	 * @returns The stored {@link TSubscribeData}, or `undefined`.
	 */
	public async getSubscription(clientIdentifier: TIdentifier, topic: string): Promise<TSubscribeData | undefined> {
		const client = this.clientIdentifierManager.getIdentifier(clientIdentifier);
		if (client) {
			return this.clientDataMap.get(client)?.subscription.get(topic);
		}
		return undefined;
	}

	/**
	 * Stores or updates a retained message for a topic with an optional TTL (seconds); may derive `messageExpiryTimestamp` from `messageExpiryInterval`.
	 *
	 * @param topic - Topic name for the retain entry.
	 * @param pubData - PUBLISH payload to retain.
	 * @param retainTTL - Seconds until retain entry expires (default 3600).
	 */
	public async addRetainMessage(topic: string, pubData: IPublishData, retainTTL?: number) {
		if (pubData.properties.messageExpiryInterval && !pubData.properties.messageExpiryTimestamp) {
			pubData.properties.messageExpiryTimestamp = Date.now() + pubData.properties.messageExpiryInterval * 1000;
		}
		this.retainMessage.set(topic, {
			TTL: Math.floor(Date.now() / 1000) + (retainTTL ?? 3600),
			data: pubData,
		});
	}

	/**
	 * Removes the retained message for a topic, if any.
	 *
	 * @param topic - Topic name.
	 */
	public async deleteRetainMessage(topic: string) {
		this.retainMessage.delete(topic);
	}

	/**
	 * Returns the retained payload for a topic if the store entry is still within TTL and message expiry.
	 *
	 * @param topic - Topic name.
	 * @returns Retained {@link IPublishData}, or `undefined` if missing or expired.
	 */
	public async getRetainMessage(topic: string) {
		const ratainData: any = this.retainMessage.get(topic);
		if (ratainData && ratainData.TTL > Math.floor(Date.now() / 1000)) {
			if (ratainData.data?.properties?.messageExpiryTimestamp && Date.now() > ratainData.data.properties.messageExpiryTimestamp) {
				this.retainMessage.delete(topic);
				return undefined;
			}
			return this.retainMessage.get(topic)?.data;
		}
		return undefined;
	}

	/**
	 * Iterates retained messages that are still valid, invoking the callback for each; skips and deletes per-message expiry violations.
	 *
	 * @param callbackfn - Async handler receiving `(topic, data)` for each retained message.
	 */
	public async forEachRetainMessage(callbackfn: (topic: string, data: IPublishData) => Promise<void>) {
		const nowDate = Math.floor(Date.now() / 1000);
		for (const [key, value] of this.retainMessage.entries()) {
			if (value.TTL > nowDate) {
				if (value.data?.properties?.messageExpiryTimestamp && Date.now() > value.data.properties.messageExpiryTimestamp) {
					this.retainMessage.delete(key);
					continue;
				}
				await callbackfn(key, value.data);
			}
		}
	}
}
