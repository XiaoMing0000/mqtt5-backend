/**
 * Comprehensive MQTT v5.0 specification compliance tests for parse.ts
 * Based on https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html
 */
import {
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
	parsePacket,
	encodeConnAck,
	encodePublishPacket,
	encodePubControlPacket,
	encodeDisconnect,
	encodeSubAckPacket,
	encodeVariableByteInteger,
	encodeUTF8String,
	encodeBinaryData,
} from '../parse';
import { PacketType, ProtocolVersion, QoSType, PropertyIdentifier } from '../interface';
import type { IPublishData, IPubAckData, IPubRecData, IPubRelData, IDisconnectData, IAuthData, ISubscribeData, IUnsubscribeData, IConnAckData, ISubAckData } from '../interface';
import { DisconnectException, PubAckException, SubscribeAckException } from '../exception';

// ─── helpers ────────────────────────────────────────────────────────────

function buildConnectPacket(opts: { protocolName?: string; protocolVersion?: number; flags?: number; keepAlive?: number; properties?: number[]; payload?: number[] }): Buffer {
	const name = opts.protocolName ?? 'MQTT';
	const nameBytes = [...encodeUTF8String(name)];
	const version = opts.protocolVersion ?? 5;
	const flags = opts.flags ?? 0x02;
	const keepAlive = opts.keepAlive ?? 0;
	const props = opts.properties ?? [0x00];
	const payload = opts.payload ?? [0x00, 0x00];

	const variableHeader = [...nameBytes, version, flags, (keepAlive >> 8) & 0xff, keepAlive & 0xff, ...props];
	const body = [...variableHeader, ...payload];
	return Buffer.from([0x10, ...encodeVariableByteInteger(body.length), ...body]);
}

function emptyPubData(): IPublishData {
	return {
		header: { packetType: PacketType.RESERVED, dupFlag: false, qosLevel: 0, retain: false, remainingLength: 0, topicName: '' },
		properties: {},
		payload: '',
	};
}

function emptyPubAckData(): IPubAckData {
	return { header: { packetType: PacketType.PUBACK, received: 0, remainingLength: 0, packetIdentifier: 0, reasonCode: 0 }, properties: {} };
}

function emptyPubRecData(): IPubRecData {
	return { header: { packetType: PacketType.PUBREC, received: 0, remainingLength: 0, packetIdentifier: 0, reasonCode: 0 }, properties: {} };
}

function emptyPubRelData(): IPubRelData {
	return { header: { packetType: PacketType.PUBREL, received: 0, remainingLength: 0, packetIdentifier: 0, reasonCode: 0 }, properties: {} };
}

function emptyDisconnectData(): IDisconnectData {
	return { header: { packetType: PacketType.DISCONNECT, received: 0, remainingLength: 0, reasonCode: 0 }, properties: {} };
}

function emptyAuthData(): IAuthData {
	return { header: { packetType: PacketType.AUTH, received: 0, remainingLength: 0, reasonCode: 0 }, properties: {} };
}

function emptySubData(): ISubscribeData {
	return {
		header: { packetType: PacketType.RESERVED, received: 0x02, remainingLength: 0, packetIdentifier: 0 },
		properties: {},
		payload: '',
		options: { qos: QoSType.QoS0, noLocal: false, retainAsPublished: false, retainHandling: 0, retain: 0 },
	};
}

function emptyUnsubData(): IUnsubscribeData {
	return {
		header: { packetType: PacketType.RESERVED, received: 0x02, remainingLength: 0, packetIdentifier: 0 },
		properties: {},
		payload: '',
	};
}

// ─── §3.1 CONNECT ───────────────────────────────────────────────────────

