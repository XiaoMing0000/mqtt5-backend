import net from 'net';
import { IConnectData } from './interface';

export function handleConnAck(client: net.Socket, connData: IConnectData) {
	if (connData.header.protocolName !== 'MQTT' || connData.header.protocolVersion !== 5) {
		console.log('Unsupported protocol or version');
		client.end();
		return;
	}
	const connAckData = {
		fixedHeader: 0x20,
		remainingLength: 0,
		acknowledgeFlags: 0x00,
		properties: [0x00],
	};

	if (connData.connectFlags.cleanStart) {
		connAckData.acknowledgeFlags &= 0xfe;
	} else {
		// TODO 校验服务端是否已经保存了此客户端表示的 ClientID 的 会话状态 Session State
		connAckData.acknowledgeFlags = 0x01;
	}

	if (!connData.properties.requestProblemInformation) {
		// 仅当 request problem information 为 0 时才能向用户发送 properties 3.1.2.11.7
	}

	const reasonCode = 0x00;
	// 生成 CONNACK 报文
	const connAckBuffer = Buffer.from([0x20, 0x02, 0x00, 0x00]); // CONNACK 报文

	if (connData.properties.requestProblemInformation) {
		// TODO 是否返回相应信息 3.1.2.11.6
	}

	client.write(connAckBuffer);
}

/*



*/
