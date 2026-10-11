/**
 * MQTT 5.0 Data Representations (Section 1.5 of the MQTT v5.0 specification).
 * Provides low-level decoders and encoders for MQTT primitive data types:
 * - Bits (1.5.1)
 * - Two Byte Integer (1.5.2)
 * - Four Byte Integer (1.5.3)
 * - UTF-8 Encoded String (1.5.4)
 * - Variable Byte Integer (1.5.5)
 * - Binary Data (1.5.6)
 * - UTF-8 String Pair (1.5.7)
 */

import { DisconnectException, DisconnectReasonCode } from './exception';
import { BufferData } from './interface';

/****************************** decode *****************************/

/** Alias for {@link decodeOneByteInteger} (reads a single byte as an unsigned value). */
export const bits = decodeOneByteInteger;

/**
 * Reads one byte from the buffer as an unsigned 8-bit integer.
 *
 * @remarks Bits are numbered 7 to 0; bit 7 is the most significant bit (MSB) and bit 0 is the least significant (LSB).
 * @param data - Cursor over the underlying buffer; `index` is advanced by one.
 * @returns An integer in the range 0–255.
 */
export function decodeOneByteInteger(data: BufferData): number {
  return data.buffer[data.index++];
}

/**
 * Reads a 16-bit unsigned integer in big-endian order (high byte first, then low byte).
 * @param data - Cursor over the underlying buffer; `index` is advanced by two.
 * @returns An integer in the range 0–65535.
 */
export function decodeTwoByteInteger(data: BufferData): number {
  return (data.buffer[data.index++] << 8) | data.buffer[data.index++];
}

/**
 * Reads a 32-bit unsigned integer in big-endian order (MSB first through to LSB).
 * @param data - Cursor over the underlying buffer; `index` is advanced by four.
 * @returns An integer in the range 0 to 2³²−1.
 */
export function decodeFourByteInteger(data: BufferData): number {
  return (data.buffer[data.index++] << 24) | (data.buffer[data.index++] << 16) | (data.buffer[data.index++] << 8) | data.buffer[data.index++];
}

/**
 * Decodes an MQTT Variable Byte Integer (7-bit payload chunks with continuation bit 7).
 *
 * @param data - Cursor over the underlying buffer; `index` advances per encoded byte.
 * @param length - Maximum number of encoded bytes to accept (MQTT specification allows up to 4 bytes). Defaults to 4.
 * @returns The decoded unsigned integer value (0 to 268,435,455).
 * @throws {@link DisconnectException} When the encoding exceeds the allowed length or is malformed.
 */
export function decodeVariableByteInteger(data: BufferData, length = 4): number {
  let encodeByte;
  let value = 0;
  let leftShift = 0;
  do {
    encodeByte = data.buffer[data.index++];
    value += (encodeByte & 0x7f) << leftShift;
    leftShift += 7;
    if (leftShift > length * 7) {
      throw new DisconnectException(DisconnectReasonCode.ProtocolError, 'Malformed Remaining Length.');
    }
  } while (encodeByte & 0x80);
  return value;
}

/**
 * Reads a UTF-8 string prefixed by a Two Byte Integer length (MQTT UTF-8 string type).
 * @param data - Cursor over the underlying buffer; `index` advances past the length and payload.
 * @returns The decoded string (UTF-8 payload may be 0–65535 bytes per the spec).
 */
export function decodeUtf8String(data: BufferData): string {
  const strLength = (data.buffer[data.index++] << 8) | data.buffer[data.index++];
  return data.buffer.slice(data.index, (data.index += strLength)).toString();
}

/**
 * Reads a UTF-8 string pair: two consecutive MQTT UTF-8 strings (name/value).
 * @param data - Cursor over the underlying buffer.
 * @returns The first string as `key` and the second as `value`.
 */
export function decodeUtf8StringPair(data: BufferData): { key: string; value: string } {
  return {
    key: decodeUtf8String(data),
    value: decodeUtf8String(data),
  };
}

/**
 * Reads a length-prefixed binary blob (Two Byte Integer length followed by raw bytes).
 * @remarks Used for Will Payload, Password, Correlation Data, Authentication Data, and similar fields.
 * @param data - Cursor over the underlying buffer.
 * @returns A `Buffer` copy of the payload bytes.
 */
export function decodeBinaryData(data: BufferData): Buffer {
  const length = (data.buffer[data.index++] << 8) | data.buffer[data.index++];
  return Buffer.from(data.buffer.slice(data.index, (data.index += length)));
}

/****************************** encode *****************************/

/**
 * Encodes the low 8 bits of a number as a single byte value (0–255).
 * @param value - Source integer; higher bits are masked off.
 * @returns The unsigned byte value.
 */
export function encodeOneByteInteger(value: number): number {
  return value & 0xff;
}

/**
 * Splits a 16-bit value into two big-endian bytes.
 * @param value - Value to encode.
 * @returns Two element byte array `[high, low]`.
 */
export function encodeTwoByteInteger(value: number): [number, number] {
  return [(value >> 8) & 0xff, value & 0xff];
}

/**
 * Splits a 32-bit value into four big-endian bytes.
 * @param value - Value to encode.
 * @returns Four element byte array from MSB to LSB.
 */
export function encodeFourByteInteger(value: number): [number, number, number, number] {
  return [(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/**
 * Encodes a non-negative integer as MQTT Variable Byte Integer bytes (7 bits per byte, continuation MSB).
 * @param value - Must be in range 0–268435455 (2²⁸−1).
 * @returns Array of byte values (0–255) representing the encoding.
 * @throws {@link DisconnectException} When `value` is out of the allowed range.
 */
export function encodeVariableByteInteger(value: number): number[] {
  if (value < 0 || value > 268435455) {
    throw new DisconnectException(DisconnectReasonCode.ProtocolError, 'Variable byte integer Value out of range.');
  }

  const bytes = [];
  do {
    let encodedByte = value & 0x7f; // low 7 bits of the current chunk
    value >>= 7;
    if (value > 0) {
      encodedByte |= 0x80; // continuation: more bytes follow
    }
    bytes.push(encodedByte);
  } while (value > 0);

  return bytes;
}

/**
 * Computes how many bytes a non-negative integer needs when encoded as a Variable Byte Integer.
 * @param data - The value to measure (typically remaining length or property length).
 * @returns Byte count (at least 1).
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
 * Concatenates multiple byte arrays or `Uint8Array`s into a single dense number array.
 * @param args - Segments to merge in order.
 * @returns Flattened array of byte values.
 */
export function mergeUint8Arrays(...args: Array<Array<number> | Uint8Array>) {
  const arrNumber = [];
  for (const data of args) {
    arrNumber.push(...data);
  }
  return arrNumber;
}

/**
 * Encodes a string as MQTT UTF-8: Two Byte Integer length (big-endian) followed by UTF-8 bytes.
 * @param str - Source string.
 * @returns Byte sequence suitable for appending to a packet body.
 */
export function encodeUTF8String(str: string): Array<number> {
  const strBuffer = new TextEncoder().encode(str);
  return mergeUint8Arrays(encodeTwoByteInteger(strBuffer.length), strBuffer);
}
/**
 * Encodes binary data as MQTT Binary Data: length prefix (Two Byte Integer) plus raw bytes.
 * @param data - Payload buffer.
 * @returns Byte sequence (length + bytes).
 */
export function encodeBinaryData(data: Buffer): Array<number> {
  return [...encodeTwoByteInteger(data.length), ...data];
}
