import { StreamFramer, probeFrameLength, encodeVariableByteInteger, encodePublishPacket } from '../parse';
import { IPublishData, PacketType, ProtocolVersion, QoSType } from '../interface';

function makePingReqPacket(): Buffer {
	return Buffer.from([PacketType.PINGREQ << 4, 0x00]);
}

function makePublishPacket(topic: string, payload: string, qos: QoSType = QoSType.QoS0, packetId?: number): Buffer {
	const pubData: IPublishData = {
		header: {
			packetType: PacketType.PUBLISH,
			dupFlag: false,
			qosLevel: qos,
			retain: false,
			topicName: topic,
			packetIdentifier: packetId,
		},
		properties: {},
		payload,
	};
	return encodePublishPacket(pubData, ProtocolVersion.V5);
}

function makeDisconnectPacket(): Buffer {
	return Buffer.from([PacketType.DISCONNECT << 4, 0x00]);
}

describe('probeFrameLength', () => {
	it('returns null when buffer is too short (0 or 1 byte)', () => {
		expect(probeFrameLength(Buffer.alloc(0))).toBeNull();
		expect(probeFrameLength(Buffer.from([0x10]))).toBeNull();
	});

	it('returns correct length for a 0-byte remaining length', () => {
		const buf = Buffer.from([PacketType.PINGREQ << 4, 0x00]);
		expect(probeFrameLength(buf)).toBe(2);
	});

	it('returns correct length for a 1-byte remaining length', () => {
		const buf = Buffer.from([0x30, 0x05, 0, 0, 0, 0, 0]);
		expect(probeFrameLength(buf)).toBe(7);
	});

	it('returns correct length for a 2-byte remaining length (128)', () => {
		const remaining = 128;
		const vbi = encodeVariableByteInteger(remaining);
		const header = Buffer.from([0x30, ...vbi]);
		const full = Buffer.concat([header, Buffer.alloc(remaining)]);
		expect(probeFrameLength(full)).toBe(1 + vbi.length + remaining);
	});

	it('returns correct length for a 3-byte remaining length (16384)', () => {
		const remaining = 16384;
		const vbi = encodeVariableByteInteger(remaining);
		const header = Buffer.from([0x30, ...vbi]);
		const full = Buffer.concat([header, Buffer.alloc(remaining)]);
		expect(probeFrameLength(full)).toBe(1 + vbi.length + remaining);
	});

	it('returns null when variable byte integer continuation bit is set but next byte missing', () => {
		const buf = Buffer.from([0x30, 0x80]);
		expect(probeFrameLength(buf)).toBeNull();
	});

	it('returns null when multi-byte VBI is incomplete', () => {
		const buf = Buffer.from([0x30, 0x80, 0x80]);
		expect(probeFrameLength(buf)).toBeNull();
	});
});

