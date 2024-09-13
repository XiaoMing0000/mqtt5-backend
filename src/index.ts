import net from 'net';
import { ConnectException, PubAckException, PubCompReasonCode } from './exception';
import { ConnAckPropertyIdentifier, IConnectData, IDisconnectData, IPublishData, IPubRelData, ISubscribeData, PacketType, PropertyIdentifier, QoSType } from './interface';
import { EncodedProperties, encodeVariableByteInteger, integerToTwoUint8, parseConnect, parseDisconnect, parsePublish, parsePubRel, parseSubscribe, twoByteInteger } from './parse';
export class MqttManager {
	static defaultProperties = {
		receiveMaximum: 32,
		maximumPacketSize: 1 << 20,
		topicAliasMaximum: 65535,
		wildcardSubscriptionAvailable: false,
	};

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
		private readonly client: net.Socket,
		private readonly clients: Set<net.Socket>,
	) {
		this.client = client;
		this.clients = clients;
	}
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
			properties: EncodedProperties;
		} = {
			fixedHeader: 0x20,
			remainingLength: 0,
			acknowledgeFlags: 0x00,
			reasonCode: 0x00,
			properties: new EncodedProperties(),
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
		connAckData.properties.add(ConnAckPropertyIdentifier.ReceiveMaximum, MqttManager.defaultProperties.receiveMaximum);
		// TODO 暂时不支持 QoS 1 2  3.2.2.3.4
		connAckData.properties.add(ConnAckPropertyIdentifier.MaximumQoS, false);
		connAckData.properties.add(ConnAckPropertyIdentifier.RetainAvailable, false);
		connAckData.properties.add(ConnAckPropertyIdentifier.MaximumPacketSize, MqttManager.defaultProperties.maximumPacketSize);
		connAckData.properties.add(ConnAckPropertyIdentifier.TopicAliasMaximum, MqttManager.defaultProperties.topicAliasMaximum);
		// TODO 未作通配符
		connAckData.properties.add(ConnAckPropertyIdentifier.WildcardSubscriptionAvailable, MqttManager.defaultProperties.wildcardSubscriptionAvailable);
		// TODO 是否支持订阅，需要在 subscribe 报文中校验
		connAckData.properties.add(ConnAckPropertyIdentifier.SubscriptionIdentifierAvailable, true);
		connAckData.properties.add(ConnAckPropertyIdentifier.SharedSubscriptionAvailable, true);

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
			console.log('connData: ', this.connData);
			this.handleConnAck();
		} catch (error) {
			if (error instanceof ConnectException) {
				const properties = new EncodedProperties();
				properties.add(PropertyIdentifier.ReasonString, error.msg);
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
		} catch (err) {
			console.error(err);
			this.client.end();
		}
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
			console.log('pubData: ', pubData);

			// TODO 缺少向每个订阅者发布消息

			if (pubData.header.qosLevel === QoSType.QoS1) {
				this.handlePubAck(pubData);
			} else if (pubData.header.qosLevel === QoSType.QoS2) {
				this.handlePubRec(pubData);
			}
			// throw new PubAckException('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', PubAckReasonCode.TopicNameInvalid);
		} catch (error) {
			if (error instanceof PubAckException) {
				if (error instanceof PubAckException) {
					if (pubData.header.qosLevel > 0 && pubData.header.packetIdentifier) {
						const packetIdentifier = pubData.header.packetIdentifier;

						const properties = new EncodedProperties();
						properties.add(PropertyIdentifier.ReasonString, error.msg);
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
			}
		}
	}
	private handlePubAck(pubData: IPublishData) {
		const packetIdentifier = pubData.header.packetIdentifier ?? 1;

		const properties = new EncodedProperties();
		const errorPacket = Buffer.from([
			PacketType.PUBACK << 4,
			...encodeVariableByteInteger(3 + properties.length),
			...integerToTwoUint8(packetIdentifier),
			0x00,
			...properties.buffer,
		]);
		this.client.write(errorPacket);
	}

	private handlePubRec(pubData: IPublishData) {
		const packetIdentifier = pubData.header.packetIdentifier ?? 1;

		const properties = new EncodedProperties();
		const errorPacket = Buffer.from([
			PacketType.PUBREC << 4,
			...encodeVariableByteInteger(3 + properties.length),
			...integerToTwoUint8(packetIdentifier),
			0x00,
			...properties.buffer,
		]);
		this.client.write(errorPacket);
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
		console.log('pubRelData: ', pubRelData);
		this.handlePubComp(pubRelData);
	}

	private handlePubComp(pubRelData: IPubRelData) {
		const properties = new EncodedProperties();
		const compPacket = Buffer.from([
			PacketType.PUBCOMP << 4,
			...encodeVariableByteInteger(3 + properties.length),
			...integerToTwoUint8(pubRelData.header.packetIdentifier),
			PubCompReasonCode.Success,
			...properties.buffer,
		]);
		this.client.write(compPacket);
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
			qos: QoSType.QoS0,
		};
		parseSubscribe(buffer, subData);
		console.log('subData: ', subData);

		this.handleSubAck(subData);
	}

	private handleSubAck(subData: ISubscribeData) {
		const properties = new EncodedProperties();
		const compPacket = Buffer.from([
			PacketType.SUBACK << 4,
			...encodeVariableByteInteger(properties.length + 2),
			...integerToTwoUint8(subData.header.packetIdentifier),
			...properties.buffer,
		]);
		console.log('compPacket: ', compPacket);
		this.client.write(compPacket);
	}
}
