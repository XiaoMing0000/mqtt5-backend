import { IPublishData, PropertyIdentifier } from './interface';
import { EncoderProperties, encodeVariableByteInteger, integerToTwoUint8 } from './parse';

export function encodePublishPacket(pubData: IPublishData) {
	const fixedHeader = (pubData.header.packetType << 4) | ((pubData.header.udpFlag ? 1 : 0) << 3) | (pubData.header.qosLevel << 1) | (pubData.header.retain ? 1 : 0);

	let remainingLength = 1;
	const topicNameBuffer = Buffer.from(pubData.header.topicName);
	remainingLength += topicNameBuffer.length;

	let packetIdentifierBuffer: Array<number> = [];
	if (pubData.header.qosLevel > 0 && pubData.header.packetIdentifier !== undefined) {
		packetIdentifierBuffer = integerToTwoUint8(pubData.header.packetIdentifier);
		remainingLength += packetIdentifierBuffer.length;
	}

	const properties = new EncoderProperties();
	properties.add(PropertyIdentifier.UserProperty, pubData.properties);
	// for (const key in pubData.properties) {
	// 	properties.add(PropertyIdentifier[key as keyof typeof PropertyIdentifier], pubData.properties[key as keyof IProperties] as any);
	// }

	const publishedPacket = Buffer.from([fixedHeader, ...encodeVariableByteInteger(3 + properties.length), ...packetIdentifierBuffer, 0x00, ...properties.buffer]);

	return publishedPacket;
}
