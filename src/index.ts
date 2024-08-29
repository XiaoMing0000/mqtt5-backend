import * as net from 'net';
import { parseProperties } from './property';
import { IConnectFlags, IProperties, PacketType } from './interface';
import { oneByteInteger, twoByteInteger, utf8EncodedString, variableByteInteger } from './parse';

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

// 处理 CONNECT 报文
function handleConnect(client: net.Socket, buffer: Buffer): void {
	console.log('Handling CONNECT packet');

	const protocolNameLength = buffer.readUInt16BE(0);
	const protocolName = buffer.slice(2, 2 + protocolNameLength).toString();
	const protocolLevel = buffer[2 + protocolNameLength];
	const connectFlags = buffer[3 + protocolNameLength];
	const keepAlive = buffer.readUInt16BE(4 + protocolNameLength);
	let offset = 6 + protocolNameLength; // 计算偏移量

	if (protocolName !== 'MQTT' || protocolLevel !== 5) {
		console.log('Unsupported protocol or version');
		client.end();
		return;
	}

	// 解析属性长度
	const { propertyLength, offset: newOffset } = parseVariableHeaderProperties(buffer, offset);
	offset = newOffset + propertyLength; // 跳过属性

	// 检查客户端标识符（Client ID）
	const clientIdLength = buffer.readUInt16BE(offset);
	const clientId = buffer.slice(offset + 2, offset + 2 + clientIdLength).toString();
	console.log(`Client ID: ${clientId}`);

	// 生成 CONNACK 报文
	const connack = Buffer.from([0x20, 0x02, 0x00, 0x00]); // CONNACK 报文
	client.write(connack);
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

// MQTT 5.0 协议中固定报头的解析
function parseConnect(buffer: Buffer) {
	const packetType = (buffer[0] >> 4) as PacketType;
	const packetFlags = buffer[0] & 0xf;

	const data = { buffer, index: 1 };
	// 获取数据长度
	const remainingLength = variableByteInteger(data);

	const protocolName = utf8EncodedString(data);
	const protocolVersion = oneByteInteger(data);

	const connectFlagsValue = oneByteInteger(data);
	const connectFlags: IConnectFlags = {
		username: !!((connectFlagsValue >> 7) & 1),
		password: !!((connectFlagsValue >> 6) & 1),
		willRetain: !!((connectFlagsValue >> 5) & 1),
		willQoS: (connectFlagsValue >> 3) & 3,
		willFlag: !!((connectFlagsValue >> 2) & 1),
		cleanStart: !!((connectFlagsValue >> 1) & 1),
		reserved: !!(connectFlagsValue & 1),
	};

	const keepAlive = twoByteInteger(data);

	// 获取属性
	const propertyLength = variableByteInteger(data);
	const propertiesBuffer = data.buffer.slice(data.index, (data.index += propertyLength));
	const properties = parseProperties(propertiesBuffer);

	// Connect Payload
	// 客户端 id
	const clientId = utf8EncodedString(data);

	let willProperties: IProperties = {};
	let willTopic: string = '';
	let willPayload: string = '';
	if (connectFlags.willFlag) {
		const willPropertiesLength = variableByteInteger(data);
		const willPropertiesBuffer = data.buffer.slice(data.index, (data.index += willPropertiesLength));
		willProperties = parseProperties(willPropertiesBuffer);

		willTopic = utf8EncodedString(data);
		willPayload = utf8EncodedString(data);
	}

	let username = '';
	let password = '';
	if (connectFlags.username && connectFlags.password) {
		username = utf8EncodedString(data);
		password = utf8EncodedString(data);
	}

	return {
		packetType,
		packetFlags,
		remainingLength,
		protocolName,
		protocolVersion,
		connectFlags,
		keepAlive,
		properties,
		clientId,
		username,
		password,
	};
}

// 创建 TCP 服务器
const server = net.createServer((client) => {
	console.log('Client connected');

	client.on('data', (data) => {
		const parseData = parseConnect(data);
		console.log(parseData);
		// switch (packetType) {
		// 	case PacketType.CONNECT:
		// 		handleConnect(client, data.slice(2));
		// 		break;
		// 	case PacketType.PUBLISH:
		// 		handlePublish(client, data.slice(2));
		// 		break;
		// 	default:
		// 		console.log('Unhandled packet type:', packetType);
		// }
		console.log('连接------------');
	});

	client.on('end', () => {
		console.log('Client disconnected');
	});

	client.on('error', (err) => {
		console.error('Client error:', err);
	});
});

server.listen(1883, () => {
	console.log('MQTT server listening on port 1883');
});