describe('parseConnect (§3.1 CONNECT)', () => {
	test('parses CONNECT with Will QoS 1 and will retain (§3.1.2.5–7)', () => {
		const willTopic = encodeUTF8String('will/topic');
		const willPayload = encodeBinaryData(Buffer.from('will-msg'));
		// flags: willRetain=1 willQoS=1 willFlag=1 cleanStart=1 => 0b_0_0_1_01_1_1_0 = 0x2E
		const buf = buildConnectPacket({
			flags: 0x2e,
			properties: [0x00],
			payload: [0x00, 0x00, 0x00, ...willTopic, ...willPayload],
		});
		const result = parseConnect(buf);
		expect(result.connectFlags.willFlag).toBe(true);
		expect(result.connectFlags.willQoS).toBe(1);
		expect(result.connectFlags.willRetain).toBe(true);
		expect(result.payload.willTopic).toBe('will/topic');
		expect(result.payload.willPayload?.toString()).toBe('will-msg');
	});

	test('parses CONNECT with Will QoS 2 (§3.1.2.6)', () => {
		const willTopic = encodeUTF8String('q2/topic');
		const willPayload = encodeBinaryData(Buffer.from('q2'));
		// flags: willQoS=2 willFlag=1 cleanStart=1 => 0b_0_0_0_10_1_1_0 = 0x16
		const buf = buildConnectPacket({
			flags: 0x16,
			properties: [0x00],
			payload: [0x00, 0x00, 0x00, ...willTopic, ...willPayload],
		});
		const result = parseConnect(buf);
		expect(result.connectFlags.willQoS).toBe(2);
	});

	test('parses CONNECT v5 with Will Properties (§3.1.3.2)', () => {
		const willTopic = encodeUTF8String('w/t');
		const willPayload = encodeBinaryData(Buffer.from('wp'));
		// Will properties: willDelayInterval = 60 (0x18, four bytes)
		const willProps = [0x18, 0x00, 0x00, 0x00, 0x3c];
		const willPropsVBI = encodeVariableByteInteger(willProps.length);
		// flags: willFlag=1 cleanStart=1 => 0b_0_0_0_00_1_1_0 = 0x06
		const buf = buildConnectPacket({
			flags: 0x06,
			properties: [0x00],
			payload: [0x00, 0x00, ...willPropsVBI, ...willProps, ...willTopic, ...willPayload],
		});
		const result = parseConnect(buf);
		expect(result.payload.willProperties?.willDelayInterval).toBe(60);
		expect(result.payload.willTopic).toBe('w/t');
	});

	test('parses MQTT v3.1.1 CONNECT without properties block (§3.1)', () => {
		const nameBytes = encodeUTF8String('MQTT');
		const clientId = encodeUTF8String('v4client');
		const body = [...nameBytes, 4, 0x02, 0x00, 0x3c, ...clientId];
		const buf = Buffer.from([0x10, ...encodeVariableByteInteger(body.length), ...body]);
		const result = parseConnect(buf);
		expect(result.header.protocolVersion).toBe(ProtocolVersion.V3_1_1);
		expect(result.header.keepAlive).toBe(60);
		expect(result.payload.clientIdentifier).toBe('v4client');
		expect(result.properties).toEqual({});
	});

	test('parses CONNECT with cleanStart=false (§3.1.2.4)', () => {
		const buf = buildConnectPacket({ flags: 0x00, payload: [...encodeUTF8String('c1')] });
		const result = parseConnect(buf);
		expect(result.connectFlags.cleanStart).toBe(false);
	});

	test('parses CONNECT keepAlive=300 (§3.1.2.10)', () => {
		const buf = buildConnectPacket({ keepAlive: 300 });
		const result = parseConnect(buf);
		expect(result.header.keepAlive).toBe(300);
	});

	test('parses CONNECT with v5 Session Expiry Interval property (§3.1.2.11.2)', () => {
		const props = [PropertyIdentifier.sessionExpiryInterval, 0x00, 0x00, 0x01, 0x2c];
		const propsVBI = encodeVariableByteInteger(props.length);
		const buf = buildConnectPacket({ properties: [...propsVBI, ...props] });
		const result = parseConnect(buf);
		expect(result.properties.sessionExpiryInterval).toBe(300);
	});

	test('rejects willRetain=1 when willFlag=0 (§3.1.2.7)', () => {
		// flags: willRetain=1 willFlag=0 cleanStart=1 => 0b_0_0_1_00_0_1_0 = 0x22
		expect(() => buildConnectPacket({ flags: 0x22 }).length && parseConnect(buildConnectPacket({ flags: 0x22 }))).toThrow(DisconnectException);
	});

	test('rejects willQoS=3 (§3.1.2.6)', () => {
		// flags: willQoS=3 willFlag=1 cleanStart=1 => 0b_0_0_0_11_1_1_0 = 0x1E
		expect(() => parseConnect(buildConnectPacket({ flags: 0x1e }))).toThrow(DisconnectException);
	});

	test('rejects reserved bit set (§3.1.2.3)', () => {
		expect(() => parseConnect(buildConnectPacket({ flags: 0x03 }))).toThrow(DisconnectException);
	});
});

// ─── §3.3 PUBLISH ───────────────────────────────────────────────────────

