import Redis, { RedisOptions } from 'ioredis';
import { ClientIdentifierManager, Manager, TClient, TClientSubscription, TIdentifier, TSubscribeData, TTopic } from './manager';
import { IConnectData, IPublishData, QoSType } from '../interface';
import { topicToRegEx } from '../topicFilters';
import { encodePublishPacket } from '../parse';

/**
 * In-memory index of MQTT topic subscriptions: which clients are subscribed to which topics,
 * and subscription flags per (client, topic). Used alongside Redis for publish fan-out.
 */
class SubscribeManager {
	private topicsMap = new Map<string, Set<string>>();
	private clientIdentifierMap = new Map<string, TClientSubscription>();

	/**
	 * Registers a client's subscription to a topic and stores subscription options.
	 *
	 * @param clientIdentifier - Logical client id (same as elsewhere in the manager).
	 * @param topic - MQTT topic filter string.
	 * @param data - Subscription flags (QoS, shared group, etc.).
	 */
	subscribe(clientIdentifier: string, topic: string, data: TSubscribeData) {
		const getClientIdentifierSet = this.topicsMap.get(topic);
		if (getClientIdentifierSet) {
			getClientIdentifierSet.add(clientIdentifier);
		} else {
			this.topicsMap.set(topic, new Set([clientIdentifier]));
		}

		const getClientTopicMap = this.clientIdentifierMap.get(clientIdentifier);
		if (getClientTopicMap) {
			getClientTopicMap.set(topic, data);
		} else {
			this.clientIdentifierMap.set(clientIdentifier, new Map([[topic, data]]));
		}
	}

	/**
	 * Removes a client's subscription to a topic and prunes empty maps/sets.
	 *
	 * @param clientIdentifier - Client id to remove from the topic.
	 * @param topic - Topic filter to unsubscribe from.
	 */
	unsubscribe(clientIdentifier: string, topic: string) {
		this.topicsMap.get(topic)?.delete(clientIdentifier);
		this.topicsMap.get(topic)?.size === 0 && this.topicsMap.delete(topic);
		this.clientIdentifierMap.get(clientIdentifier)?.delete(topic);
		this.clientIdentifierMap.get(clientIdentifier)?.size === 0 && this.clientIdentifierMap.delete(clientIdentifier);
	}

	/**
	 * @param clientIdentifier - Client id.
	 * @param topic - Topic filter.
	 * @returns Whether the client has an active subscription entry for the topic.
	 */
	isSubscribe(clientIdentifier: string, topic: string) {
		return !!this.topicsMap.get(topic)?.has(clientIdentifier);
	}

	/**
	 * @param clientIdentifier - Client id.
	 * @param topic - Topic filter.
	 * @returns Stored subscription data, or undefined if not subscribed.
	 */
	getSubscribe(clientIdentifier: string, topic: string) {
		return this.clientIdentifierMap.get(clientIdentifier)?.get(topic);
	}

	/**
	 * Removes all topic subscriptions for a client by repeatedly calling {@link unsubscribe}.
	 *
	 * @param clientIdentifier - Client id whose subscriptions should be cleared.
	 */
	clearSubscribe(clientIdentifier: string) {
		const getClientTopicMap = this.clientIdentifierMap.get(clientIdentifier);
		if (getClientTopicMap) {
			for (const key of getClientTopicMap.keys()) {
				this.unsubscribe(clientIdentifier, key);
			}
		}
	}

	/**
	 * Iterates subscribed topic filters that match the given topic name and invokes the callback
	 * for each (client, matched filter, subscription data) tuple.
	 *
	 * @param topic - Incoming PUBLISH topic name (not a filter).
	 * @param callbackfn - Async handler called per matching subscription.
	 */
	async getMatchTopic(topic: string, callbackfn: (clientIdentifier: string, matchTopic: string, data: TSubscribeData) => Promise<void>) {
		for (const [keyTopic, clientIdentifierSet] of this.topicsMap.entries()) {
			const reg = topicToRegEx(keyTopic);
			if (reg && new RegExp(reg).test(topic)) {
				for (const clientIdentifier of clientIdentifierSet) {
					const subData = this.clientIdentifierMap.get(clientIdentifier)?.get(keyTopic);
					if (subData) {
						await callbackfn(clientIdentifier, keyTopic, subData);
					}
				}
			}
		}
	}
}

/**
 * {@link Manager} implementation backed by Redis (ioredis): connection/session keys, retained
 * messages, and a single pub/sub channel `"publish"` to fan out publishes across processes.
 * Subscribes to `__keyevent@0__:expired` for connect keep-alive expiry when keyspace notifications are enabled.
 */
