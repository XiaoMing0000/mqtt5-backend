import { decodePacket, encodePacket, probeFrameLength } from '../packet';
import { PacketType, ProtocolVersion, QoSType, PropertyIdentifier } from '../interface';
import { DisconnectException, DisconnectReasonCode } from '../exception';
import type { IPublishData, IPubAckData, IDisconnectData, IUnsubscribeData, IConnAckData, ISubAckData, IAuthData } from '../interface';
import { encodeUTF8String, encodeVariableByteInteger } from '../dataRepresentations';

describe('packet', () => {
  describe('probeFrameLength', () => {
    test('returns null when buffer length is less than 2', () => {
      expect(probeFrameLength(Buffer.from([]))).toBeNull();
      expect(probeFrameLength(Buffer.from([0x10]))).toBeNull();
    });

    test('returns total frame length for single-byte remaining length', () => {
      // Fixed header (1) + remaining length byte (1) + payload (5) = 7
      const buf = Buffer.from([PacketType.PUBLISH << 4, 0x05, 1, 2, 3, 4, 5]);
      expect(probeFrameLength(buf)).toBe(7);
    });

    test('returns total frame length for multi-byte remaining length', () => {
      // Remaining length 128 is encoded as [0x80, 0x01] (2 bytes)
      // Total frame length = 1 (fixed header) + 2 (remaining length) + 128 = 131
      const buf = Buffer.alloc(131);
      buf[0] = PacketType.PUBLISH << 4;
      buf[1] = 0x80;
      buf[2] = 0x01;
      expect(probeFrameLength(buf)).toBe(131);
    });

    test('returns null when remaining length continuation bytes are incomplete in buffer', () => {
      // Buffer only has first byte of remaining length which indicates continuation (0x80)
      const buf = Buffer.from([0x30, 0x80]);
      expect(probeFrameLength(buf)).toBeNull();
    });

    test('throws MalformedPacket when remaining length uses more than four continuation bytes', () => {
      const buf = Buffer.from([0x30, 0x80, 0x80, 0x80, 0x80]);
      expect(() => probeFrameLength(buf)).toThrow(DisconnectException);
      try {
        probeFrameLength(buf);
      } catch (error) {
        expect((error as DisconnectException).code).toBe(DisconnectReasonCode.MalformedPacket);
      }
    });
  });

  describe('decodePacket', () => {
    test('should parse PINGREQ packet', () => {
      const buffer = Buffer.from([PacketType.PINGREQ << 4, 0x00]);
      const result = decodePacket(buffer, ProtocolVersion.V5);
      expect(result.header.packetType).toBe(PacketType.PINGREQ);
    });

    test('should throw error for unknown packet type', () => {
      const buffer = Buffer.from([0x00, 0x00]); // RESERVED packet type
      expect(() => decodePacket(buffer, ProtocolVersion.V5)).toThrow(DisconnectException);
    });

    test('dispatches PUBACK / PUBREC / PUBREL / PUBCOMP', () => {
      const cases: Array<[number, PacketType]> = [
        [PacketType.PUBACK << 4, PacketType.PUBACK],
        [PacketType.PUBREC << 4, PacketType.PUBREC],
        [(PacketType.PUBREL << 4) | 0x02, PacketType.PUBREL],
        [PacketType.PUBCOMP << 4, PacketType.PUBCOMP],
      ];
      for (const [fixedHeader, expectedType] of cases) {
        const buffer = Buffer.from([fixedHeader, 0x02, 0x00, 0x01]);
        const result = decodePacket(buffer, ProtocolVersion.V5);
        expect(result.header.packetType).toBe(expectedType);
      }
    });

    test('dispatches CONNECT', () => {
      const buffer = Buffer.from([0x10, 0x0e, 0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, 0x05, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00]);
      const result = decodePacket(buffer, ProtocolVersion.V5);
      expect(result.header.packetType).toBe(PacketType.CONNECT);
    });

    test('dispatches PUBLISH', () => {
      const topic = encodeUTF8String('test/topic');
      const body = [...topic, 0x00, ...Buffer.from('payload')];
      const buffer = Buffer.from([PacketType.PUBLISH << 4, ...encodeVariableByteInteger(body.length), ...body]);
      const result = decodePacket(buffer, ProtocolVersion.V5) as IPublishData;
      expect(result.header.packetType).toBe(PacketType.PUBLISH);
      expect(result.header.topicName).toBe('test/topic');
      expect(result.payload).toBe('payload');
    });

    test('dispatches SUBSCRIBE', () => {
      const topic = encodeUTF8String('test/topic');
      const body = [0x00, 0x01, 0x00, ...topic, 0x00];
      const buffer = Buffer.from([(PacketType.SUBSCRIBE << 4) | 0x02, ...encodeVariableByteInteger(body.length), ...body]);
      const result = decodePacket(buffer, ProtocolVersion.V5);
      expect(result.header.packetType).toBe(PacketType.SUBSCRIBE);
    });

    test('dispatches DISCONNECT', () => {
      const buffer = Buffer.from([PacketType.DISCONNECT << 4, 0x02, 0x00, 0x00]);
      const result = decodePacket(buffer, ProtocolVersion.V5);
      expect(result.header.packetType).toBe(PacketType.DISCONNECT);
    });

    test('dispatches AUTH', () => {
      const buffer = Buffer.from([PacketType.AUTH << 4, 0x02, 0x00, 0x00]);
      const result = decodePacket(buffer, ProtocolVersion.V5);
      expect(result.header.packetType).toBe(PacketType.AUTH);
    });

    test('dispatches UNSUBSCRIBE', () => {
      const topic = encodeUTF8String('a/b');
      const body = [0x00, 0x01, 0x00, ...topic];
      const buffer = Buffer.from([(PacketType.UNSUBSCRIBE << 4) | 0x02, ...encodeVariableByteInteger(body.length), ...body]);
      const result = decodePacket(buffer, ProtocolVersion.V5);
      expect(result.header.packetType).toBe(PacketType.UNSUBSCRIBE);
      expect((result as IUnsubscribeData).payloads).toEqual(['a/b']);
    });

    test('throws ProtocolError if PUBLISH topic name is empty and no topic alias in MQTT 5', () => {
      const topic = encodeUTF8String('');
      const body = [...topic, 0x00];
      const buffer = Buffer.from([PacketType.PUBLISH << 4, ...encodeVariableByteInteger(body.length), ...body]);
      expect(() => decodePacket(buffer, ProtocolVersion.V5)).toThrow(DisconnectException);
      try {
        decodePacket(buffer, ProtocolVersion.V5);
      } catch (error) {
        expect((error as DisconnectException).code).toBe(DisconnectReasonCode.ProtocolError);
      }
    });

    test('throws ProtocolError if PUBLISH topic name is empty in MQTT 3.1.1', () => {
      const topic = encodeUTF8String('');
      const body = [...topic];
      const buffer = Buffer.from([PacketType.PUBLISH << 4, ...encodeVariableByteInteger(body.length), ...body]);
      expect(() => decodePacket(buffer, ProtocolVersion.V3_1_1)).toThrow(DisconnectException);
      try {
        decodePacket(buffer, ProtocolVersion.V3_1_1);
      } catch (error) {
        expect((error as DisconnectException).code).toBe(DisconnectReasonCode.ProtocolError);
      }
    });

    test('allows empty topic name when topic alias is present in MQTT 5', () => {
      const topic = encodeUTF8String('');
      const props = [PropertyIdentifier.topicAlias, 0x00, 0x01];
      const propsVBI = encodeVariableByteInteger(props.length);
      const body = [...topic, ...propsVBI, ...props, ...Buffer.from('payload')];
      const buffer = Buffer.from([PacketType.PUBLISH << 4, ...encodeVariableByteInteger(body.length), ...body]);
      const result = decodePacket(buffer, ProtocolVersion.V5) as IPublishData;
      expect(result.header.packetType).toBe(PacketType.PUBLISH);
      expect(result.header.topicName).toBe('');
      expect(result.properties.topicAlias).toBe(1);
      expect(result.payload).toBe('payload');
    });

    test('dispatches DISCONNECT with 0 remaining length', () => {
      const buffer = Buffer.from([PacketType.DISCONNECT << 4, 0x00]);
      const result = decodePacket(buffer, ProtocolVersion.V5) as IDisconnectData;
      expect(result.header.packetType).toBe(PacketType.DISCONNECT);
      expect(result.header.reasonCode).toBe(0x00);
    });

    test('dispatches AUTH with 0 remaining length', () => {
      const buffer = Buffer.from([PacketType.AUTH << 4, 0x00]);
      const result = decodePacket(buffer, ProtocolVersion.V5) as IAuthData;
      expect(result.header.packetType).toBe(PacketType.AUTH);
      expect(result.header.reasonCode).toBe(0x00);
    });

    test('returns distinct object instances across decodePacket calls', () => {
      const buffer1 = Buffer.from([PacketType.DISCONNECT << 4, 0x00]);
      const buffer2 = Buffer.from([PacketType.DISCONNECT << 4, 0x00]);
      const result1 = decodePacket(buffer1, ProtocolVersion.V5);
      const result2 = decodePacket(buffer2, ProtocolVersion.V5);
      expect(result1).not.toBe(result2);
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
      const buffer = encodePacket(connAckData, ProtocolVersion.V5);
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
      const buffer = encodePacket(disconnectData, ProtocolVersion.V5);
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer[0] >> 4).toBe(PacketType.DISCONNECT);
    });

    test('should encode MQTT 3.1.1 / missing data as a single-byte DISCONNECT', () => {
      const disconnectData: IDisconnectData = {
        header: {
          packetType: PacketType.DISCONNECT,
          received: 0,
          remainingLength: 0,
          reasonCode: 0x00,
        },
        properties: {},
      };
      expect(encodePacket(disconnectData, ProtocolVersion.V3_1_1)).toEqual(Buffer.from([PacketType.DISCONNECT << 4]));
      expect(encodePacket(disconnectData, ProtocolVersion.V3_1)).toEqual(Buffer.from([PacketType.DISCONNECT << 4]));
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
      const buffer = encodePacket(pubData, ProtocolVersion.V5);
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
      const buffer = encodePacket(pubData, ProtocolVersion.V5);
      expect(Buffer.isBuffer(buffer)).toBe(true);
    });

    test('should encode PUBLISH without property section for MQTT 3.1.1', () => {
      const pubData: IPublishData = {
        header: {
          packetType: PacketType.PUBLISH,
          dupFlag: false,
          qosLevel: QoSType.QoS0,
          retain: false,
          remainingLength: 0,
          topicName: 't',
        },
        properties: { contentType: 'ignored' },
        payload: 'x',
      };
      const v5 = encodePacket(pubData, ProtocolVersion.V5);
      const v311 = encodePacket(pubData, ProtocolVersion.V3_1_1);
      expect(v311.length).toBeLessThan(v5.length);
      expect(v311[0] >> 4).toBe(PacketType.PUBLISH);
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
      const buffer = encodePacket(pubAckData, ProtocolVersion.V5);
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer[0] >> 4).toBe(PacketType.PUBACK);
    });

    test('should encode PUBACK without properties for MQTT 3.1.1', () => {
      const pubAckData: IPubAckData = {
        header: {
          packetType: PacketType.PUBACK,
          received: 0x00,
          remainingLength: 0,
          packetIdentifier: 0x0001,
          reasonCode: 0x00,
        },
        properties: { reasonString: 'ignored' },
      };
      const buffer = encodePacket(pubAckData, ProtocolVersion.V3_1_1);
      // fixed + remaining length(3) + packet id(2) + reason(1) = 5 bytes, no property section
      expect(buffer).toEqual(Buffer.from([PacketType.PUBACK << 4, 0x03, 0x00, 0x01, 0x00]));
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
      const buffer = encodePacket(subAckData, ProtocolVersion.V5);
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer[0] >> 4).toBe(PacketType.SUBACK);
    });

    test('should encode SUBACK without properties for MQTT 3.1.1', () => {
      const subAckData: ISubAckData = {
        header: {
          packetType: PacketType.SUBACK,
          retain: 0,
          packetIdentifier: 0x0002,
        },
        properties: {},
        reasonCode: 0x00,
      };
      const buffer = encodePacket(subAckData, ProtocolVersion.V3_1_1);
      expect(buffer).toEqual(Buffer.from([PacketType.SUBACK << 4, 0x03, 0x00, 0x02, 0x00]));
    });

    test('should encode SUBACK packet with multiple reason codes', () => {
      const subAckData: ISubAckData = {
        header: {
          packetType: PacketType.SUBACK,
          retain: 0,
          packetIdentifier: 0x1234,
        },
        properties: {},
        reasonCode: 0x00,
        reasonCodes: [0x00, 0x01, 0x80],
      };
      const buffer = encodePacket(subAckData, ProtocolVersion.V5);
      expect(buffer[0] >> 4).toBe(PacketType.SUBACK);
      expect(buffer.slice(-3)).toEqual(Buffer.from([0x00, 0x01, 0x80]));
    });
  });
});