describe('StreamFramer', () => {
	describe('push (parse mode)', () => {
		it('handles a single complete packet in one chunk', () => {
			const framer = new StreamFramer();
			const ping = makePingReqPacket();
			const packets = framer.push(ping, ProtocolVersion.V5);
			expect(packets).toHaveLength(1);
			expect(packets[0].header.packetType).toBe(PacketType.PINGREQ);
			expect(framer.bufferedBytes).toBe(0);
		});

		it('handles multiple complete packets in one chunk (粘包)', () => {
			const framer = new StreamFramer();
			const ping1 = makePingReqPacket();
			const ping2 = makePingReqPacket();
			const disconnect = makeDisconnectPacket();
			const combined = Buffer.concat([ping1, ping2, disconnect]);
			const packets = framer.push(combined, ProtocolVersion.V5);
			expect(packets).toHaveLength(3);
			expect(packets[0].header.packetType).toBe(PacketType.PINGREQ);
			expect(packets[1].header.packetType).toBe(PacketType.PINGREQ);
			expect(packets[2].header.packetType).toBe(PacketType.DISCONNECT);
			expect(framer.bufferedBytes).toBe(0);
		});

		it('handles a packet split across two chunks (半包)', () => {
			const framer = new StreamFramer();
			const pub = makePublishPacket('test/topic', 'hello');
			const mid = Math.floor(pub.length / 2);
			const chunk1 = pub.subarray(0, mid);
			const chunk2 = pub.subarray(mid);

			const packets1 = framer.push(chunk1, ProtocolVersion.V5);
			expect(packets1).toHaveLength(0);
			expect(framer.bufferedBytes).toBe(mid);

			const packets2 = framer.push(chunk2, ProtocolVersion.V5);
			expect(packets2).toHaveLength(1);
			expect((packets2[0] as IPublishData).header.topicName).toBe('test/topic');
			expect((packets2[0] as IPublishData).payload).toBe('hello');
			expect(framer.bufferedBytes).toBe(0);
		});

		it('handles a packet split across three chunks (多次半包拼接)', () => {
			const framer = new StreamFramer();
			const pub = makePublishPacket('a/b', 'payload-data');
			const part1 = pub.subarray(0, 1);
			const part2 = pub.subarray(1, 5);
			const part3 = pub.subarray(5);

			expect(framer.push(part1, ProtocolVersion.V5)).toHaveLength(0);
			expect(framer.push(part2, ProtocolVersion.V5)).toHaveLength(0);
			const packets = framer.push(part3, ProtocolVersion.V5);
			expect(packets).toHaveLength(1);
			expect((packets[0] as IPublishData).payload).toBe('payload-data');
			expect(framer.bufferedBytes).toBe(0);
		});

		it('handles incomplete VBI across chunks (variable byte integer 跨 chunk)', () => {
			const framer = new StreamFramer();
			const remaining = 200;
			const vbi = encodeVariableByteInteger(remaining);
			expect(vbi.length).toBe(2);

			const fullPacket = Buffer.concat([Buffer.from([0x30, ...vbi]), Buffer.alloc(remaining)]);

			const chunk1 = fullPacket.subarray(0, 2);
			expect(framer.push(chunk1, ProtocolVersion.V5)).toHaveLength(0);

			const packets = framer.push(fullPacket.subarray(2), ProtocolVersion.V5);
			expect(packets).toHaveLength(1);
			expect(framer.bufferedBytes).toBe(0);
		});

		it('handles 粘包 + 半包 combined: complete packet followed by partial', () => {
			const framer = new StreamFramer();
			const ping = makePingReqPacket();
			const pub = makePublishPacket('x', 'y');
			const mid = Math.floor(pub.length / 2);

			const chunk1 = Buffer.concat([ping, pub.subarray(0, mid)]);
			const packets1 = framer.push(chunk1, ProtocolVersion.V5);
			expect(packets1).toHaveLength(1);
			expect(packets1[0].header.packetType).toBe(PacketType.PINGREQ);
			expect(framer.bufferedBytes).toBe(mid);

			const packets2 = framer.push(pub.subarray(mid), ProtocolVersion.V5);
			expect(packets2).toHaveLength(1);
			expect((packets2[0] as IPublishData).header.topicName).toBe('x');
			expect(framer.bufferedBytes).toBe(0);
		});

		it('handles only the fixed header byte arriving (1-byte chunk)', () => {
			const framer = new StreamFramer();
			const pub = makePublishPacket('t', 'p');
			expect(framer.push(pub.subarray(0, 1), ProtocolVersion.V5)).toHaveLength(0);
			expect(framer.bufferedBytes).toBe(1);

			const packets = framer.push(pub.subarray(1), ProtocolVersion.V5);
			expect(packets).toHaveLength(1);
			expect(framer.bufferedBytes).toBe(0);
		});

		it('reset clears buffered state', () => {
			const framer = new StreamFramer();
			const pub = makePublishPacket('topic', 'data');
			framer.push(pub.subarray(0, 3), ProtocolVersion.V5);
			expect(framer.bufferedBytes).toBe(3);
			framer.reset();
			expect(framer.bufferedBytes).toBe(0);
		});
	});

	describe('extractFrames (raw frame mode)', () => {
		it('extracts complete frames without parsing', () => {
			const framer = new StreamFramer();
			const ping = makePingReqPacket();
			const disconnect = makeDisconnectPacket();
			const combined = Buffer.concat([ping, disconnect]);
			const frames = framer.extractFrames(combined);
			expect(frames).toHaveLength(2);
			expect(frames[0]).toEqual(ping);
			expect(frames[1]).toEqual(disconnect);
			expect(framer.bufferedBytes).toBe(0);
		});

		it('buffers incomplete frame and completes on next call', () => {
			const framer = new StreamFramer();
			const pub = makePublishPacket('topic', 'payload');
			const mid = 4;

			const frames1 = framer.extractFrames(pub.subarray(0, mid));
			expect(frames1).toHaveLength(0);

			const frames2 = framer.extractFrames(pub.subarray(mid));
			expect(frames2).toHaveLength(1);
			expect(frames2[0]).toEqual(pub);
			expect(framer.bufferedBytes).toBe(0);
		});

		it('extracts multiple frames from interleaved complete + partial chunks', () => {
			const framer = new StreamFramer();
			const ping = makePingReqPacket();
			const pub = makePublishPacket('a', 'b');

			const chunk = Buffer.concat([ping, pub.subarray(0, 3)]);
			const frames1 = framer.extractFrames(chunk);
			expect(frames1).toHaveLength(1);
			expect(frames1[0]).toEqual(ping);

			const frames2 = framer.extractFrames(pub.subarray(3));
			expect(frames2).toHaveLength(1);
			expect(frames2[0]).toEqual(pub);
		});
	});
});
