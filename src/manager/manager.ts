import net from 'net';
import { IConnectData, IPublishData, QoSType } from '../interface';

export type TTopic = string;
export type TClient = net.Socket;
export type TIdentifier = string;
type TClientID = { identifier: TIdentifier; packetIdentifier: Set<number>; dynamicId: number };
export type TClientMap = Map<TClient, TClientID>;
export type TIdentifierMap = Map<TIdentifier, TClient>;
export type ClientIdentifierMap = Map<TClient, string>;

export type TSubscribeData = {
	qos: QoSType;
	date: Date;
	subscriptionIdentifier?: number;
	noLocal: boolean;
	retainAsPublished: boolean;
};
export type TClientSubscription = Map<TTopic, TSubscribeData>;
/**
 * 客户端连接管理
 */
export class ClientIdentifierManager {
	private readonly clientMap: TClientMap;
	private readonly identifierMap: TIdentifierMap;
	constructor() {
		this.clientMap = new Map();
		this.identifierMap = new Map();
	}

	has(key: TClient | TIdentifier) {
		if (typeof key === 'string') {
			return this.identifierMap.has(key);
		}
		return this.clientMap.has(key);
	}

	getClient(client: TClient) {
		return this.clientMap.get(client);
	}
	getIdendifier(identifier: TIdentifier) {
		return this.identifierMap.get(identifier);
	}

	set(key: TClient, value: TIdentifier): void;
	set(key: TIdentifier, value: TClient): void;
	set(key: TClient | TIdentifier, value: TIdentifier | TClient): void {
		if (typeof key === 'string' && value instanceof net.Socket) {
			this.identifierMap.set(key, value);
			this.clientMap.set(value, { identifier: key, packetIdentifier: new Set(), dynamicId: 1 });
		} else if (typeof value === 'string' && key instanceof net.Socket) {
			this.identifierMap.set(value, key);
			this.clientMap.set(key, { identifier: value, packetIdentifier: new Set(), dynamicId: 1 });
		}
	}

	delete(key: TClient | TIdentifier) {
		if (typeof key === 'string') {
			const client = this.identifierMap.get(key);
			if (client) {
				this.clientMap.delete(client);
			}
			return this.identifierMap.delete(key);
		} else {
			const client = this.clientMap.get(key);
			if (client) {
				this.identifierMap.delete(client.identifier);
			}
			return this.clientMap.delete(key);
		}
	}

	clear() {
		this.clientMap.clear();
		this.identifierMap.clear();
	}

	get size() {
		return this.clientMap.size;
	}

	clientKeys() {
		return this.clientMap.keys();
	}

	identifierKeys() {
		return this.identifierMap.keys();
	}

	clientValues() {
		return this.clientMap.values();
	}
	identifierValues() {
		return this.identifierMap.values();
	}

	clientForEarch(callbackfn: (value: TClientID, key: TClient, map: Map<TClient, TClientID>) => void) {
		this.clientMap.forEach(callbackfn);
	}

	identifierForeEach(callbackfn: (value: TClient, key: TIdentifier, map: Map<TIdentifier, TClient>) => void) {
		this.identifierMap.forEach(callbackfn);
	}

	/**
	 * 获取客户端使用过个的 id
	 * @param client
	 * @returns
	 */
	public getPacketIdentifierValues(client: TClient) {
		return this.clientMap.get(client)?.packetIdentifier.values();
	}

	/**
	 * 添加一个新的报文标识符
	 *
	 * @remarks
	 * 应用于服务端向客户端分发消息时 （publish)
	 *
	 * @param client
	 * @returns
	 */
	public newPacketIdentifier(client: TClient) {
		let newPacketIdentifier = 0;
		const manager = this.clientMap.get(client);
		if (manager) {
			do {
				newPacketIdentifier = manager.dynamicId++ & 0xffff;
			} while (manager.packetIdentifier.has(newPacketIdentifier) && !newPacketIdentifier);
			manager.packetIdentifier.add(newPacketIdentifier);
		}
		return newPacketIdentifier;
	}

	/**
	 * 释放报文标识符
	 *
	 * @remarks
	 * 当一个 publish 消息结束时进行释放报文标识符, 仅应用于 PUBACK、PUBREC、PUBCOMP 报文中	 *
	 *
	 * @param client
	 * @param id 被释放的报文标识符
	 */
	public deletePacketIdentifier(client: TClient, id: number) {
		this.clientMap.get(client)?.packetIdentifier.delete(id);
	}

	/**
	 * 检测当前用户是否存在指定的报文标识符
	 * @param client
	 * @param id 被检测的报文标识符
	 * @returns
	 */
	public hasPacketIdentifier(client: TClient, id: number) {
		return this.clientMap.get(client)?.packetIdentifier.has(id);
	}

