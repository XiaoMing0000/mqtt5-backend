import {
	oneByteInteger,
	twoByteInteger,
	fourByteInteger,
	variableByteInteger,
	utf8DecodedString,
	utf8StringPair,
	variableString,
	integerToOneUint8,
	integerToTwoUint8,
	integerToFourUint8,
	variableByteIntegerLength,
	encodeVariableByteInteger,
	mergeUint8Arrays,
	encodeUTF8String,
	parsePacket,
	parseConnect,
	parsePublish,
	parsePubAck,
	parsePubRel,
	parsePubRec,
	parsePubComp,
	parseSubscribe,
	parseUnsubscribe,
	parseDisconnect,
	parseAuth,
	encodeConnAck,
	encodeDisconnect,
	encodePublishPacket,
	encodePubControlPacket,
	encodeSubAckPacket,
	EncoderProperties,
} from '../parse';
import { PacketType, ProtocolVersion, QoSType } from '../interface';
import { DisconnectException, PubAckException } from '../exception';
import type {
	BufferData,
	IPublishData,
	IPubAckData,
	IPubRecData,
	IPubRelData,
	IDisconnectData,
	IAuthData,
	ISubscribeData,
	IUnsubscribeData,
	IConnAckData,
	ISubAckData,
} from '../interface';

