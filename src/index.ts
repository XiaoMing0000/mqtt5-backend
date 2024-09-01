import net from 'net';
import { ConnectException, ConnectReasonCode } from './exception';
import { ConnAckPropertyIdentifier, IConnectData, PacketType } from './interface';
import { EncodedProperties, oneByteInteger, parseConnect, twoByteInteger, utf8EncodedString, variableByteInteger } from './parse';
import { parseProperties } from './property';

export class MqttManager {
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
		const connAckData = {
			fixedHeader: 0x20,
			remainingLength: 0,
			acknowledgeFlags: 0x00,
			properties: [0x00],
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

		const reasonCode = 0x00;
		// 生成 CONNACK 报文
		const connAckBuffer = Buffer.from([0x20, 0x02, 0x00, 0x00]); // CONNACK 报文

		if (this.connData.properties.requestProblemInformation) {
			// TODO 是否返回相应信息 3.1.2.11.6
			const property = new EncodedProperties<ConnAckPropertyIdentifier>();
			// property.add(ConnAckPropertyIdentifier)

			connAckData.properties = property.getProperties();
		}

		this.client.write(connAckBuffer);
	}

	/**
	 * 处理连接报
	 * @param buffer
	 */
	public connectHandle(buffer: Buffer) {
		try {
			this.connData = parseConnect(buffer);
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
