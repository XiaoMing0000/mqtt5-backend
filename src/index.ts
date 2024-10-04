import net from 'net';
import {
	ConnectAckReasonCode,
	DisconnectException,
	DisconnectReasonCode,
	PubAckException,
	PubAckReasonCode,
	PubCompReasonCode,
	SubscribeAckException,
	SubscribeAckReasonCode,
	UnsubscribeAckReasonCode,
} from './exception';
import {
	IConnAckData,
	IConnectData,
	IDisconnectData,
	IDisconnectProperties,
	IPubAckData,
	IPublishData,
	IPubRecData,
	IPubRelData,
	ISubAckData,
	ISubscribeData,
	IUnsubscribeData,
	PacketType,
	QoSType,
} from './interface';
import {
	encodeConnAck,
	encodeDisconnect,
	encodePubControlPacket,
	encodePublishPacket,
	EncoderProperties,
	encodeSubAckPacket,
	encodeVariableByteInteger,
	integerToTwoUint8,
} from './parse';
import { topicToRegEx } from './topicFilters';

type TNetSocket = net.Socket;
type TSubscribeData = {
	qos: QoSType;
	date: Date;
	subscriptionIdentifier?: number;
	noLocal: boolean;
	retainAsPublished: boolean;
};
type TTopic = string;
type TClientSubscription = Map<TTopic, TSubscribeData>;

export class ClientManager {
	private topicMap = new Map<string, Set<TNetSocket>>();
	private packetIdentifier = 0;
	private clientManager = new Map<
		TNetSocket,
		{
			subscription: TClientSubscription;
			packetIdentifier: Set<number>;
			dynamicId: number;
		}
	>();
	// 记录保留消息
	private retainMessage = new Map<string, { data: IPublishData; TTL: number }>();

	constructor() {
		setInterval(() => {
			const timestamp = Math.floor(Date.now() / 1000);
			this.retainMessage.forEach((value, key) => {
				if (timestamp > value.TTL) {
					this.retainMessage.delete(key);
				}
			});
		}, 1000);
	}

	/**
	 * 获取并更新 packetIdentifier
	 * @returns
	 */
	public getPacketIdentifier() {
		return this.packetIdentifier++ & 0xffff;
	}

	/**
	 * 初始化客户端连接信息
	 * @param client
	 */
	public initClient(client: TNetSocket) {
		if (!this.clientManager.has(client)) {
			this.clientManager.set(client, {
				subscription: new Map(),
				packetIdentifier: new Set(),
				dynamicId: 1,
			});
		}
	}

	/**
	 * 添加主题订阅，订阅信息
	 * @param client 订阅者
	 * @param topic 订阅主题
	 * @param data 订阅配置信息
	 */
	public subscribe(client: TNetSocket, topic: string, data: TSubscribeData) {
		if (this.clientManager.has(client)) {
			this.clientManager.get(client)?.subscription.set(topic, data);
		}
		// TODO 添加通配符订阅主题
		// TODO subscribe 主题名合法性校验和 publish 主题名非法性校验

		if (!this.topicMap.has(topic)) {
			const clientSet = new Set<TNetSocket>();
			clientSet.add(client);
			this.topicMap.set(topic, clientSet);
		} else {
			const clientSet = this.topicMap.get(topic);
			clientSet?.add(client);
		}
	}

	/**
	 * 取消主题订阅
	 * @param client 订阅者
	 * @param topic 订阅主题
	 */
	public unsubscribe(client: TNetSocket, topic: string) {
		const clientManager = this.clientManager.get(client)?.subscription;
		if (clientManager) {
			clientManager.delete(topic);
		}

		const clientSet = this.topicMap.get(topic);
		if (clientSet) {
			clientSet.delete(client);
			if (!clientSet.size) {
				this.topicMap.delete(topic);
			}
		}
	}

	/**
	 * 遍历订阅指定主题的订阅者
	 * @param topic 订阅主题
	 * @param callbackfn 遍历回调函数
	 */
	public forEach(topic: string, callbackfn: (client: TNetSocket, data: TSubscribeData) => void) {
		this.topicMap.forEach((topicClientSet, topicKey) => {
			if (!new RegExp(topicKey).test(topic)) {
				return;
			}
			topicClientSet.forEach((cli) => {
				// const clientManager = this.clientSubscription.get(cli);
				const clientSubscription = this.clientManager.get(cli)?.subscription;
				const subscriptionData = clientSubscription?.get(topicKey);
				if (subscriptionData) {
					callbackfn(cli, subscriptionData);
				}
			});
		});
	}