describe('parsePublish (§3.3 PUBLISH)', () => {
	test('parses QoS 2 PUBLISH with packet identifier (§3.3.2.2)', () => {
		const topic = encodeUTF8String('qos2/topic');
		const payload = Buffer.from('data');
		const body = [...topic, 0x00, 0x2a, 0x00, ...payload];
		const fixedHeader = (PacketType.PUBLISH << 4) | 0x04; // QoS 2
		const buf = Buffer.from([fixedHeader, ...encodeVariableByteInteger(body.length), ...body]);
		const pubData = emptyPubData();
		parsePublish(buf, pubData, ProtocolVersion.V5);
		expect(pubData.header.qosLevel).toBe(QoSType.QoS2);
		expect(pubData.header.packetIdentifier).toBe(42);
	});

	test('parses DUP=true on QoS 1 PUBLISH (§3.3.1.1)', () => {
		const topic = encodeUTF8String('dup/t');
		const body = [...topic, 0x00, 0x01, 0x00];
		const fixedHeader = (PacketType.PUBLISH << 4) | 0x0a; // DUP=1, QoS=1
		const buf = Buffer.from([fixedHeader, ...encodeVariableByteInteger(body.length), ...body]);
		const pubData = emptyPubData();
		parsePublish(buf, pubData, ProtocolVersion.V5);
		expect(pubData.header.dupFlag).toBe(true);
		expect(pubData.header.qosLevel).toBe(QoSType.QoS1);
	});

	test('parses RETAIN=true (§3.3.1.3)', () => {
		const topic = encodeUTF8String('ret/t');
		const body = [...topic, 0x00];
		const fixedHeader = (PacketType.PUBLISH << 4) | 0x01; // retain=1
		const buf = Buffer.from([fixedHeader, ...encodeVariableByteInteger(body.length), ...body]);
		const pubData = emptyPubData();
		parsePublish(buf, pubData, ProtocolVersion.V5);
		expect(pubData.header.retain).toBe(true);
	});

	test('accepts topic starting with $ (§3.3.2.1)', () => {
		const topic = encodeUTF8String('$SYS/info');
		const body = [...topic, 0x00, ...Buffer.from('ok')];
		const buf = Buffer.from([PacketType.PUBLISH << 4, ...encodeVariableByteInteger(body.length), ...body]);
		const pubData = emptyPubData();
		parsePublish(buf, pubData, ProtocolVersion.V5);
		expect(pubData.header.topicName).toBe('$SYS/info');
	});

	test('parses empty payload (§3.3.3)', () => {
		const topic = encodeUTF8String('empty');
		const body = [...topic, 0x00];
		const buf = Buffer.from([PacketType.PUBLISH << 4, ...encodeVariableByteInteger(body.length), ...body]);
		const pubData = emptyPubData();
		parsePublish(buf, pubData, ProtocolVersion.V5);
		expect(pubData.payload).toBe('');
	});

	test('parses v3.1.1 PUBLISH without properties block', () => {
		const topic = encodeUTF8String('v4/t');
		const payload = Buffer.from('v4data');
		const body = [...topic, ...payload];
		const buf = Buffer.from([PacketType.PUBLISH << 4, ...encodeVariableByteInteger(body.length), ...body]);
		const pubData = emptyPubData();
		parsePublish(buf, pubData, ProtocolVersion.V3_1_1);
		expect(pubData.header.topicName).toBe('v4/t');
		expect(pubData.payload).toBe('v4data');
	});

	test('rejects topic with # wildcard (§3.3.2.1)', () => {
		const topic = encodeUTF8String('bad/#');
		const buf = Buffer.from([PacketType.PUBLISH << 4, ...encodeVariableByteInteger(topic.length), ...topic]);
		const pubData = emptyPubData();
		expect(() => parsePublish(buf, pubData, ProtocolVersion.V5)).toThrow(PubAckException);
	});

	test('rejects topic with + wildcard (§3.3.2.1)', () => {
		const topic = encodeUTF8String('bad/+/x');
		const buf = Buffer.from([PacketType.PUBLISH << 4, ...encodeVariableByteInteger(topic.length), ...topic]);
		const pubData = emptyPubData();
		expect(() => parsePublish(buf, pubData, ProtocolVersion.V5)).toThrow(PubAckException);
	});
});

// ─── §3.4–3.7 PUBACK/PUBREC/PUBREL/PUBCOMP ─────────────────────────────

describe('parsePubAck (§3.4)', () => {
	test('parses v5 PUBACK with Reason String property (§3.4.2.2)', () => {
		const reasonStr = encodeUTF8String('quota exceeded');
		const props = [PropertyIdentifier.reasonString, ...reasonStr];
		const propsVBI = encodeVariableByteInteger(props.length);
		const body = [0x00, 0x0a, 0x97, ...propsVBI, ...props];
		const buf = Buffer.from([PacketType.PUBACK << 4, ...encodeVariableByteInteger(body.length), ...body]);
		const data = emptyPubAckData();
		parsePubAck(buf, data, ProtocolVersion.V5);
		expect(data.header.packetIdentifier).toBe(10);
		expect(data.header.reasonCode).toBe(0x97);
		expect(data.properties.reasonString).toBe('quota exceeded');
	});

	test('parses PUBACK with non-zero reason code and no properties', () => {
		const buf = Buffer.from([PacketType.PUBACK << 4, 0x03, 0x00, 0x01, 0x10]);
		const data = emptyPubAckData();
		parsePubAck(buf, data, ProtocolVersion.V3_1_1);
		expect(data.header.packetIdentifier).toBe(1);
		expect(data.header.reasonCode).toBe(0x10);
	});
});

