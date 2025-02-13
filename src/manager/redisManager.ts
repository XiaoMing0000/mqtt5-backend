import Redis, { RedisOptions } from 'ioredis';
import { ClientIdentifierManager, Manager, TClient, TClientSubscription, TIdentifier, TSubscribeData, TTopic } from './manager';
import { IConnectData, IPublishData, QoSType } from '../interface';
import { topicToRegEx } from '../topicFilters';
import { encodePublishPacket } from '../parse';

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

	isSubscribe(topic: string) {
		const topics = this.topicsMap.keys();
		for (const key of topics) {
			const reg = topicToRegEx(key);
			if (topic === topic || (reg && new RegExp(key).test(topic))) {
				return true;
			}
		}
		return false;
	}

	getSubscribe(clientIdentifier: string, topic: string) {
		return this.clientIdentifierMap.get(clientIdentifier)?.get(topic);
	}

	clearSubscribe(clientIdentifier: string) {
		const getClientTopicMap = this.clientIdentifierMap.get(clientIdentifier);
		if (getClientTopicMap) {
			getClientTopicMap.forEach((_value, key) => {
				this.unsubscribe(clientIdentifier, key);
			});
		}
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

export class RedisManager extends Manager {
	clientIdentifierManager: ClientIdentifierManager;
	private subscribeManmager = new SubscribeManager();
	private redis: Redis;
	private redisSub: Redis;

	constructor(options: RedisOptions) {
		super();
		this.redis = new Redis(options);
		this.redisSub = new Redis(options);
		this.clientIdentifierManager = new ClientIdentifierManager();
		this.redisSub.subscribe('publish');
		// 订阅redis过期事件，需要在redis.conf中配置notify-keyspace-events Ex
		this.redisSub.subscribe('__keyevent@0__:expired'); // 处理 key 过期事件
		this.redisMessage();
	}

	async redisMessage() {
		this.redisSub.on('message', async (channel, message) => {
			switch (channel) {
				// 处理 connect keepAlive 过期事件
				case '__keyevent@0__:expired': {
					if (message.startsWith('connect:')) {
						const clientIdentifier = message.substring('connect:'.length);
						const client = this.clientIdentifierManager.getIdendifier(clientIdentifier);
						if (client) {
							client.end();
						}
					}
					break;
				}

				case 'publish': {
					const { pubData, topic, clientIdentifier } = JSON.parse(message) as { pubData: IPublishData; topic: string; clientIdentifier: string };

					const distributeData: IPublishData = JSON.parse(JSON.stringify(pubData));
					await this.subscribeManmager.getMatchTopic(topic, async (publishIdentifier: string, matchTopic: string, subFlags: TSubscribeData) => {
						try {
							const client = this.clientIdentifierManager.getIdendifier(publishIdentifier);
							if (client) {
								delete distributeData.properties.subscriptionIdentifier;
								if (subFlags && subFlags.noLocal && publishIdentifier === clientIdentifier) {
									return;
								}
								const minQoS = Math.min(subFlags.qos || 0, pubData.header.qosLevel);
								if (minQoS > QoSType.QoS0) {
									distributeData.header.packetIdentifier = this.newPacketIdentifier(client);
									distributeData.header.udpFlag = false;
								}
								distributeData.header.qosLevel = minQoS;
								distributeData.header.retain = subFlags.retainAsPublished ? distributeData.header.retain : false;
								subFlags.subscriptionIdentifier && (distributeData.properties.subscriptionIdentifier = [subFlags.subscriptionIdentifier]);
								const pubPacket = encodePublishPacket(distributeData);
								client.write(pubPacket);
							}
						} catch (error) {
							console.log('publish error:', error);
						}
					});
				}
			}
		});
	}

	private connectKey(clientIdentifier: string) {
		return `connect:${clientIdentifier}`;
	}

	async isConnected(key: TClient | TIdentifier): Promise<boolean> {
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

	async connect(clientIdentifier: string, connData: IConnectData, client: TClient): Promise<void> {
		this.clientIdentifierManager.set(clientIdentifier, client);
		await this.redis.set(this.connectKey(clientIdentifier), JSON.stringify(connData));
		if (connData.header.keepAlive) {
			await this.redis.expire(this.connectKey(clientIdentifier), connData.header.keepAlive * 1.5);
		}
	}

	public async ping(clientIdentifier: string): Promise<void> {
		const data = await this.redis.get(this.connectKey(clientIdentifier));
		if (data) {
			const connData = JSON.parse(data) as IConnectData;
			if (connData.header.keepAlive) {
				await this.redis.expire(this.connectKey(clientIdentifier), connData.header.keepAlive * 1.5);
			}
		}
	}

	async subscribe(clientIdentifier: string, topic: TTopic, data: TSubscribeData): Promise<void> {
		this.subscribeManmager.subscribe(clientIdentifier, topic, data);
	}

	async unsubscribe(clientIdentifier: string, topic: TTopic): Promise<void> {
		this.subscribeManmager.unsubscribe(clientIdentifier, topic);
	}

	async clearSubscribe(clientIdentifier: string): Promise<void> {
		this.subscribeManmager.clearSubscribe(clientIdentifier);
	}

	async isSubscribe(topic: TTopic): Promise<boolean> {
		return this.subscribeManmager.isSubscribe(topic);
	}

	async clearConnect(clientIdentifier: TClient | TIdentifier): Promise<void> {
		const identifier = typeof clientIdentifier === 'string' ? clientIdentifier : this.clientIdentifierManager.getClient(clientIdentifier)?.identifier;
		const client = typeof clientIdentifier === 'string' ? this.clientIdentifierManager.getIdendifier(clientIdentifier) : clientIdentifier;
		if (client && identifier) {
			this.clearSubscribe(identifier);
			this.clientIdentifierManager.delete(client);

			await this.redis.del(this.connectKey(identifier));
		}
	}

	async getSubscription(clientIdentifier: TIdentifier, topic: string): Promise<TSubscribeData | undefined> {
		return this.subscribeManmager.getSubscribe(clientIdentifier, topic);
	}

	publish(clientIdentifier: string, topic: TTopic, pubData: IPublishData): void {
		this.redis.publish(
			'publish',
			JSON.stringify({
				clientIdentifier,
				topic,
				pubData,
			}),
		);
	}

	private retainKey(topic: string) {
		return `retain:${topic}`;
	}

	async getRatain() {
		// TODO
		return await this.redis.scan(0, 'MATCH', 'retain:*', (err, matchData) => {
			if (err) {
				// pass
			}
		});
	}

	async addRetainMessage(topic: string, pubData: IPublishData, retainTTL?: number): Promise<void> {
		this.redis.set(this.retainKey(topic), JSON.stringify(pubData));
		this.redis.expire(this.retainKey(topic), retainTTL ?? 3600 * 24);
	}
	async deleteRetainMessage(topic: string): Promise<void> {
		this.redis.del(this.retainKey(topic));
	}
	async getRetainMessage(topic: string): Promise<IPublishData | undefined> {
		const ratainData = await this.redis.get(this.retainKey(topic));
		return ratainData ? JSON.parse(ratainData) : undefined;
	}
	async forEachRetainMessage(callbackfn: (topic: string, data: IPublishData) => Promise<void>): Promise<void> {
		const allRatainData = await this.getRatain();

		for (const key of allRatainData[1]) {
			const topic = key.substring('retain:'.length);
			const data = await this.redis.get(key);
			const pubData = data ? JSON.parse(data) : undefined;
			if (pubData) {
				await callbackfn(topic, pubData);
			}
		}
	}
}
