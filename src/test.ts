import net from 'net';
import { PacketType } from './interface';
import { defaultAuthenticate, defaultAuthorizeForward, defaultAuthorizePublish, defaultAuthorizeSubscribe, defaultPreConnect, defaultPublished } from './auth';
import { MqttManager } from '.';

// 解析 MQTT 5.0 报文中的可变头部属性长度
function parseVariableHeaderProperties(buffer: Buffer, offset: number): { propertyLength: number; offset: number } {
	let propertyLength = 0;
	let multiplier = 1;
	let encodedByte;
	let index = offset;

	do {
		encodedByte = buffer[index++];
		propertyLength += (encodedByte & 127) * multiplier;
		multiplier *= 128;
		if (multiplier > 128 * 128 * 128) {
			throw new Error('Malformed Property Length');
		}
	} while ((encodedByte & 128) !== 0);

	return { propertyLength, offset: index };
}

// 处理 PUBLISH 报文
function handlePublish(client: net.Socket, buffer: Buffer): void {
	console.log('Handling PUBLISH packet');

	// 解析主题名长度和主题名
	const topicNameLength = buffer.readUInt16BE(0);
	const topicName = buffer.slice(2, 2 + topicNameLength).toString();
	let offset = 2 + topicNameLength;

	// 如果 QoS 等于 1 或 2，则有 Packet Identifier
	// 假设 flags 在可变头部已经被解析处理并且是 QoS 1
	const packetIdentifier = buffer.readUInt16BE(offset);
	offset += 2;

	// 解析属性长度
	const { propertyLength, offset: newOffset } = parseVariableHeaderProperties(buffer, offset);
	offset = newOffset + propertyLength; // 跳过属性

	// 解析有效负载
	const payload = buffer.slice(offset);
	console.log(`Received message on topic '${topicName}': ${payload.toString()}`);

	// TODO: 根据 QoS 级别发送相应的 PUBACK, PUBREC, PUBREL, PUBCOMP
}

// 创建 TCP 服务器
const server = net.createServer((client) => {
	const defaultOption = {
		concurrency: 100,
		heartbeatInterval: 60000, // 1 minute
		connectTimeout: 30000, // 30 secs
		decodeProtocol: null,
		preConnect: defaultPreConnect,
		authenticate: defaultAuthenticate,
		authorizePublish: defaultAuthorizePublish,
		authorizeSubscribe: defaultAuthorizeSubscribe,
		authorizeForward: defaultAuthorizeForward,
		published: defaultPublished,
		trustProxy: false,
		trustedProxies: [],
		queueLimit: 42,
		maxClientsIdLength: 23,
		keepaliveLimit: 0,
	};

	const mqttManager = new MqttManager(client);

	client.on('data', (data) => {
		const packetType = (data[0] >> 4) as PacketType;

		switch (packetType) {
			case PacketType.CONNECT:
				mqttManager.connectHandle(data);
				break;
			case PacketType.PUBLISH:
				handlePublish(client, data.slice(2));
				break;
			default:
				console.log('Unhandled packet type:', packetType);
		}
	});

	client.on('end', () => {
		console.log('Client disconnected');
		client.end();
	});

	client.on('error', (err) => {
		console.error('Client error:', err);
	});
});

server.listen(1883, () => {
	console.log('MQTT server listening on port 1883');
});

// TODO 3.2 CONNACK – Connect acknowledgement 下一步编写

console.log(new Uint8Array([257]));
console.log(Buffer.from([255, 1]).join(''));