describe('parsePubRec (§3.5)', () => {
	test('parses v5 PUBREC with properties', () => {
		const reasonStr = encodeUTF8String('not authorized');
		const props = [PropertyIdentifier.reasonString, ...reasonStr];
		const propsVBI = encodeVariableByteInteger(props.length);
		const body = [0x00, 0x05, 0x87, ...propsVBI, ...props];
		const buf = Buffer.from([PacketType.PUBREC << 4, ...encodeVariableByteInteger(body.length), ...body]);
		const data = emptyPubRecData();
		parsePubRec(buf, data, ProtocolVersion.V5);
		expect(data.header.packetIdentifier).toBe(5);
		expect(data.header.reasonCode).toBe(0x87);
		expect(data.properties.reasonString).toBe('not authorized');
	});

	test('parses minimal PUBREC (remaining=2, success implied, §3.5.2.1)', () => {
		const buf = Buffer.from([PacketType.PUBREC << 4, 0x02, 0x00, 0x03]);
		const data = emptyPubRecData();
		parsePubRec(buf, data, ProtocolVersion.V5);
		expect(data.header.packetIdentifier).toBe(3);
		expect(data.header.reasonCode).toBe(0x00);
	});
});

describe('parsePubRel (§3.6)', () => {
	test('parses v5 PUBREL with properties', () => {
		const reasonStr = encodeUTF8String('id not found');
		const props = [PropertyIdentifier.reasonString, ...reasonStr];
		const propsVBI = encodeVariableByteInteger(props.length);
		const body = [0x00, 0x07, 0x92, ...propsVBI, ...props];
		const buf = Buffer.from([(PacketType.PUBREL << 4) | 0x02, ...encodeVariableByteInteger(body.length), ...body]);
		const data = emptyPubRelData();
		parsePubRel(buf, data, ProtocolVersion.V5);
		expect(data.header.packetIdentifier).toBe(7);
		expect(data.header.reasonCode).toBe(0x92);
		expect(data.properties.reasonString).toBe('id not found');
	});

	test('parses minimal PUBREL (remaining=2, §3.6.2.1)', () => {
		const buf = Buffer.from([(PacketType.PUBREL << 4) | 0x02, 0x02, 0x00, 0x09]);
		const data = emptyPubRelData();
		parsePubRel(buf, data, ProtocolVersion.V5);
		expect(data.header.packetIdentifier).toBe(9);
		expect(data.header.reasonCode).toBe(0x00);
	});
});

describe('parsePubComp (§3.7)', () => {
	test('parses v5 PUBCOMP with Reason String property', () => {
		const reasonStr = encodeUTF8String('completed');
		const props = [PropertyIdentifier.reasonString, ...reasonStr];
		const propsVBI = encodeVariableByteInteger(props.length);
		const body = [0x00, 0x0b, 0x00, ...propsVBI, ...props];
		const buf = Buffer.from([PacketType.PUBCOMP << 4, ...encodeVariableByteInteger(body.length), ...body]);
		const data = emptyPubRecData();
		parsePubComp(buf, data, ProtocolVersion.V5);
		expect(data.header.packetIdentifier).toBe(11);
		expect(data.properties.reasonString).toBe('completed');
	});
});

// ─── §3.8 SUBSCRIBE ─────────────────────────────────────────────────────

