import { IConnectData, IPublishData, QoSType } from '../interface';
import { encodePublishPacket } from '../parse';
import { ClientIdentifierManager, Manager, TClient, TClientSubscription, TIdentifier, TSubscribeData, TTopic } from './manager';

interface IRoute {
	[key: string]: {
		clients: Map<TClient, TTopic>;
		child?: IRoute;
	};
}

export class MemoryManager extends Manager {
	clientIdentifierManager: ClientIdentifierManager;
	private retainMessage = new Map<string, { data: IPublishData; TTL: number }>();
	private connectDataMap = new Map<TClient, { data: IConnectData; expire: number }>();

	private clientDataMap = new Map<
		TClient,
		{
			subscription: TClientSubscription;
		}
	>();
	private route: IRoute = {};

	constructor() {
		super();
		this.clientIdentifierManager = new ClientIdentifierManager();

		// 定时清理过期的 retainMessage
		setInterval(() => {
			const timestamp = Math.floor(Date.now() / 1000);
			this.retainMessage.forEach((value, key) => {
				if (timestamp > value.TTL) {
					this.retainMessage.delete(key);
				}
			});
		}, 1000 * 60);

		// 定时清理过期的 retainMessage
		setInterval(() => {
			const timestamp = Math.floor(Date.now() / 1000);
			this.connectDataMap.forEach((value, key) => {
				if (timestamp > value.expire) {
					this.disconnect(key);
				}
			});
			// }, 1000 * 60);
		}, 1000);
	}

	getClient(clientIdentifier: TIdentifier) {
		return this.clientIdentifierManager.getIdentifier(clientIdentifier);
	}

	isConnected(key: TClient): Promise<boolean>;
	isConnected(key: TIdentifier): Promise<boolean>;
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

	public async connect(clientIdentifier: string, connData: IConnectData, client: TClient): Promise<void> {
		this.clientIdentifierManager.set(clientIdentifier, client);
		this.connectDataMap.set(client, { data: connData, expire: Date.now() / 1000 + connData.header.keepAlive * 1.5 });
		if (!this.clientDataMap.has(client)) {
			this.clientDataMap.set(client, {
				subscription: new Map(),
			});
		}
	}

	public async ping(clientIdentifier: string): Promise<void> {
		const client = this.clientIdentifierManager.getIdentifier(clientIdentifier);
		if (client) {
			const connData = this.connectDataMap.get(client);
			if (connData) {
				connData.expire = Date.now() / 1000 + connData.data.header.keepAlive * 1.5;
			}
		}
	}

	public clearConnect(clientIdentifier: TClient | TIdentifier): void {
		const identifier = typeof clientIdentifier === 'string' ? clientIdentifier : this.clientIdentifierManager.getClient(clientIdentifier)?.identifier;
		const client = typeof clientIdentifier === 'string' ? this.clientIdentifierManager.getIdentifier(clientIdentifier) : clientIdentifier;
		if (client && identifier) {
			this.connectDataMap.delete(client);
			this.clearSubscribe(identifier);
			this.clientIdentifierManager.delete(client);
		}
	}

