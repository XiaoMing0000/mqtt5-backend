import { BufferData, IConnectData, PacketType } from './interface';
import { parseProperties } from './property';

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
export function utf8EncodedString(data: BufferData): string {
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
		key: utf8EncodedString(data),
		value: utf8EncodedString(data),
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

export function integerToOnUint8(value: number): Uint8Array {
	const array = new Uint8Array(1);
	array[0] = value & 0xff;
	return array;
}
export function integerToTwoUint8(value: number): Uint8Array {
	const array = new Uint8Array(2);
	array[0] = (value >> 8) & 0xff;
	array[1] = value & 0xff;
	return array;
}
export function integerToFourUint8(value: number): Uint8Array {
	const array = new Uint8Array(4);
	array[0] = (value >> 24) & 0xff;
	array[1] = (value >> 16) & 0xff;
	array[2] = (value >> 8) & 0xff;
	array[3] = value & 0xff;
	return array;
}

/**
 * 将 number 类型转换为可变长类型 buffer
 * @param value number
 * @returns
 */
function encodeVariableByteInteger(value: number) {
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

	return new Uint8Array(bytes);
}

export function mergeUint8Arrays(array1: Uint8Array, array2: Uint8Array) {
	const mergedArray = new Uint8Array(array1.length + array2.length);
	mergedArray.set(array1, 0);
	mergedArray.set(array2, array1.length);

	return mergedArray;
}

export function utf8decodedString(str: string): Uint8Array {
	const strBuffer = new TextEncoder().encode(str);
	return mergeUint8Arrays(integerToTwoUint8(strBuffer.length), strBuffer);
}

export function stringToVariableByteInteger(str: string) {
	const strBuffer = new TextEncoder().encode(str);
	return mergeUint8Arrays(integerToTwoUint8(encodeVariableByteInteger.length), strBuffer);
}

/**
 * 解析 connect 报文
 * @param buffer
 * @returns
 */
export function parseConnect(buffer: Buffer): IConnectData {
	const connectedData: IConnectData = {
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
	connectedData.header.packetType = (buffer[0] >> 4) as PacketType;
	connectedData.header.packetFlags = buffer[0] & 0xf;

	const data = { buffer, index: 1 };
	// 获取数据长度
	connectedData.header.remainingLength = variableByteInteger(data);

	connectedData.header.protocolName = utf8EncodedString(data);
	connectedData.header.protocolVersion = oneByteInteger(data);

	const connectFlagsValue = oneByteInteger(data);
	connectedData.connectFlags = {
		username: !!((connectFlagsValue >> 7) & 1),
		password: !!((connectFlagsValue >> 6) & 1),
		willRetain: !!((connectFlagsValue >> 5) & 1),
		willQoS: (connectFlagsValue >> 3) & 3,
		willFlag: !!((connectFlagsValue >> 2) & 1),
		cleanStart: !!((connectFlagsValue >> 1) & 1),
		reserved: !!(connectFlagsValue & 1),
	};

	connectedData.header.keepAlive = twoByteInteger(data);

	// 获取属性
	const propertyLength = variableByteInteger(data);
	const propertiesBuffer = data.buffer.slice(data.index, (data.index += propertyLength));
	connectedData.properties = parseProperties(propertiesBuffer);

	// Connect Payload
	// 客户端 id
	connectedData.payload.clientIdentifier = utf8EncodedString(data);

	if (connectedData.connectFlags.willFlag) {
		const willPropertiesLength = variableByteInteger(data);
		const willPropertiesBuffer = data.buffer.slice(data.index, (data.index += willPropertiesLength));
		connectedData.payload.willProperties = parseProperties(willPropertiesBuffer);

		connectedData.payload.willTopic = utf8EncodedString(data);
		connectedData.payload.willPayload = utf8EncodedString(data);
	}

	if (connectedData.connectFlags.username && connectedData.connectFlags.password) {
		connectedData.payload.username = utf8EncodedString(data);
		connectedData.payload.password = utf8EncodedString(data);
	}

	return connectedData;
}
