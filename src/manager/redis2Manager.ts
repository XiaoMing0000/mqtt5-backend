import { Socket } from 'net';
import { IConnectData, IPublishData, QoSType } from '../interface';
import { ClientIdentifierManager, Manager, TClient, TClientSubscription, TIdentifier, TSubscribeData } from './manager';
import Redis, { RedisOptions } from 'ioredis';
import { isWildcardTopic, topicToRegEx } from '../topicFilters';
import { encodePublishPacket } from '../parse';

/**
 * mqtt 主题转换为 redis 订阅主题
 * @param topic
 * @returns
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
 * 检查 redis 订阅主题是否与 mqtt 主题匹配
 * @param pattern redis 订阅主题
 * @param channel mqtt 主题
 * @returns
 */
function checkRedisTopic(pattern: string, channel: string) {
	if (pattern === '*' || pattern === '**') {
		return true;
	} else if (pattern === '/*') {
		return /^(\/.*)?$/.test(channel);
	} else if (pattern === '[^/]*') {
		// 匹配 +
		const reg = new RegExp(`^${pattern}$`);
		return reg.test(channel);
	} else if (/\*/.test(pattern)) {
		// 校验含有通配符

		let regStr = pattern;

		if (/\[\/\]\*$/.test(pattern)) {
			// redis 主题以 [/]* 结尾对应 mqtt 的 /+
			regStr = regStr.replace(/\[\/\]\*$/, '/[^/]*');
		} else if (/\*$/.test(pattern)) {
			// 以 * 结尾对应 mqtt 的 #
			regStr = regStr.replace(/\*$/, '(\/.*)?');
		}

		// 包 */ 对应 mqtt 的 +/
		regStr = regStr.replace(/\*\//g, '[^/]*/');
		const reg = new RegExp(`^${regStr}$`);
		if (!reg.test(channel)) {
			return false;
		}
	}

	return true;
}

class SubscribeManager {
	private topicsMap = new Map<string, Set<string>>();
	private clientIdentifierMap = new Map<string, TClientSubscription>();

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

	unsubscribe(clientIdentifier: string, topic: string) {
		this.topicsMap.get(topic)?.delete(clientIdentifier);
		this.topicsMap.get(topic)?.size === 0 && this.topicsMap.delete(topic);
		this.clientIdentifierMap.get(clientIdentifier)?.delete(topic);
		this.clientIdentifierMap.get(clientIdentifier)?.size === 0 && this.clientIdentifierMap.delete(clientIdentifier);
	}

	topicExists(topic: string) {
		return this.topicsMap.has(topic);
	}

	isSubscribe(clientIdentifier: string, topic: string) {
		return !!this.clientIdentifierMap.get(clientIdentifier)?.has(topic);
	}

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

	getTopicClientIdentifier(topic: string) {
		return this.topicsMap.get(topic);
	}

	getClientAllTopic(clientIdentifier: string) {
		return this.clientIdentifierMap.get(clientIdentifier);
	}

	getClientSubscription(clientIdentifier: string, topic: string) {
		return this.clientIdentifierMap.get(clientIdentifier)?.get(topic);
	}

	async getMatchTopic(topic: string, callbackfn: (clientIdentifier: string, matchTopic: string, data: TSubscribeData) => Promise<void>) {
		this.topicsMap.forEach(async (clientIdentifierSet, keyTopic) => {
			const reg = topicToRegEx(keyTopic);
			if (reg && new RegExp(reg).test(topic)) {
				clientIdentifierSet.forEach(async (clientIdentifier) => {
					const subData = this.clientIdentifierMap.get(clientIdentifier)?.get(keyTopic);
					if (subData) {
						await callbackfn(clientIdentifier, keyTopic, subData);
					}
				});
			}
		});
	}
}

export class Redis2Manager extends Manager {
	clientIdentifierManager = new ClientIdentifierManager();
	private subscribeManager = new SubscribeManager();
	private redisPub: Redis;
	private redisSub: Redis;

	constructor(options: RedisOptions) {
		super();
		this.redisPub = new Redis(options);
		this.redisSub = new Redis(options);
		this.listenRedisMessage();
	}

	/**
	 * 监听 redis 消息
	 */
	private listenRedisMessage() {
		this.redisSub.subscribe('__keyevent@0__:expired');
		// 监听单个频道
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

		// 监听带有通配符的频道
		this.redisSub.on('pmessage', (pattern, channel, message) => {
			// 如果redis 订阅主题与 mqtt 主题不匹配，则不处理
			if (!checkRedisTopic(pattern, channel)) {
				return;
			}
			this.broadcastMessage(pattern, message);
		});
	}

	private broadcastMessage(pattern: string, message: string) {
		try {
			const { pubData, topic, clientIdentifier: pubClientIdentifier } = JSON.parse(message) as { pubData: IPublishData; topic: string; clientIdentifier: string };
			const staticSourceData = {
				qos: pubData.header.qosLevel,
				retain: pubData.header.retain,
			};
			this.subscribeManager.getTopicClientIdentifier(pattern)?.forEach(async (clientIdentifier) => {
				const client = this.clientIdentifierManager.getIdentifier(clientIdentifier);
				if (client) {
					const subFlags = this.subscribeManager.getClientSubscription(clientIdentifier, pattern);
					if (!subFlags) {
						return;
					}
					if (subFlags && subFlags.noLocal && pubClientIdentifier === clientIdentifier) {
						return;
					}
					const minQoS = Math.min(subFlags.qos, staticSourceData.qos);
					if (minQoS > QoSType.QoS0) {
						pubData.header.packetIdentifier = this.newPacketIdentifier(client);
						pubData.header.dupFlag = false;
					} else {
						delete pubData.header.packetIdentifier;
					}
					pubData.header.qosLevel = minQoS;
					pubData.header.retain = subFlags.retainAsPublished ? staticSourceData.retain : false;
					subFlags.subscriptionIdentifier && (pubData.properties.subscriptionIdentifier = [subFlags.subscriptionIdentifier]);
					const pubPacket = encodePublishPacket(pubData);
					client.write(pubPacket);
				}
			});
		} catch (error) {
			console.error('broadcastMessage error:', error);
		}
	}

	private connectKey(clientIdentifier: string) {
		return `connect:${clientIdentifier}`;
	}

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
	async connect(clientIdentifier: string, connData: IConnectData, client: Socket): Promise<void> {
		this.clientIdentifierManager.set(clientIdentifier, client);
		await this.redisPub.set(this.connectKey(clientIdentifier), JSON.stringify(connData));
		if (connData.header.keepAlive) {
			await this.redisPub.expire(this.connectKey(clientIdentifier), connData.header.keepAlive * 1.5);
		}
	}

	public async clearConnect(clientIdentifier: TClient | TIdentifier): Promise<void> {
		const identifier = typeof clientIdentifier === 'string' ? clientIdentifier : this.clientIdentifierManager.getClient(clientIdentifier)?.identifier;
		const client = typeof clientIdentifier === 'string' ? this.clientIdentifierManager.getIdentifier(clientIdentifier) : clientIdentifier;
		if (client && identifier) {
			this.clearSubscribe(identifier);
			this.clientIdentifierManager.delete(client);

			await this.redisPub.del(this.connectKey(identifier));
		}
	}

	async clearSubscribe(clientIdentifier: string): Promise<void> {
		this.subscribeManager.getClientAllTopic(clientIdentifier)?.forEach(async (data, redisSubTopic) => {
			// 清除当前进程的订阅
			this.subscribeManager.unsubscribe(clientIdentifier, redisSubTopic);
			// 如果当前进程没有这个订阅主题，则清除 redis 订阅主题
			if (!this.subscribeManager.topicExists(redisSubTopic)) {
				await this.redisSub.punsubscribe(redisSubTopic);
				await this.redisSub.unsubscribe(redisSubTopic);
			}
		});
	}
	async subscribe(clientIdentifier: string, topic: string, data: TSubscribeData): Promise<void> {
		const redisSubTopic = mqttTopicToRedisSubTopic(topic);
		// 如果 redis 订阅主题不存在，则订阅
		if (!this.subscribeManager.topicExists(redisSubTopic)) {
			if (isWildcardTopic(topic)) {
				await this.redisSub.psubscribe(redisSubTopic);
			} else {
				await this.redisSub.subscribe(redisSubTopic);
			}
		}
		this.subscribeManager.subscribe(clientIdentifier, redisSubTopic, data);
	}

	async unsubscribe(clientIdentifier: string, topic: string): Promise<void> {
		let redisSubTopic = mqttTopicToRedisSubTopic(topic);
		this.subscribeManager.unsubscribe(clientIdentifier, redisSubTopic);
		if (!this.subscribeManager.topicExists(redisSubTopic)) {
			if (isWildcardTopic(topic)) {
				await this.redisSub.punsubscribe(redisSubTopic);
			} else {
				await this.redisSub.unsubscribe(redisSubTopic);
			}
		}
	}
	async isSubscribe(clientIdentifier: string, topic: string): Promise<boolean> {
		let redisSubTopic = mqttTopicToRedisSubTopic(topic);
		return this.subscribeManager.isSubscribe(clientIdentifier, redisSubTopic);
	}
	async getSubscription(clientIdentifier: string, topic: string): Promise<TSubscribeData | undefined> {
		let redisSubTopic = mqttTopicToRedisSubTopic(topic);
		return this.subscribeManager.getSubscribe(clientIdentifier, redisSubTopic);
	}

	publish(clientIdentifier: string, topic: string, pubData: IPublishData): void {
		this.redisPub.publish(topic, JSON.stringify({ pubData, topic: topic, clientIdentifier }));
	}
	public async ping(clientIdentifier: string): Promise<void> {
		const data = await this.redisPub.get(this.connectKey(clientIdentifier));
		if (data) {
			const connData = JSON.parse(data) as IConnectData;
			if (connData.header.keepAlive) {
				await this.redisPub.expire(this.connectKey(clientIdentifier), connData.header.keepAlive * 1.5);
			}
		}
	}

	private retainKey(topic: string) {
		return `retain:${topic}`;
	}

	public async addRetainMessage(topic: string, pubData: IPublishData, retainTTL?: number) {
		await this.redisPub.set(this.retainKey(topic), JSON.stringify(pubData));
		if (retainTTL) {
			this.redisPub.expire(this.retainKey(topic), retainTTL);
		}
	}

	public async deleteRetainMessage(topic: string) {
		this.redisPub.del(this.retainKey(topic));
	}

	public async getRetainMessage(topic: string) {
		const retainData: any = await this.redisPub.get(this.retainKey(topic));
		return retainData ? JSON.parse(retainData) : undefined;
	}

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

		// 使用 redis 通配符一级过滤
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
				const [cursor, keys] = elements;
				if (keys) {
					keys.forEach(async (key) => {
						// 使用正则对 mqtt 主题二次过滤
						if (topicRegEx.test(key.replace(/^retain:/, ''))) {
							const retainData: any = await this.redisPub.get(key);
							const pubData = retainData ? JSON.parse(retainData) : undefined;
							if (pubData) {
								await callbackfn(key.replace(/^retain:/, ''), pubData);
							}
						}
					});
				}
			}
		});
	}
}