	/**
	 * 清空当前用户的报文标识符
	 * @param client
	 */
	public clearPacketIdentifier(client: TClient) {
		this.clientMap.get(client)?.packetIdentifier.clear();
	}
}

export abstract class Manager {
	abstract readonly clientIdentifierManager: ClientIdentifierManager;

	/**
	 * 查询所有服务端是由有用户连接
	 * @param clientIdentifier
	 */
	abstract isConnected(key: TClient): Promise<boolean>;
	/**
	 * 查询当前进程是否有用户连接
	 * @param client
	 */
	abstract isConnected(key: TIdentifier): Promise<boolean>;

	/**
	 * 建立连接
	 * @param connData
	 */
	abstract connect(clientIdentifier: string, connData: IConnectData, client: TClient): Promise<void>;

	/**
	 * 断开连接
	 * @param clientIdentifier
	 */
	public disconnect(clientIdentifier: string | TClient): void {
		typeof clientIdentifier === 'string' ? this.clientIdentifierManager.getIdendifier(clientIdentifier)?.end() : clientIdentifier.end();
	}

	/**
	 * 清除客户端连接的信息
	 * @param clientIdentifier
	 */
	abstract clearConnect(clientIdentifier: TClient | TIdentifier): void;

	/**
	 * 清除该用户的所有订阅信息
	 * @param clientIdentifier 订阅者
	 */
	abstract clearSubscribe(clientIdentifier: string): Promise<void>;

	/**
	 * 添加主题订阅，订阅信息
	 * @param client 订阅者
	 * @param topic 订阅主题
	 * @param data 订阅配置信息
	 */
	abstract subscribe(clientIdentifier: string, topic: TTopic, data: TSubscribeData): Promise<void>;

	/**
	 * 取消主题订阅
	 * @param clientIdentifier 订阅者
	 * @param topic 订阅主题
	 */
	abstract unsubscribe(clientIdentifier: string, topic: TTopic): Promise<void>;

	/**
	 * 检测是订阅是否存在
	 * @param topic
	 * @returns
	 */
	abstract isSubscribe(topic: TTopic): Promise<boolean>;

	/**
	 * 获取客户端订阅信息
	 * @param client
	 * @returns
	 */
	abstract getSubscription(clientIdentifier: TIdentifier, topic: string): Promise<TSubscribeData | undefined>;

	/**
	 * 发布主题
	 * @param topic 订阅主题
	 * @param pubData 推送内容
	 */
	abstract publish(clientIdentifier: string, topic: TTopic, pubData: IPublishData): void;

	/**
	 * 心跳检测,更新 keepalive 时间
	 * @param clientIdentifier	客户端标识符
	 */
	abstract ping(clientIdentifier: string): Promise<void>;

	/**
	 * 获取客户端使用过个的 id
	 * @param client
	 * @returns
	 */
	public getPacketIdentifierValues(client: TClient) {
		return this.clientIdentifierManager.getPacketIdentifierValues(client);
	}

	/**
	 * 添加一个新的报文标识符
	 *
	 * @remarks
	 * 应用于服务端向客户端分发消息时 （publish)
	 *
	 * @param client
	 * @returns
	 */
	public newPacketIdentifier(client: TClient) {
		return this.clientIdentifierManager.newPacketIdentifier(client);
	}

	/**
	 * 释放报文标识符
	 *
	 * @remarks
	 * 当一个 publish 消息结束时进行释放报文标识符, 仅应用于 PUBACK、PUBREC、PUBCOMP 报文中	 *
	 *
	 * @param client
	 * @param id 被释放的报文标识符
	 */
	public deletePacketIdentifier(client: TClient, id: number) {
		this.clientIdentifierManager.deletePacketIdentifier(client, id);
	}

	/**
	 * 检测当前用户是否存在指定的报文标识符
	 * @param client
	 * @param id 被检测的报文标识符
	 * @returns
	 */
	public hasPacketIdentifier(client: TClient, id: number) {
		return this.clientIdentifierManager.hasPacketIdentifier(client, id);
	}

	/**
	 * 清空当前用户的报文标识符
	 * @param client
	 */
	public clearPacketIdentifier(client: TClient) {
		this.clientIdentifierManager.clearPacketIdentifier(client);
	}

	/************************** PUBLISH 保留消息 **************************/
	abstract addRetainMessage(topic: string, pubData: IPublishData, retainTTL?: number): Promise<void>;

	abstract deleteRetainMessage(topic: string): Promise<void>;

	abstract getRetainMessage(topic: string): Promise<IPublishData | undefined>;

	abstract forEachRetainMessage(callbackfn: (topic: string, data: IPublishData) => Promise<void>): Promise<void>;
}
