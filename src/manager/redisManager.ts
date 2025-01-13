import Redis, { RedisOptions } from 'ioredis';
import { ClientIdentifierManager, Manager, TClient, TIdentifier, TSubscribeData, TTopic } from './manager';
import { IConnectData, IPublishData, QoSType } from '../interface';
import { topicToRegEx } from '../topicFilters';
import { encodePublishPacket } from '../parse';

export class RedisManager extends Manager {
	clientIdentifierManager: ClientIdentifierManager;
	private redis: Redis;
	private redisSub: Redis;
	private subMap = new Map<string, Set<string>>();

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

	private connectKey(clientIdentifier: string) {
		return `connect:${clientIdentifier}`;
	}

	private topicKey(topic: string) {
		return `topic:${topic}`;
	}

	private subscribeKey(clientIdentifier: string, topic: string) {
		return `subscribe:${clientIdentifier}:${topic}`;
	}

	private retainKey(topic: string) {
		return `retain:${topic}`;
	}

	private async deleteMatch(key: string, callbackfn?: (matchedKey: string) => Promise<void>): Promise<void> {
		await this.redis.scan(0, 'MATCH', key, async (err, matchData) => {
			// if (err) {
			// }
			if (matchData && matchData[1]) {
				for (const key of matchData[1]) {
					if (callbackfn) {
						await callbackfn(key);
					}
					await this.redis.del(key);
				}
			}
		});
	}

	async clearSubscribe(clientIdentifier: string, match = '*'): Promise<void> {
		await this.deleteMatch(`subscribe:${clientIdentifier}:${match}`, (matchKey) => {
			const topic = matchKey.substring(`subscribe:${clientIdentifier}:`.length);
			this.subMap.get(topic)?.delete(clientIdentifier);
			if (this.subMap.get(topic)?.size === 0) {
				this.subMap.delete(topic);
			}
			return Promise.resolve();
		});
	}

	async getRatain() {
		// TODO
		return await this.redis.scan(0, 'MATCH', 'retain:*', (err, matchData) => {
			if (err) {
				// pass
			}
		});
	}

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

	public async connect(clientIdentifier: string, connData: IConnectData, client: TClient) {
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

	public async disconnect(client: string | TClient): Promise<void> {
		typeof client === 'string' ? this.clientIdentifierManager.getIdendifier(client)?.end() : client.end();
	}

	async clearConnect(clientIdentifier: TClient | TIdentifier): Promise<void> {
		const identifier = typeof clientIdentifier === 'string' ? clientIdentifier : (this.clientIdentifierManager.getClient(clientIdentifier)?.identifier ?? '');
		if (!identifier) {
			return;
		}

		await this.redis.scan(0, 'MATCH', `subscribe:${identifier}:*`, async (err, matchData) => {
			if (err) {
				// pass
			} else if (matchData && matchData[1]) {
				const delStrSart = `subscribe:${identifier}:`.length;
				for (const key of matchData[1]) {
					const topic = key.substring(delStrSart);
					await this.delTopicIdentifier(identifier, topic);
					await this.redis.del(key);
				}
			}
		});

		await this.redis.del(this.connectKey(identifier));
		this.clientIdentifierManager.delete(clientIdentifier);
	}

	public async subscribe(clientIdentifier: string, topic: TTopic, data: TSubscribeData) {
		const subscribeClientsID = await this.redis.get(this.topicKey(topic));

		if (subscribeClientsID) {
			const clientIds = JSON.parse(subscribeClientsID);
			clientIds[clientIdentifier] = 1;
			await this.redis.set(this.topicKey(topic), JSON.stringify(clientIds));
		} else {
			await this.redis.set(this.topicKey(topic), JSON.stringify({ [clientIdentifier]: 1 }));
		}
		await this.redis.set(this.subscribeKey(clientIdentifier, topic), JSON.stringify(data));

		const clientIdentifierSet = this.subMap.get(topic);
		if (clientIdentifierSet) {
			clientIdentifierSet.add(clientIdentifier);
		} else {
			const initSet = new Set<string>();
			initSet.add(clientIdentifier);
			this.subMap.set(topic, initSet);
		}
	}

	private async delTopicIdentifier(clientIdentifier: string, topic: string) {
		const topicIdendifitersString = await this.redis.get(this.topicKey(topic));
		if (topicIdendifitersString) {
			const topicIdentifiers = JSON.parse(topicIdendifitersString);
			delete topicIdentifiers[clientIdentifier];
			if (!Object.keys(topicIdentifiers).length) {
				await this.redis.del(this.topicKey(topic));
			} else {
				await this.redis.set(this.topicKey(topic), JSON.stringify(topicIdentifiers));
			}
		}
	}

	public async unsubscribe(clientIdentifier: string, topic: TTopic): Promise<void> {
		await this.redis.del(this.subscribeKey(clientIdentifier, topic));
		await this.delTopicIdentifier(clientIdentifier, topic);

		this.subMap.get(topic)?.delete(clientIdentifier);
		if (this.subMap.get(topic)?.size === 0) {
			this.subMap.delete(topic);
		}
	}

	public async getSubscribe(clientIdentifier: string) {
		await this.redis.get(`subscribe:${clientIdentifier}`);
	}

	public async publish(clientIdentifier: string, topic: TTopic, pubData: IPublishData): Promise<void> {
		this.redis.publish(
			'publish',
			JSON.stringify({
				clientIdentifier,
				topic,
				pubData,
			}),
		);
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
				// 处理发布事件
				case 'publish':
					{
						const { pubData, topic, clientIdentifier } = JSON.parse(message) as { pubData: IPublishData; topic: string; clientIdentifier: string };
						this.subMap.forEach(async (value, key) => {
							const topicReg = topicToRegEx(key);
							if (topicReg && new RegExp(topicReg).test(topic)) {
								const distributeData: IPublishData = JSON.parse(JSON.stringify(pubData));
								value.forEach(async (publishIdentifier) => {
									try {
										delete distributeData.properties.subscriptionIdentifier;
										const client = this.clientIdentifierManager.getIdendifier(publishIdentifier);
										const subFlags = await this.getSubscription(publishIdentifier, key);
										if (subFlags && client) {
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
						});
					}
					break;
			}
		});
	}

	public async isSubscribe(topic: TTopic): Promise<boolean> {
		let isSub = false;
		await this.redis.scan(0, 'MATCH', `topic:*`, async (err, matchData) => {
			if (matchData && matchData[1]) {
				const delStrSart = `topic:`.length;
				for (const key of matchData[1]) {
					const keyTopic = key.substring(delStrSart);
					const reg = topicToRegEx(keyTopic);
					if (reg && new RegExp(reg).test(topic)) {
						isSub = true;
						return;
					}
				}
			}
		});
		return isSub;
	}

	async getSubscription(clientIdentifier: TIdentifier, topic: string): Promise<TSubscribeData | undefined> {
		const data = await this.redis.get(this.subscribeKey(clientIdentifier, topic));
		if (data) {
			return JSON.parse(data);
		}
		return undefined;
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
