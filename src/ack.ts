import net from 'net';
import { IConnectData } from './interface';

export function handleConnAck(client: net.Socket, connData: IConnectData) {
	if (connData.header.protocolName !== 'MQTT' || connData.header.protocolVersion !== 5) {
		console.log('Unsupported protocol or version');
		client.end();
		return;
	}

	const fixedHeader = 0x20;
	let remainningLength = 0x00;

	// 生成 CONNACK 报文
	const connAckBuffer = Buffer.from([0x20, 0x02, 0x00, 0x00]); // CONNACK 报文
	client.write(connAckBuffer);
}
