import { BufferData } from './interface';

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
