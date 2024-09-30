import net from 'net';
import {
	ConnectAckException,
	DisconnectException,
	DisconnectReasonCode,
	PubAckException,
	PubAckReasonCode,
	PubCompReasonCode,
	SubscribeAckReasonCode,
	UnsubscribeAckReasonCode,
} from './exception';
import {
	ConnAckPropertyIdentifier,
	IConnectData,
	IDisconnectData,
	IDisconnectProperties,
	IPubAckData,
	IPublishData,
	IPubRecData,
	IPubRelData,
	ISubscribeData,
	IUnsubscribeData,
	PacketType,
	PropertyIdentifier,
	QoSType,
} from './interface';
import {
	encodeDisconnect,
	encodePublishPacket,
	EncoderProperties,
	encodeVariableByteInteger,
	integerToTwoUint8,
	parseConnect,
	parseDisconnect,
	parsePubAck,
	parsePublish,
	parsePubRec,
	parsePubRel,
	parseSubscribe,
	parseUnsubscribe,
} from './parse';

type TNetSocket = net.Socket;
type TSubscribeData = {
	qos: QoSType;
	date: Date;
	subscriptionIdentifier?: number;
};
type TTopic = string;
type TClientSubscription = Map<TTopic, TSubscribeData>;

export class SubscriptionManger {
	private clientSubscription = new Map<TNetSocket, TClientSubscription>();
	private topicMap = new Map<string, Set<TNetSocket>>();
	private packetIdentifier = 0;

	/**
	 * 获取并更新 packetIdentifier
	 * @returns
	 */
	public getPacketIdentifier() {
		return this.packetIdentifier++ & 0xffff;
	}

	/**
	 * 添加主题订阅，订阅信息
	 * @param client 订阅者
	 * @param topic 订阅主题
	 * @param data 订阅配置信息
	 */
	public subscribe(client: TNetSocket, topic: string, data: TSubscribeData) {
		if (!this.clientSubscription.has(client)) {
			const clientSubscription: TClientSubscription = new Map();
			clientSubscription.set(topic, data);
			this.clientSubscription.set(client, clientSubscription);
		} else {
			const clientSubscription = this.clientSubscription.get(client);
			clientSubscription?.set(topic, data);
		}

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
		const subscription = this.clientSubscription.get(client);
		if (subscription) {
			subscription.delete(topic);
			if (!subscription.size) {
				this.clientSubscription.delete(client);
			}
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
		const clientSet = this.topicMap.get(topic);
		if (clientSet) {
			clientSet.forEach((cli) => {
				const subscription = this.clientSubscription.get(cli);
				const clientData = subscription?.get(topic);
				if (clientData) {
					callbackfn(cli, clientData);
				}
			});
		}
	}

	public getSubscription(client: TNetSocket) {
		return this.clientSubscription.get(client);
	}

	/**
	 * 清除该用户的所有订阅信息
	 * @param client 订阅者
	 */
	public clear(client: TNetSocket) {
		this.clientSubscription.get(client)?.forEach((value, key) => {
			this.topicMap.get(key)?.delete(client);
		});
		this.clientSubscription.delete(client);
	}
}

export class MqttManager {
	static defaultProperties = {
		maximumQoS: 2,
		receiveMaximum: 32,
		maximumPacketSize: 1 << 20,
		topicAliasMaximum: 65535,
		wildcardSubscriptionAvailable: false,
	};

