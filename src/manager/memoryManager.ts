import { MqttManager } from '..';
import { IConnectData, IPublishData } from '../interface';
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
	}

	getClient(clientIdentifier: TIdentifier) {
		return this.clientIdentifierManager.getIdendifier(clientIdentifier);
	}

	isConnected(key: TClient): Promise<boolean>;
	isConnected(key: TIdentifier): Promise<boolean>;
	async isConnected(key: TClient | TIdentifier): Promise<boolean> {
		if (typeof key === 'string') {
			const client = this.clientIdentifierManager.getIdendifier(key);
			if (client) {
				return this.clientDataMap.has(client);
			}
			return false;
		} else {
			return this.clientDataMap.has(key);
		}
	}

	public async connect(clientIdentifier: string, connData: IConnectData, client: TClient): Promise<void> {
		this.clientIdentifierManager.set(client, clientIdentifier);
		if (!this.clientDataMap.has(client)) {
			this.clientDataMap.set(client, {
				subscription: new Map(),
			});
		}
	}

	disconnect(clientIdentifier: TIdentifier): void;
	disconnect(client: TClient): void;
	disconnect(client: TClient | TIdentifier): void {
		if (typeof client === 'string') {
		}
	}

	async clear(clientIdentifier: string): Promise<void> {
		const client = this.clientIdentifierManager.getIdendifier(clientIdentifier);
		if (client) {
			this.clientDataMap.get(client)?.subscription.forEach((value, key) => {
				this.unsubscribe(clientIdentifier, key);
			});

			this.clientDataMap.delete(client);
		}
	}
	clearSubscribe(clientIdentifier: string): void {
		throw new Error('Method not implemented.');
	}
	subscribe(clientIdentifier: string, topic: string, data: TSubscribeData): void {
		const client = this.clientIdentifierManager.getIdendifier(clientIdentifier);
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

	async unsubscribe(clientIdentifier: string, topic: string): Promise<void> {
		const client = this.clientIdentifierManager.getIdendifier(clientIdentifier);
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
	publish(topic: string, callbackfn: (client: TClient, data: TSubscribeData) => void) {
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
	}

	/**
	 * 检测是订阅是否存在
	 * @param topic
	 * @returns
	 */
	public async isSubscribe(topic: string) {
		const find = (nodes: Array<string>, index: number, route: IRoute) => {
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
	public async getSubscription(client: TClient): Promise<TClientSubscription | undefined> {
		return this.clientDataMap.get(client)?.subscription;
	}

	public async addRetainMessage(topic: string, pubData: IPublishData) {
		this.retainMessage.set(topic, {
			TTL: Math.floor(Date.now()) + MqttManager.defaultProperties.retainTTL,
			data: pubData,
		});
	}

	public async deleteRetainMessage(topic: string) {
		this.retainMessage.delete(topic);
	}

	public async getRetainMessage(topic: string) {
		return this.retainMessage.get(topic)?.data;
	}

	public async forEachRetainMessage(callbackfn: (topic: string, data: IPublishData) => void) {
		this.retainMessage.forEach((value, key) => {
			callbackfn(key, value.data);
		});
	}
}