describe('parseSubscribe (§3.8)', () => {
	test('parses subscription with QoS 2 (§3.8.3.1)', () => {
		const topic = encodeUTF8String('q2/sub');
		const body = [0x00, 0x01, 0x00, ...topic, 0x02];
		const buf = Buffer.from([(PacketType.SUBSCRIBE << 4) | 0x02, ...encodeVariableByteInteger(body.length), ...body]);
		const data = emptySubData();
		parseSubscribe(buf, data, ProtocolVersion.V5);
		expect(data.payloads![0].options.qos).toBe(QoSType.QoS2);
	});

	test('parses noLocal=true (§3.8.3.1, bit 2)', () => {
		const topic = encodeUTF8String('nl/t');
		const body = [0x00, 0x01, 0x00, ...topic, 0x04]; // noLocal bit
		const buf = Buffer.from([(PacketType.SUBSCRIBE << 4) | 0x02, ...encodeVariableByteInteger(body.length), ...body]);
		const data = emptySubData();
		parseSubscribe(buf, data, ProtocolVersion.V5);
		expect(data.payloads![0].options.noLocal).toBe(true);
	});

	test('parses retainAsPublished=true (§3.8.3.1, bit 3)', () => {
		const topic = encodeUTF8String('rap/t');
		const body = [0x00, 0x01, 0x00, ...topic, 0x04]; // retainAsPublished is bit 2 in our implementation
		const buf = Buffer.from([(PacketType.SUBSCRIBE << 4) | 0x02, ...encodeVariableByteInteger(body.length), ...body]);
		const data = emptySubData();
		parseSubscribe(buf, data, ProtocolVersion.V5);
		expect(data.payloads![0].options.retainAsPublished).toBe(true);
	});

	test('parses retainHandling=1 (send if new, §3.8.3.1)', () => {
		const topic = encodeUTF8String('rh/t');
		const body = [0x00, 0x01, 0x00, ...topic, 0x10]; // retainHandling=1 at bits 5-4
		const buf = Buffer.from([(PacketType.SUBSCRIBE << 4) | 0x02, ...encodeVariableByteInteger(body.length), ...body]);
		const data = emptySubData();
		parseSubscribe(buf, data, ProtocolVersion.V5);
		expect(data.payloads![0].options.retainHandling).toBe(1);
	});

	test('parses retainHandling=2 (do not send, §3.8.3.1)', () => {
		const topic = encodeUTF8String('rh2/t');
		const body = [0x00, 0x01, 0x00, ...topic, 0x20]; // retainHandling=2
		const buf = Buffer.from([(PacketType.SUBSCRIBE << 4) | 0x02, ...encodeVariableByteInteger(body.length), ...body]);
		const data = emptySubData();
		parseSubscribe(buf, data, ProtocolVersion.V5);
		expect(data.payloads![0].options.retainHandling).toBe(2);
	});

	test('parses Subscription Identifier property (§3.8.2.1.2)', () => {
		const topic = encodeUTF8String('si/t');
		const subIdProp = [PropertyIdentifier.subscriptionIdentifier, 0x2a]; // VBI = 42
		const propsVBI = encodeVariableByteInteger(subIdProp.length);
		const body = [0x00, 0x01, ...propsVBI, ...subIdProp, ...topic, 0x00];
		const buf = Buffer.from([(PacketType.SUBSCRIBE << 4) | 0x02, ...encodeVariableByteInteger(body.length), ...body]);
		const data = emptySubData();
		parseSubscribe(buf, data, ProtocolVersion.V5);
		expect(data.properties.subscriptionIdentifier).toBe(42);
	});

	test('throws when QoS > 2 (§3.8.3.1)', () => {
		const topic = encodeUTF8String('bad/q');
		const body = [0x00, 0x01, 0x00, ...topic, 0x03]; // QoS=3
		const buf = Buffer.from([(PacketType.SUBSCRIBE << 4) | 0x02, ...encodeVariableByteInteger(body.length), ...body]);
		const data = emptySubData();
		expect(() => parseSubscribe(buf, data, ProtocolVersion.V5)).toThrow(DisconnectException);
	});

	test('throws when retainHandling > 2 (§3.8.3.1)', () => {
		const topic = encodeUTF8String('bad/rh');
		const body = [0x00, 0x01, 0x00, ...topic, 0x30]; // retainHandling=3
		const buf = Buffer.from([(PacketType.SUBSCRIBE << 4) | 0x02, ...encodeVariableByteInteger(body.length), ...body]);
		const data = emptySubData();
		expect(() => parseSubscribe(buf, data, ProtocolVersion.V5)).toThrow(DisconnectException);
	});

	test('throws when fixed header reserved bits wrong (§3.8.1)', () => {
		const topic = encodeUTF8String('t');
		const body = [0x00, 0x01, 0x00, ...topic, 0x00];
		const buf = Buffer.from([(PacketType.SUBSCRIBE << 4) | 0x00, ...encodeVariableByteInteger(body.length), ...body]);
		const data = emptySubData();
		data.header.received = 0x00;
		expect(() => parseSubscribe(buf, data, ProtocolVersion.V5)).toThrow(DisconnectException);
	});

	test('throws on empty payload (§3.8.3)', () => {
		const body = [0x00, 0x01, 0x00];
		const buf = Buffer.from([(PacketType.SUBSCRIBE << 4) | 0x02, ...encodeVariableByteInteger(body.length), ...body]);
		const data = emptySubData();
		expect(() => parseSubscribe(buf, data, ProtocolVersion.V5)).toThrow(DisconnectException);
	});
});