export class RedisManager extends Manager {
	clientIdentifierManager: ClientIdentifierManager;
	private subscribeManager = new SubscribeManager();
	private redis: Redis;
	private redisSub: Redis;

	/**
	 * Creates Redis connections for data and pub/sub, registers {@link ClientIdentifierManager},
	 * and wires {@link redisMessage} for `"publish"` and key expiry events.
	 *
	 * @param options - Passed to both main and subscriber `ioredis` clients.
	 */
	constructor(options: RedisOptions) {
		super();
		this.redis = new Redis(options);
		this.redisSub = new Redis(options);
		this.clientIdentifierManager = new ClientIdentifierManager();
		this.redisSub.subscribe('publish');
		// Keyspace expiry notifications require `notify-keyspace-events Ex` in redis.conf
		this.redisSub.subscribe('__keyevent@0__:expired');
		this.redisMessage();
	}

	/**
	 * Handles incoming pub/sub messages: CONNECT keep-alive expiry via keyspace events, and
	 * cross-node publish fan-out on channel `"publish"`.
	 *
	 * @returns Resolves when the message listener is attached (listener runs asynchronously thereafter).
	 */
	async redisMessage() {
		this.redisSub.on('message', async (channel, message) => {
			switch (channel) {
				// Expired `connect:*` keys end the local socket when keep-alive TTL fires
				case '__keyevent@0__:expired': {
					if (message.startsWith('connect:')) {
						const clientIdentifier = message.substring('connect:'.length);
						const client = this.clientIdentifierManager.getIdentifier(clientIdentifier);
						if (client) {
							client.end();
						}
					}
					break;
				}

				case 'publish': {
					const { pubData, topic, clientIdentifier } = JSON.parse(message) as { pubData: IPublishData; topic: string; clientIdentifier: string };
					const matchedByClient = new Map<string, TSubscribeData[]>();
					await this.subscribeManager.getMatchTopic(topic, async (publishIdentifier: string, _matchTopic: string, subFlags: TSubscribeData) => {
						const list = matchedByClient.get(publishIdentifier) ?? [];
						list.push(subFlags);
						matchedByClient.set(publishIdentifier, list);
					});
					for (const [publishIdentifier, subscriptions] of matchedByClient.entries()) {
						try {
							const client = this.clientIdentifierManager.getIdentifier(publishIdentifier);
							if (!client) continue;
							const candidates = subscriptions.filter((sub) => !(sub.noLocal && publishIdentifier === clientIdentifier));
							if (!candidates.length) continue;
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
							for (const list of sharedBuckets.values()) {
								if (list.length) {
									selected.push(list[0]);
								}
							}
							const distributeData: IPublishData = JSON.parse(JSON.stringify(pubData));
							if (distributeData.properties.messageExpiryTimestamp && Date.now() > distributeData.properties.messageExpiryTimestamp) {
								continue;
							}
							const minQoS = Math.min(...selected.map((sub) => sub.qos || 0), pubData.header.qosLevel);
							if (minQoS > QoSType.QoS0) {
								distributeData.header.packetIdentifier = this.newPacketIdentifier(client);
								distributeData.header.dupFlag = false;
							}
							distributeData.header.qosLevel = minQoS;
							distributeData.header.retain = selected.some((sub) => sub.retainAsPublished) ? distributeData.header.retain : false;
							const identifiers = selected
								.flatMap((sub) =>
									Array.isArray(sub.subscriptionIdentifier)
										? sub.subscriptionIdentifier
										: sub.subscriptionIdentifier !== undefined
											? [sub.subscriptionIdentifier]
											: [],
								)
								.filter((value, index, arr) => arr.indexOf(value) === index);
							if (identifiers.length) {
								distributeData.properties.subscriptionIdentifier = identifiers;
							} else {
								delete distributeData.properties.subscriptionIdentifier;
							}
							const pubPacket = encodePublishPacket(distributeData, selected[0].protocolVersion);
							client.write(pubPacket);
							if (minQoS > QoSType.QoS0 && distributeData.header.packetIdentifier !== undefined) {
								this.registerPendingPacket(client, distributeData.header.packetIdentifier, pubPacket, 'publish');
							}
						} catch (error) {
							console.log('publish error:', error);
						}
					}
				}
			}
		});
	}

	/**
	 * @param clientIdentifier - Logical client id.
	 * @returns Redis key storing CONNECT payload JSON for keep-alive / presence.
	 */
	private connectKey(clientIdentifier: string) {
		return `connect:${clientIdentifier}`;
	}

