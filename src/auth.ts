import net from 'net';

export function defaultPreConnect(client: net.Socket, packet: Buffer, callback: (...any: Array<any>) => void) {
	callback(null, true);
}

export function defaultAuthenticate(client: net.Socket, username: string, password: string, callback: (...any: Array<any>) => void) {
	callback(null, true);
}

export function defaultAuthorizePublish(client: net.Socket, packetpacket: Buffer, callback: (...any: Array<any>) => void) {
	// if (packet.topic.startsWith($SYS_PREFIX)) {
	//   return callback(new Error($SYS_PREFIX + ' topic is reserved'))
	// }
	callback(null);
}

export function defaultAuthorizeSubscribe(client: net.Socket, sub: any, callback: (...any: Array<any>) => void) {
	callback(null, sub);
}

export function defaultAuthorizeForward(client: net.Socket, packet: (...any: Array<any>) => void) {
	return packet;
}

export function defaultPublished(packet: Buffer, client: net.Socket, callback: (...any: Array<any>) => void) {
	callback(null);
}