	// 当前客户推送消息的 topic alisa name
	topicAliasNameMap: { [key: number]: string } = {};

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
		private readonly subscription: SubscriptionManger,
	) {}
	/**
	 * 连接响应报文
	 * @returns
	 */
	private handleConnAck() {
		const connAckData: {
			fixedHeader: number;
			remainingLength: number;
			acknowledgeFlags: number;
			reasonCode: number;
			properties: EncoderProperties;
		} = {
			fixedHeader: 0x20,
			remainingLength: 0,
			acknowledgeFlags: 0x00,
			reasonCode: 0x00,
			properties: new EncoderProperties(),
		};

		if (this.connData.connectFlags.cleanStart) {
			connAckData.acknowledgeFlags &= 0xfe;
		} else {
			// TODO 校验服务端是否已经保存了此客户端表示的 ClientID 的 会话状态 Session State
			connAckData.acknowledgeFlags = 0x01;
		}

		if (!this.connData.properties.requestProblemInformation) {
			// 仅当 request problem information 为 0 时才能向用户发送 properties 3.1.2.11.7
		}

		// 处理 property
		connAckData.properties.add(ConnAckPropertyIdentifier.receiveMaximum, MqttManager.defaultProperties.receiveMaximum);
		// TODO 暂时不支持 QoS 1 2  3.2.2.3.4
		// connAckData.properties.add(ConnAckPropertyIdentifier.maximumQoS, true);
		connAckData.properties.add(ConnAckPropertyIdentifier.retainAvailable, false);
		connAckData.properties.add(ConnAckPropertyIdentifier.maximumPacketSize, MqttManager.defaultProperties.maximumPacketSize);
		connAckData.properties.add(ConnAckPropertyIdentifier.topicAliasMaximum, MqttManager.defaultProperties.topicAliasMaximum);
		// TODO 未作通配符
		connAckData.properties.add(ConnAckPropertyIdentifier.wildcardSubscriptionAvailable, MqttManager.defaultProperties.wildcardSubscriptionAvailable);
		// TODO 是否支持订阅，需要在 subscribe 报文中校验
		connAckData.properties.add(ConnAckPropertyIdentifier.subscriptionIdentifierAvailable, true);
		connAckData.properties.add(ConnAckPropertyIdentifier.sharedSubscriptionAvailable, true);

		// 报文编码
		connAckData.remainingLength = 2 + connAckData.properties.length;
		const connPacket = Buffer.from([
			connAckData.fixedHeader,
			...encodeVariableByteInteger(connAckData.remainingLength),
			connAckData.acknowledgeFlags,
			connAckData.reasonCode,
			...connAckData.properties.buffer,
		]);
		this.client.write(connPacket);
	}

	/**
	 * 处理连接报
	 * @param buffer
	 */
	public connectHandle(buffer: Buffer) {
		try {
			this.connData = parseConnect(buffer);

			if (this.connData.connectFlags.cleanStart) {
				this.subscription.clear(this.client);
			}
			// console.log('connData: ', this.connData);
			this.handleConnAck();
		} catch (error) {
			if (error instanceof ConnectAckException) {
				const properties = new EncoderProperties();
				properties.add(PropertyIdentifier.reasonString, error.msg);
				const errorPacket = Buffer.from([0x20, ...encodeVariableByteInteger(2 + properties.length), 0x00, error.code, ...properties.buffer]);
				this.client.write(errorPacket);
				this.client.end();
			}
		}
	}

	public disconnectHandle(buffer: Buffer) {
		const disconnectData: IDisconnectData = {
			header: {
				packetType: PacketType.DISCONNECT,
				received: 0,
				remainingLength: 0,
				reasonCode: 0x00,
			},
			properties: {},
		};
		try {
			parseDisconnect(buffer, disconnectData);
			this.client.end();
		} catch (err) {
			console.error(err);
			this.client.end();
		}
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
		this.client.write(Buffer.from(disconnectPacket));
	}

	public pingReqHandle() {
		this.client.write(Buffer.from([PacketType.PINGRESP << 4, 0]));
	}

