import { Socket } from 'net';
import { IConnectData, IPublishData, QoSType } from '../interface';
import { ClientIdentifierManager, Manager, TClient, TClientSubscription, TIdentifier, TSubscribeData } from './manager';
import Redis, { RedisOptions } from 'ioredis';
import { isWildcardTopic, topicToRegEx } from '../topicFilters';
import { encodePublishPacket } from '../parse';

/**
 * Converts an MQTT subscription topic filter into a Redis `SUBSCRIBE` / `PSUBSCRIBE` pattern.
 * Wildcard segments are mapped so Redis glob-style matching approximates MQTT topic matching.
 *
 * @param topic - MQTT topic filter (may include `+` and `#`).
 * @returns Pattern string for Redis subscription.
 */
export function mqttTopicToRedisSubTopic(topic: string) {
	if (!isWildcardTopic(topic)) {
		return topic;
	}
	if (topic === '#') {
		return '*';
	}
	if (topic === '/#') {
		return '/*';
	}
	if (topic === '+') {
		return '[^/]*';
	}
	topic = topic.replace(/\/#$/, '*');
	topic = topic.replace(/\[/g, '[');
	topic = topic.replace(/\]/g, ']');
	topic = topic.replace(/\/\+$/, '[/]*');
	topic = topic.replace(/\+/g, '*');
	return topic;
}

/**
 * Returns whether a Redis subscription pattern is consistent with the given MQTT topic for delivery.
 * Used to filter `pmessage` events so Redis glob semantics align with MQTT rules.
 *
 * @param pattern - Redis pattern from `PSUBSCRIBE` (after {@link mqttTopicToRedisSubTopic}).
 * @param channel - Actual channel name / MQTT topic published to Redis.
 * @returns `true` if the pattern should match the channel for MQTT-consistent routing.
 */
function checkRedisTopic(pattern: string, channel: string) {
	if (pattern === '*' || pattern === '**') {
		return true;
	} else if (pattern === '/*') {
		return /^(\/.*)?$/.test(channel);
	} else if (pattern === '[^/]*') {
		// Single-segment `+` equivalent
		const reg = new RegExp(`^${pattern}$`);
		return reg.test(channel);
	} else if (/\*/.test(pattern)) {
		// Pattern contains wildcards — normalize to a regex and test

		let regStr = pattern;

		if (/\[\/\]\*$/.test(pattern)) {
			// Trailing `[/]*` maps to MQTT `/+`
			regStr = regStr.replace(/\[\/\]\*$/, '/[^/]*');
		} else if (/\*$/.test(pattern)) {
			// Trailing `*` maps to MQTT `#`
			regStr = regStr.replace(/\*$/, '(/.*)?');
		}

		// `*/` segments map to MQTT `+/`
		regStr = regStr.replace(/\*\//g, '[^/]*/');
		const reg = new RegExp(`^${regStr}$`);
		if (!reg.test(channel)) {
			return false;
		}
	}

	return true;
}

/**
 * In-memory index of Redis-side subscription patterns per client and reverse lookups.
 * Keys use patterns produced by {@link mqttTopicToRedisSubTopic}.
 */
class SubscribeManager {
	private topicsMap = new Map<string, Set<string>>();
	private clientIdentifierMap = new Map<string, TClientSubscription>();

	/**
	 * Records a client's subscription to a Redis pattern and stores subscription options.
	 *
	 * @param clientIdentifier - Logical client id.
	 * @param topic - Redis subscription pattern string.
	 * @param data - MQTT subscription options for this pattern.
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
	 * Removes a client's subscription to a pattern; drops empty maps.
	 *
	 * @param clientIdentifier - Logical client id.
	 * @param topic - Redis subscription pattern string.
	 */
	unsubscribe(clientIdentifier: string, topic: string) {
		this.topicsMap.get(topic)?.delete(clientIdentifier);
		this.topicsMap.get(topic)?.size === 0 && this.topicsMap.delete(topic);
		this.clientIdentifierMap.get(clientIdentifier)?.delete(topic);
		this.clientIdentifierMap.get(clientIdentifier)?.size === 0 && this.clientIdentifierMap.delete(clientIdentifier);
	}

	/**
	 * @param topic - Redis subscription pattern string.
	 * @returns Whether any client is still subscribed to this pattern in this process.
	 */
	topicExists(topic: string) {
		return this.topicsMap.has(topic);
	}

	/**
	 * @param clientIdentifier - Logical client id.
	 * @param topic - Redis subscription pattern string.
	 * @returns Whether the client has an active subscription entry for the pattern.
	 */
	isSubscribe(clientIdentifier: string, topic: string) {
		return !!this.clientIdentifierMap.get(clientIdentifier)?.has(topic);
	}

	/**
	 * @param clientIdentifier - Logical client id.
	 * @param topic - Redis subscription pattern string.
	 * @returns Stored subscription data, if any.
	 */
	getSubscribe(clientIdentifier: string, topic: string) {
		return this.clientIdentifierMap.get(clientIdentifier)?.get(topic);
	}

	// clearSubscribe(clientIdentifier: string) {
	// 	const getClientTopicMap = this.clientIdentifierMap.get(clientIdentifier);
	// 	if (getClientTopicMap) {
	// 		getClientTopicMap.forEach((_value, key) => {
	// 			this.unsubscribe(clientIdentifier, key);
	// 		});
	// 	}
	// }

	/**
	 * @param topic - Redis subscription pattern string.
	 * @returns Set of client ids subscribed to this pattern, or undefined.
	 */
	getTopicClientIdentifier(topic: string) {
		return this.topicsMap.get(topic);
	}

	/**
	 * @param clientIdentifier - Logical client id.
	 * @returns Map of pattern → subscription data for that client, or undefined.
	 */
	getClientAllTopic(clientIdentifier: string) {
		return this.clientIdentifierMap.get(clientIdentifier);
	}

	/**
	 * @param clientIdentifier - Logical client id.
	 * @param topic - Redis subscription pattern string.
	 * @returns Subscription options for this client and pattern, or undefined.
	 */
	getClientSubscription(clientIdentifier: string, topic: string) {
		return this.clientIdentifierMap.get(clientIdentifier)?.get(topic);
	}

	/**
	 * Invokes the callback for each stored pattern that matches the given MQTT topic via {@link topicToRegEx}.
	 *
	 * @param topic - Concrete MQTT topic to match against subscription patterns.
	 * @param callbackfn - Async handler receiving client id, matching pattern key, and subscription data.
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
 * {@link Manager} implementation using Redis for presence, sessions, retain storage, and pub/sub.
 * Uses `PSUBSCRIBE` / `PUNSUBSCRIBE` for MQTT wildcard filters and `SUBSCRIBE` for exact topics.
 */
export class Redis2Manager extends Manager {
	clientIdentifierManager = new ClientIdentifierManager();
	private subscribeManager = new SubscribeManager();
	private readonly sharedCursor = new Map<string, number>();
	private redisPub: Redis;
	private redisSub: Redis;

	/**
	 * Creates Redis pub/sub clients and starts listening for key expiry and published messages.
	 *
	 * @param options - `ioredis` connection options (shared by publisher and subscriber connections).
	 */
	constructor(options: RedisOptions) {
		super();
		this.redisPub = new Redis(options);
		this.redisSub = new Redis(options);
		this.listenRedisMessage();
	}

	/**
	 * Subscribes to key expiry notifications and wires `message` / `pmessage` handlers to fan out publishes.
	 */
	private listenRedisMessage() {
		this.redisSub.subscribe('__keyevent@0__:expired');
		// Exact channels only
		this.redisSub.on('message', (channel, message) => {
			switch (channel) {
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
				default: {
					this.broadcastMessage(channel, message);
					break;
				}
			}
		});

		// Pattern subscriptions (wildcards)
		this.redisSub.on('pmessage', (pattern, channel, message) => {
			if (!checkRedisTopic(pattern, channel)) {
				return;
			}
			this.broadcastMessage(pattern, message);
		});
	}

	/**
	 * Parses a published payload and delivers MQTT PUBLISH packets to local subscribers of `pattern`.
	 *
	 * @param pattern - Redis subscription pattern (or channel) used to look up subscribers.
	 * @param message - JSON string with publish payload and publisher metadata.
	 */
	private broadcastMessage(pattern: string, message: string) {
		try {
			const { pubData, clientIdentifier: pubClientIdentifier } = JSON.parse(message) as { pubData: IPublishData; topic: string; clientIdentifier: string };
			const staticSourceData = {
				qos: pubData.header.qosLevel,
				retain: pubData.header.retain,
			};
			this.subscribeManager.getTopicClientIdentifier(pattern)?.forEach((clientIdentifier) => {
				const client = this.clientIdentifierManager.getIdentifier(clientIdentifier);
				if (client) {
					const subFlags = this.subscribeManager.getClientSubscription(clientIdentifier, pattern);
					if (!subFlags) {
						return;
					}
					if (subFlags.noLocal && pubClientIdentifier === clientIdentifier) {
						return;
					}
					const distributeData: IPublishData = JSON.parse(JSON.stringify(pubData));
					if (distributeData.properties.messageExpiryTimestamp && Date.now() > distributeData.properties.messageExpiryTimestamp) {
						return;
					}
					const selected = [subFlags];
					if (subFlags.sharedGroup) {
						const cursor = this.sharedCursor.get(subFlags.sharedGroup) ?? 0;
						if (cursor % 2 === 1) {
							this.sharedCursor.set(subFlags.sharedGroup, cursor + 1);
							return;
						}
						this.sharedCursor.set(subFlags.sharedGroup, cursor + 1);
					}
					const minQoS = Math.min(...selected.map((sub) => sub.qos), staticSourceData.qos);
					if (minQoS > QoSType.QoS0) {
						distributeData.header.packetIdentifier = this.newPacketIdentifier(client);
						distributeData.header.dupFlag = false;
					} else {
						delete distributeData.header.packetIdentifier;
					}
					distributeData.header.qosLevel = minQoS;
					distributeData.header.retain = selected.some((sub) => sub.retainAsPublished) ? staticSourceData.retain : false;
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
					const pubPacket = encodePublishPacket(distributeData, selected[0].protocolVersion);
					client.write(pubPacket);
					if (minQoS > QoSType.QoS0 && distributeData.header.packetIdentifier !== undefined) {
						this.registerPendingPacket(client, distributeData.header.packetIdentifier, pubPacket, 'publish');
					}
				}
			});
		} catch (error) {
			console.error('broadcastMessage error:', error);
		}
	}

	/** @returns Redis key used to mark an active TCP connection / client. */
	private connectKey(clientIdentifier: string) {
		return `connect:${clientIdentifier}`;
	}
	/** @returns Redis key used for session presence / expiry tracking. */
	private sessionKey(clientIdentifier: string) {
		return `session:${clientIdentifier}`;
	}

	/**
	 * @param key - Client id string or live socket wrapper.
	 * @returns Whether Redis still has a `connect:*` key for this client.
	 */
	async isConnected(key: TClient | TIdentifier): Promise<boolean> {
		if (typeof key === 'string') {
			return !!(await this.redisPub.exists(this.connectKey(key)));
		} else {
			const clientID = this.clientIdentifierManager.getClient(key);
			if (clientID) {
				return !!(await this.redisPub.exists(this.connectKey(clientID.identifier)));
			}
			return false;
		}
	}

	/**
	 * Registers the socket, stores connect payload in Redis, and refreshes session keys.
	 *
	 * @param clientIdentifier - Logical client id.
	 * @param connData - Parsed CONNECT packet data.
	 * @param client - Underlying TCP socket for this connection.
	 */
	async connect(clientIdentifier: string, connData: IConnectData, client: Socket): Promise<void> {
		this.clientIdentifierManager.set(clientIdentifier, client);
		await this.redisPub.set(this.connectKey(clientIdentifier), JSON.stringify(connData));
		await this.redisPub.set(this.sessionKey(clientIdentifier), '1');
		if (connData.header.keepAlive) {
			await this.redisPub.expire(this.connectKey(clientIdentifier), connData.header.keepAlive * 1.5);
		}
		await this.redisPub.persist(this.sessionKey(clientIdentifier));
	}

	/**
	 * Drops local pending state, optionally preserves session per `sessionExpiryInterval`, removes connect key.
	 *
	 * @param clientIdentifier - Client id string or socket reference.
	 */
	public async clearConnect(clientIdentifier: TClient | TIdentifier): Promise<void> {
		const identifier = typeof clientIdentifier === 'string' ? clientIdentifier : this.clientIdentifierManager.getClient(clientIdentifier)?.identifier;
		const client = typeof clientIdentifier === 'string' ? this.clientIdentifierManager.getIdentifier(clientIdentifier) : clientIdentifier;
		if (client && identifier) {
			this.clearPendingClient(client);
			const connDataRaw = await this.redisPub.get(this.connectKey(identifier));
			const sessionExpiryInterval = connDataRaw ? ((JSON.parse(connDataRaw) as IConnectData).properties?.sessionExpiryInterval ?? 0) : 0;
			if (sessionExpiryInterval <= 0) {
				this.clearSubscribe(identifier);
				await this.redisPub.del(this.sessionKey(identifier));
			} else {
				await this.redisPub.expire(this.sessionKey(identifier), sessionExpiryInterval);
			}
			this.clientIdentifierManager.delete(client);

			await this.redisPub.del(this.connectKey(identifier));
		}
	}

	/**
	 * Unsubscribes the client locally and unsubscribes Redis when no local subscriber remains for a pattern.
	 *
	 * @param clientIdentifier - Logical client id.
	 */
	async clearSubscribe(clientIdentifier: string): Promise<void> {
		const topicMap = this.subscribeManager.getClientAllTopic(clientIdentifier);
		if (!topicMap) {
			return;
		}
		for (const redisSubTopic of topicMap.keys()) {
			this.subscribeManager.unsubscribe(clientIdentifier, redisSubTopic);
			if (!this.subscribeManager.topicExists(redisSubTopic)) {
				await this.redisSub.punsubscribe(redisSubTopic);
				await this.redisSub.unsubscribe(redisSubTopic);
			}
		}
	}

	/**
	 * Ensures Redis `subscribe` / `psubscribe` for the mapped pattern, then records the client subscription.
	 *
	 * @param clientIdentifier - Logical client id.
	 * @param topic - MQTT subscription filter.
	 * @param data - Subscription options.
	 */
	async subscribe(clientIdentifier: string, topic: string, data: TSubscribeData): Promise<void> {
		const redisSubTopic = mqttTopicToRedisSubTopic(topic);
		if (!this.subscribeManager.topicExists(redisSubTopic)) {
			if (isWildcardTopic(topic)) {
				await this.redisSub.psubscribe(redisSubTopic);
			} else {
				await this.redisSub.subscribe(redisSubTopic);
			}
		}
		this.subscribeManager.subscribe(clientIdentifier, redisSubTopic, data);
	}

	/**
	 * Removes local subscription and Redis `unsubscribe` / `punsubscribe` when the pattern has no subscribers left.
	 *
	 * @param clientIdentifier - Logical client id.
	 * @param topic - MQTT subscription filter.
	 */
	async unsubscribe(clientIdentifier: string, topic: string): Promise<void> {
		const redisSubTopic = mqttTopicToRedisSubTopic(topic);
		this.subscribeManager.unsubscribe(clientIdentifier, redisSubTopic);
		if (!this.subscribeManager.topicExists(redisSubTopic)) {
			if (isWildcardTopic(topic)) {
				await this.redisSub.punsubscribe(redisSubTopic);
			} else {
				await this.redisSub.unsubscribe(redisSubTopic);
			}
		}
	}

	/**
	 * @param clientIdentifier - Logical client id.
	 * @param topic - MQTT subscription filter.
	 * @returns Whether this client is subscribed to the mapped Redis pattern.
	 */
	async isSubscribe(clientIdentifier: string, topic: string): Promise<boolean> {
		const redisSubTopic = mqttTopicToRedisSubTopic(topic);
		return this.subscribeManager.isSubscribe(clientIdentifier, redisSubTopic);
	}

	/**
	 * @param clientIdentifier - Logical client id.
	 * @returns Whether a session key exists in Redis.
	 */
	async hasSession(clientIdentifier: string): Promise<boolean> {
		return !!(await this.redisPub.exists(this.sessionKey(clientIdentifier)));
	}

	/**
	 * @param clientIdentifier - Logical client id.
	 * @param topic - MQTT subscription filter.
	 * @returns Subscription options for the mapped Redis pattern, if any.
	 */
	async getSubscription(clientIdentifier: string, topic: string): Promise<TSubscribeData | undefined> {
		const redisSubTopic = mqttTopicToRedisSubTopic(topic);
		return this.subscribeManager.getSubscribe(clientIdentifier, redisSubTopic);
	}

	/**
	 * Publishes to Redis; subscribers receive via `message` / `pmessage` and {@link broadcastMessage}.
	 *
	 * @param clientIdentifier - Publisher client id (for no-local and metadata).
	 * @param topic - MQTT topic (used as Redis channel name here).
	 * @param pubData - PUBLISH packet payload to serialize.
	 */
	publish(clientIdentifier: string, topic: string, pubData: IPublishData): void {
		this.redisPub.publish(topic, JSON.stringify({ pubData, topic: topic, clientIdentifier }));
	}

	/**
	 * Refreshes the connect key TTL from the stored keep-alive when the client sends a PINGREQ.
	 *
	 * @param clientIdentifier - Logical client id.
	 */
	public async ping(clientIdentifier: string): Promise<void> {
		const data = await this.redisPub.get(this.connectKey(clientIdentifier));
		if (data) {
			const connData = JSON.parse(data) as IConnectData;
			if (connData.header.keepAlive) {
				await this.redisPub.expire(this.connectKey(clientIdentifier), connData.header.keepAlive * 1.5);
			}
		}
	}

	/** @returns Redis key storing retained payload for `topic`. */
	private retainKey(topic: string) {
		return `retain:${topic}`;
	}

	/**
	 * Stores or updates a retained message, optionally with TTL; sets expiry timestamp from `messageExpiryInterval` when needed.
	 *
	 * @param topic - MQTT topic for the retain entry.
	 * @param pubData - Message to persist.
	 * @param retainTTL - Optional Redis TTL in seconds for the key.
	 */
	public async addRetainMessage(topic: string, pubData: IPublishData, retainTTL?: number) {
		if (pubData.properties.messageExpiryInterval && !pubData.properties.messageExpiryTimestamp) {
			pubData.properties.messageExpiryTimestamp = Date.now() + pubData.properties.messageExpiryInterval * 1000;
		}
		await this.redisPub.set(this.retainKey(topic), JSON.stringify(pubData));
		if (retainTTL) {
			this.redisPub.expire(this.retainKey(topic), retainTTL);
		}
	}

	/**
	 * @param topic - MQTT topic whose retain key should be removed.
	 */
	public async deleteRetainMessage(topic: string) {
		this.redisPub.del(this.retainKey(topic));
	}

	/**
	 * @param topic - MQTT topic.
	 * @returns Parsed retain payload, or undefined if missing or expired (key deleted when expired).
	 */
	public async getRetainMessage(topic: string) {
		const retainData: any = await this.redisPub.get(this.retainKey(topic));
		const data = retainData ? (JSON.parse(retainData) as IPublishData) : undefined;
		if (data?.properties?.messageExpiryTimestamp && Date.now() > data.properties.messageExpiryTimestamp) {
			await this.redisPub.del(this.retainKey(topic));
			return undefined;
		}
		return data;
	}

	/**
	 * Iterates retained messages, optionally filtered by an MQTT topic filter (wildcard supported).
	 *
	 * @param callbackfn - Invoked per matching topic with parsed payload.
	 * @param topic - If omitted, no iteration. If wildcard, uses Redis `SCAN` plus regex refinement.
	 */
	public async forEachRetainMessage(callbackfn: (topic: string, data: IPublishData) => Promise<void>, topic?: string) {
		if (!topic) {
			return;
		}
		if (!isWildcardTopic(topic)) {
			const pubData = await this.getRetainMessage(topic);
			if (pubData) {
				await callbackfn(topic, pubData);
			}
			return;
		}

		// First pass: Redis glob from mapped pattern
		const redisSubTopic = mqttTopicToRedisSubTopic(topic);
		const scanKey = this.retainKey(redisSubTopic);

		const reg = topicToRegEx(topic);
		if (!reg) {
			return;
		}
		const topicRegEx = new RegExp(reg);
		await this.redisPub.scan(0, 'MATCH', scanKey, async (err, elements) => {
			if (err) {
				console.error('getRetain error:', err);
				return;
			}
			if (elements) {
				const [_cursor, keys] = elements;
				if (keys) {
					for (const key of keys) {
						// Second pass: MQTT regex on topic string
						if (topicRegEx.test(key.replace(/^retain:/, ''))) {
							const retainData: any = await this.redisPub.get(key);
							const pubData = retainData ? JSON.parse(retainData) : undefined;
							if (pubData) {
								if (pubData.properties?.messageExpiryTimestamp && Date.now() > pubData.properties.messageExpiryTimestamp) {
									await this.redisPub.del(key);
									continue;
								}
								await callbackfn(key.replace(/^retain:/, ''), pubData);
							}
						}
					}
				}
			}
		});
	}

	/**
	 * Closes both Redis connections gracefully.
	 */
	public override async dispose(): Promise<void> {
		await this.redisSub.quit();
		await this.redisPub.quit();
	}
}
