import { PubAckReasonCode, PubAckException, PubRelReasonCode, SubscribeAckException, ConnectAckException, ConnectAckReasonCode } from './exception';
import {
	BufferData,
	IConnectData,
	IDisconnectData,
	IProperties,
	IPubAckData,
	IPublishData,
	IPubRecData,
	IPubRelData,
	ISubscribeData,
	IUnsubscribeData,
	PacketType,
	PropertyDataMap,
	PropertyIdentifier,
	TPropertyIdentifier,
} from './interface';
import {
	encodeProperties,
	parseConnectProperties,
	parseDisconnectProperties,
	parseProperties,
	parsePubAckProperties,
	parsePubCompProperties,
	parsePublishProperties,
	parsePubRecProperties,
	parsePubRelProperties,
	parseSubscribeProperties,
} from './property';

export const bits = oneByteInteger;
/**
 * 字节中的位标记为 7 到 0。位号 7 是最高有效位，最低有效位被分配位号 0。
 * @param data
 * @returns 数值范围 0 - 255
 */
export function oneByteInteger(data: BufferData): number {
	return data.buffer[data.index++];
}

/**
 * 两个字节整数数据值是 big-endian 顺序的 16 位无符号整数：高阶字节位于低阶字节之前。这意味着 16 位字在网络上显示为最高有效字节 （MSB），然后是最低有效字节 （LSB）
 * @param data {@link BufferData}
 * @returns 数值范围 0 - 65535
 */
export function twoByteInteger(data: BufferData): number {
	return (data.buffer[data.index++] << 8) | data.buffer[data.index++];
}

/**
 * 四个字节整数数据值是按大端顺序排列的 32 位无符号整数：高阶字节位于连续低序字节之前。这意味着 32 位字在网络上显示为最高有效字节 （MSB），
 * 然后是下一个最高有效字节 （MSB），然后是下一个最高有效字节 （MSB），然后是最低有效字节 （LSB）。
 * @param data
 * @returns 数值范围 0 - (2^32-1)
 */
export function fourByteInteger(data: BufferData): number {
	return (data.buffer[data.index++] << 24) | (data.buffer[data.index++] << 16) | (data.buffer[data.index++] << 8) | data.buffer[data.index++];
}

/**
 * 获取可变字节整数
 * @param data {@link BufferData}
 * @param length 获取数据的最大字节数(一个字节算 7 位)
 * @returns 可变长整数的结果值
 */
export function variableByteInteger(data: BufferData, length = 3): number {
	let encodeByte;
	let value = 0;
	let leftShift = 0;
	// 计算剩余长度
	do {
		encodeByte = data.buffer[data.index++];
		value += (encodeByte & 0x7f) << leftShift;
		leftShift += 7;
		if (leftShift > length * 7) {
			throw new Error('Malformed Remaining Length');
		}
	} while (encodeByte & 0x80);
	return value;
}

/**
 * 这些字符串中的每一个都带有一个 Two Byte Integer length 字段，该字段给出了 UTF-8 编码字符串本身的字节数，因此，UTF-8 编码字符串的最大大小为 65,535 字节。
 * 返回后面指定长度的字符串
 * @param data {@link BufferData}
 * @returns 长度 0 - 65535 字节的字符串
 */
export function utf8DecodedString(data: BufferData): string {
	const strLength = (data.buffer[data.index++] << 8) | data.buffer[data.index++];
	return data.buffer.slice(data.index, (data.index += strLength)).toString();
}

/**
 * UTF-8 字符串对由两个 UTF-8 编码字符串组成。此数据类型用于保存名称/值对。第一个字符串用作名称，第二个字符串包含值。
 * @param data
 * @returns
 */
export function utf8StringPair(data: BufferData): { key: string; value: string } {
	return {
		key: utf8DecodedString(data),
		value: utf8DecodedString(data),
	};
}

/**
 * 前面一个可边长的整数，后面是获取指定长度的字符串
 * @param data
 * @returns
 */
export function variableString(data: BufferData) {
	const strLength = variableByteInteger(data);
	return data.buffer.slice(data.index, (data.index += strLength)).toString();
}

export function integerToOneUint8(value: number): number {
	return value & 0xff;
}

export function integerToTwoUint8(value: number): Array<number> {
	return [(value >> 8) & 0xff, value & 0xff];
}