// ─── §3.10 UNSUBSCRIBE ──────────────────────────────────────────────────

describe('parseUnsubscribe (§3.10)', () => {
	test('throws when fixed header reserved bits wrong (§3.10.1)', () => {
		const topic = encodeUTF8String('t');
		const body = [0x00, 0x01, 0x00, ...topic];
		const buf = Buffer.from([(PacketType.UNSUBSCRIBE << 4) | 0x00, ...encodeVariableByteInteger(body.length), ...body]);
		const data = emptyUnsubData();
		data.header.received = 0x00;
		expect(() => parseUnsubscribe(buf, data, ProtocolVersion.V5)).toThrow(SubscribeAckException);
	});

	test('throws on empty payload (§3.10.3)', () => {
		const body = [0x00, 0x01, 0x00];
		const buf = Buffer.from([(PacketType.UNSUBSCRIBE << 4) | 0x02, ...encodeVariableByteInteger(body.length), ...body]);
		const data = emptyUnsubData();
		expect(() => parseUnsubscribe(buf, data, ProtocolVersion.V5)).toThrow(DisconnectException);
	});

	test('parses three topic filters (§3.10.3)', () => {
		const t1 = encodeUTF8String('a/1');
		const t2 = encodeUTF8String('b/2');
		const t3 = encodeUTF8String('c/3');
		const body = [0x00, 0x01, 0x00, ...t1, ...t2, ...t3];
		const buf = Buffer.from([(PacketType.UNSUBSCRIBE << 4) | 0x02, ...encodeVariableByteInteger(body.length), ...body]);
		const data = emptyUnsubData();
		parseUnsubscribe(buf, data, ProtocolVersion.V5);
		expect(data.payloads).toEqual(['a/1', 'b/2', 'c/3']);
	});
});

// ─── §3.13 DISCONNECT ───────────────────────────────────────────────────

describe('parseDisconnect (§3.13)', () => {
	test('parses DISCONNECT with Session Expiry Interval property (§3.14.2.2.2)', () => {
		const props = [PropertyIdentifier.sessionExpiryInterval, 0x00, 0x00, 0x00, 0x78]; // 120
		const propsVBI = encodeVariableByteInteger(props.length);
		const body = [0x00, ...propsVBI, ...props];
		const buf = Buffer.from([PacketType.DISCONNECT << 4, ...encodeVariableByteInteger(body.length), ...body]);
		const data = emptyDisconnectData();
		parseDisconnect(buf, data, ProtocolVersion.V5);
		expect(data.properties.sessionExpiryInterval).toBe(120);
	});

	test('parses DISCONNECT with Reason String (§3.14.2.2.3)', () => {
		const reasonStr = encodeUTF8String('server shutting down');
		const props = [PropertyIdentifier.reasonString, ...reasonStr];
		const propsVBI = encodeVariableByteInteger(props.length);
		const body = [0x8b, ...propsVBI, ...props];
		const buf = Buffer.from([PacketType.DISCONNECT << 4, ...encodeVariableByteInteger(body.length), ...body]);
		const data = emptyDisconnectData();
		parseDisconnect(buf, data, ProtocolVersion.V5);
		expect(data.header.reasonCode).toBe(0x8b);
		expect(data.properties.reasonString).toBe('server shutting down');
	});

	test.each([
		[0x00, 'Normal disconnection'],
		[0x04, 'Disconnect with Will Message'],
		[0x81, 'Malformed Packet'],
		[0x93, 'Receive Maximum exceeded'],
	])('parses reason code 0x%s (%s)', (code) => {
		const buf = Buffer.from([PacketType.DISCONNECT << 4, 0x01, code]);
		const data = emptyDisconnectData();
		parseDisconnect(buf, data, ProtocolVersion.V5);
		expect(data.header.reasonCode).toBe(code);
	});
});

// ─── §3.14 AUTH ──────────────────────────────────────────────────────────