describe('parse', () => {
	describe('oneByteInteger', () => {
		test.each([
			[0, 0],
			[127, 127],
			[255, 255],
			[42, 42],
		])('should decode one byte integer: %s', (value, expected) => {
			const buffer = Buffer.from([value]);
			const data: BufferData = { buffer, index: 0 };
			expect(oneByteInteger(data)).toBe(expected);
			expect(data.index).toBe(1);
		});
	});

	describe('twoByteInteger', () => {
		test.each([
			[0x0000, [0x00, 0x00]],
			[0x00ff, [0x00, 0xff]],
			[0xff00, [0xff, 0x00]],
			[0xffff, [0xff, 0xff]],
			[0x1234, [0x12, 0x34]],
		])('should decode two byte integer: %s', (expected, bytes) => {
			const buffer = Buffer.from(bytes);
			const data: BufferData = { buffer, index: 0 };
			expect(twoByteInteger(data)).toBe(expected);
			expect(data.index).toBe(2);
		});
	});

	describe('fourByteInteger', () => {
		test.each([
			[0x00000000, [0x00, 0x00, 0x00, 0x00]],
			[0x000000ff, [0x00, 0x00, 0x00, 0xff]],
			[0x12345678, [0x12, 0x34, 0x56, 0x78]],
		])('should decode four byte integer: %s', (expected, bytes) => {
			const buffer = Buffer.from(bytes);
			const data: BufferData = { buffer, index: 0 };
			expect(fourByteInteger(data)).toBe(expected);
			expect(data.index).toBe(4);
		});

		test('should decode maximum four byte integer', () => {
			// JavaScript numbers are safe up to 2^53, but bitwise operations work with 32-bit signed integers
			// 0xffffffff is -1 in signed 32-bit, but we're treating it as unsigned
			const buffer = Buffer.from([0xff, 0xff, 0xff, 0xff]);
			const data: BufferData = { buffer, index: 0 };
			const result = fourByteInteger(data);
			// In JavaScript, bitwise operations return signed 32-bit integers
			// So 0xffffffff becomes -1, but we can convert it to unsigned
			expect(result >>> 0).toBe(0xffffffff);
			expect(data.index).toBe(4);
		});
	});

	describe('variableByteInteger', () => {
		test.each([
			[0, [0x00]],
			[127, [0x7f]],
			[128, [0x80, 0x01]],
			[16383, [0xff, 0x7f]],
			[16384, [0x80, 0x80, 0x01]],
			[2097151, [0xff, 0xff, 0x7f]],
		])('should decode variable byte integer: %s', (expected, bytes) => {
			const buffer = Buffer.from(bytes);
			const data: BufferData = { buffer, index: 0 };
			expect(variableByteInteger(data)).toBe(expected);
		});

		test('should decode 4-byte variable byte integer with length 4', () => {
			const buffer = Buffer.from([0x80, 0x80, 0x80, 0x01]); // 2097152
			const data: BufferData = { buffer, index: 0 };
			expect(variableByteInteger(data, 4)).toBe(2097152);
		});

		test('should decode maximum 4-byte variable byte integer', () => {
			const buffer = Buffer.from([0xff, 0xff, 0xff, 0x7f]); // 268435455
			const data: BufferData = { buffer, index: 0 };
			expect(variableByteInteger(data, 4)).toBe(268435455);
		});

		test('should throw error for malformed remaining length', () => {
			const buffer = Buffer.from([0x80, 0x80, 0x80, 0x80, 0x01]); // 超过3字节
			const data: BufferData = { buffer, index: 0 };
			expect(() => variableByteInteger(data, 3)).toThrow(DisconnectException);
		});
	});

	describe('utf8DecodedString', () => {
		test.each([
			['', [0x00, 0x00]],
			['test', [0x00, 0x04, 0x74, 0x65, 0x73, 0x74]],
			['hello world', [0x00, 0x0b, 0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x77, 0x6f, 0x72, 0x6c, 0x64]],
			['MQTT', [0x00, 0x04, 0x4d, 0x51, 0x54, 0x54]],
		])('should decode UTF-8 string: %s', (expected, bytes) => {
			const buffer = Buffer.from(bytes);
			const data: BufferData = { buffer, index: 0 };
			expect(utf8DecodedString(data)).toBe(expected);
		});
	});

	describe('utf8StringPair', () => {
		test('should decode UTF-8 string pair', () => {
			// key: "key", value: "value"
			const buffer = Buffer.from([0x00, 0x03, 0x6b, 0x65, 0x79, 0x00, 0x05, 0x76, 0x61, 0x6c, 0x75, 0x65]);
			const data: BufferData = { buffer, index: 0 };
			const result = utf8StringPair(data);
			expect(result.key).toBe('key');
			expect(result.value).toBe('value');
		});
	});

	describe('variableString', () => {
		test.each([
			['', [0x00]],
			['test', [0x04, 0x74, 0x65, 0x73, 0x74]],
			['hello', [0x05, 0x68, 0x65, 0x6c, 0x6c, 0x6f]],
		])('should decode variable string: %s', (expected, bytes) => {
			const buffer = Buffer.from(bytes);
			const data: BufferData = { buffer, index: 0 };
			expect(variableString(data)).toBe(expected);
		});
	});

	describe('integerToOneUint8', () => {
		test.each([
			[0, 0],
			[255, 255],
			[256, 0],
			[257, 1],
			[42, 42],
		])('should convert integer to one uint8: %s -> %s', (value, expected) => {
			expect(integerToOneUint8(value)).toBe(expected);
		});
	});

	describe('integerToTwoUint8', () => {
		test.each([
			[0x0000, [0x00, 0x00]],
			[0x00ff, [0x00, 0xff]],
			[0xff00, [0xff, 0x00]],
			[0xffff, [0xff, 0xff]],
			[0x1234, [0x12, 0x34]],
		])('should convert integer to two uint8: %s -> %s', (value, expected) => {
			expect(integerToTwoUint8(value)).toEqual(expected);
		});
	});

	describe('integerToFourUint8', () => {
		test.each([
			[0x00000000, [0x00, 0x00, 0x00, 0x00]],
			[0x000000ff, [0x00, 0x00, 0x00, 0xff]],
			[0xffffffff, [0xff, 0xff, 0xff, 0xff]],
			[0x12345678, [0x12, 0x34, 0x56, 0x78]],
		])('should convert integer to four uint8: %s -> %s', (value, expected) => {
			expect(integerToFourUint8(value)).toEqual(expected);
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
		])('should calculate variable byte integer length: %s -> %s', (value, expected) => {
			expect(variableByteIntegerLength(value)).toBe(expected);
		});
	});

	describe('encodeVariableByteInteger', () => {
		test.each([
			[0, [0x00]],
			[127, [0x7f]],
			[128, [0x80, 0x01]],
			[16383, [0xff, 0x7f]],
			[16384, [0x80, 0x80, 0x01]],
			[2097151, [0xff, 0xff, 0x7f]],
			[2097152, [0x80, 0x80, 0x80, 0x01]],
			[268435455, [0xff, 0xff, 0xff, 0x7f]],
		])('should encode variable byte integer: %s -> %s', (value, expected) => {
			expect(encodeVariableByteInteger(value)).toEqual(expected);
		});

		test('should throw error for value out of range', () => {
			expect(() => encodeVariableByteInteger(-1)).toThrow(DisconnectException);
			expect(() => encodeVariableByteInteger(268435456)).toThrow(DisconnectException);
		});
	});

	describe('mergeUint8Arrays', () => {
		test('should merge Uint8Arrays', () => {
			const arr1 = [1, 2, 3];
			const arr2 = [4, 5, 6];
			const arr3 = new Uint8Array([7, 8, 9]);
			const result = mergeUint8Arrays(arr1, arr2, arr3);
			expect(result).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
		});
	});

	describe('encodeUTF8String', () => {
		test.each([
			['', [0x00, 0x00]],
			['test', [0x00, 0x04, 0x74, 0x65, 0x73, 0x74]],
			['hello', [0x00, 0x05, 0x68, 0x65, 0x6c, 0x6c, 0x6f]],
		])('should encode UTF-8 string: %s', (str, expected) => {
			expect(encodeUTF8String(str)).toEqual(expected);
		});
	});

	describe('EncoderProperties', () => {
		test('should add property and calculate length', () => {
			const encoder = new EncoderProperties();
			encoder.add(0x01, 1); // payloadFormatIndicator
			expect(encoder.length).toBeGreaterThan(0);
		});

		test('should push properties', () => {
			const encoder = new EncoderProperties();
			encoder.push({
				payloadFormatIndicator: 1,
			});
			expect(encoder.length).toBeGreaterThan(0);
		});

		test('should ignore undefined properties', () => {
			const encoder = new EncoderProperties();
			encoder.push({
				payloadFormatIndicator: undefined,
			} as any);
			// length includes variable byte integer length (1 byte for 0)
			expect(encoder.length).toBe(1);
		});

		test('should get buffer', () => {
			const encoder = new EncoderProperties();
			encoder.add(0x01, 1);
			const buffer = encoder.buffer;
			expect(Buffer.isBuffer(buffer)).toBe(true);
			expect(buffer.length).toBeGreaterThan(0);
		});
	});

	describe('parsePacket', () => {
		test('should parse PINGREQ packet', () => {
			const buffer = Buffer.from([PacketType.PINGREQ << 4, 0x00]);
			const result = parsePacket(buffer, ProtocolVersion.V5);
			expect(result.header.packetType).toBe(PacketType.PINGREQ);
		});

		test('should throw error for unknown packet type', () => {
			const buffer = Buffer.from([0x00, 0x00]); // RESERVED packet type
			expect(() => parsePacket(buffer, ProtocolVersion.V5)).toThrow(DisconnectException);
		});
	});

	describe('parseConnect', () => {
		test('should parse minimal CONNECT packet (MQTT v5)', () => {
			// Fixed header: CONNECT (0x10), remaining length (0x0e = 14)
			// Protocol name: "MQTT" (0x00, 0x04, "MQTT")
			// Protocol version: 5 (0x05)
			// Connect flags: 0x02 (clean start)
			// Keep alive: 0x0000
			// Properties length: 0x00
			// Client ID: "" (0x00, 0x00)
			const buffer = Buffer.from([
				0x10, // CONNECT packet type
				0x0e, // remaining length
				0x00,
				0x04,
				0x4d,
				0x51,
				0x54,
				0x54, // "MQTT"
				0x05, // protocol version
				0x02, // connect flags (clean start)
				0x00,
				0x00, // keep alive
				0x00, // properties length
				0x00,
				0x00, // client ID (empty)
			]);
			const result = parseConnect(buffer);
			expect(result.header.packetType).toBe(PacketType.CONNECT);
			expect(result.header.protocolName).toBe('MQTT');
			expect(result.header.protocolVersion).toBe(ProtocolVersion.V5);
			expect(result.connectFlags.cleanStart).toBe(true);
			expect(result.payload.clientIdentifier).toBe('');
		});

		test('should parse CONNECT packet with client ID', () => {
			const clientId = 'test-client';
			const clientIdBytes = Buffer.from(clientId);
			const buffer = Buffer.from([
				0x10, // CONNECT packet type
				0x0e + clientIdBytes.length, // remaining length
				0x00,
				0x04,
				0x4d,
				0x51,
				0x54,
				0x54, // "MQTT"
				0x05, // protocol version
				0x02, // connect flags
				0x00,
				0x00, // keep alive
				0x00, // properties length
				0x00,
				clientIdBytes.length, // client ID length
				...clientIdBytes, // client ID
			]);
			const result = parseConnect(buffer);
			expect(result.payload.clientIdentifier).toBe(clientId);
		});

		test('should throw error for invalid connect flags', () => {
			const buffer = Buffer.from([
				0x10, // CONNECT packet type
				0x0e, // remaining length
				0x00,
				0x04,
				0x4d,
				0x51,
				0x54,
				0x54, // "MQTT"
				0x05, // protocol version
				0x01, // connect flags (reserved bit set)
				0x00,
				0x00, // keep alive
				0x00, // properties length
				0x00,
				0x00, // client ID
			]);
			expect(() => parseConnect(buffer)).toThrow(DisconnectException);
		});
	});

	describe('parsePublish', () => {
		test('should parse PUBLISH packet QoS 0', () => {
			const topic = 'test/topic';
			const payload = 'test payload';
			const topicBytes = Buffer.from(topic);
			const payloadBytes = Buffer.from(payload);
			// For MQTT v5, we need to include properties length (0x00 for empty properties)
			const remainingLength = 1 + 2 + topicBytes.length + payloadBytes.length;
			const buffer = Buffer.from([
				(PacketType.PUBLISH << 4) | 0x00, // PUBLISH, QoS 0, no flags
				remainingLength,
				0x00,
				topicBytes.length, // topic length
				...topicBytes, // topic
				0x00, // properties length (v5)
				...payloadBytes, // payload
			]);
			const pubData: IPublishData = {
				header: {
					packetType: PacketType.RESERVED,
					dupFlag: false,
					qosLevel: 0,
					retain: false,
					remainingLength: 0,
					topicName: '',
				},
				properties: {},
				payload: '',
			};
			parsePublish(buffer, pubData, ProtocolVersion.V5);
			expect(pubData.header.packetType).toBe(PacketType.PUBLISH);
			expect(pubData.header.topicName).toBe(topic);
			expect(pubData.payload).toBe(payload);
		});

		test('should parse PUBLISH packet QoS 1', () => {
			const topic = 'test/topic';
			const payload = 'test payload';
			const packetId = 0x1234;
			const topicBytes = Buffer.from(topic);
			const payloadBytes = Buffer.from(payload);
			// For MQTT v5, we need to include properties length (0x00 for empty properties)
			const remainingLength = 1 + 2 + topicBytes.length + 2 + payloadBytes.length;
			const buffer = Buffer.from([
				(PacketType.PUBLISH << 4) | 0x02, // PUBLISH, QoS 1
				remainingLength,
				0x00,
				topicBytes.length, // topic length
				...topicBytes, // topic
				0x12,
				0x34, // packet identifier
				0x00, // properties length (v5)
				...payloadBytes, // payload
			]);
			const pubData: IPublishData = {
				header: {
					packetType: PacketType.RESERVED,
					dupFlag: false,
					qosLevel: 0,
					retain: false,
					remainingLength: 0,
					topicName: '',
				},
				properties: {},
				payload: '',
			};
			parsePublish(buffer, pubData, ProtocolVersion.V5);
			expect(pubData.header.packetIdentifier).toBe(packetId);
			expect(pubData.payload).toBe(payload);
		});

		test('should throw error for invalid topic name', () => {
			const topic = 'test/#';
			const topicBytes = Buffer.from(topic);
			const buffer = Buffer.from([(PacketType.PUBLISH << 4) | 0x00, 2 + topicBytes.length, 0x00, topicBytes.length, ...topicBytes]);
			const pubData: IPublishData = {
				header: {
					packetType: PacketType.RESERVED,
					dupFlag: false,
					qosLevel: 0,
					retain: false,
					remainingLength: 0,
					topicName: '',
				},
				properties: {},
				payload: '',
			};
			expect(() => parsePublish(buffer, pubData, ProtocolVersion.V5)).toThrow(PubAckException);
		});
	});

	describe('parsePubAck', () => {
		test('should parse PUBACK packet', () => {
			const packetId = 0x1234;
			const buffer = Buffer.from([
				PacketType.PUBACK << 4,
				0x03, // remaining length (2 bytes packet ID + 1 byte reason code)
				0x12,
				0x34, // packet identifier
				0x00, // reason code
			]);
			const pubAckData: IPubAckData = {
				header: {
					packetType: PacketType.PUBACK,
					received: 0x00,
					remainingLength: 0,
					packetIdentifier: 0,
					reasonCode: 0x00,
				},
				properties: {},
			};
			parsePubAck(buffer, pubAckData, ProtocolVersion.V3_1_1);
			expect(pubAckData.header.packetIdentifier).toBe(packetId);
		});
	});

	describe('parsePubRel', () => {
		test('should parse PUBREL packet', () => {
			const packetId = 0x1234;
			const buffer = Buffer.from([(PacketType.PUBREL << 4) | 0x02, 0x03, 0x12, 0x34, 0x00]);
			const pubRelData: IPubRelData = {
				header: {
					packetType: PacketType.PUBREC,
					received: 0x02,
					remainingLength: 0,
					packetIdentifier: 0,
					reasonCode: 0x00,
				},
				properties: {},
			};
			parsePubRel(buffer, pubRelData, ProtocolVersion.V3_1_1);
			expect(pubRelData.header.packetIdentifier).toBe(packetId);
		});
	});

	describe('parsePubRec', () => {
		test('should parse PUBREC packet', () => {
			const packetId = 0x1234;
			const buffer = Buffer.from([(PacketType.PUBREC << 4) | 0x02, 0x03, 0x12, 0x34, 0x00]);
			const pubRecData: IPubRecData = {
				header: {
					packetType: PacketType.PUBREL,
					received: 0x02,
					remainingLength: 0,
					packetIdentifier: 0,
					reasonCode: 0x00,
				},
				properties: {},
			};
			parsePubRec(buffer, pubRecData, ProtocolVersion.V3_1_1);
			expect(pubRecData.header.packetIdentifier).toBe(packetId);
		});
	});

	describe('parsePubComp', () => {
		test('should parse PUBCOMP packet', () => {
			const packetId = 0x1234;
			const buffer = Buffer.from([(PacketType.PUBCOMP << 4) | 0x02, 0x03, 0x12, 0x34, 0x00]);
			const pubCompData: IPubRecData = {
				header: {
					packetType: PacketType.PUBREL,
					received: 0x02,
					remainingLength: 0,
					packetIdentifier: 0,
					reasonCode: 0x00,
				},
				properties: {},
			};
			parsePubComp(buffer, pubCompData);
			expect(pubCompData.header.packetIdentifier).toBe(packetId);
		});
	});

	describe('parseSubscribe', () => {
		test('should parse SUBSCRIBE packet', () => {
			const packetId = 0x1234;
			const topic = 'test/topic';
			const topicBytes = Buffer.from(topic);
			const buffer = Buffer.from([
				(PacketType.SUBSCRIBE << 4) | 0x02,
				2 + 2 + topicBytes.length + 1, // remaining length
				0x12,
				0x34, // packet identifier
				0x00, // properties length (v5)
				0x00,
				topicBytes.length, // topic length
				...topicBytes, // topic
				0x00, // subscription options (QoS 0)
			]);
			const subData: ISubscribeData = {
				header: {
					packetType: PacketType.RESERVED,
					received: 0x02,
					remainingLength: 0,
					packetIdentifier: 0,
				},
				properties: {},
				payload: '',
				options: {
					qos: QoSType.QoS0,
					noLocal: false,
					retainAsPublished: false,
					retainHandling: 0,
					retain: 0,
				},
			};
			parseSubscribe(buffer, subData, ProtocolVersion.V5);
			expect(subData.header.packetIdentifier).toBe(packetId);
			expect(subData.payload).toBe(topic);
		});
	});

	describe('parseUnsubscribe', () => {
		test('should parse UNSUBSCRIBE packet', () => {
			const packetId = 0x1234;
			const topic = 'test/topic';
			const topicBytes = Buffer.from(topic);
			const buffer = Buffer.from([
				(PacketType.UNSUBSCRIBE << 4) | 0x02,
				2 + 2 + topicBytes.length, // remaining length
				0x12,
				0x34, // packet identifier
				0x00, // properties length (v5)
				0x00,
				topicBytes.length, // topic length
				...topicBytes, // topic
			]);
			const unsubscribeData: IUnsubscribeData = {
				header: {
					packetType: PacketType.RESERVED,
					received: 0x02,
					remainingLength: 0,
					packetIdentifier: 0,
				},
				properties: {},
				payload: '',
			};
			parseUnsubscribe(buffer, unsubscribeData, ProtocolVersion.V5);
			expect(unsubscribeData.header.packetIdentifier).toBe(packetId);
			expect(unsubscribeData.payload).toBe(topic);
		});
	});

	describe('parseDisconnect', () => {
		test('should parse DISCONNECT packet', () => {
			const buffer = Buffer.from([
				PacketType.DISCONNECT << 4,
				0x02, // remaining length
				0x00, // reason code
				0x00, // properties length
			]);
			const disconnectData: IDisconnectData = {
				header: {
					packetType: PacketType.DISCONNECT,
					received: 0,
					remainingLength: 0,
					reasonCode: 0x00,
				},
				properties: {},
			};
			parseDisconnect(buffer, disconnectData, ProtocolVersion.V5);
			expect(disconnectData.header.packetType).toBe(PacketType.DISCONNECT);
		});
	});

	describe('parseAuth', () => {
		test('should parse AUTH packet', () => {
			const buffer = Buffer.from([
				PacketType.AUTH << 4,
				0x02, // remaining length
				0x00, // reason code
				0x00, // properties length
			]);
			const authData: IAuthData = {
				header: {
					packetType: PacketType.AUTH,
					received: 0,
					remainingLength: 0,
					reasonCode: 0x00,
				},
				properties: {},
			};
			parseAuth(buffer, authData, ProtocolVersion.V5);
			expect(authData.header.packetType).toBe(PacketType.AUTH);
		});
	});

	describe('encodeConnAck', () => {
		test('should encode CONNACK packet', () => {
			const connAckData: IConnAckData = {
				header: {
					packetType: PacketType.CONNACK,
					reserved: 0,
					reasonCode: 0x00,
				},
				acknowledgeFlags: {
					SessionPresent: false,
				},
				properties: {},
			};
			const buffer = encodeConnAck(connAckData, ProtocolVersion.V5);
			expect(Buffer.isBuffer(buffer)).toBe(true);
			expect(buffer[0] >> 4).toBe(PacketType.CONNACK);
		});
	});

	describe('encodeDisconnect', () => {
		test('should encode DISCONNECT packet', () => {
			const disconnectData: IDisconnectData = {
				header: {
					packetType: PacketType.DISCONNECT,
					received: 0,
					remainingLength: 0,
					reasonCode: 0x00,
				},
				properties: {},
			};
			const buffer = encodeDisconnect(disconnectData);
			expect(Buffer.isBuffer(buffer)).toBe(true);
			expect(buffer[0] >> 4).toBe(PacketType.DISCONNECT);
		});
	});

	describe('encodePublishPacket', () => {
		test('should encode PUBLISH packet QoS 0', () => {
			const pubData: IPublishData = {
				header: {
					packetType: PacketType.PUBLISH,
					dupFlag: false,
					qosLevel: QoSType.QoS0,
					retain: false,
					remainingLength: 0,
					topicName: 'test/topic',
				},
				properties: {},
				payload: 'test payload',
			};
			const buffer = encodePublishPacket(pubData, ProtocolVersion.V5);
			expect(Buffer.isBuffer(buffer)).toBe(true);
			expect(buffer[0] >> 4).toBe(PacketType.PUBLISH);
		});

		test('should encode PUBLISH packet QoS 1', () => {
			const pubData: IPublishData = {
				header: {
					packetType: PacketType.PUBLISH,
					dupFlag: false,
					qosLevel: QoSType.QoS1,
					retain: false,
					remainingLength: 0,
					topicName: 'test/topic',
					packetIdentifier: 0x1234,
				},
				properties: {},
				payload: 'test payload',
			};
			const buffer = encodePublishPacket(pubData, ProtocolVersion.V5);
			expect(Buffer.isBuffer(buffer)).toBe(true);
		});
	});

	describe('encodePubControlPacket', () => {
		test('should encode PUBACK packet', () => {
			const pubAckData: IPubAckData = {
				header: {
					packetType: PacketType.PUBACK,
					received: 0x00,
					remainingLength: 0,
					packetIdentifier: 0x1234,
					reasonCode: 0x00,
				},
				properties: {},
			};
			const buffer = encodePubControlPacket(pubAckData, ProtocolVersion.V5);
			expect(Buffer.isBuffer(buffer)).toBe(true);
			expect(buffer[0] >> 4).toBe(PacketType.PUBACK);
		});
	});

	describe('encodeSubAckPacket', () => {
		test('should encode SUBACK packet', () => {
			const subAckData: ISubAckData = {
				header: {
					packetType: PacketType.SUBACK,
					retain: 0,
					packetIdentifier: 0x1234,
				},
				properties: {},
				reasonCode: 0x00,
			};
			const buffer = encodeSubAckPacket(subAckData, ProtocolVersion.V5);
			expect(Buffer.isBuffer(buffer)).toBe(true);
			expect(buffer[0] >> 4).toBe(PacketType.SUBACK);
		});
	});
});
