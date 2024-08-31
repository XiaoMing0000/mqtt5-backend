import net from 'net';
import { IConnectData } from './interface';

export function handleConnAck(client: net.Socket, connData: IConnectData) {
	if (connData.header.protocolName !== 'MQTT' || connData.header.protocolVersion !== 5) {
		console.log('Unsupported protocol or version');
		client.end();
		return;
	}

	// 固定包头
	const fixedHeader = 0x20;
	// 剩余长度字段
	let remainningLength = 0x00;

	const sessionPresent = 0x01;
	// 1
	const acknowledgeFlags = 0x00 | sessionPresent;

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
