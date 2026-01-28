import {
	parseProperties,
	parseConnectProperties,
	parsePublishProperties,
	parseSubscribeProperties,
	parseDisconnectProperties,
	parseAuthProperties,
	parseConnAckProperties,
	parsePubAckProperties,
	parsePubRecProperties,
	parsePubRelProperties,
	parsePubCompProperties,
	parseSubAckProperties,
	parseUnsubscribeProperties,
	parseUnsubscribeAckProperties,
	parseConnectWillProperties,
	encodeProperties,
} from '../property';
import { PropertyIdentifier } from '../interface';
import { DisconnectException } from '../exception';
import { encodeUTF8String, integerToOneUint8, integerToTwoUint8, integerToFourUint8 } from '../parse';

describe('property', () => {
	describe('parseProperties', () => {
		test('should parse empty buffer', () => {
			const buffer = Buffer.from([]);
			const result = parseProperties(buffer);
			expect(result).toEqual({});
		});

		test('should parse payloadFormatIndicator', () => {
			const buffer = Buffer.from([PropertyIdentifier.payloadFormatIndicator, 0x01]);
			const result = parseProperties(buffer);
			expect(result.payloadFormatIndicator).toBe(0x01);
		});

		test('should parse messageExpiryInterval', () => {
			const buffer = Buffer.from([PropertyIdentifier.messageExpiryInterval, 0x00, 0x00, 0x00, 0xff]);
			const result = parseProperties(buffer);
			expect(result.messageExpiryInterval).toBe(0xff);
		});

		test('should parse contentType', () => {
			const str = 'application/json';
			const strBytes = Buffer.from(str);
			const buffer = Buffer.from([PropertyIdentifier.contentType, 0x00, strBytes.length, ...strBytes]);
			const result = parseProperties(buffer);
			expect(result.contentType).toBe(str);
		});

		test('should parse userProperty', () => {
			const key = 'key';
			const value = 'value';
			const keyBytes = Buffer.from(key);
			const valueBytes = Buffer.from(value);
			const buffer = Buffer.from([PropertyIdentifier.userProperty, 0x00, keyBytes.length, ...keyBytes, 0x00, valueBytes.length, ...valueBytes]);
			const result = parseProperties(buffer);
			expect(result.userProperty).toEqual({ [key]: value });
		});

		test('should parse multiple userProperty', () => {
			const key1 = 'key1';
			const value1 = 'value1';
			const key2 = 'key2';
			const value2 = 'value2';
			const key1Bytes = Buffer.from(key1);
			const value1Bytes = Buffer.from(value1);
			const key2Bytes = Buffer.from(key2);
			const value2Bytes = Buffer.from(value2);
			const buffer = Buffer.from([
				PropertyIdentifier.userProperty,
				0x00,
				key1Bytes.length,
				...key1Bytes,
				0x00,
				value1Bytes.length,
				...value1Bytes,
				PropertyIdentifier.userProperty,
				0x00,
				key2Bytes.length,
				...key2Bytes,
				0x00,
				value2Bytes.length,
				...value2Bytes,
			]);
			const result = parseProperties(buffer);
			expect(result.userProperty).toEqual({ [key1]: value1, [key2]: value2 });
		});

		test('should throw error for duplicate payloadFormatIndicator', () => {
			const buffer = Buffer.from([PropertyIdentifier.payloadFormatIndicator, 0x01, PropertyIdentifier.payloadFormatIndicator, 0x02]);
			expect(() => parseProperties(buffer)).toThrow(DisconnectException);
		});

		test('should throw error for subscriptionIdentifier with value 0', () => {
			const buffer = Buffer.from([PropertyIdentifier.subscriptionIdentifier, 0x00]);
			expect(() => parseProperties(buffer)).toThrow(DisconnectException);
		});

		test('should parse subscriptionIdentifier', () => {
			const buffer = Buffer.from([PropertyIdentifier.subscriptionIdentifier, 0x01]);
			const result = parseProperties(buffer);
			expect(result.subscriptionIdentifier).toBe(1);
		});
	});

	describe('parseConnectProperties', () => {
		test('should parse sessionExpiryInterval', () => {
			const buffer = Buffer.from([PropertyIdentifier.sessionExpiryInterval, 0x00, 0x00, 0x00, 0xff]);
			const result = parseConnectProperties(buffer);
			expect(result.sessionExpiryInterval).toBe(0xff);
		});

		test('should parse receiveMaximum', () => {
			const buffer = Buffer.from([PropertyIdentifier.receiveMaximum, 0x12, 0x34]);
			const result = parseConnectProperties(buffer);
			expect(result.receiveMaximum).toBe(0x1234);
		});

		test('should parse userProperty', () => {
			const key = 'key';
			const value = 'value';
			const keyBytes = Buffer.from(key);
			const valueBytes = Buffer.from(value);
			const buffer = Buffer.from([PropertyIdentifier.userProperty, 0x00, keyBytes.length, ...keyBytes, 0x00, valueBytes.length, ...valueBytes]);
			const result = parseConnectProperties(buffer);
			expect(result.userProperty).toEqual({ [key]: value });
		});
	});

	describe('parsePublishProperties', () => {
		test('should parse payloadFormatIndicator', () => {
			const buffer = Buffer.from([PropertyIdentifier.payloadFormatIndicator, 0x01]);
			const result = parsePublishProperties(buffer);
			expect(result.payloadFormatIndicator).toBe(0x01);
		});

		test('should parse responseTopic', () => {
			const topic = 'response/topic';
			const topicBytes = Buffer.from(topic);
			const buffer = Buffer.from([PropertyIdentifier.responseTopic, 0x00, topicBytes.length, ...topicBytes]);
			const result = parsePublishProperties(buffer);
			expect(result.responseTopic).toBe(topic);
		});

		test('should throw error for responseTopic with wildcard', () => {
			const topic = 'response/#';
			const topicBytes = Buffer.from(topic);
			const buffer = Buffer.from([PropertyIdentifier.responseTopic, 0x00, topicBytes.length, ...topicBytes]);
			expect(() => parsePublishProperties(buffer)).toThrow(DisconnectException);
		});

		test('should parse subscriptionIdentifier array', () => {
			const buffer = Buffer.from([PropertyIdentifier.subscriptionIdentifier, 0x01, PropertyIdentifier.subscriptionIdentifier, 0x02]);
			const result = parsePublishProperties(buffer);
			expect(result.subscriptionIdentifier).toEqual([1, 2]);
		});

		test('should throw error for subscriptionIdentifier with value 0', () => {
			const buffer = Buffer.from([PropertyIdentifier.subscriptionIdentifier, 0x00]);
			expect(() => parsePublishProperties(buffer)).toThrow(DisconnectException);
		});
	});

	describe('parseSubscribeProperties', () => {
		test('should parse subscriptionIdentifier', () => {
			const buffer = Buffer.from([PropertyIdentifier.subscriptionIdentifier, 0x01]);
			const result = parseSubscribeProperties(buffer);
			expect(result.subscriptionIdentifier).toBe(1);
		});

		test('should throw error for subscriptionIdentifier with value 0', () => {
			const buffer = Buffer.from([PropertyIdentifier.subscriptionIdentifier, 0x00]);
			expect(() => parseSubscribeProperties(buffer)).toThrow(DisconnectException);
		});

		test('should throw error for duplicate subscriptionIdentifier', () => {
			const buffer = Buffer.from([PropertyIdentifier.subscriptionIdentifier, 0x01, PropertyIdentifier.subscriptionIdentifier, 0x02]);
			expect(() => parseSubscribeProperties(buffer)).toThrow(DisconnectException);
		});
	});

	describe('parseDisconnectProperties', () => {
		test('should parse sessionExpiryInterval', () => {
			const buffer = Buffer.from([PropertyIdentifier.sessionExpiryInterval, 0x00, 0x00, 0x00, 0xff]);
			const result = parseDisconnectProperties(buffer);
			expect(result.sessionExpiryInterval).toBe(0xff);
		});

		test('should parse reasonString', () => {
			const reason = 'Disconnect reason';
			const reasonBytes = Buffer.from(reason);
			const buffer = Buffer.from([PropertyIdentifier.reasonString, 0x00, reasonBytes.length, ...reasonBytes]);
			const result = parseDisconnectProperties(buffer);
			expect(result.reasonString).toBe(reason);
		});

		test('should parse userProperty', () => {
			const key = 'key';
			const value = 'value';
			const keyBytes = Buffer.from(key);
			const valueBytes = Buffer.from(value);
			const buffer = Buffer.from([PropertyIdentifier.userProperty, 0x00, keyBytes.length, ...keyBytes, 0x00, valueBytes.length, ...valueBytes]);
			const result = parseDisconnectProperties(buffer);
			expect(result.userProperty).toEqual({ [key]: value });
		});
	});

	describe('parseAuthProperties', () => {
		test('should parse authenticationMethod', () => {
			const method = 'PLAIN';
			const methodBytes = Buffer.from(method);
			const buffer = Buffer.from([PropertyIdentifier.authenticationMethod, 0x00, methodBytes.length, ...methodBytes]);
			const result = parseAuthProperties(buffer);
			expect(result.authenticationMethod).toBe(method);
		});

		test('should parse authenticationData', () => {
			const data = 'auth-data';
			const dataBytes = Buffer.from(data);
			const buffer = Buffer.from([PropertyIdentifier.authenticationData, 0x00, dataBytes.length, ...dataBytes]);
			const result = parseAuthProperties(buffer);
			expect(result.authenticationData).toBe(data);
		});

		test('should parse userProperty', () => {
			const key = 'key';
			const value = 'value';
			const keyBytes = Buffer.from(key);
			const valueBytes = Buffer.from(value);
			const buffer = Buffer.from([PropertyIdentifier.userProperty, 0x00, keyBytes.length, ...keyBytes, 0x00, valueBytes.length, ...valueBytes]);
			const result = parseAuthProperties(buffer);
			expect(result.userProperty).toEqual({ [key]: value });
		});
	});

	describe('parseConnectWillProperties', () => {
		test('should parse willDelayInterval', () => {
			const buffer = Buffer.from([PropertyIdentifier.willDelayInterval, 0x00, 0x00, 0x00, 0xff]);
			const result = parseConnectWillProperties(buffer);
			expect(result.willDelayInterval).toBe(0xff);
		});

		test('should parse payloadFormatIndicator', () => {
			const buffer = Buffer.from([PropertyIdentifier.payloadFormatIndicator, 0x01]);
			const result = parseConnectWillProperties(buffer);
			expect(result.payloadFormatIndicator).toBe(0x01);
		});

		test('should throw error for responseTopic with wildcard', () => {
			const topic = 'response/#';
			const topicBytes = Buffer.from(topic);
			const buffer = Buffer.from([PropertyIdentifier.responseTopic, 0x00, topicBytes.length, ...topicBytes]);
			expect(() => parseConnectWillProperties(buffer)).toThrow(DisconnectException);
		});
	});

	describe('parseConnAckProperties', () => {
		test('should parse assignedClientIdentifier', () => {
			const clientId = 'client-id';
			const clientIdBytes = Buffer.from(clientId);
			const buffer = Buffer.from([PropertyIdentifier.assignedClientIdentifier, 0x00, clientIdBytes.length, ...clientIdBytes]);
			const result = parseConnAckProperties(buffer);
			expect(result.assignedClientIdentifier).toBe(clientId);
		});

		test('should parse serverKeepAlive', () => {
			const buffer = Buffer.from([PropertyIdentifier.serverKeepAlive, 0x12, 0x34]);
			const result = parseConnAckProperties(buffer);
			expect(result.serverKeepAlive).toBe(0x1234);
		});
	});

	describe('parsePubAckProperties', () => {
		test('should parse reasonString', () => {
			const reason = 'Reason';
			const reasonBytes = Buffer.from(reason);
			const buffer = Buffer.from([PropertyIdentifier.reasonString, 0x00, reasonBytes.length, ...reasonBytes]);
			const result = parsePubAckProperties(buffer);
			expect(result.reasonString).toBe(reason);
		});

		test('should parse userProperty', () => {
			const key = 'key';
			const value = 'value';
			const keyBytes = Buffer.from(key);
			const valueBytes = Buffer.from(value);
			const buffer = Buffer.from([PropertyIdentifier.userProperty, 0x00, keyBytes.length, ...keyBytes, 0x00, valueBytes.length, ...valueBytes]);
			const result = parsePubAckProperties(buffer);
			expect(result.userProperty).toEqual({ [key]: value });
		});
	});

	describe('parsePubRecProperties', () => {
		test('should parse reasonString', () => {
			const reason = 'Reason';
			const reasonBytes = Buffer.from(reason);
			const buffer = Buffer.from([PropertyIdentifier.reasonString, 0x00, reasonBytes.length, ...reasonBytes]);
			const result = parsePubRecProperties(buffer);
			expect(result.reasonString).toBe(reason);
		});
	});

	describe('parsePubRelProperties', () => {
		test('should parse reasonString', () => {
			const reason = 'Reason';
			const reasonBytes = Buffer.from(reason);
			const buffer = Buffer.from([PropertyIdentifier.reasonString, 0x00, reasonBytes.length, ...reasonBytes]);
			const result = parsePubRelProperties(buffer);
			expect(result.reasonString).toBe(reason);
		});
	});

	describe('parsePubCompProperties', () => {
		test('should parse reasonString', () => {
			const reason = 'Reason';
			const reasonBytes = Buffer.from(reason);
			const buffer = Buffer.from([PropertyIdentifier.reasonString, 0x00, reasonBytes.length, ...reasonBytes]);
			const result = parsePubCompProperties(buffer);
			expect(result.reasonString).toBe(reason);
		});
	});

	describe('parseSubAckProperties', () => {
		test('should parse reasonString', () => {
			const reason = 'Reason';
			const reasonBytes = Buffer.from(reason);
			const buffer = Buffer.from([PropertyIdentifier.reasonString, 0x00, reasonBytes.length, ...reasonBytes]);
			const result = parseSubAckProperties(buffer);
			expect(result.reasonString).toBe(reason);
		});
	});

	describe('parseUnsubscribeProperties', () => {
		test('should parse userProperty', () => {
			const key = 'key';
			const value = 'value';
			const keyBytes = Buffer.from(key);
			const valueBytes = Buffer.from(value);
			const buffer = Buffer.from([PropertyIdentifier.userProperty, 0x00, keyBytes.length, ...keyBytes, 0x00, valueBytes.length, ...valueBytes]);
			const result = parseUnsubscribeProperties(buffer);
			expect(result.userProperty).toEqual({ [key]: value });
		});
	});

	describe('parseUnsubscribeAckProperties', () => {
		test('should parse userProperty', () => {
			const key = 'key';
			const value = 'value';
			const keyBytes = Buffer.from(key);
			const valueBytes = Buffer.from(value);
			const buffer = Buffer.from([PropertyIdentifier.userProperty, 0x00, keyBytes.length, ...keyBytes, 0x00, valueBytes.length, ...valueBytes]);
			const result = parseUnsubscribeAckProperties(buffer);
			expect(result.userProperty).toEqual({ [key]: value });
		});
	});

	describe('encodeProperties', () => {
		test('should encode payloadFormatIndicator', () => {
			const result = encodeProperties(PropertyIdentifier.payloadFormatIndicator, 0x01);
			expect(result).toEqual([PropertyIdentifier.payloadFormatIndicator, 0x01]);
		});

		test('should encode messageExpiryInterval', () => {
			const result = encodeProperties(PropertyIdentifier.messageExpiryInterval, 0x12345678);
			expect(result).toEqual([PropertyIdentifier.messageExpiryInterval, ...integerToFourUint8(0x12345678)]);
		});

		test('should encode contentType', () => {
			const str = 'application/json';
			const result = encodeProperties(PropertyIdentifier.contentType, str);
			expect(result).toEqual([PropertyIdentifier.contentType, ...encodeUTF8String(str)]);
		});

		test('should encode responseTopic', () => {
			const topic = 'response/topic';
			const result = encodeProperties(PropertyIdentifier.responseTopic, topic);
			expect(result).toEqual([PropertyIdentifier.responseTopic, ...encodeUTF8String(topic)]);
		});

		test('should encode subscriptionIdentifier as array', () => {
			const ids = [1, 2, 3];
			const result = encodeProperties(PropertyIdentifier.subscriptionIdentifier, ids as any);
			expect(result.length).toBeGreaterThan(0);
			expect(result[0]).toBe(PropertyIdentifier.subscriptionIdentifier);
		});

		test('should encode sessionExpiryInterval', () => {
			const result = encodeProperties(PropertyIdentifier.sessionExpiryInterval, 0x12345678);
			expect(result).toEqual([PropertyIdentifier.sessionExpiryInterval, ...integerToFourUint8(0x12345678)]);
		});

		test('should encode assignedClientIdentifier', () => {
			const clientId = 'client-id';
			const result = encodeProperties(PropertyIdentifier.assignedClientIdentifier, clientId);
			expect(result).toEqual([PropertyIdentifier.assignedClientIdentifier, ...encodeUTF8String(clientId)]);
		});

		test('should encode serverKeepAlive', () => {
			const result = encodeProperties(PropertyIdentifier.serverKeepAlive, 0x1234);
			expect(result).toEqual([PropertyIdentifier.serverKeepAlive, ...integerToTwoUint8(0x1234)]);
		});

		test('should encode authenticationMethod', () => {
			const method = 'PLAIN';
			const result = encodeProperties(PropertyIdentifier.authenticationMethod, method);
			expect(result).toEqual([PropertyIdentifier.authenticationMethod, ...encodeUTF8String(method)]);
		});

		test('should encode requestProblemInformation', () => {
			const result = encodeProperties(PropertyIdentifier.requestProblemInformation, 1);
			expect(result).toEqual([PropertyIdentifier.requestProblemInformation, integerToOneUint8(1)]);
		});

		test('should encode userProperty', () => {
			const userProperty = { key1: 'value1', key2: 'value2' };
			const result = encodeProperties(PropertyIdentifier.userProperty, userProperty as any);
			expect(result.length).toBeGreaterThan(0);
			expect(result[0]).toBe(PropertyIdentifier.userProperty);
		});

		test('should encode topicAlias', () => {
			const result = encodeProperties(PropertyIdentifier.topicAlias, 0x1234);
			expect(result).toEqual([PropertyIdentifier.topicAlias, ...integerToTwoUint8(0x1234)]);
		});

		test('should encode maximumQoS', () => {
			const result = encodeProperties(PropertyIdentifier.maximumQoS, true);
			expect(result).toEqual([PropertyIdentifier.maximumQoS, integerToOneUint8(1)]);
		});

		test('should encode retainAvailable', () => {
			const result = encodeProperties(PropertyIdentifier.retainAvailable, true);
			expect(result).toEqual([PropertyIdentifier.retainAvailable, integerToOneUint8(1)]);
		});

		test('should encode maximumPacketSize', () => {
			const result = encodeProperties(PropertyIdentifier.maximumPacketSize, 0x12345678);
			expect(result).toEqual([PropertyIdentifier.maximumPacketSize, ...integerToFourUint8(0x12345678)]);
		});

		test('should return empty array for unknown property', () => {
			const result = encodeProperties(0xff as any, 'test');
			expect(result).toEqual([]);
		});
	});

	describe('parseProperties with index', () => {
		test('should parse properties starting from index', () => {
			const buffer = Buffer.from([0x00, 0x00, PropertyIdentifier.payloadFormatIndicator, 0x01, PropertyIdentifier.contentType, 0x00, 0x04, 0x74, 0x65, 0x73, 0x74]);
			const result = parseProperties(buffer, 2);
			expect(result.payloadFormatIndicator).toBe(0x01);
			expect(result.contentType).toBe('test');
		});
	});
});