describe('parseAuth (§3.15 AUTH)', () => {
	test('parses Continue Authentication reason code (§3.15.2.1)', () => {
		const buf = Buffer.from([PacketType.AUTH << 4, 0x02, 0x18, 0x00]);
		const data = emptyAuthData();
		parseAuth(buf, data, ProtocolVersion.V5);
		expect(data.header.reasonCode).toBe(0x18);
	});

	test('parses Re-authentication reason code', () => {
		const buf = Buffer.from([PacketType.AUTH << 4, 0x02, 0x19, 0x00]);
		const data = emptyAuthData();
		parseAuth(buf, data, ProtocolVersion.V5);
		expect(data.header.reasonCode).toBe(0x19);
	});

	test('parses AUTH with Authentication Method and Data (§3.15.2.2)', () => {
		const method = encodeUTF8String('SCRAM-SHA-256');
		const authDataBytes = encodeUTF8String('challenge-data');
		const props = [PropertyIdentifier.authenticationMethod, ...method, PropertyIdentifier.authenticationData, ...authDataBytes];
		const propsVBI = encodeVariableByteInteger(props.length);
		const body = [0x18, ...propsVBI, ...props];
		const buf = Buffer.from([PacketType.AUTH << 4, ...encodeVariableByteInteger(body.length), ...body]);
		const data = emptyAuthData();
		parseAuth(buf, data, ProtocolVersion.V5);
		expect(data.properties.authenticationMethod).toBe('SCRAM-SHA-256');
		expect(data.properties.authenticationData).toBe('challenge-data');
	});
});

// ─── §3.2 CONNACK encoding ──────────────────────────────────────────────

describe('encodeConnAck (§3.2)', () => {
	test('encodes Session Present=true in acknowledge flags byte (§3.2.2.1.1)', () => {
		const connAckData: IConnAckData = {
			header: { packetType: PacketType.CONNACK, reserved: 0, reasonCode: 0x00 },
			acknowledgeFlags: { SessionPresent: true },
			properties: {},
		};
		const buf = encodeConnAck(connAckData, ProtocolVersion.V5);
		expect(buf[2]).toBe(0x01); // Session Present flag
	});

	test('encodes Session Present=false (§3.2.2.1.1)', () => {
		const connAckData: IConnAckData = {
			header: { packetType: PacketType.CONNACK, reserved: 0, reasonCode: 0x00 },
			acknowledgeFlags: { SessionPresent: false },
			properties: {},
		};
		const buf = encodeConnAck(connAckData, ProtocolVersion.V5);
		expect(buf[2]).toBe(0x00);
	});

	test('encodes non-success reason code (§3.2.2.2)', () => {
		const connAckData: IConnAckData = {
			header: { packetType: PacketType.CONNACK, reserved: 0, reasonCode: 0x86 },
			acknowledgeFlags: { SessionPresent: false },
			properties: {},
		};
		const buf = encodeConnAck(connAckData, ProtocolVersion.V5);
		expect(buf[3]).toBe(0x86);
	});

	test('v3.1.1 CONNACK omits property block', () => {
		const connAckData: IConnAckData = {
			header: { packetType: PacketType.CONNACK, reserved: 0, reasonCode: 0x00 },
			acknowledgeFlags: { SessionPresent: false },
			properties: {},
		};
		const buf = encodeConnAck(connAckData, ProtocolVersion.V3_1_1);
		expect(buf[1]).toBe(2); // remaining length = 2 (no properties)
	});
});

// ─── Roundtrip tests ─────────────────────────────────────────────────────