	public async clearSubscribe(clientIdentifier: string): Promise<void> {
		const client = this.clientIdentifierManager.getIdentifier(clientIdentifier);
		if (client) {
			this.clientDataMap.get(client)?.subscription.forEach((value, key) => {
				this.unsubscribe(clientIdentifier, key);
			});

			this.clientDataMap.delete(client);
		}
	}

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
	public publish(clientIdentifier: string, topic: string, pubData: IPublishData) {
		const pubClient = this.getClient(clientIdentifier);
		// if (pubClient) {
		const distributeData: IPublishData = JSON.parse(JSON.stringify(pubData));
		const callbackfn = async (client: TClient, subFlags: TSubscribeData) => {
			if (subFlags.noLocal && client === pubClient) {
				return;
			}

			const minQoS = Math.min(subFlags.qos || 0, pubData.header.qosLevel);
			if (minQoS > QoSType.QoS0) {
				// 增加报文标识符，用来做publish消息结束校验数据来源
				// 向客户端分发 qos1 和 qos2 级别的消息，需要记录 packetIdentifier；
				// 分发 qos2 消息时当收到客户端返回 pubRec、PubComp 数据包需要校验 packetIdentifier;
				// 分发 qos1 消息时当收到客户端返回 pubAck 数据包需要校验 packetIdentifier;
				distributeData.header.packetIdentifier = this.newPacketIdentifier(client);
				distributeData.header.dupFlag = false;
			}
			distributeData.header.qosLevel = minQoS;
			distributeData.header.retain = subFlags.retainAsPublished ? distributeData.header.retain : false;
			const pubPacket = encodePublishPacket(distributeData);
			client.write(pubPacket);
		};

		const match = (nodes: Array<string>, index: number, route: IRoute) => {
			for (const node of [nodes[index], '+']) {
				const currentRoute = route[node];
				if (currentRoute) {
					if (nodes.length === index + 1) {
						currentRoute.clients.forEach((topic, client) => {
							const data = this.clientDataMap.get(client)?.subscription.get(topic);
							if (data) {
								callbackfn(client, data);
							}
						});

						if (nodes.length == index + 1 && route[nodes[index]]) {
							const childRoute = route[nodes[index]].child;
							if (childRoute && childRoute['#']) {
								childRoute['#'].clients.forEach((topic, client) => {
									const data = this.clientDataMap.get(client)?.subscription.get(topic);
									if (data) {
										callbackfn(client, data);
									}
								});
							}
						}
					} else if (currentRoute.child) {
						match(nodes, index + 1, currentRoute.child);
					}
				}
			}
			if (route['#']) {
				route['#'].clients.forEach((topic, client) => {
					const data = this.clientDataMap.get(client)?.subscription.get(topic);
					if (data) {
						callbackfn(client, data);
					}
				});
			}
		};
		const nodes = topic.split('/');
		match(nodes, 0, this.route);
		// }
	}

	/**
	 * 检测是订阅是否存在
	 * @param topic
	 * @returns
	 */
	public async isSubscribe(topic: string) {
		const find = (nodes: Array<string>, index: number, route: IRoute): boolean => {
			for (const node of [nodes[index], '+']) {
				const currentRoute = route[node];
				if (currentRoute) {
					if (nodes.length == index + 1) {
						if (currentRoute.clients.size) {
							return true;
						}
						return false;
					} else if (currentRoute.child) {
						return find(nodes, index + 1, currentRoute.child);
					}
				}
			}
			return false;
		};

		const nodes = topic.split('/');
		return find(nodes, 0, this.route);
	}

	/**
	 * 获取客户端订阅信息
	 * @param client
	 * @returns
	 */
	public async getSubscription(clientIdentifier: TIdentifier, topic: string): Promise<TSubscribeData | undefined> {
		const client = this.clientIdentifierManager.getIdentifier(clientIdentifier);
		if (client) {
			return this.clientDataMap.get(client)?.subscription.get(topic);
		}
		return undefined;
	}

	public async addRetainMessage(topic: string, pubData: IPublishData, retainTTL?: number) {
		this.retainMessage.set(topic, {
			TTL: Math.floor(Date.now() / 1000) + (retainTTL ?? 3600),
			data: pubData,
		});
	}

	public async deleteRetainMessage(topic: string) {
		this.retainMessage.delete(topic);
	}

	public async getRetainMessage(topic: string) {
		const ratainData: any = this.retainMessage.get(topic);
		if (ratainData && ratainData.TTL > Math.floor(Date.now() / 1000)) {
			return this.retainMessage.get(topic)?.data;
		}
		return undefined;
	}

	public async forEachRetainMessage(callbackfn: (topic: string, data: IPublishData) => Promise<void>) {
		const nowDate = Math.floor(Date.now() / 1000);
		this.retainMessage.forEach(async (value, key) => {
			if (value.TTL < nowDate) {
				await callbackfn(key, value.data);
			}
		});
	}
}
