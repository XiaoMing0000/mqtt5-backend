/**
 * Unit tests for MQTT 5.0 Data Representations (src/dataRepresentations.ts)
 * Based on MQTT v5.0 specification section 1.5.
 */
import {
  bits,
  decodeBinaryData,
  decodeFourByteInteger,
  decodeOneByteInteger,
  decodeTwoByteInteger,
  decodeUtf8String,
  decodeUtf8StringPair,
  decodeVariableByteInteger,
  encodeBinaryData,
  encodeFourByteInteger,
  encodeOneByteInteger,
  encodeTwoByteInteger,
  encodeUTF8String,
  encodeVariableByteInteger,
  mergeUint8Arrays,
  variableByteIntegerLength,
} from '../dataRepresentations';
import { DisconnectException, DisconnectReasonCode } from '../exception';
import type { BufferData } from '../interface';

describe('dataRepresentations', () => {
  // ─── 1.5.1 Bits / One Byte Integer ──────────────────────────────────────────

  describe('decodeOneByteInteger & bits (§1.5.1)', () => {
    test.each([
      [0, 0],
      [1, 1],
      [42, 42],
      [127, 127],
      [128, 128],
      [255, 255],
    ])('decodes byte %d to %d', (byteVal, expected) => {
      const data: BufferData = { buffer: Buffer.from([byteVal]), index: 0 };
      expect(decodeOneByteInteger(data)).toBe(expected);
      expect(data.index).toBe(1);
    });

    test('bits is an alias for decodeOneByteInteger', () => {
      expect(bits).toBe(decodeOneByteInteger);
      const data: BufferData = { buffer: Buffer.from([0xab]), index: 0 };
      expect(bits(data)).toBe(0xab);
    });
  });

  describe('encodeOneByteInteger (§1.5.1)', () => {
    test.each([
      [0, 0x00],
      [1, 0x01],
      [127, 0x7f],
      [255, 0xff],
      [256, 0x00], // masks low 8 bits
      [0x1234, 0x34],
    ])('encodes %d to byte 0x%s', (value, expected) => {
      expect(encodeOneByteInteger(value)).toBe(expected);
    });
  });

  // ─── 1.5.2 Two Byte Integer ─────────────────────────────────────────────────

  describe('decodeTwoByteInteger (§1.5.2)', () => {
    test.each([
      [0x0000, [0x00, 0x00]],
      [0x0001, [0x00, 0x01]],
      [0x00ff, [0x00, 0xff]],
      [0x0100, [0x01, 0x00]],
      [0x1234, [0x12, 0x34]],
      [0xff00, [0xff, 0x00]],
      [0xffff, [0xff, 0xff]],
    ])('decodes %j to 0x%s', (expected, bytes) => {
      const data: BufferData = { buffer: Buffer.from(bytes), index: 0 };
      expect(decodeTwoByteInteger(data)).toBe(expected);
      expect(data.index).toBe(2);
    });
  });

  describe('encodeTwoByteInteger (§1.5.2)', () => {
    test.each([
      [0x0000, [0x00, 0x00]],
      [0x0001, [0x00, 0x01]],
      [0x00ff, [0x00, 0xff]],
      [0x0100, [0x01, 0x00]],
      [0x1234, [0x12, 0x34]],
      [0xffff, [0xff, 0xff]],
    ])('encodes 0x%s to %j in big-endian order', (value, expected) => {
      expect(encodeTwoByteInteger(value)).toEqual(expected);
    });
  });

  // ─── 1.5.3 Four Byte Integer ────────────────────────────────────────────────

  describe('decodeFourByteInteger (§1.5.3)', () => {
    test.each([
      [0x00000000, [0x00, 0x00, 0x00, 0x00]],
      [0x00000001, [0x00, 0x00, 0x00, 0x01]],
      [0x000000ff, [0x00, 0x00, 0x00, 0xff]],
      [0x12345678, [0x12, 0x34, 0x56, 0x78]],
      [0x7fffffff, [0x7f, 0xff, 0xff, 0xff]],
    ])('decodes %j to 0x%s', (expected, bytes) => {
      const data: BufferData = { buffer: Buffer.from(bytes), index: 0 };
      expect(decodeFourByteInteger(data)).toBe(expected);
      expect(data.index).toBe(4);
    });

    test('decodes maximum 32-bit unsigned integer (0xffffffff)', () => {
      const data: BufferData = { buffer: Buffer.from([0xff, 0xff, 0xff, 0xff]), index: 0 };
      const result = decodeFourByteInteger(data);
      expect(result >>> 0).toBe(0xffffffff);
    });
  });

  describe('encodeFourByteInteger (§1.5.3)', () => {
    test.each([
      [0x00000000, [0x00, 0x00, 0x00, 0x00]],
      [0x00000001, [0x00, 0x00, 0x00, 0x01]],
      [0x000000ff, [0x00, 0x00, 0x00, 0xff]],
      [0x12345678, [0x12, 0x34, 0x56, 0x78]],
      [0x7fffffff, [0x7f, 0xff, 0xff, 0xff]],
    ])('encodes 0x%s to %j in big-endian order', (value, expected) => {
      expect(encodeFourByteInteger(value)).toEqual(expected);
    });
  });

  // ─── 1.5.5 Variable Byte Integer ────────────────────────────────────────────

  describe('Variable Byte Integer (§1.5.5)', () => {
    // Official test vectors from MQTT 5.0 spec Table 1-1
    const testVectors: Array<[number, number[]]> = [
      [0, [0x00]],
      [127, [0x7f]],
      [128, [0x80, 0x01]],
      [16383, [0xff, 0x7f]],
      [16384, [0x80, 0x80, 0x01]],
      [2097151, [0xff, 0xff, 0x7f]],
      [2097152, [0x80, 0x80, 0x80, 0x01]],
      [268435455, [0xff, 0xff, 0xff, 0x7f]],
    ];

    describe('decodeVariableByteInteger', () => {
      test.each(testVectors)('decodes %j to %d', (expected, bytes) => {
        const data: BufferData = { buffer: Buffer.from(bytes), index: 0 };
        expect(decodeVariableByteInteger(data)).toBe(expected);
        expect(data.index).toBe(bytes.length);
      });

      test('advances index correctly when buffer has trailing bytes', () => {
        const data: BufferData = { buffer: Buffer.from([0x80, 0x01, 0xaa, 0xbb]), index: 0 };
        expect(decodeVariableByteInteger(data)).toBe(128);
        expect(data.index).toBe(2);
      });

      test('throws DisconnectException when continuation extends past length limit', () => {
        // 5 continuation bytes (exceeds default length=4)
        const data: BufferData = { buffer: Buffer.from([0x80, 0x80, 0x80, 0x80, 0x80, 0x01]), index: 0 };
        expect(() => decodeVariableByteInteger(data)).toThrow(DisconnectException);
        try {
          data.index = 0;
          decodeVariableByteInteger(data);
        } catch (error) {
          expect(error).toBeInstanceOf(DisconnectException);
          expect((error as DisconnectException).code).toBe(DisconnectReasonCode.ProtocolError);
        }
      });

      test('respects custom length parameter', () => {
        // 3 bytes is ok with default length=4, but should throw when length=2
        const data: BufferData = { buffer: Buffer.from([0x80, 0x80, 0x01]), index: 0 };
        expect(() => decodeVariableByteInteger(data, 2)).toThrow(DisconnectException);
      });
    });

    describe('encodeVariableByteInteger', () => {
      test.each(testVectors)('encodes %d to %j', (value, expected) => {
        expect(encodeVariableByteInteger(value)).toEqual(expected);
      });

      test('throws DisconnectException when value is negative', () => {
        expect(() => encodeVariableByteInteger(-1)).toThrow(DisconnectException);
      });

      test('throws DisconnectException when value exceeds maximum 268,435,455', () => {
        expect(() => encodeVariableByteInteger(268435456)).toThrow(DisconnectException);
      });
    });

    describe('variableByteIntegerLength', () => {
      test.each([
        [0, 1],
        [127, 1],
        [128, 2],
        [16383, 2],
        [16384, 3],
        [2097151, 3],
        [2097152, 4],
        [268435455, 4],
      ])('computes encoded byte length for %d -> %d', (value, expectedLen) => {
        expect(variableByteIntegerLength(value)).toBe(expectedLen);
        expect(encodeVariableByteInteger(value).length).toBe(expectedLen);
      });
    });
  });

  // ─── 1.5.4 UTF-8 Encoded String ─────────────────────────────────────────────

  describe('UTF-8 Encoded String (§1.5.4)', () => {
    describe('decodeUtf8String', () => {
      test('decodes empty string', () => {
        const data: BufferData = { buffer: Buffer.from([0x00, 0x00]), index: 0 };
        expect(decodeUtf8String(data)).toBe('');
        expect(data.index).toBe(2);
      });

      test('decodes ASCII string', () => {
        const bytes = [0x00, 0x05, 0x68, 0x65, 0x6c, 0x6c, 0x6f]; // "hello"
        const data: BufferData = { buffer: Buffer.from(bytes), index: 0 };
        expect(decodeUtf8String(data)).toBe('hello');
        expect(data.index).toBe(7);
      });

      test('decodes multi-byte UTF-8 string (Chinese, emoji)', () => {
        const text = 'MQTT 协议 🚀';
        const textBuffer = Buffer.from(text, 'utf8');
        const buffer = Buffer.concat([Buffer.from([0x00, textBuffer.length]), textBuffer]);
        const data: BufferData = { buffer, index: 0 };
        expect(decodeUtf8String(data)).toBe(text);
        expect(data.index).toBe(buffer.length);
      });
    });

    describe('encodeUTF8String', () => {
      test('encodes empty string with 2-byte zero length prefix', () => {
        expect(encodeUTF8String('')).toEqual([0x00, 0x00]);
      });

      test('encodes ASCII string with 2-byte length prefix', () => {
        expect(encodeUTF8String('test')).toEqual([0x00, 0x04, 0x74, 0x65, 0x73, 0x74]);
      });

      test('encodes multi-byte UTF-8 string with byte length (not character length)', () => {
        const text = '你好';
        const encoded = encodeUTF8String(text);
        const byteLen = Buffer.byteLength(text, 'utf8');
        expect(encoded.slice(0, 2)).toEqual([0x00, byteLen]);
        expect(Buffer.from(encoded.slice(2)).toString('utf8')).toBe(text);
      });
    });
  });

  // ─── 1.5.7 UTF-8 String Pair ────────────────────────────────────────────────

  describe('decodeUtf8StringPair (§1.5.7)', () => {
    test('decodes two consecutive UTF-8 strings into key and value', () => {
      const buffer = Buffer.concat([Buffer.from(encodeUTF8String('color')), Buffer.from(encodeUTF8String('blue'))]);
      const data: BufferData = { buffer, index: 0 };
      expect(decodeUtf8StringPair(data)).toEqual({ key: 'color', value: 'blue' });
      expect(data.index).toBe(buffer.length);
    });

    test('decodes pair with empty strings and Unicode characters', () => {
      const buffer = Buffer.concat([Buffer.from(encodeUTF8String('环境')), Buffer.from(encodeUTF8String('生产'))]);
      const data: BufferData = { buffer, index: 0 };
      expect(decodeUtf8StringPair(data)).toEqual({ key: '环境', value: '生产' });
    });
  });

  // ─── 1.5.6 Binary Data ──────────────────────────────────────────────────────

  describe('Binary Data (§1.5.6)', () => {
    describe('decodeBinaryData', () => {
      test('decodes zero-length binary data', () => {
        const data: BufferData = { buffer: Buffer.from([0x00, 0x00]), index: 0 };
        const result = decodeBinaryData(data);
        expect(result).toEqual(Buffer.alloc(0));
        expect(data.index).toBe(2);
      });

      test('decodes binary payload with arbitrary bytes', () => {
        const payload = Buffer.from([0x00, 0xff, 0x42, 0x00, 0x7f]);
        const buffer = Buffer.concat([Buffer.from([0x00, payload.length]), payload]);
        const data: BufferData = { buffer, index: 0 };
        const result = decodeBinaryData(data);
        expect(result).toEqual(payload);
        expect(data.index).toBe(buffer.length);
      });
    });

    describe('encodeBinaryData', () => {
      test('encodes empty buffer', () => {
        expect(encodeBinaryData(Buffer.alloc(0))).toEqual([0x00, 0x00]);
      });

      test('encodes buffer with 2-byte big-endian length prefix', () => {
        const raw = Buffer.from([0x01, 0x02, 0x03]);
        expect(encodeBinaryData(raw)).toEqual([0x00, 0x03, 0x01, 0x02, 0x03]);
      });
    });
  });

  // ─── mergeUint8Arrays ───────────────────────────────────────────────────────

  describe('mergeUint8Arrays helper', () => {
    test('merges empty inputs into empty array', () => {
      expect(mergeUint8Arrays()).toEqual([]);
      expect(mergeUint8Arrays([])).toEqual([]);
    });

    test('concatenates multiple number arrays and Uint8Arrays', () => {
      const part1 = [1, 2];
      const part2 = new Uint8Array([3, 4, 5]);
      const part3 = [6];
      expect(mergeUint8Arrays(part1, part2, part3)).toEqual([1, 2, 3, 4, 5, 6]);
    });
  });

  // ─── Round-trip tests ───────────────────────────────────────────────────────

  describe('round-trip encode and decode', () => {
    test('One Byte Integer round-trip', () => {
      for (const val of [0, 1, 127, 128, 255]) {
        const encoded = encodeOneByteInteger(val);
        const decoded = decodeOneByteInteger({ buffer: Buffer.from([encoded]), index: 0 });
        expect(decoded).toBe(val);
      }
    });

    test('Two Byte Integer round-trip', () => {
      for (const val of [0, 1, 255, 256, 32767, 65535]) {
        const encoded = encodeTwoByteInteger(val);
        const decoded = decodeTwoByteInteger({ buffer: Buffer.from(encoded), index: 0 });
        expect(decoded).toBe(val);
      }
    });

    test('Four Byte Integer round-trip', () => {
      for (const val of [0, 1, 65535, 65536, 16777215, 2147483647]) {
        const encoded = encodeFourByteInteger(val);
        const decoded = decodeFourByteInteger({ buffer: Buffer.from(encoded), index: 0 });
        expect(decoded).toBe(val);
      }
    });

    test('Variable Byte Integer round-trip', () => {
      for (const val of [0, 1, 127, 128, 16383, 16384, 2097151, 2097152, 268435455]) {
        const encoded = encodeVariableByteInteger(val);
        const decoded = decodeVariableByteInteger({ buffer: Buffer.from(encoded), index: 0 });
        expect(decoded).toBe(val);
      }
    });

    test('UTF-8 string round-trip', () => {
      for (const str of ['', 'a', 'hello world', 'MQTT 5.0 客户端', '特殊字符 !@#$%^&*()', '🌟🔥🚀']) {
        const encoded = encodeUTF8String(str);
        const decoded = decodeUtf8String({ buffer: Buffer.from(encoded), index: 0 });
        expect(decoded).toBe(str);
      }
    });

    test('Binary data round-trip', () => {
      for (const raw of [Buffer.alloc(0), Buffer.from([0]), Buffer.from([1, 2, 3, 4, 5]), crypto.getRandomValues(new Uint8Array(64))]) {
        const buf = Buffer.from(raw);
        const encoded = encodeBinaryData(buf);
        const decoded = decodeBinaryData({ buffer: Buffer.from(encoded), index: 0 });
        expect(decoded).toEqual(buf);
      }
    });
  });
});