export function integerToFourUint8(value: number): Array<number> {
	return [(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/**
 * 计算可变长数据所占字节数
 * @param data
 * @returns
 */
export function variableByteIntegerLength(data: number): number {
	let length = 0;
	do {
		data >>= 7;
		length++;
	} while (data);
	return length;
}

/**
 * 将 number 类型转换为可变长类型 buffer
 * @param value number
 * @returns
 */
export function encodeVariableByteInteger(value: number) {
	if (value < 0 || value > 268435455) {
		throw new Error('Value out of range');
	}

	const bytes = [];
	do {
		let encodedByte = value & 0x7f; // 取低7位
		value >>= 7; // 右移7位，处理下一组低7位
		if (value > 0) {
			encodedByte |= 0x80; // 如果后续还有字节，将最高位设为1
		}
		bytes.push(encodedByte);
	} while (value > 0);

	return bytes;
}

export function mergeUint8Arrays(...args: Array<Array<number> | Uint8Array>) {
	const arrNumber = [];
	for (const data of args) {
		arrNumber.push(...data);
	}
	return arrNumber;
}

export function encodeUTF8String(str: string): Array<number> {
	const strBuffer = new TextEncoder().encode(str);
	return mergeUint8Arrays(integerToTwoUint8(strBuffer.length), strBuffer);
}

export function stringToVariableByteInteger(str: string) {
	const strBuffer = new TextEncoder().encode(str);
	return mergeUint8Arrays(integerToTwoUint8(encodeVariableByteInteger.length), strBuffer);
}

/**
 * 对属性进行编码
 */
export class EncoderProperties {
	private propertyLength: number = 0;
	private properties: Array<number> = [];

	/**
	 * 添加属性
	 * @param identifier 属性 id
	 * @param data 属性值
	 */
	add<K extends TPropertyIdentifier>(identifier: K, data: PropertyDataMap[K]) {
		const list = encodeProperties(identifier, data);
		this.properties.push(...list);
		this.propertyLength += list.length;
	}

	/**
	 * 批量添加属性
	 * @param properties
	 */
	push(properties: IProperties) {
		for (const key in properties) {
			this.add(PropertyIdentifier[key as keyof typeof PropertyIdentifier], properties[key as keyof IProperties] as any);
		}
	}

	/**
	 * 获取属性 buffer
	 */
	get buffer() {
		return Buffer.from([...encodeVariableByteInteger(this.propertyLength), ...this.properties]);
	}

	/**
	 * 计算当前属性字节长度 + 可变长度值字节长度
	 */
	get length() {
		return this.propertyLength + variableByteIntegerLength(this.propertyLength);
	}
}

/**
 * 解析 connect 报文
 * @param buffer
 * @returns
 */
export function parseConnect(buffer: Buffer): IConnectData {
	const connData: IConnectData = {
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
	connData.header.packetType = (buffer[0] >> 4) as PacketType;
	connData.header.packetFlags = buffer[0] & 0xf;

	const data = { buffer, index: 1 };
	// 获取数据长度
	connData.header.remainingLength = variableByteInteger(data);

	connData.header.protocolName = utf8DecodedString(data);
	connData.header.protocolVersion = oneByteInteger(data);
	if (connData.header.protocolName !== 'MQTT' || connData.header.protocolVersion !== 5) {
		throw new ConnectAckException('Unsupported Protocol Version.', ConnectAckReasonCode.UnsupportedProtocolVersion);
	}

	const connectFlagsValue = oneByteInteger(data);
	connData.connectFlags = {
		username: !!((connectFlagsValue >> 7) & 1),
		password: !!((connectFlagsValue >> 6) & 1),
		willRetain: !!((connectFlagsValue >> 5) & 1),
		willQoS: (connectFlagsValue >> 3) & 3,
		willFlag: !!((connectFlagsValue >> 2) & 1),
		cleanStart: !!((connectFlagsValue >> 1) & 1),
		reserved: !!(connectFlagsValue & 1),
	};
	if (connData.connectFlags.reserved || connData.connectFlags.willQoS >= 0x03 || (!connData.connectFlags.willFlag && connData.connectFlags.willRetain)) {
		throw new ConnectAckException('If the reserved flag is not 0 it is a Malformed Packet.', ConnectAckReasonCode.MalformedPacket);
	}
	if (connData.connectFlags.cleanStart) {
		// TODO 是否建立新的连接 3.1.24
	}
	connData.header.keepAlive = twoByteInteger(data);

	// 获取属性
	const propertyLength = variableByteInteger(data);
	const propertiesBuffer = data.buffer.slice(data.index, (data.index += propertyLength));
	connData.properties = parseConnectProperties(propertiesBuffer);

	// Connect Payload
	// 客户端 id
	connData.payload.clientIdentifier = utf8DecodedString(data);

	if (connData.connectFlags.willFlag) {
		const willPropertiesLength = variableByteInteger(data);
		const willPropertiesBuffer = data.buffer.slice(data.index, (data.index += willPropertiesLength));
		connData.payload.willProperties = parseProperties(willPropertiesBuffer);

		connData.payload.willTopic = utf8DecodedString(data);
		connData.payload.willPayload = utf8DecodedString(data);
	}

	if (connData.connectFlags.username && connData.connectFlags.password) {
		connData.payload.username = utf8DecodedString(data);
		connData.payload.password = utf8DecodedString(data);
		if (connData.payload.username === undefined || connData.payload.password === undefined) {
			throw new ConnectAckException('Bad User Name or Password.', ConnectAckReasonCode.BadUserNameOrPassword);
		}
	}

	return connData;
}

export function parsePublish(buffer: Buffer, pubData: IPublishData) {
	pubData.header.packetType = (buffer[0] >> 4) as PacketType;
	pubData.header.udpFlag = !!(buffer[0] & 0x8);
	pubData.header.qosLevel = (buffer[0] >> 1) & 0x3;
	pubData.header.retain = !!(buffer[0] & 0x1);

	const data = { buffer, index: 1 };
	// 获取数据长度
	pubData.header.remainingLength = variableByteInteger(data);

	pubData.header.topicName = utf8DecodedString(data);
	if (/[#+$]/.test(pubData.header.topicName)) {
		throw new PubAckException('The Will Topic Name is not malformed, but is not accepted by this Server.', PubAckReasonCode.TopicNameInvalid);
	}

	if (pubData.header.qosLevel > 0) {
		pubData.header.packetIdentifier = twoByteInteger(data);
	}

	// 获取属性
	const propertyLength = variableByteInteger(data);
	const propertiesBuffer = data.buffer.slice(data.index, (data.index += propertyLength));
	pubData.properties = parsePublishProperties(propertiesBuffer);
	pubData.payload = data.buffer.slice(data.index).toString();

	return pubData;
}

export function parsePubAck(buffer: Buffer, pubAckData: IPubAckData) {
	pubAckData.header.packetType = (buffer[0] >> 4) as PacketType;
	pubAckData.header.received = buffer[0] & 0xf;

	const data = { buffer, index: 1 };
	// 获取数据长度
	pubAckData.header.remainingLength = variableByteInteger(data);
	pubAckData.header.packetIdentifier = twoByteInteger(data);
	pubAckData.header.reasonCode = oneByteInteger(data) ?? PubAckReasonCode.Success;
	// 获取属性
	const propertyLength = variableByteInteger(data);
	const propertiesBuffer = data.buffer.slice(data.index, (data.index += propertyLength));
	pubAckData.properties = parsePubAckProperties(propertiesBuffer);
}

export function parsePubRel(buffer: Buffer, pubRelData: IPubRelData) {
	pubRelData.header.packetType = (buffer[0] >> 4) as PacketType;
	pubRelData.header.received = buffer[0] & 0xf;

	const data = { buffer, index: 1 };
	// 获取数据长度
	pubRelData.header.remainingLength = variableByteInteger(data);
	pubRelData.header.packetIdentifier = twoByteInteger(data);
	pubRelData.header.reasonCode = oneByteInteger(data) ?? PubRelReasonCode.Success;
	// 获取属性
	const propertyLength = variableByteInteger(data);
	const propertiesBuffer = data.buffer.slice(data.index, (data.index += propertyLength));
	pubRelData.properties = parsePubRelProperties(propertiesBuffer);
}

export function parsePubRec(buffer: Buffer, pubRecData: IPubRecData) {
	pubRecData.header.packetType = (buffer[0] >> 4) as PacketType;
	pubRecData.header.received = buffer[0] & 0xf;

	const data = { buffer, index: 1 };
	// 获取数据长度
	pubRecData.header.remainingLength = variableByteInteger(data);
	pubRecData.header.packetIdentifier = twoByteInteger(data);
	pubRecData.header.reasonCode = oneByteInteger(data) ?? PubRelReasonCode.Success;
	// 获取属性
	const propertyLength = variableByteInteger(data);
	const propertiesBuffer = data.buffer.slice(data.index, (data.index += propertyLength));
	pubRecData.properties = parsePubRecProperties(propertiesBuffer);
}

export function parsePubComp(buffer: Buffer, pubCompData: IPubRecData) {
	pubCompData.header.packetType = (buffer[0] >> 4) as PacketType;
	pubCompData.header.received = buffer[0] & 0xf;

	const data = { buffer, index: 1 };
	// 获取数据长度
	pubCompData.header.remainingLength = variableByteInteger(data);
	pubCompData.header.packetIdentifier = twoByteInteger(data);
	pubCompData.header.reasonCode = oneByteInteger(data) ?? PubRelReasonCode.Success;
	// 获取属性
	const propertyLength = variableByteInteger(data);
	const propertiesBuffer = data.buffer.slice(data.index, (data.index += propertyLength));
	pubCompData.properties = parsePubCompProperties(propertiesBuffer);
}

export function parseSubscribe(buffer: Buffer, subData: ISubscribeData) {
	subData.header.packetType = (buffer[0] >> 4) as PacketType;
	subData.header.received = buffer[0] & 0xf;

	if (subData.header.received !== 0x02) {
		new SubscribeAckException('Bits 3,2,1 and 0 of the Fixed Header of the SUBSCRIBE packet are reserved and MUST be set to 0,0,1 and 0 respectively. ');
	}

	const data = { buffer, index: 1 };
	// 获取数据长度
	subData.header.remainingLength = variableByteInteger(data);
	subData.header.packetIdentifier = twoByteInteger(data);
	// 获取属性
	const propertyLength = variableByteInteger(data);
	const propertiesBuffer = data.buffer.slice(data.index, (data.index += propertyLength));
	subData.properties = parseSubscribeProperties(propertiesBuffer);

	subData.payload = utf8DecodedString(data);

	const subscriptionOptions = oneByteInteger(data);
	subData.options = {
		qos: subscriptionOptions & 0x3,
		noLocal: !!((subscriptionOptions >> 2) & 0x01),
		retainAsPublished: !!(subscriptionOptions & 0x4),
		retainHandling: (subscriptionOptions >> 4) & 0x03,
		retain: (subscriptionOptions >> 6) & 0x03,
	};
}

export function parseUnsubscribe(buffer: Buffer, unsubscribeData: IUnsubscribeData) {
	unsubscribeData.header.packetType = (buffer[0] >> 4) as PacketType;
	unsubscribeData.header.received = buffer[0] & 0xf;

	if (unsubscribeData.header.received !== 0x02) {
		new SubscribeAckException('Bits 3,2,1 and 0 of the Fixed Header of the UNSUBSCRIBE packet are reserved and MUST be set to 0,0,1 and 0 respectively.');
	}

	const data = { buffer, index: 1 };
	// 获取数据长度
	unsubscribeData.header.remainingLength = variableByteInteger(data);
	unsubscribeData.header.packetIdentifier = twoByteInteger(data);
	// 获取属性
	const propertyLength = variableByteInteger(data);
	const propertiesBuffer = data.buffer.slice(data.index, (data.index += propertyLength));
	unsubscribeData.properties = parseSubscribeProperties(propertiesBuffer);

	unsubscribeData.payload = utf8DecodedString(data);
}

export function parseDisconnect(buffer: Buffer, disconnectData: IDisconnectData) {
	disconnectData.header.packetType = buffer[0] >> 4;
	disconnectData.header.received = buffer[0] & 0xf;

	const data = { buffer, index: 1 };
	disconnectData.header.remainingLength = variableByteInteger(data);
	disconnectData.header.reasonCode = oneByteInteger(data);

	// 获取属性
	const propertyLength = variableByteInteger(data);
	const propertiesBuffer = data.buffer.slice(data.index, (data.index += propertyLength));
	disconnectData.properties = parseDisconnectProperties(propertiesBuffer);
}

export function encodeDisconnect(disconnectData: IDisconnectData) {
	const fixedHeader = (disconnectData.header.packetType << 4) | disconnectData.header.received;

	const properties = new EncoderProperties();
	properties.push(disconnectData.properties);

	const remainingBuffer = [disconnectData.header.reasonCode, ...properties.buffer];
	return Buffer.from([fixedHeader, ...encodeVariableByteInteger(remainingBuffer.length), ...remainingBuffer]);
}

export function encodePublishPacket(pubData: IPublishData) {
	const fixedHeader = (pubData.header.packetType << 4) | ((pubData.header.udpFlag ? 1 : 0) << 3) | (pubData.header.qosLevel << 1) | (pubData.header.retain ? 1 : 0);

	const topicNameBuffer = encodeUTF8String(pubData.header.topicName);

	let packetIdentifierBuffer: Array<number> = [];
	if (pubData.header.qosLevel > 0 && pubData.header.packetIdentifier !== undefined) {
		packetIdentifierBuffer = integerToTwoUint8(pubData.header.packetIdentifier);
	}

	const properties = new EncoderProperties();
	properties.push(pubData.properties);

	const remainingBuffer = [...topicNameBuffer, ...packetIdentifierBuffer, ...properties.buffer, ...Buffer.from(pubData.payload)];
	const publishedPacket = Buffer.from([fixedHeader, ...encodeVariableByteInteger(remainingBuffer.length), ...remainingBuffer]);

	return publishedPacket;
}