	/**
	 * @param clientIdentifier - Logical client id.
	 * @returns Redis key marking an MQTT session (survives disconnect when session expiry is positive).
	 */
	private sessionKey(clientIdentifier: string) {
		return `session:${clientIdentifier}`;
	}

	/**
	 * @param key - Client id string, or live client object to resolve via {@link ClientIdentifierManager}.
	 * @returns Whether a `connect:*` key exists in Redis for that client.
	 */
	public async isConnected(key: TClient | TIdentifier): Promise<boolean> {
		if (typeof key === 'string') {
			return !!(await this.redis.exists(this.connectKey(key)));
		} else {
			const clientID = this.clientIdentifierManager.getClient(key);
			if (clientID) {
				return !!(await this.redis.exists(this.connectKey(clientID.identifier)));
			}
			return false;
		}
	}

	/**
	 * Persists CONNECT data, registers the live socket, refreshes session and connect TTLs.
	 *
	 * @param clientIdentifier - Logical client id.
	 * @param connData - Serialized CONNECT properties for Redis.
	 * @param client - Active TCP/WebSocket client.
	 */
	async connect(clientIdentifier: string, connData: IConnectData, client: TClient): Promise<void> {
		this.clientIdentifierManager.set(clientIdentifier, client);
		await this.redis.set(this.connectKey(clientIdentifier), JSON.stringify(connData));
		await this.redis.set(this.sessionKey(clientIdentifier), '1');
		if (connData.header.keepAlive) {
			await this.redis.expire(this.connectKey(clientIdentifier), connData.header.keepAlive * 1.5);
		}
		await this.redis.persist(this.sessionKey(clientIdentifier));
	}

	/**
	 * Refreshes the `connect:*` key TTL from stored keep-alive when the client sends traffic (e.g. PINGREQ).
	 *
	 * @param clientIdentifier - Logical client id.
	 */
	public async ping(clientIdentifier: string): Promise<void> {
		const data = await this.redis.get(this.connectKey(clientIdentifier));
		if (data) {
			const connData = JSON.parse(data) as IConnectData;
			if (connData.header.keepAlive) {
				await this.redis.expire(this.connectKey(clientIdentifier), connData.header.keepAlive * 1.5);
			}
		}
	}

	/**
	 * @param clientIdentifier - Logical client id.
	 * @param topic - Topic filter.
	 * @param data - Subscription flags.
	 */
	public async subscribe(clientIdentifier: string, topic: TTopic, data: TSubscribeData): Promise<void> {
		this.subscribeManager.subscribe(clientIdentifier, topic, data);
	}

	/**
	 * @param clientIdentifier - Logical client id.
	 * @param topic - Topic filter to remove.
	 */
	public async unsubscribe(clientIdentifier: string, topic: TTopic): Promise<void> {
		this.subscribeManager.unsubscribe(clientIdentifier, topic);
	}

	/**
	 * @param clientIdentifier - Logical client id whose in-memory subscriptions are dropped.
	 */
	public async clearSubscribe(clientIdentifier: string): Promise<void> {
		this.subscribeManager.clearSubscribe(clientIdentifier);
	}

	/**
	 * @param clientIdentifier - Logical client id.
	 * @param topic - Topic filter.
	 * @returns Whether the client is subscribed to the topic in the local index.
	 */
	public async isSubscribe(clientIdentifier: string, topic: TTopic): Promise<boolean> {
		return this.subscribeManager.isSubscribe(clientIdentifier, topic);
	}

	/**
	 * @param clientIdentifier - Logical client id.
	 * @returns Whether a `session:*` key exists in Redis.
	 */
	public async hasSession(clientIdentifier: string): Promise<boolean> {
		return !!(await this.redis.exists(`session:${clientIdentifier}`));
	}

	/**
	 * Tears down local pending state and Redis keys for a disconnect; may retain `session:*` with TTL
	 * when {@link IConnectData.properties.sessionExpiryInterval} is positive.
	 *
	 * @param clientIdentifier - Client id string or live client / identifier handle.
	 */
	public async clearConnect(clientIdentifier: TClient | TIdentifier): Promise<void> {
		const identifier = typeof clientIdentifier === 'string' ? clientIdentifier : this.clientIdentifierManager.getClient(clientIdentifier)?.identifier;
		const client = typeof clientIdentifier === 'string' ? this.clientIdentifierManager.getIdentifier(clientIdentifier) : clientIdentifier;
		if (client && identifier) {
			this.clearPendingClient(client);
			const connDataRaw = await this.redis.get(this.connectKey(identifier));
			const sessionExpiryInterval = connDataRaw ? ((JSON.parse(connDataRaw) as IConnectData).properties?.sessionExpiryInterval ?? 0) : 0;
			if (sessionExpiryInterval <= 0) {
				this.clearSubscribe(identifier);
				await this.redis.del(this.sessionKey(identifier));
			} else {
				await this.redis.expire(this.sessionKey(identifier), sessionExpiryInterval);
			}
			this.clientIdentifierManager.delete(client);

			await this.redis.del(this.connectKey(identifier));
		}
	}