	public publishHandle(buffer: Buffer) {
		const pubData: IPublishData = {
			header: {
				packetType: PacketType.RESERVED,
				udpFlag: false,
				qosLevel: 0,
				retain: false,
				remainingLength: 0,
				topicName: '',
			},
			properties: {},
			payload: '',
		};
		try {
			parsePublish(buffer, pubData);
			const qosLevel = pubData.header.qosLevel;
			const packetIdentifier = pubData.header.packetIdentifier;
			// 记录 packetIdentifier
			if (qosLevel >= QoSType.QoS1) {
				// this.p
			}

			console.log('pubData: ', pubData);
			console.log('pubData: ', buffer);
			console.log('pubData: ', buffer.toString());
			// 数据校验
			if (pubData.properties.topicAlias && pubData.properties.topicAlias > MqttManager.defaultProperties.topicAliasMaximum) {
				throw new PubAckException(
					'A Client MUST accept all Topic Alias values greater than 0 and less than or equal to the Topic Alias Maximum value that it sent in the CONNECT packet.',
					PubAckReasonCode.PacketIdentifierInUse,
				);
			}
			if (pubData.header.qosLevel > MqttManager.defaultProperties.maximumQoS) {
				this.handleDisconnect(DisconnectReasonCode.QoSNotSupported, {
					reasonString: 'The Client specified a QoS greater than the QoS specified in a Maximum QoS in the CONNACK.',
				});
				return;
			}

			// 添加主题别名映射
			if (pubData.header.topicName && pubData.properties.topicAlias) {
				this.topicAliasNameMap[pubData.properties.topicAlias] = pubData.header.topicName;
			} else if (pubData.properties.topicAlias) {
				pubData.header.topicName = this.topicAliasNameMap[pubData.properties.topicAlias];
			}
			delete pubData.properties.topicAlias;
			// TODO 向订阅者发布消息，未启动通配符订阅
			this.subscription.forEach(pubData.header.topicName, (client, data) => {
				// 如果使用通配符进行订阅，可能会匹配多个订阅，如果订阅标识符存在则必须将这些订阅标识符发送给用户
				const publishSubscriptionIdentifier: Array<number> = [];
				let maxQoS = 0;
				const newPacketIdentifier = this.subscription.getPacketIdentifier();
				this.subscription.getSubscription(client)?.forEach((value, key) => {
					if (key === pubData.header.topicName) {
						// eslint-disable-next-line @typescript-eslint/no-unused-expressions
						value.subscriptionIdentifier && publishSubscriptionIdentifier.push(value.subscriptionIdentifier);
						maxQoS = value.qos > maxQoS ? value.qos : maxQoS;

						if (qosLevel === QoSType.QoS0 && pubData.header.qosLevel !== maxQoS) {
							pubData.header.packetIdentifier = newPacketIdentifier;
						}
						pubData.header.qosLevel = maxQoS;
						pubData.properties.subscriptionIdentifier = publishSubscriptionIdentifier;
						const pubPacket = encodePublishPacket(pubData);

						// TODO 向客户端分发 qos1 和 qos2 级别的消息，需要记录 packetIdentifier；
						// 分发 qos2 消息时当收到客户端返回 pubRec、PubComp 数据包需要校验 packetIdentifier;
						// 分发 qos1 消息时当收到客户端返回 pubAck 数据包需要校验 packetIdentifier;
						client.write(pubPacket);
					}
				});
			});

			// 相应推送者
			pubData.header.qosLevel = qosLevel;
			pubData.header.packetIdentifier = packetIdentifier;
			if (pubData.header.qosLevel === QoSType.QoS1) {
				this.handlePubAck(pubData);
			} else if (pubData.header.qosLevel === QoSType.QoS2) {
				this.handlePubRec(pubData);
			}
		} catch (error) {
			if (error instanceof PubAckException) {
				if (error instanceof PubAckException) {
					if (pubData.header.qosLevel > 0 && pubData.header.packetIdentifier) {
						const packetIdentifier = pubData.header.packetIdentifier;

						const properties = new EncoderProperties();
						properties.add(PropertyIdentifier.reasonString, error.msg);
						const errorPacket = Buffer.from([
							0x40,
							...encodeVariableByteInteger(3 + properties.length),
							...integerToTwoUint8(packetIdentifier),
							error.code,
							...properties.buffer,
						]);
						this.client.write(errorPacket);
					}
				}
			} else if (error instanceof DisconnectException) {
				// 处理 disconnect
				console.log('-------------');
			}
		}
	}
	private handlePubAck(pubData: IPublishData) {
		const packetIdentifier = pubData.header.packetIdentifier ?? 1;

		const properties = new EncoderProperties();
		const pubAckPacket = Buffer.from([
			PacketType.PUBACK << 4,
			...encodeVariableByteInteger(3 + properties.length),
			...integerToTwoUint8(packetIdentifier),
			0x00,
			...properties.buffer,
		]);
		this.client.write(pubAckPacket);
	}

