import { PubAckReasonCode, PubAckException, PubRecReasonCode, PubRelReasonCode, SubscribeAckException, DisconnectException, DisconnectReasonCode } from './exception';
import {
	BufferData,
	IAuthData,
	IConnAckData,
	IConnectData,
	IDisconnectData,
	IPingData,
	IProperties,
	IPubAckData,
	IPubCompData,
	IPublishData,
	IPubRecData,
	IPubRelData,
	ISubAckData,
	ISubscribeData,
	IUnsubscribeData,
	PacketType,
	PacketTypeData,
	PropertyDataMap,
	PropertyIdentifier,
	ProtocolVersion,
	QoSType,
	TPropertyIdentifier,
} from './interface';
import {
	encodeProperties,
	parseAuthProperties,
	parseConnectProperties,
	parseConnectWillProperties,
	parseDisconnectProperties,
	parsePubAckProperties,
	parsePubCompProperties,
	parsePublishProperties,
	parsePubRecProperties,
	parsePubRelProperties,
	parseSubscribeProperties,
} from './property';

/** Alias for {@link oneByteInteger} (reads a single byte as an unsigned value). */
export const bits = oneByteInteger;

/**
 * Reads one byte from the buffer as an unsigned 8-bit integer.
 *
 * @remarks Bits are numbered 7 to 0; bit 7 is the most significant bit (MSB) and bit 0 is the least significant (LSB).
 * @param data - Cursor over the underlying buffer; `index` is advanced by one.
 * @returns An integer in the range 0–255.
 */
export function oneByteInteger(data: BufferData): number {
	return data.buffer[data.index++];
}

/**
 * Reads a 16-bit unsigned integer in big-endian order (high byte first, then low byte).
 * @param data - Cursor over the underlying buffer; `index` is advanced by two.
 * @returns An integer in the range 0–65535.
 */
export function twoByteInteger(data: BufferData): number {
	return (data.buffer[data.index++] << 8) | data.buffer[data.index++];
}

/**
 * Reads a 32-bit unsigned integer in big-endian order (MSB first through to LSB).
 * @param data - Cursor over the underlying buffer; `index` is advanced by four.
 * @returns An integer in the range 0 to 2³²−1.
 */
export function fourByteInteger(data: BufferData): number {
	return (data.buffer[data.index++] << 24) | (data.buffer[data.index++] << 16) | (data.buffer[data.index++] << 8) | data.buffer[data.index++];
}

/**
 * Decodes an MQTT Variable Byte Integer (UTF-8-like 7-bit groups with continuation bit).
 * @param data - Cursor over the underlying buffer; `index` advances per encoded byte.
 * @param length - Maximum number of encoded bytes to accept (each byte contributes 7 payload bits).
 * @returns The decoded unsigned value.
 * @throws {@link DisconnectException} When the encoding is malformed or exceeds the allowed width.
 */
export function variableByteInteger(data: BufferData, length = 3): number {
	let encodeByte;
	let value = 0;
	let leftShift = 0;
	do {
		encodeByte = data.buffer[data.index++];
		value += (encodeByte & 0x7f) << leftShift;
		leftShift += 7;
		if (leftShift > length * 7) {
			throw new DisconnectException('Malformed Remaining Length.', DisconnectReasonCode.ProtocolError);
		}
	} while (encodeByte & 0x80);
	return value;
}

/**
 * Reads a UTF-8 string prefixed by a Two Byte Integer length (MQTT UTF-8 string type).
 * @param data - Cursor over the underlying buffer; `index` advances past the length and payload.
 * @returns The decoded string (UTF-8 payload may be 0–65535 bytes per the spec).
 */
export function utf8DecodedString(data: BufferData): string {
	const strLength = (data.buffer[data.index++] << 8) | data.buffer[data.index++];
	return data.buffer.slice(data.index, (data.index += strLength)).toString();
}

/**
 * Reads a UTF-8 string pair: two consecutive MQTT UTF-8 strings (name/value).
 * @param data - Cursor over the underlying buffer.
 * @returns The first string as `key` and the second as `value`.
 */
export function utf8StringPair(data: BufferData): { key: string; value: string } {
	return {
		key: utf8DecodedString(data),
		value: utf8DecodedString(data),
	};
}

/**
 * Reads a length-prefixed binary blob (Two Byte Integer length followed by raw bytes).
 * @remarks Used for Will Payload, Password, Correlation Data, Authentication Data, and similar fields.
 * @param data - Cursor over the underlying buffer.
 * @returns A `Buffer` copy of the payload bytes.
 */
export function binaryData(data: BufferData): Buffer {
	const length = (data.buffer[data.index++] << 8) | data.buffer[data.index++];
	return Buffer.from(data.buffer.slice(data.index, (data.index += length)));
}