	/**
	 * 获取客户端订阅信息
	 * @param client
	 * @returns
	 */
	public getSubscription(client: TNetSocket) {
		return this.clientManager.get(client)?.subscription;
	}

	/**
	 * 检测是订阅是否存在
	 * @param topic
	 * @returns
	 */
	public isSubscribe(topic: string) {
		return this.topicMap.has(topic);
	}

	/**
	 * 获取客户端使用过个的 id
	 * @param client
	 * @returns
	 */
	public getPacketIdentifierValues(client: TNetSocket) {
		return this.clientManager.get(client)?.packetIdentifier.values();
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
	public newPacketIdentifier(client: TNetSocket) {
		let newPacketIdentifier = 0;
		const manager = this.clientManager.get(client);
		if (manager) {
			do {
				newPacketIdentifier = manager.dynamicId++ && 0xffff;
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
	public deletePacketIdentifier(client: TNetSocket, id: number) {
		this.clientManager.get(client)?.packetIdentifier.delete(id);
	}

	/**
	 * 检测当前用户是否存在指定的报文标识符
	 * @param client
	 * @param id 被检测的报文标识符
	 * @returns
	 */
	public hasPacketIdentifier(client: TNetSocket, id: number) {
		return this.clientManager.get(client)?.packetIdentifier.has(id);
	}

	/**
	 * 清空当前用户的报文标识符
	 * @param client
	 */
	public clearPacketIdentifier(client: TNetSocket) {
		this.clientManager.get(client)?.packetIdentifier.clear();
	}

	/**
	 * 清除该用户的所有订阅信息
	 * @param client 订阅者
	 */
	public clear(client: TNetSocket) {
		this.clientManager.get(client)?.subscription.forEach((value, key) => {
			this.topicMap.get(key)?.delete(client);
		});
		this.clientManager.delete(client);
	}

	/************************** PUBLISH 保留消息 **************************/
	public addRetainMessage(topic: string, pubData: IPublishData) {
		this.retainMessage.set(topic, {
			TTL: Math.floor(Date.now()) + MqttManager.defaultProperties.retainTTL,
			data: pubData,
		});
	}

	public deleteRetainMessage(topic: string) {
		this.retainMessage.delete(topic);
	}

	public getRetainMessage(topic: string) {
		return this.retainMessage.get(topic);
	}

	public forEachRetainMessage(callbackfn: (topic: string, data: IPublishData) => void) {
		this.retainMessage.forEach((value, key) => {
			callbackfn(key, value.data);
		});
	}
}

export class MqttManager {
	static defaultProperties = {
		maximumQoS: 2,
		retainAvailable: true,
		retainTTL: 30 * 60,
		maximumPacketSize: 1 << 20,
		topicAliasMaximum: 65535,
		wildcardSubscriptionAvailable: false,
	};

	// 当前客户推送消息的 topic alisa name
	topicAliasNameMap: { [key: number]: string } = {};
	receiveCounter = 0;

	protected connData: IConnectData = {
		header: {
			packetType: PacketType.RESERVED,
			packetFlags: 0,
			remainingLength: 0,
			protocolName: '',
			protocolVersion: 0,
			keepAlive: 0,
		},
		connectFlags: {} as any,
		properties: {},
		payload: {
			clientIdentifier: '',
		},
	};

	constructor(
		private readonly client: TNetSocket,
		private readonly clientManager: ClientManager,
	) {}
	/**
	 * 连接响应报文
	 * @returns
	 */
	public handleConnAck(connData: IConnectData, reasonCode?: ConnectAckReasonCode, reasonString?: string) {
		const connAckData: IConnAckData = {
			header: {
				packetType: PacketType.CONNACK,
				reserved: 0x00,
				reasonCode: reasonCode ?? 0x00,
			},
			acknowledgeFlags: {
				SessionPresent: false,
			},
			properties: {
				reasonString,
			},
		};

		if (this.connData.connectFlags.cleanStart) {
			connAckData.acknowledgeFlags.SessionPresent = false;
		} else {
			// TODO 校验服务端是否已经保存了此客户端表示的 ClientID 的 会话状态 Session State

			connAckData.acknowledgeFlags.SessionPresent = true;
		}

		if (!this.connData.properties.requestProblemInformation) {
			// 仅当 request problem information 为 0 时才能向用户发送 properties 3.1.2.11.7
		}

		connAckData.properties = {
			receiveMaximum: this.connData.properties.receiveMaximum,
			retainAvailable: MqttManager.defaultProperties.retainAvailable,
			maximumPacketSize: MqttManager.defaultProperties.maximumPacketSize,
			topicAliasMaximum: MqttManager.defaultProperties.topicAliasMaximum,
			wildcardSubscriptionAvailable: MqttManager.defaultProperties.wildcardSubscriptionAvailable,
			subscriptionIdentifierAvailable: true,
			sharedSubscriptionAvailable: true,
		};
		// TODO 是否支持订阅，需要在 subscribe 报文中校验
		// TODO 未作通配符

		const connPacket = encodeConnAck(connAckData);
		console.log(connPacket);
		this.client.write(connPacket);
		if (reasonCode === ConnectAckReasonCode.UnsupportedProtocolVersion) {
			this.client.end();
		}
		console.log('------------------');
	}

	/**
	 * 处理连接报
	 * @param buffer
	 */
	public connectHandle(connData: IConnectData) {
		this.connData = connData;
		if (this.connData.connectFlags.cleanStart) {
			this.clientManager.clear(this.client);
			this.receiveCounter = 0;
		}

		this.clientManager.initClient(this.client);
		// console.log('connData: ', this.connData);
		this.connData.properties.receiveMaximum ??= 0xffff;
		this.handleConnAck(this.connData);
	}

	public disconnectHandle(disconnectData: IDisconnectData) {
		this.client.end();
	}

	public handleDisconnect(reasonCode: DisconnectReasonCode, properties: IDisconnectProperties) {
		const disconnectPacket = encodeDisconnect({
			header: {
				packetType: PacketType.DISCONNECT,
				received: 0,
				remainingLength: 0,
				reasonCode: reasonCode,
			},
			properties: properties,
		});
		this.client.end(Buffer.from(disconnectPacket));
	}

	public pingReqHandle() {
		this.client.write(Buffer.from([PacketType.PINGRESP << 4, 0]));
	}

	public publishHandle(pubData: IPublishData) {
		console.log('pubData: ', pubData);
		// 数据校验
		if (pubData.properties.topicAlias && pubData.properties.topicAlias > MqttManager.defaultProperties.topicAliasMaximum) {
			throw new PubAckException(
				'A Client MUST accept all Topic Alias values greater than 0 and less than or equal to the Topic Alias Maximum value that it sent in the CONNECT packet.',
				PubAckReasonCode.PacketIdentifierInUse,
			);
		}
		if (pubData.header.qosLevel > MqttManager.defaultProperties.maximumQoS) {
			throw new DisconnectException('The Client specified a QoS greater than the QoS specified in a Maximum QoS in the CONNACK.', DisconnectReasonCode.QoSNotSupported);
		}

		// 添加主题别名映射
		if (pubData.header.topicName && pubData.properties.topicAlias) {
			this.topicAliasNameMap[pubData.properties.topicAlias] = pubData.header.topicName;
		} else if (pubData.properties.topicAlias) {
			pubData.header.topicName = this.topicAliasNameMap[pubData.properties.topicAlias];
		}
		// 保留消息处理
		if (MqttManager.defaultProperties.retainAvailable && pubData.header.retain) {
			if (pubData.payload) {
				this.clientManager.addRetainMessage(pubData.header.topicName, pubData);
			} else {
				this.clientManager.deleteRetainMessage(pubData.header.topicName);
			}
		}

		delete pubData.properties.topicAlias;
		// TODO 向订阅者发布消息，未启动通配符订阅
		// 拷贝数据，隔离服务端和客户端 PUBACK 报文
		const distributeData: IPublishData = JSON.parse(JSON.stringify(pubData));
		distributeData.header.udpFlag = false;
		this.clientManager.forEach(distributeData.header.topicName, (client, subFlags) => {
			if (subFlags.noLocal && client === this.client) {
				return;
			}
			// 如果使用通配符进行订阅，可能会匹配多个订阅，如果订阅标识符存在则必须将这些订阅标识符发送给用户
			const publishSubscriptionIdentifier: Array<number> = [];
			let maxQoS = 0;

			// 获取当前用户订阅匹配到主题的最大 qos 等级
			this.clientManager.getSubscription(client)?.forEach((data, topic) => {
				if (new RegExp(topic).test(distributeData.header.topicName)) {
					// eslint-disable-next-line @typescript-eslint/no-unused-expressions
					data.subscriptionIdentifier && publishSubscriptionIdentifier.push(data.subscriptionIdentifier);
					maxQoS = data.qos > maxQoS ? data.qos : maxQoS;
				}
			});
			if (maxQoS > QoSType.QoS0) {
				// 增加报文标识符，用来做publish消息结束校验数据来源
				// 向客户端分发 qos1 和 qos2 级别的消息，需要记录 packetIdentifier；
				// 分发 qos2 消息时当收到客户端返回 pubRec、PubComp 数据包需要校验 packetIdentifier;
				// 分发 qos1 消息时当收到客户端返回 pubAck 数据包需要校验 packetIdentifier;
				distributeData.header.packetIdentifier = this.clientManager.newPacketIdentifier(client);
			}
			distributeData.header.qosLevel = maxQoS;
			distributeData.properties.subscriptionIdentifier = publishSubscriptionIdentifier;
			distributeData.header.retain = subFlags.retainAsPublished ? distributeData.header.retain : false;
			const pubPacket = encodePublishPacket(distributeData);
			client.write(pubPacket);
		});

		// 响应推送者
		if (pubData.header.qosLevel === QoSType.QoS1) {
			this.handlePubAck(pubData);
		} else if (pubData.header.qosLevel === QoSType.QoS2) {
			this.handlePubRec(pubData);
		}
	}
	private handlePubAck(pubData: IPublishData) {
		this.receiveCounter++;
		if (this.receiveCounter > (this.connData.properties.receiveMaximum ?? 0xffff)) {
			throw new DisconnectException(
				'The Client MUST NOT send more than Receive Maximum QoS 1 and QoS 2 PUBLISH packets for which it has not received PUBACK, PUBCOMP, or PUBREC with a Reason Code of 128 or greater from the Server.',
				DisconnectReasonCode.ReceiveMaximumExceeded,
			);
		}

		const pubAckData: IPubAckData = {
			header: {
				packetType: PacketType.PUBACK,
				packetIdentifier: pubData.header.packetIdentifier ?? 0,
				received: 0x00,
				reasonCode: 0x00,
			},
			properties: {},
		};

		const pubAckPacket = encodePubControlPacket(pubAckData);
		this.client.write(pubAckPacket);
	}

	private handlePubRec(pubData: IPublishData) {
		const pubRecData: IPubRecData = {
			header: {
				packetType: PacketType.PUBREC,
				packetIdentifier: pubData.header.packetIdentifier ?? 0,
				received: 0x00,
				reasonCode: 0x00,
			},
			properties: {},
		};
		const pubRecPacket = encodePubControlPacket(pubRecData);
		this.client.write(pubRecPacket);
	}

	public pubAckHandle(pubAckData: IPubAckData) {
		if (!this.clientManager.hasPacketIdentifier(this.client, pubAckData.header.packetIdentifier)) {
			throw new DisconnectException('PUBACK contained unknown packet identifier!', DisconnectReasonCode.ProtocolError);
		}
		// 释放报文标识符
		this.clientManager.deletePacketIdentifier(this.client, pubAckData.header.packetIdentifier);
		console.log('pubAckData: ', pubAckData);
	}

	public pubRelHandle(pubRelData: IPubRelData) {
		// console.log('pubRelData: ', pubRelData);
		this.handlePubComp(pubRelData);
	}

	private handlePubComp(pubRelData: IPubRelData) {
		this.receiveCounter++;
		if (this.receiveCounter > (this.connData.properties.receiveMaximum ?? 0xffff)) {
			throw new DisconnectException(
				'The Client MUST NOT send more than Receive Maximum QoS 1 and QoS 2 PUBLISH packets for which it has not received PUBACK, PUBCOMP, or PUBREC with a Reason Code of 128 or greater from the Server.',
				DisconnectReasonCode.ReceiveMaximumExceeded,
			);
		}
		const properties = new EncoderProperties();
		const compPacket = Buffer.from([
			PacketType.PUBCOMP << 4,
			...encodeVariableByteInteger(3 + properties.length),
			...integerToTwoUint8(pubRelData.header.packetIdentifier),
			PubCompReasonCode.Success,
			...properties.buffer,
		]);
		this.client.write(compPacket);
	}

	public pubRecHandle(pubRecData: IPubRecData) {
		// console.log('pubRecData: ', pubRecData);
		if (!this.clientManager.hasPacketIdentifier(this.client, pubRecData.header.packetIdentifier)) {
			throw new DisconnectException('PUBREC contained unknown packet identifier!', DisconnectReasonCode.ProtocolError);
		}
		this.handlePubRel(pubRecData);
	}

	private handlePubRel(pubRecData: IPubRecData) {
		const properties = new EncoderProperties();
		const pubRelPacket = Buffer.from([
			(PacketType.PUBREL << 4) | 0x02,
			...encodeVariableByteInteger(3 + properties.length),
			...integerToTwoUint8(pubRecData.header.packetIdentifier),
			PubCompReasonCode.Success,
			...properties.buffer,
		]);
		this.client.write(pubRelPacket);
	}

	public pubCompHandle(pubCompData: IPubRecData) {
		// console.log('pubCompData: ', pubCompData);
		if (!this.clientManager.hasPacketIdentifier(this.client, pubCompData.header.packetIdentifier)) {
			throw new DisconnectException('PUBCOMP contained unknown packet identifier!', DisconnectReasonCode.ProtocolError);
		}
		// 释放报文标识符
		this.clientManager.deletePacketIdentifier(this.client, pubCompData.header.packetIdentifier);
	}

	public subscribeHandle(subData: ISubscribeData) {
		// console.log('subData: ', subData);
		const topic = topicToRegEx(subData.payload);
		if (!topic) {
			throw new SubscribeAckException('The topic filter format is incorrect and cannot be received by the server.', SubscribeAckReasonCode.TopicFilterInvalid);
		} else {
			this.clientManager.subscribe(this.client, topic, {
				qos: subData.options.qos,
				date: new Date(),
				subscriptionIdentifier: subData.properties.subscriptionIdentifier,
				noLocal: subData.options.noLocal,
				retainAsPublished: subData.options.retainAsPublished,
			});
		}

		// TODO 3.8.4 SUBSCRIBE Actions

		// 允许推送保留消息
		if (
			MqttManager.defaultProperties.retainAvailable &&
			(subData.options.retainHandling == 0 || (subData.options.retainHandling == 1 && this.clientManager.isSubscribe(subData.payload)))
		) {
			this.clientManager.forEachRetainMessage((topic, data) => {
				if (new RegExp(topic).test(subData.payload)) {
					data.header.qosLevel = subData.options.qos;
					data.header.packetIdentifier = this.clientManager.newPacketIdentifier(this.client);
					const publishPacket = encodePublishPacket(data);
					this.client.write(publishPacket);
				}
			});
		}
		// subData.header.packetIdentifier = 100;
		console.log(subData.header.packetIdentifier);
		const subAckData: ISubAckData = {
			header: {
				packetType: PacketType.SUBACK,
				retain: 0x00,
				packetIdentifier: subData.header.packetIdentifier,
			},
			properties: {},
			reasonCode: SubscribeAckReasonCode.GrantedQoS2,
		};
		this.handleSubAck(subAckData);
	}

	public handleSubAck(subAckData: ISubAckData) {
		const subAckPacket = encodeSubAckPacket(subAckData);
		this.client.write(subAckPacket);
	}

	public unsubscribeHandle(unsubscribeData: IUnsubscribeData) {
		console.log('unsubscribeData: ', unsubscribeData);
		const topic = topicToRegEx(unsubscribeData.payload);
		if (!topic) {
			// TODO 检测 topic name 是否符合规则，如果不符合规则，则返回错误或则断开连接
			throw new Error('topic name error');
		}

		this.clientManager.unsubscribe(this.client, topic);
		this.handleUnsubscribeAck(unsubscribeData);
	}

	public handleUnsubscribeAck(unsubscribeData: IUnsubscribeData) {
		let remainingLength = 1;
		const properties = new EncoderProperties();
		remainingLength += properties.length + 2;
		const unsubscribePacket = Buffer.from([
			PacketType.UNSUBACK << 4,
			...encodeVariableByteInteger(remainingLength),
			...integerToTwoUint8(unsubscribeData.header.packetIdentifier),
			...properties.buffer,
			UnsubscribeAckReasonCode.Success,
		]);
		this.client.write(unsubscribePacket);
	}
}