	private handlePubRec(pubData: IPublishData) {
		const packetIdentifier = pubData.header.packetIdentifier ?? 1;

		const properties = new EncoderProperties();
		const errorPacket = Buffer.from([
			PacketType.PUBREC << 4,
			...encodeVariableByteInteger(3 + properties.length),
			...integerToTwoUint8(packetIdentifier),
			0x00,
			...properties.buffer,
		]);
		this.client.write(errorPacket);
	}

	public pubAckHandle(buffer: Buffer) {
		const pubAckData: IPubAckData = {
			header: {
				packetType: PacketType.PUBACK,
				received: 0x00,
				remainingLength: 0,
				packetIdentifier: 0,
				reasonCode: 0x00,
			},
			properties: {},
		};
		parsePubAck(buffer, pubAckData);
		console.log('pubAckData: ', pubAckData);
	}

	public pubRelHandle(buffer: Buffer) {
		const pubRelData: IPubRelData = {
			header: {
				packetType: PacketType.PUBREC,
				received: 0x02,
				remainingLength: 0,
				packetIdentifier: 0,
				reasonCode: 0x00,
			},
			properties: {},
		};
		parsePubRel(buffer, pubRelData);
		// console.log('pubRelData: ', pubRelData);
		this.handlePubComp(pubRelData);
	}

	private handlePubComp(pubRelData: IPubRelData) {
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

	public pubRecHandle(buffer: Buffer) {
		const pubRecData: IPubRecData = {
			header: {
				packetType: PacketType.PUBREL,
				received: 0x02,
				remainingLength: 0,
				packetIdentifier: 0,
				reasonCode: 0x00,
			},
			properties: {},
		};
		parsePubRec(buffer, pubRecData);
		// console.log('pubRecData: ', pubRecData);

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

	public pubCompHandle(buffer: Buffer) {
		const pubCompData: IPubRecData = {
			header: {
				packetType: PacketType.PUBREL,
				received: 0x02,
				remainingLength: 0,
				packetIdentifier: 0,
				reasonCode: 0x00,
			},
			properties: {},
		};
		parsePubRec(buffer, pubCompData);
		// console.log('pubCompData: ', pubCompData);
	}

	public subscribeHandle(buffer: Buffer) {
		const subData: ISubscribeData = {
			header: {
				packetType: PacketType.RESERVED,
				received: 0x02,
				remainingLength: 0,
				packetIdentifier: 0,
			},
			properties: {},
			payload: '',
			options: {
				qos: QoSType.QoS0,
				noLocal: false,
				retainAsPublished: false,
				retainHandling: 0,
				retain: 0,
			},
		};
		try {
			parseSubscribe(buffer, subData);
			// console.log('subData: ', subData);
			this.subscription.subscribe(this.client, subData.payload, {
				qos: subData.options.qos,
				date: new Date(),
				subscriptionIdentifier: subData.properties.subscriptionIdentifier,
			});
		} catch {
			// TODO 订阅异常处理
		}
		this.handleSubAck(subData);
	}

	private handleSubAck(subData: ISubscribeData) {
		let remainingLength = 1;
		const properties = new EncoderProperties();
		remainingLength += properties.length + 2;
		const subAckPacket = Buffer.from([
			PacketType.SUBACK << 4,
			...encodeVariableByteInteger(remainingLength),
			...integerToTwoUint8(subData.header.packetIdentifier),
			...properties.buffer,
			SubscribeAckReasonCode.GrantedQoS1,
		]);
		this.client.write(subAckPacket);
	}

	public unsubscribeHandle(buffer: Buffer) {
		const unsubscribeData: IUnsubscribeData = {
			header: {
				packetType: PacketType.RESERVED,
				received: 0x02,
				remainingLength: 0,
				packetIdentifier: 0,
			},
			properties: {},
			payload: '',
		};
		try {
			parseUnsubscribe(buffer, unsubscribeData);
			console.log('unsubscribeData: ', unsubscribeData);

			this.subscription.unsubscribe(this.client, unsubscribeData.payload);
		} catch {
			// TODO 订阅异常处理
		}

		this.handleUnsubscribeAck(unsubscribeData);
	}

	private handleUnsubscribeAck(unsubscribeData: IUnsubscribeData) {
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