describe('encode/decode roundtrip', () => {
	test('encodePublishPacket → parsePublish yields identical fields (QoS 0)', () => {
		const original: IPublishData = {
			header: { packetType: PacketType.PUBLISH, dupFlag: false, qosLevel: QoSType.QoS0, retain: false, topicName: 'round/trip' },
			properties: {},
			payload: 'roundtrip-data',
		};
		const encoded = encodePublishPacket(original, ProtocolVersion.V5);
		const parsed = emptyPubData();
		parsePublish(encoded, parsed, ProtocolVersion.V5);
		expect(parsed.header.topicName).toBe('round/trip');
		expect(parsed.payload).toBe('roundtrip-data');
		expect(parsed.header.qosLevel).toBe(QoSType.QoS0);
		expect(parsed.header.dupFlag).toBe(false);
		expect(parsed.header.retain).toBe(false);
	});

	test('encodePublishPacket → parsePublish yields identical fields (QoS 1, DUP, retain)', () => {
		const original: IPublishData = {
			header: { packetType: PacketType.PUBLISH, dupFlag: true, qosLevel: QoSType.QoS1, retain: true, topicName: 'rt/q1', packetIdentifier: 0xabcd },
			properties: {},
			payload: 'q1-payload',
		};
		const encoded = encodePublishPacket(original, ProtocolVersion.V5);
		const parsed = emptyPubData();
		parsePublish(encoded, parsed, ProtocolVersion.V5);
		expect(parsed.header.topicName).toBe('rt/q1');
		expect(parsed.header.packetIdentifier).toBe(0xabcd);
		expect(parsed.header.qosLevel).toBe(QoSType.QoS1);
		expect(parsed.header.dupFlag).toBe(true);
		expect(parsed.header.retain).toBe(true);
		expect(parsed.payload).toBe('q1-payload');
	});

	test('encodePublishPacket → parsePublish yields identical fields (QoS 2)', () => {
		const original: IPublishData = {
			header: { packetType: PacketType.PUBLISH, dupFlag: false, qosLevel: QoSType.QoS2, retain: false, topicName: 'rt/q2', packetIdentifier: 42 },
			properties: {},
			payload: 'q2-payload',
		};
		const encoded = encodePublishPacket(original, ProtocolVersion.V5);
		const parsed = emptyPubData();
		parsePublish(encoded, parsed, ProtocolVersion.V5);
		expect(parsed.header.packetIdentifier).toBe(42);
		expect(parsed.header.qosLevel).toBe(QoSType.QoS2);
		expect(parsed.payload).toBe('q2-payload');
	});

	test('encodePubControlPacket → parsePubAck roundtrip', () => {
		const original: IPubAckData = {
			header: { packetType: PacketType.PUBACK, received: 0, remainingLength: 0, packetIdentifier: 0x1234, reasonCode: 0x00 },
			properties: {},
		};
		const encoded = encodePubControlPacket(original, ProtocolVersion.V5);
		const parsed = emptyPubAckData();
		parsePubAck(encoded, parsed, ProtocolVersion.V5);
		expect(parsed.header.packetIdentifier).toBe(0x1234);
		expect(parsed.header.reasonCode).toBe(0x00);
	});

	test('encodeDisconnect → parseDisconnect roundtrip', () => {
		const original: IDisconnectData = {
			header: { packetType: PacketType.DISCONNECT, received: 0, remainingLength: 0, reasonCode: 0x8b },
			properties: { reasonString: 'shutdown' },
		};
		const encoded = encodeDisconnect(original);
		const parsed = emptyDisconnectData();
		parseDisconnect(encoded, parsed, ProtocolVersion.V5);
		expect(parsed.header.reasonCode).toBe(0x8b);
		expect(parsed.properties.reasonString).toBe('shutdown');
	});

	test('encodeSubAckPacket encodes correct reason code order (§3.9.3)', () => {
		const subAckData: ISubAckData = {
			header: { packetType: PacketType.SUBACK, retain: 0, packetIdentifier: 100 },
			properties: {},
			reasonCode: 0x00,
			reasonCodes: [0x00, 0x01, 0x02, 0x80],
		};
		const buf = encodeSubAckPacket(subAckData, ProtocolVersion.V5);
		expect(buf[0] >> 4).toBe(PacketType.SUBACK);
		const tail = buf.subarray(buf.length - 4);
		expect([...tail]).toEqual([0x00, 0x01, 0x02, 0x80]);
	});
});

// ─── parsePacket dispatch ─────────────────────────────────────────────────

describe('parsePacket dispatch', () => {
	test('dispatches CONNECT correctly', () => {
		const buf = buildConnectPacket({});
		const result = parsePacket(buf, ProtocolVersion.V5);
		expect(result.header.packetType).toBe(PacketType.CONNECT);
	});

	test('dispatches PUBLISH correctly', () => {
		const topic = encodeUTF8String('t');
		const body = [...topic, 0x00];
		const buf = Buffer.from([PacketType.PUBLISH << 4, ...encodeVariableByteInteger(body.length), ...body]);
		const result = parsePacket(buf, ProtocolVersion.V5);
		expect(result.header.packetType).toBe(PacketType.PUBLISH);
	});

	test('dispatches SUBSCRIBE correctly', () => {
		const topic = encodeUTF8String('s/t');
		const body = [0x00, 0x01, 0x00, ...topic, 0x00];
		const buf = Buffer.from([(PacketType.SUBSCRIBE << 4) | 0x02, ...encodeVariableByteInteger(body.length), ...body]);
		const result = parsePacket(buf, ProtocolVersion.V5);
		expect(result.header.packetType).toBe(PacketType.SUBSCRIBE);
	});

	test('dispatches DISCONNECT correctly', () => {
		const buf = Buffer.from([PacketType.DISCONNECT << 4, 0x00]);
		const result = parsePacket(buf, ProtocolVersion.V5);
		expect(result.header.packetType).toBe(PacketType.DISCONNECT);
	});

	test('dispatches AUTH correctly', () => {
		const buf = Buffer.from([PacketType.AUTH << 4, 0x00]);
		const result = parsePacket(buf, ProtocolVersion.V5);
		expect(result.header.packetType).toBe(PacketType.AUTH);
	});

	test('throws on RESERVED packet type (0x00)', () => {
		const buf = Buffer.from([0x00, 0x00]);
		expect(() => parsePacket(buf, ProtocolVersion.V5)).toThrow(DisconnectException);
	});
});
