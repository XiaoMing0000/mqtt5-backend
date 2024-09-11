import net from 'net';
import { PacketType } from './interface';
import { defaultAuthenticate, defaultAuthorizeForward, defaultAuthorizePublish, defaultAuthorizeSubscribe, defaultPreConnect, defaultPublished } from './auth';
import { MqttManager } from '.';

// 本地缓存，用来记录连接的client
const allClient = new Set<net.Socket>();

// 创建 TCP 服务器
const server = net.createServer((client) => {
	const defaultOption = {
		concurrency: 100,
		heartbeatInterval: 60000, // 1 minute
		connectTimeout: 30000, // 30 secs
		decodeProtocol: null,
		preConnect: defaultPreConnect,
		authenticate: defaultAuthenticate,
		authorizePublish: defaultAuthorizePublish,
		authorizeSubscribe: defaultAuthorizeSubscribe,
		authorizeForward: defaultAuthorizeForward,
		published: defaultPublished,
		trustProxy: false,
		trustedProxies: [],
		queueLimit: 42,
		maxClientsIdLength: 23,
		keepaliveLimit: 0,
	};

	allClient.add(client);

	const mqttManager = new MqttManager(client, allClient);
	client.on('data', (data) => {
		const packetType = (data[0] >> 4) as PacketType;

		switch (packetType) {
			case PacketType.CONNECT:
				mqttManager.connectHandle(data);
				break;
			case PacketType.PUBLISH:
				mqttManager.publishHandle(data);
				break;
			case PacketType.PUBREL:
				mqttManager.pubRelHandle(data);
				break;
			case PacketType.SUBSCRIBE:
				mqttManager.subscribeHandle(data);
				break;
			case PacketType.UNSUBSCRIBE:
				console.log('unsubscribe');
				break;
			case PacketType.PINGREQ:
				mqttManager.pingReqHandle();
				break;

			case PacketType.DISCONNECT:
				mqttManager.disconnectHandle(data);
				break;
			default:
				console.log('Unhandled packet type:', packetType);
		}
	});

	client.on('end', () => {
		console.log('Client disconnected');
		client.end();
	});

	client.on('error', (err) => {
		console.error('Client error:', err);
	});

	client.on('close', (hadError: boolean) => {
		allClient.delete(client);
		if (hadError) {
			console.log('Connection closed due to error!');
		} else {
			console.log('The connection was closed properly!');
		}
	});
});

server.listen(1883, () => {
	console.log('MQTT server listening on port 1883');
});

// TODO 3.2 CONNACK – Connect acknowledgement 下一步编写

console.log(new Uint8Array([257]));
console.log(Buffer.from([255, 1]).join(''));
