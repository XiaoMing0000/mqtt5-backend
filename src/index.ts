import net from 'net';
import { ConnectException } from './exception';
import { ConnAckPropertyIdentifier, IConnectData, PacketType } from './interface';
import { EncodedProperties, encodeVariableByteInteger, parseConnect } from './parse';

export class MqttManager {
	static defaultProperties = {
		receiveMaximum: 32,
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

	constructor(private readonly client: net.Socket) {
		this.client = client;
	}
	/**
	 * 连接响应报文
	 * @returns
	 */
	private handleConnAck() {
		if (this.connData.header.protocolName !== 'MQTT' || this.connData.header.protocolVersion !== 5) {
			console.log('Unsupported protocol or version');
			this.client.end();
			return;
		}
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
		connAckData.properties.add(ConnAckPropertyIdentifier.RetainAvailable, 0);

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
				const errorCode = error.code;
				const connAckErrorBuffer = Buffer.from([0x20, 0x02, 0x00, errorCode]);
				this.client.write(connAckErrorBuffer);
				this.client.end();
			}
		}
	}
}
