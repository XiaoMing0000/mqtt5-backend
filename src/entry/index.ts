import * as net from 'net';

// MQTT 报文类型
enum PacketType {
	CONNECT = 1,
	CONNACK,
	PUBLISH,
	PUBACK,
	PUBREC,
	PUBREL,
	PUBCOMP,
	SUBSCRIBE,
	SUBACK,
	UNSUBSCRIBE,
	UNSUBACK,
	PINGREQ,
	PINGRESP,
	DISCONNECT,
	AUTH,
}

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

// 可变整数
function variableByteInteger(buffer: Buffer, offset: number) {
	let index = offset;
	let encodeByte;
	let value = 0;
	let leftShift = 0;
	// 计算剩余长度
	do {
		encodeByte = buffer[index++];
		value += (encodeByte & 0x7f) << leftShift;
		leftShift += 7;
		if (leftShift > 21) {
			throw new Error('Malformed Remaining Length');
		}
	} while (encodeByte & 0x80);
	return {
		offset: index,
		value: value,
	};
}

interface IConnectFlags {
	username: boolean;
	password: boolean;
	willRetain: boolean;
	qos: number;
	willFlag: boolean;
	cleanStart: boolean;
	reserved: boolean;
}

// MQTT 5.0 协议中固定报头的解析
function parseConnect(buffer: Buffer) {
	console.log(buffer.toString());
	const packetType = (buffer[0] >> 4) as PacketType;
	const packetFlags = buffer[0] & 0xf;
	let index = 1;
	// 获取数据长度
	const fixedHeader = variableByteInteger(buffer, index);
	const remainingLength = fixedHeader.value;
	index = fixedHeader.offset;
	console.log(index);

	// 获取协议名称
	const protocolNameLength = buffer.readUint16BE(index);
	const protocolName = buffer.slice(index + 2, index + 2 + protocolNameLength).toString();
	index += 2 + protocolNameLength;

	const protocolVersion = buffer[index++];
	const connectFlagsValue = buffer[index++];
	const connectFlags: IConnectFlags = {
		username: !!((connectFlagsValue >> 7) & 1),
		password: !!((connectFlagsValue >> 6) & 1),
		willRetain: !!((connectFlagsValue >> 5) & 1),
		qos: (connectFlagsValue >> 7) & 3,
		willFlag: !!((connectFlagsValue >> 2) & 1),
		cleanStart: !!((connectFlagsValue >> 1) & 1),
		reserved: !!(connectFlagsValue & 1),
	};
	const keepAlive = (buffer[index++] << 8) | buffer[index++];

	// 获取属性
	const propertyLength = variableByteInteger(buffer, index);
	index = propertyLength.offset + propertyLength.value;
	const propertiesBuffer = buffer.slice(propertyLength.offset, index);
	const properties: {
		sessionExpiryInterval?: number;
		receiveMaximum?: number;
		maximumPacketSize?: number;
		topicAliasMaximum?: number;
		requestResponseInformation?: string;
		requestProblemInformation?: string;
		clientIdentifier?: string;
		userProperty?: string;
		authenticationMethod?: string;
		authenticationData?: string;
		[key: string]: string | number | undefined;
	} = {
		sessionExpiryInterval: undefined,
	};
	if (propertiesBuffer.length) {
		for (let i = 0; i < propertiesBuffer.length; i) {
			switch (propertiesBuffer[i]) {
				case 0x11:
					if (properties.sessionExpiryInterval != undefined) {
						throw new Error('It is a Protocol Error to include the Session Expiry Interval more than once.');
					}
					i++;
					properties.sessionExpiryInterval = (propertiesBuffer[i++] << 24) | (propertiesBuffer[i++] << 16) | (propertiesBuffer[i++] << 8) | propertiesBuffer[i++];
					break;
				case 0x12:
					i++;
					const idLength = (propertiesBuffer[i++] << 8) | propertiesBuffer[i++];
					properties.clientIdentifier = propertiesBuffer.slice(i, i + idLength).toString();
					i += idLength;
					break;
				case 0x15:
					i++;
					break;
				case 0x17:
					i++;
					break;
				// 在客户端中使用
				// case 0x19:
				// 	i++;
				// 	break;
				case 0x21:
					i++;
					if (properties.receiveMaximum != undefined) {
						throw new Error('It is a Protocol Error to include the Receive Maximum value more than once or for it to have the value 0.');
					}
					properties.receiveMaximum = (propertiesBuffer[i++] << 8) | propertiesBuffer[i++];
					break;
				case 0x22:
					if (properties.receiveMaximum != undefined) {
						throw new Error('t is a Protocol Error to include the Topic Alias Maximum value more than once.');
					}
					i++;
					properties.topicAliasMaximum = (propertiesBuffer[i++] << 8) | propertiesBuffer[i++];
					break;
				case 0x26:
					i++;
					const keyLength = (propertiesBuffer[i++] << 8) | propertiesBuffer[i++];
					const key = propertiesBuffer.slice(i, i + keyLength).toString();
					i += keyLength;
					const valueLength = (propertiesBuffer[i++] << 8) | propertiesBuffer[i++];
					const value = propertiesBuffer.slice(i, i + valueLength).toString();
					i += valueLength;
					properties[key] = value;
					break;
				case 0x27:
					if (properties.maximumPacketSize != undefined) {
						throw new Error('It is a Protocol Error to include the Maximum Packet Size more than once, or for the value to be set to zero.');
					}
					i++;
					properties.maximumPacketSize = (propertiesBuffer[i++] << 24) | (propertiesBuffer[i++] << 16) | (propertiesBuffer[i++] << 8) | propertiesBuffer[i++];
					break;
				default:
					i = propertiesBuffer.length;
					break;
			}
		}
	}

	// 会话时间间隔
	const sessionLength = variableByteInteger(buffer, index);
	const sessionExpiryInterval = sessionLength.value;
	index = sessionLength.offset;

	// 客户端 id
	const clientIdLength = variableByteInteger(buffer, index);
	index = clientIdLength.offset + clientIdLength.value;
	const clientId = buffer.slice(clientIdLength.offset, index).toString();

	let username = '';
	let password = '';
	if (connectFlags.username && connectFlags.password) {
		const usernameLength = (buffer[index++] << 8) | buffer[index++];
		username = buffer.slice(index, index + usernameLength).toString();
		index += usernameLength;
		const passwordLength = (buffer[index++] << 8) | buffer[index++];
		password = buffer.slice(index, index + passwordLength).toString();
		index += passwordLength;
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
		sessionExpiryInterval,
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
