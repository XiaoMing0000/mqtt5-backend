import Redis, { RedisOptions } from 'ioredis';
import { ClientIdentifierManager, Manager, TClient, TIdentifier, TSubscribeData, TTopic } from './manager';
import { IConnectData, IPublishData } from '../interface';

// TODO redis 管理客户端
export class RedisStorage extends Manager {
	clientIdentifierManager: ClientIdentifierManager;
	private redis: Redis;
	constructor(options: RedisOptions) {
		super();
		this.redis = new Redis(options);
		this.clientIdentifierManager = new ClientIdentifierManager();
	}

	async clear(clientIdentifier: string, match = '*'): Promise<void> {
		await this.redis.scan(0, 'MATCH', `${clientIdentifier}:${match}`, (err, matchData) => {
			if (err) {
			}
			if (matchData) {
				const [cursor, elements] = matchData;
				for (const key of elements) {
					this.redis.del(key);
				}
			}
		});
	}

	public async isConnected(key: TClient | TIdentifier): Promise<boolean> {
		if (typeof key === 'string') {
			return !!(await this.redis.exists(`${key}:connectData`));
		} else {
			return this.clientIdentifierManager.has(key);
		}
	}

	public async connect(clientIdentifier: string, connData: IConnectData, client: TClient) {
		this.clientIdentifierManager.set(client, clientIdentifier);
		await this.redis.set(`${clientIdentifier}:connectData`, JSON.stringify(connData));
		await this.redis.expire(clientIdentifier, 3600 * 24);
	}

	disconnect(client: string): void;
	disconnect(client: TClient): void;
	disconnect(client: string | TClient): void {
		if (typeof client === 'string') {
			this.clear(client);
		} else {
			const clientIdentifier = this.clientIdentifierManager.getClient(client as TClient);
			if (clientIdentifier) {
				this.clear(clientIdentifier.identifier);
			}
		}
		this.clientIdentifierManager.delete(client);
	}

	public clearSubscribe(clientIdentifier: string): void {
		this.clear(clientIdentifier, 'subscribe:*');
	}

	public subscribe(clientIdentifier: string, topic: TTopic, data: TSubscribeData) {
		this.redis.set(`${clientIdentifier}:subscribe:${topic}`, JSON.stringify(data));
	}

	async unsubscribe(clientIdentifier: string, topic: TTopic): Promise<void> {
		this.clear(clientIdentifier, `subscribe:${topic}`);
	}

	public getSubscribe(clientIdentifier: string) {
		this.redis.get(`${clientIdentifier}:subscribe`);
	}

	publish(topic: TTopic, callbackfn: (client: TClient, topic: TSubscribeData) => void): Promise<void> {
		throw new Error('Method not implemented.');
	}

	isSubscribe(topic: TTopic): Promise<boolean> {
		throw new Error('Method not implemented.');
	}

	getSubscription(client: TClient): Promise<any> {
		throw new Error('Method not implemented.');
	}

	addRetainMessage(topic: string, pubData: IPublishData): Promise<void> {
		throw new Error('Method not implemented.');
	}
	deleteRetainMessage(topic: string): Promise<void> {
		throw new Error('Method not implemented.');
	}
	getRetainMessage(topic: string): Promise<any> {
		throw new Error('Method not implemented.');
	}
	forEachRetainMessage(callbackfn: (topic: string, data: IPublishData) => void): Promise<void> {
		throw new Error('Method not implemented.');
	}
}