/**
 * Reads a string whose length is given by a Variable Byte Integer, followed by UTF-8 bytes of that length.
 * @param data - Cursor over the underlying buffer.
 * @returns The decoded string.
 */
export function variableString(data: BufferData) {
	const strLength = variableByteInteger(data);
	return data.buffer.slice(data.index, (data.index += strLength)).toString();
}

/**
 * Encodes the low 8 bits of a number as a single byte value (0–255).
 * @param value - Source integer; higher bits are masked off.
 * @returns The unsigned byte value.
 */
export function integerToOneUint8(value: number): number {
	return value & 0xff;
}

/**
 * Splits a 16-bit value into two big-endian bytes.
 * @param value - Value to encode.
 * @returns Two element byte array `[high, low]`.
 */
export function integerToTwoUint8(value: number): Array<number> {
	return [(value >> 8) & 0xff, value & 0xff];
}

/**
 * Splits a 32-bit value into four big-endian bytes.
 * @param value - Value to encode.
 * @returns Four element byte array from MSB to LSB.
 */
export function integerToFourUint8(value: number): Array<number> {
	return [(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
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
 * Encodes a non-negative integer as MQTT Variable Byte Integer bytes (7 bits per byte, continuation MSB).
 * @param value - Must be in range 0–268435455 (2²⁸−1).
 * @returns Array of byte values (0–255) representing the encoding.
 * @throws {@link DisconnectException} When `value` is out of the allowed range.
 */
export function encodeVariableByteInteger(value: number) {
	if (value < 0 || value > 268435455) {
		throw new DisconnectException('Variable byte integer Value out of range.', DisconnectReasonCode.ProtocolError);
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
	return mergeUint8Arrays(integerToTwoUint8(strBuffer.length), strBuffer);
}

/**
 * Encodes binary data as MQTT Binary Data: length prefix (Two Byte Integer) plus raw bytes.
 * @param data - Payload buffer.
 * @returns Byte sequence (length + bytes).
 */
export function encodeBinaryData(data: Buffer): Array<number> {
	return [...integerToTwoUint8(data.length), ...data];
}

/**
 * Encodes a string as Two Byte Integer length plus UTF-8 bytes (identical wire layout to {@link encodeUTF8String}).
 * @param str - Source string.
 * @returns Byte sequence suitable for appending to a packet body.
 */
export function stringToVariableByteInteger(str: string) {
	const strBuffer = new TextEncoder().encode(str);
	return mergeUint8Arrays(integerToTwoUint8(strBuffer.length), strBuffer);
}

/**
 * Accumulates MQTT 5 property bytes and builds the prefixed property length + payload for the wire format.
 */
export class EncoderProperties {
	private propertyLength: number = 0;
	private properties: Array<number> = [];

	/**
	 * Appends one property (identifier + value) using the shared encoder from `property.ts`.
	 * @param identifier - Property identifier enum value.
	 * @param data - Typed value for that property.
	 */
	add<K extends TPropertyIdentifier>(identifier: K, data: PropertyDataMap[K]) {
		const list = encodeProperties(identifier, data);
		this.properties.push(...list);
		this.propertyLength += list.length;
	}

	/**
	 * Adds all defined entries from a properties object (skips `undefined` fields).
	 * @param properties - Partial property bag keyed by logical names.
	 */
	push(properties: IProperties) {
		for (const key in properties) {
			if (properties[key as keyof IProperties] === undefined) {
				continue;
			}
			this.add(PropertyIdentifier[key as keyof typeof PropertyIdentifier], properties[key as keyof IProperties] as any);
		}
	}

	/**
	 * Serialized property block: Variable Byte Integer (property length) followed by encoded properties.
	 * @returns A `Buffer` ready to append after fixed header / other fields as required by the packet type.
	 */
	get buffer() {
		return Buffer.from([...encodeVariableByteInteger(this.propertyLength), ...this.properties]);
	}

	/**
	 * Total size on the wire for the property section: raw property bytes plus the Variable Byte Integer that prefixes them.
	 * @returns Octet count for length-prefix + properties.
	 */
	get length() {
		return this.propertyLength + variableByteIntegerLength(this.propertyLength);
	}
}

/**
 * Parses a contiguous buffer that may contain multiple back-to-back MQTT packets (e.g. TCP coalescing).
 * @param allBuffer - Raw bytes possibly holding several complete frames.
 * @param protocolVersion - MQTT protocol version used for property parsing.
 * @returns One parsed packet object per complete frame.
 * @throws {@link DisconnectException} When remaining length is malformed or a frame extends past `allBuffer`.
 */
export function parseAllPacket(allBuffer: Buffer, protocolVersion: ProtocolVersion): Array<PacketTypeData> {
	const allPacket: Array<PacketTypeData> = [];
	let i = 0;
	while (i < allBuffer.length) {
		const remainingLength = variableByteInteger({ buffer: allBuffer, index: i + 1 });
		const offset = variableByteIntegerLength(remainingLength);
		const packetLength = remainingLength + 1 + offset;
		if (i + packetLength > allBuffer.length) {
			throw new DisconnectException('Malformed Remaining Length.', DisconnectReasonCode.ProtocolError);
		}
		const buffer = allBuffer.slice(i, i + packetLength);
		allPacket.push(parsePacket(buffer, protocolVersion));
		i += packetLength;
	}
	return allPacket;
}

// TODO: Packet parsing — only server-relevant packet types are implemented.

/**
 * Dispatches a single complete MQTT packet buffer to the appropriate parser by fixed header type (high nibble).
 * @param buffer - One full MQTT packet (fixed header + remaining length + payload).
 * @param protocolVersion - Used for MQTT 5 property sections where applicable.
 * @returns Parsed packet-specific data union.
 * @throws {@link DisconnectException} For unknown packet types or protocol errors from sub-parsers.
 */
export function parsePacket(buffer: Buffer, protocolVersion: ProtocolVersion): PacketTypeData {
	const packetType = (buffer[0] >> 4) as PacketType;

	switch (packetType) {
		case PacketType.PINGREQ: {
			const data: IPingData = { header: { packetType: PacketType.PINGREQ } };
			return data;
		}
		case PacketType.CONNECT: {
			return parseConnect(buffer);
		}
		case PacketType.PUBLISH: {
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
			parsePublish(buffer, pubData, protocolVersion);
			return pubData;
		}
		case PacketType.PUBACK: {
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
			parsePubAck(buffer, pubAckData, protocolVersion);
			return pubAckData;
		}
		case PacketType.PUBREC: {
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
			parsePubRec(buffer, pubRecData, protocolVersion);
			return pubRecData;
		}
		case PacketType.PUBREL: {
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
			parsePubRel(buffer, pubRelData, protocolVersion);
			return pubRelData;
		}
		case PacketType.PUBCOMP: {
			const pubCompData: IPubRecData = {
				header: {
					packetType: PacketType.PUBCOMP,
					received: 0x00,
					remainingLength: 0,
					packetIdentifier: 0,
					reasonCode: 0x00,
				},
				properties: {},
			};
			parsePubComp(buffer, pubCompData, protocolVersion);
			return pubCompData;
		}
		case PacketType.SUBSCRIBE: {
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
			parseSubscribe(buffer, subData, protocolVersion);
			return subData;
		}
		case PacketType.UNSUBSCRIBE: {
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
			parseUnsubscribe(buffer, unsubscribeData, protocolVersion);
			return unsubscribeData;
		}
		case PacketType.DISCONNECT: {
			const disconnectData: IDisconnectData = {
				header: {
					packetType: PacketType.DISCONNECT,
					received: 0,
					remainingLength: 0,
					reasonCode: 0x00,
				},
				properties: {},
			};
			parseDisconnect(buffer, disconnectData, protocolVersion);
			return disconnectData;
		}
		case PacketType.AUTH: {
			const authData: IAuthData = {
				header: {
					packetType: PacketType.AUTH,
					received: 0,
					remainingLength: 0,
					reasonCode: 0x00,
				},
				properties: {},
			};
			parseAuth(buffer, authData, protocolVersion);
			return authData;
		}
		default:
			throw new DisconnectException('未能解析的报文类型', DisconnectReasonCode.ProtocolError);
	}
}

/**
 * Parses an MQTT CONNECT packet into structured connect data (flags, properties, will, credentials).
 * @param buffer - Full CONNECT packet.
 * @returns Parsed {@link IConnectData}.
 * @throws {@link DisconnectException} On malformed flags or reserved bit violations per MQTT 5 rules.
 */
export function parseConnect(buffer: Buffer): IConnectData {
	const connData: IConnectData = {
		header: {
			packetType: PacketType.RESERVED,
			packetFlags: 0,
			remainingLength: 0,
			protocolName: '',
			protocolVersion: ProtocolVersion.V5,
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
	connData.header.remainingLength = variableByteInteger(data);

	connData.header.protocolName = utf8DecodedString(data);
	connData.header.protocolVersion = oneByteInteger(data);
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
		throw new DisconnectException('If the reserved flag is not 0 it is a Malformed Packet.', DisconnectReasonCode.ProtocolError);
	}
	connData.header.keepAlive = twoByteInteger(data);

	if (connData.header.protocolVersion === ProtocolVersion.V5) {
		const propertyLength = variableByteInteger(data);
		const propertiesBuffer = data.buffer.slice(data.index, (data.index += propertyLength));
		connData.properties = parseConnectProperties(propertiesBuffer);
	}

	// Connect payload: Client Identifier first
	connData.payload.clientIdentifier = utf8DecodedString(data);

	if (connData.connectFlags.willFlag) {
		if (connData.header.protocolVersion === ProtocolVersion.V5) {
			const willPropertiesLength = variableByteInteger(data);
			const willPropertiesBuffer = data.buffer.slice(data.index, (data.index += willPropertiesLength));
			connData.payload.willProperties = parseConnectWillProperties(willPropertiesBuffer);
		}

		connData.payload.willTopic = utf8DecodedString(data);
		connData.payload.willPayload = binaryData(data);
	}

	if (connData.connectFlags.username) {
		connData.payload.username = utf8DecodedString(data);
	}
	if (connData.connectFlags.password) {
		connData.payload.password = binaryData(data);
	}

	return connData;
}

/**
 * Fills `pubData` by parsing a PUBLISH packet (topic, QoS, optional packet id, properties, payload).
 * @param buffer - Full PUBLISH packet.
 * @param pubData - Output object; header fields are overwritten from the wire.
 * @param protocolVersion - MQTT 5 properties are read only when this is {@link ProtocolVersion.V5}.
 * @returns The same `pubData` reference for chaining.
 * @throws {@link PubAckException} When the topic filter contains wildcards where forbidden for this server.
 */
export function parsePublish(buffer: Buffer, pubData: IPublishData, protocolVersion: ProtocolVersion) {
	pubData.header.packetType = (buffer[0] >> 4) as PacketType;
	pubData.header.dupFlag = !!(buffer[0] & 0x8);
	pubData.header.qosLevel = (buffer[0] >> 1) & 0x3;
	pubData.header.retain = !!(buffer[0] & 0x1);

	const data = { buffer, index: 1 };
	pubData.header.remainingLength = variableByteInteger(data);

	pubData.header.topicName = utf8DecodedString(data);
	if (/[#+]/.test(pubData.header.topicName)) {
		throw new PubAckException('The Will Topic Name is not malformed, but is not accepted by this Server.', PubAckReasonCode.TopicNameInvalid);
	}

	if (pubData.header.qosLevel > 0) {
		pubData.header.packetIdentifier = twoByteInteger(data);
	}

	if (protocolVersion === ProtocolVersion.V5) {
		const propertyLength = variableByteInteger(data);
		const propertiesBuffer = data.buffer.slice(data.index, (data.index += propertyLength));
		pubData.properties = parsePublishProperties(propertiesBuffer);
	}
	pubData.payload = data.buffer.slice(data.index).toString();

	return pubData;
}

/**
 * Parses PUBACK into `pubAckData` (packet id, reason code, optional MQTT 5 properties).
 * @param buffer - Full PUBACK packet.
 * @param pubAckData - Output structure to populate.
 * @param protocolVersion - Property block only for MQTT 5.
 */
export function parsePubAck(buffer: Buffer, pubAckData: IPubAckData, protocolVersion: ProtocolVersion) {
	pubAckData.header.packetType = (buffer[0] >> 4) as PacketType;
	pubAckData.header.received = buffer[0] & 0xf;

	const data = { buffer, index: 1 };
	pubAckData.header.remainingLength = variableByteInteger(data);
	pubAckData.header.packetIdentifier = twoByteInteger(data);

	if (pubAckData.header.remainingLength <= 2) {
		pubAckData.header.reasonCode = PubAckReasonCode.Success;
		return;
	}

	pubAckData.header.reasonCode = oneByteInteger(data) ?? PubAckReasonCode.Success;

	if (data.index >= data.buffer.length) {
		return;
	}

	if (protocolVersion === ProtocolVersion.V5) {
		const propertyLength = variableByteInteger(data);
		if (propertyLength > 0) {
			const propertiesBuffer = data.buffer.slice(data.index, (data.index += propertyLength));
			pubAckData.properties = parsePubAckProperties(propertiesBuffer);
		}
	}
}

/**
 * Parses PUBREL into `pubRelData` (QoS 2 release step).
 * @param buffer - Full PUBREL packet.
 * @param pubRelData - Output structure to populate.
 * @param protocolVersion - Property block only for MQTT 5.
 */
export function parsePubRel(buffer: Buffer, pubRelData: IPubRelData, protocolVersion: ProtocolVersion) {
	pubRelData.header.packetType = (buffer[0] >> 4) as PacketType;
	pubRelData.header.received = buffer[0] & 0xf;

	const data = { buffer, index: 1 };
	pubRelData.header.remainingLength = variableByteInteger(data);
	pubRelData.header.packetIdentifier = twoByteInteger(data);

	if (pubRelData.header.remainingLength <= 2) {
		pubRelData.header.reasonCode = PubRelReasonCode.Success;
		return;
	}

	pubRelData.header.reasonCode = oneByteInteger(data) ?? PubRelReasonCode.Success;

	if (data.index >= data.buffer.length) {
		return;
	}

	if (protocolVersion === ProtocolVersion.V5) {
		const propertyLength = variableByteInteger(data);
		if (propertyLength > 0) {
			const propertiesBuffer = data.buffer.slice(data.index, (data.index += propertyLength));
			pubRelData.properties = parsePubRelProperties(propertiesBuffer);
		}
	}
}

/**
 * Parses PUBREC into `pubRecData` (QoS 2 received step).
 * @param buffer - Full PUBREC packet.
 * @param pubRecData - Output structure to populate.
 * @param protocolVersion - Property block only for MQTT 5.
 */
export function parsePubRec(buffer: Buffer, pubRecData: IPubRecData, protocolVersion: ProtocolVersion) {
	pubRecData.header.packetType = (buffer[0] >> 4) as PacketType;
	pubRecData.header.received = buffer[0] & 0xf;

	const data = { buffer, index: 1 };
	pubRecData.header.remainingLength = variableByteInteger(data);
	pubRecData.header.packetIdentifier = twoByteInteger(data);

	if (pubRecData.header.remainingLength <= 2) {
		pubRecData.header.reasonCode = PubRecReasonCode.Success;
		return;
	}

	pubRecData.header.reasonCode = oneByteInteger(data) ?? PubRecReasonCode.Success;

	if (data.index >= data.buffer.length) {
		return;
	}

	if (protocolVersion === ProtocolVersion.V5) {
		const propertyLength = variableByteInteger(data);
		if (propertyLength > 0) {
			const propertiesBuffer = data.buffer.slice(data.index, (data.index += propertyLength));
			pubRecData.properties = parsePubRecProperties(propertiesBuffer);
		}
	}
}

/**
 * Parses PUBCOMP into `pubCompData` (QoS 2 complete step; reuses {@link IPubRecData} shape in this codebase).
 * @param buffer - Full PUBCOMP packet.
 * @param pubCompData - Output structure to populate.
 * @param protocolVersion - Property block only for MQTT 5.
 */
export function parsePubComp(buffer: Buffer, pubCompData: IPubRecData, protocolVersion: ProtocolVersion) {
	pubCompData.header.packetType = (buffer[0] >> 4) as PacketType;
	pubCompData.header.received = buffer[0] & 0xf;

	const data = { buffer, index: 1 };
	pubCompData.header.remainingLength = variableByteInteger(data);
	pubCompData.header.packetIdentifier = twoByteInteger(data);

	if (pubCompData.header.remainingLength <= 2) {
		pubCompData.header.reasonCode = 0x00;
		return;
	}

	pubCompData.header.reasonCode = oneByteInteger(data) ?? 0x00;

	if (data.index >= data.buffer.length) {
		return;
	}

	if (protocolVersion === ProtocolVersion.V5) {
		const propertyLength = variableByteInteger(data);
		if (propertyLength > 0) {
			const propertiesBuffer = data.buffer.slice(data.index, (data.index += propertyLength));
			pubCompData.properties = parsePubCompProperties(propertiesBuffer);
		}
	}
}

/**
 * Parses SUBSCRIBE: validates fixed-header reserved bits, then topic filters and subscription options.
 * @param buffer - Full SUBSCRIBE packet.
 * @param subData - Output structure; `payload`/`options` mirror the first subscription for convenience.
 * @param protocolVersion - Property block only for MQTT 5.
 * @throws {@link DisconnectException} On invalid QoS, retain handling, or empty payload.
 */
export function parseSubscribe(buffer: Buffer, subData: ISubscribeData, protocolVersion: ProtocolVersion) {
	subData.header.packetType = (buffer[0] >> 4) as PacketType;
	subData.header.received = buffer[0] & 0xf;

	if (subData.header.received !== 0x02) {
		throw new DisconnectException(
			'Bits 3,2,1 and 0 of the Fixed Header of the SUBSCRIBE packet are reserved and MUST be set to 0,0,1 and 0 respectively.',
			DisconnectReasonCode.ProtocolError,
		);
	}

	const data = { buffer, index: 1 };
	subData.header.remainingLength = variableByteInteger(data);
	subData.header.packetIdentifier = twoByteInteger(data);
	if (protocolVersion === ProtocolVersion.V5) {
		const propertyLength = variableByteInteger(data);
		const propertiesBuffer = data.buffer.slice(data.index, (data.index += propertyLength));
		subData.properties = parseSubscribeProperties(propertiesBuffer);
	}

	subData.payloads = [];
	while (data.index < data.buffer.length) {
		const topicFilter = utf8DecodedString(data);
		const subscriptionOptions = oneByteInteger(data);
		const options = {
			qos: subscriptionOptions & 0x3,
			noLocal: !!((subscriptionOptions >> 2) & 0x01),
			retainAsPublished: !!(subscriptionOptions & 0x4),
			retainHandling: (subscriptionOptions >> 4) & 0x03,
			retain: (subscriptionOptions >> 6) & 0x03,
		};
		if (options.qos > QoSType.QoS2) {
			throw new DisconnectException('It is a Protocol Error if the Maximum QoS field has the value 3.', DisconnectReasonCode.ProtocolError);
		}
		if (options.retainHandling > 0x02) {
			throw new DisconnectException('It is a Protocol Error to send a Retain Handling value of 3.', DisconnectReasonCode.ProtocolError);
		}
		if (options.retain !== 0) {
			throw new DisconnectException('Sending a Retain value that is not equal to 0 is a protocol error.', DisconnectReasonCode.ProtocolError);
		}
		subData.payloads.push({ topicFilter, options });
	}
	if (!subData.payloads.length) {
		throw new DisconnectException('The SUBSCRIBE packet payload must contain at least one Topic Filter.', DisconnectReasonCode.ProtocolError);
	}
	subData.payload = subData.payloads[0].topicFilter;
	subData.options = subData.payloads[0].options;
}

/**
 * Parses UNSUBSCRIBE: topic filters only (no subscription options).
 * @param buffer - Full UNSUBSCRIBE packet.
 * @param unsubscribeData - Output structure to populate.
 * @param protocolVersion - Property block only for MQTT 5 (reuses subscribe property parser).
 * @throws {@link SubscribeAckException} When fixed-header reserved bits are wrong.
 * @throws {@link DisconnectException} When the payload has no topic filters.
 */
export function parseUnsubscribe(buffer: Buffer, unsubscribeData: IUnsubscribeData, protocolVersion: ProtocolVersion) {
	unsubscribeData.header.packetType = (buffer[0] >> 4) as PacketType;
	unsubscribeData.header.received = buffer[0] & 0xf;

	if (unsubscribeData.header.received !== 0x02) {
		throw new SubscribeAckException('Bits 3,2,1 and 0 of the Fixed Header of the UNSUBSCRIBE packet are reserved and MUST be set to 0,0,1 and 0 respectively.');
	}

	const data = { buffer, index: 1 };
	unsubscribeData.header.remainingLength = variableByteInteger(data);
	unsubscribeData.header.packetIdentifier = twoByteInteger(data);
	if (protocolVersion === ProtocolVersion.V5) {
		const propertyLength = variableByteInteger(data);
		const propertiesBuffer = data.buffer.slice(data.index, (data.index += propertyLength));
		unsubscribeData.properties = parseSubscribeProperties(propertiesBuffer);
	}

	unsubscribeData.payloads = [];
	while (data.index < data.buffer.length) {
		unsubscribeData.payloads.push(utf8DecodedString(data));
	}
	if (!unsubscribeData.payloads.length) {
		throw new DisconnectException('The UNSUBSCRIBE packet payload must contain at least one Topic Filter.', DisconnectReasonCode.ProtocolError);
	}
	unsubscribeData.payload = unsubscribeData.payloads[0];
}

/**
 * Parses DISCONNECT (reason code and optional MQTT 5 properties).
 * @param buffer - Full DISCONNECT packet.
 * @param disconnectData - Output structure to populate.
 * @param protocolVersion - Property block only for MQTT 5.
 */
export function parseDisconnect(buffer: Buffer, disconnectData: IDisconnectData, protocolVersion: ProtocolVersion) {
	disconnectData.header.packetType = buffer[0] >> 4;
	disconnectData.header.received = buffer[0] & 0xf;

	const data = { buffer, index: 1 };
	disconnectData.header.remainingLength = variableByteInteger(data);

	if (disconnectData.header.remainingLength === 0) {
		disconnectData.header.reasonCode = 0x00;
		return;
	}

	disconnectData.header.reasonCode = oneByteInteger(data);

	if (data.index >= data.buffer.length) {
		return;
	}

	if (protocolVersion === ProtocolVersion.V5) {
		const propertyLength = variableByteInteger(data);
		if (propertyLength > 0) {
			const propertiesBuffer = data.buffer.slice(data.index, (data.index += propertyLength));
			disconnectData.properties = parseDisconnectProperties(propertiesBuffer);
		}
	}
}

/**
 * Parses AUTH (enhanced authentication exchange).
 * @param buffer - Full AUTH packet.
 * @param authData - Output structure to populate.
 * @param protocolVersion - Property block only for MQTT 5.
 */
export function parseAuth(buffer: Buffer, authData: IAuthData, protocolVersion: ProtocolVersion) {
	authData.header.packetType = buffer[0] >> 4;
	authData.header.received = buffer[0] & 0xf;

	const data = { buffer, index: 1 };
	authData.header.remainingLength = variableByteInteger(data);

	if (authData.header.remainingLength === 0) {
		authData.header.reasonCode = 0x00;
		return;
	}

	authData.header.reasonCode = oneByteInteger(data);

	if (data.index >= data.buffer.length) {
		return;
	}

	if (protocolVersion === ProtocolVersion.V5) {
		const propertyLength = variableByteInteger(data);
		if (propertyLength > 0) {
			const propertiesBuffer = data.buffer.slice(data.index, (data.index += propertyLength));
			authData.properties = parseAuthProperties(propertiesBuffer);
		}
	}
}

/**
 * Builds a binary CONNACK packet (session present, reason code, optional MQTT 5 properties).
 * @param connAckData - Logical CONNACK content.
 * @param protocolVersion - When not MQTT 5, properties are omitted from the wire.
 * @returns Complete packet buffer.
 */
export function encodeConnAck(connAckData: IConnAckData, protocolVersion: ProtocolVersion) {
	const properties = new EncoderProperties();
	properties.push(connAckData.properties);
	return Buffer.from([
		(connAckData.header.packetType << 4) | connAckData.header.reserved,
		...encodeVariableByteInteger(2 + (protocolVersion === ProtocolVersion.V5 ? properties.length : 0)),
		connAckData.acknowledgeFlags.SessionPresent ? 1 : 0,
		connAckData.header.reasonCode,
		...(protocolVersion === ProtocolVersion.V5 ? properties.buffer : []),
	]);
}

/**
 * Builds a binary DISCONNECT packet (reason code + MQTT 5 properties).
 * @param disconnectData - Logical DISCONNECT content.
 * @returns Complete packet buffer.
 */
export function encodeDisconnect(disconnectData: IDisconnectData) {
	const fixedHeader = (disconnectData.header.packetType << 4) | disconnectData.header.received;

	const properties = new EncoderProperties();
	properties.push(disconnectData.properties);

	const remainingBuffer = [disconnectData.header.reasonCode, ...properties.buffer];
	return Buffer.from([fixedHeader, ...encodeVariableByteInteger(remainingBuffer.length), ...remainingBuffer]);
}

/**
 * Serializes a PUBLISH packet from structured data (fixed header flags, topic, QoS id, properties, payload).
 * @param pubData - Publish header, properties, and payload string.
 * @param protocolVersion - MQTT 5 includes the property block; older versions omit it here.
 * @returns Complete PUBLISH buffer.
 */
export function encodePublishPacket(pubData: IPublishData, protocolVersion: ProtocolVersion) {
	const fixedHeader = (pubData.header.packetType << 4) | ((pubData.header.dupFlag ? 1 : 0) << 3) | (pubData.header.qosLevel << 1) | (pubData.header.retain ? 1 : 0);

	const topicNameBuffer = encodeUTF8String(pubData.header.topicName);

	let packetIdentifierBuffer: Array<number> = [];
	if (pubData.header.qosLevel > 0 && pubData.header.packetIdentifier !== undefined) {
		packetIdentifierBuffer = integerToTwoUint8(pubData.header.packetIdentifier);
	}

	const properties = new EncoderProperties();
	properties.push(pubData.properties);

	const remainingBuffer = [...topicNameBuffer, ...packetIdentifierBuffer, ...(protocolVersion === ProtocolVersion.V5 ? properties.buffer : []), ...Buffer.from(pubData.payload)];
	const publishedPacket = Buffer.from([fixedHeader, ...encodeVariableByteInteger(remainingBuffer.length), ...remainingBuffer]);

	return publishedPacket;
}

/**
 * Builds PUBACK, PUBREC, or PUBCOMP control packets (packet id, success reason `0x00`, optional properties).
 * @param data - Shared shape for these acknowledgement types in this codebase.
 * @param protocolVersion - MQTT 5 appends the property section when enabled.
 * @returns Complete packet buffer.
 */
export function encodePubControlPacket(data: IPubAckData | IPubRecData | IPubCompData, protocolVersion: ProtocolVersion) {
	const properties = new EncoderProperties();
	properties.push(data.properties);
	return Buffer.from([
		(data.header.packetType << 4) | data.header.received,
		...encodeVariableByteInteger(3 + (protocolVersion === ProtocolVersion.V5 ? properties.length : 0)),
		...integerToTwoUint8(data.header.packetIdentifier),
		0x00,
		...(protocolVersion === ProtocolVersion.V5 ? properties.buffer : []),
	]);
}

/**
 * Builds a SUBACK packet (packet identifier, optional MQTT 5 properties, per-subscription reason codes).
 * @param subAckData - Subscription acknowledgement data; uses `reasonCodes` when present else a single `reasonCode`.
 * @param protocolVersion - Property length is included in remaining length only for MQTT 5.
 * @returns Complete SUBACK buffer.
 */
export function encodeSubAckPacket(subAckData: ISubAckData, protocolVersion: ProtocolVersion) {
	const properties = new EncoderProperties();
	const reasonCodes = subAckData.reasonCodes?.length ? subAckData.reasonCodes : [subAckData.reasonCode];
	return Buffer.from([
		PacketType.SUBACK << 4,
		...encodeVariableByteInteger(2 + (protocolVersion === ProtocolVersion.V5 ? properties.length : 0) + reasonCodes.length),
		...integerToTwoUint8(subAckData.header.packetIdentifier),
		...(protocolVersion === ProtocolVersion.V5 ? properties.buffer : []),
		...reasonCodes,
	]);
}

/**
 * Computes the total byte length of the first MQTT frame in `buf` (first octet + Variable Byte Integer remaining length + payload).
 * @param buf - Bytes starting at a fixed header; must be at least two bytes to attempt a read.
 * @returns Total frame length in bytes, or `null` if `buf` does not yet contain a full remaining-length prefix or full frame.
 * @throws {@link DisconnectException} When the remaining-length encoding is malformed (more than four continuation bytes or invalid pattern).
 */
export function probeFrameLength(buf: Buffer): number | null {
	if (buf.length < 2) return null;
	let pos = 1;
	let multiplier = 1;
	let value = 0;

	for (let round = 0; round < 4; round++) {
		if (pos >= buf.length) return null;
		const encodedByte = buf[pos];
		value += (encodedByte & 0x7f) * multiplier;
		pos++;
		if ((encodedByte & 0x80) === 0) {
			return pos + value;
		}
		multiplier *= 128;
	}

	throw new DisconnectException('Malformed Remaining Length.', DisconnectReasonCode.ProtocolError);
}

/**
 * Buffers a TCP byte stream and splits it into complete MQTT packets (handles coalescing and partial frames).
 *
 * @remarks TCP delivers arbitrary byte chunks; this class keeps a remainder and parses full frames on each {@link StreamFramer.push}.
 */
export class StreamFramer {
	private remainBuffer: Buffer = Buffer.alloc(0);

	/**
	 * Appends incoming bytes, parses as many complete MQTT packets as possible, and returns them.
	 * @param chunk - New data from the socket (may be partial or multiple packets).
	 * @param protocolVersion - Passed through to {@link parsePacket}.
	 * @returns Parsed packet objects for every complete frame found; may be empty if more bytes are needed.
	 */
	push(chunk: Buffer, protocolVersion: ProtocolVersion): PacketTypeData[] {
		this.remainBuffer = this.remainBuffer.length === 0 ? chunk : Buffer.concat([this.remainBuffer, chunk]);
		const packets: PacketTypeData[] = [];

		while (this.remainBuffer.length >= 2) {
			const frameLength = probeFrameLength(this.remainBuffer);
			if (frameLength === null) break;
			if (this.remainBuffer.length < frameLength) break;

			const frame = this.remainBuffer.subarray(0, frameLength);
			this.remainBuffer = this.remainBuffer.subarray(frameLength);
			packets.push(parsePacket(Buffer.from(frame), protocolVersion));
		}

		return packets;
	}

	/**
	 * Like {@link StreamFramer.push} but returns raw frame buffers without calling {@link parsePacket} (for WebSocket or other adapters that parse later).
	 * @param chunk - New data to append to the internal buffer.
	 * @returns Zero or more complete MQTT frames as independent `Buffer` copies.
	 */
	extractFrames(chunk: Buffer): Buffer[] {
		this.remainBuffer = this.remainBuffer.length === 0 ? chunk : Buffer.concat([this.remainBuffer, chunk]);
		const frames: Buffer[] = [];

		while (this.remainBuffer.length >= 2) {
			const frameLength = probeFrameLength(this.remainBuffer);
			if (frameLength === null) break;
			if (this.remainBuffer.length < frameLength) break;

			frames.push(Buffer.from(this.remainBuffer.subarray(0, frameLength)));
			this.remainBuffer = this.remainBuffer.subarray(frameLength);
		}

		return frames;
	}

	/** Clears any buffered partial data (e.g. after disconnect). */
	reset() {
		this.remainBuffer = Buffer.alloc(0);
	}

	/** Number of bytes currently held waiting for a complete frame. */
	get bufferedBytes() {
		return this.remainBuffer.length;
	}
}