	/**
	 * @param clientIdentifier - Client id string.
	 * @param topic - Topic filter.
	 * @returns Subscription data from the in-memory index, if any.
	 */
	public async getSubscription(clientIdentifier: TIdentifier, topic: string): Promise<TSubscribeData | undefined> {
		return this.subscribeManager.getSubscribe(clientIdentifier, topic);
	}

	/**
	 * Broadcasts a PUBLISH to all nodes by pushing JSON onto the shared `"publish"` Redis channel.
	 *
	 * @param clientIdentifier - Publisher's logical id (for no-local / routing).
	 * @param topic - Topic name.
	 * @param pubData - Full PUBLISH packet payload to distribute.
	 */
	public publish(clientIdentifier: string, topic: TTopic, pubData: IPublishData): void {
		this.redis.publish(
			'publish',
			JSON.stringify({
				clientIdentifier,
				topic,
				pubData,
			}),
		);
	}

	/**
	 * @param topic - Topic name used in the retain key.
	 * @returns Redis key `retain:{topic}`.
	 */
	private retainKey(topic: string) {
		return `retain:${topic}`;
	}

	/**
	 * Scans Redis for keys matching `retain:*` (legacy helper; callback currently ignores matches).
	 *
	 * @returns Result tuple from `SCAN` (cursor and key batch).
	 */
	async getRatain() {
		return await this.redis.scan(0, 'MATCH', 'retain:*', (err, _matchData) => {
			if (err) {
				// intentionally ignored
			}
		});
	}

	/**
	 * Stores a retained message under `retain:{topic}` with optional TTL.
	 *
	 * @param topic - Topic name.
	 * @param pubData - Payload to retain; may set absolute expiry from `messageExpiryInterval`.
	 * @param retainTTL - Redis TTL seconds for the key (default 24h).
	 */
	async addRetainMessage(topic: string, pubData: IPublishData, retainTTL?: number): Promise<void> {
		if (pubData.properties.messageExpiryInterval && !pubData.properties.messageExpiryTimestamp) {
			pubData.properties.messageExpiryTimestamp = Date.now() + pubData.properties.messageExpiryInterval * 1000;
		}
		this.redis.set(this.retainKey(topic), JSON.stringify(pubData));
		this.redis.expire(this.retainKey(topic), retainTTL ?? 3600 * 24);
	}

	/**
	 * @param topic - Topic whose retained message key should be deleted.
	 */
	async deleteRetainMessage(topic: string): Promise<void> {
		this.redis.del(this.retainKey(topic));
	}

	/**
	 * @param topic - Topic name.
	 * @returns Parsed retained payload, or undefined if missing or expired (expired keys are deleted).
	 */
	async getRetainMessage(topic: string): Promise<IPublishData | undefined> {
		const ratainData = await this.redis.get(this.retainKey(topic));
		const data = ratainData ? (JSON.parse(ratainData) as IPublishData) : undefined;
		if (data?.properties?.messageExpiryTimestamp && Date.now() > data.properties.messageExpiryTimestamp) {
			await this.redis.del(this.retainKey(topic));
			return undefined;
		}
		return data;
	}

	/**
	 * Loads every `retain:*` key from the initial SCAN batch and invokes the callback per non-expired message.
	 *
	 * @param callbackfn - Called with topic name (without `retain:` prefix) and payload.
	 */
	async forEachRetainMessage(callbackfn: (topic: string, data: IPublishData) => Promise<void>): Promise<void> {
		const allRatainData = await this.getRatain();

		for (const key of allRatainData[1]) {
			const topic = key.substring('retain:'.length);
			const data = await this.redis.get(key);
			const pubData = data ? JSON.parse(data) : undefined;
			if (pubData) {
				if (pubData.properties?.messageExpiryTimestamp && Date.now() > pubData.properties.messageExpiryTimestamp) {
					await this.redis.del(key);
					continue;
				}
				await callbackfn(topic, pubData);
			}
		}
	}

	/**
	 * Closes the pub/sub and main Redis connections.
	 *
	 * @returns Resolves when both clients have quit.
	 */
	public override async dispose(): Promise<void> {
		await this.redisSub.quit();
		await this.redis.quit();
	}
}
