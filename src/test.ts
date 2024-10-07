import net from 'net';
import {
	IAuthData,
	IConnectData,
	IDisconnectData,
	IPubAckData,
	IPublishData,
	IPubRecData,
	IPubRelData,
	ISubAckData,
	ISubscribeData,
	IUnsubscribeData,
	PacketType,
} from './interface';
import { defaultAuthenticate, defaultAuthorizeForward, defaultAuthorizePublish, defaultAuthorizeSubscribe, defaultPreConnect, defaultPublished } from './auth';
import { MqttManager, ClientManager } from '.';
import {
	ConnectAckException,
	ConnectAckReasonCode,
	DisconnectException,
	DisconnectReasonCode,
	PubAckException,
	PubAckReasonCode,
	SubscribeAckException,
	SubscribeAckReasonCode,
} from './exception';
import { parsePacket } from './parse';

const subscriptionManger = new ClientManager();
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
	const mqttManager = new MqttManager(client, subscriptionManger);
	client.on('data', (buffer) => {
		try {
			// 这一层捕获协议错误和未知错误
			const data = parsePacket(buffer);
			try {
				switch (data.header.packetType) {
					case PacketType.CONNECT:
						mqttManager.connectHandle(data as IConnectData);
						break;
					case PacketType.PUBLISH:
						mqttManager.publishHandle(data as IPublishData);
						break;
					case PacketType.PUBACK:
						mqttManager.pubAckHandle(data as IPubAckData);
						break;
					case PacketType.PUBREC:
						mqttManager.pubRecHandle(data as IPubRecData);
						break;
					case PacketType.PUBREL:
						mqttManager.pubRelHandle(data as IPubRelData);
						break;
					case PacketType.PUBCOMP:
						mqttManager.pubCompHandle(data as IPubRecData);
						break;
					case PacketType.SUBSCRIBE:
						mqttManager.subscribeHandle(data as ISubscribeData);
						break;
					case PacketType.UNSUBSCRIBE:
						mqttManager.unsubscribeHandle(data as IUnsubscribeData);
						break;
					case PacketType.PINGREQ:
						mqttManager.pingReqHandle();
						break;
					case PacketType.DISCONNECT:
						mqttManager.disconnectHandle(data as IDisconnectData);
						break;
					case PacketType.AUTH:
						mqttManager.authHandle(data as IAuthData);
						break;
					default:
						console.log('Unhandled packet type:', data);
				}
			} catch (error) {
				if (error instanceof DisconnectException) {
					mqttManager.handleDisconnect(error.code as DisconnectReasonCode, { reasonString: error.msg });
				} else if (error instanceof ConnectAckException) {
					mqttManager.handleConnAck(data as IConnectData, error.code as ConnectAckReasonCode, error.msg);
				} else if (error instanceof SubscribeAckException) {
					const subAckData: ISubAckData = {
						header: {
							packetType: PacketType.SUBACK,
							retain: 0x00,
							packetIdentifier: data.header.packetType ?? 0,
						},
						properties: {
							reasonString: error.msg,
						},
						reasonCode: error.code as SubscribeAckReasonCode,
					};
					mqttManager.handleSubAck(subAckData);
				} else if (error instanceof PubAckException) {
					const pubAckData: IPubAckData = {
						header: {
							packetType: PacketType.PUBACK,
							received: 0x00,
							packetIdentifier: data.header.packetType ?? 0,
							reasonCode: error.code as PubAckReasonCode,
						},
						properties: {
							reasonString: error.msg,
						},
					};
					mqttManager.pubAckHandle(pubAckData);
				} else {
					throw error;
				}
			}
		} catch (error) {
			if (error instanceof DisconnectException) {
				mqttManager.handleDisconnect(error.code as DisconnectReasonCode, { reasonString: error.msg });
			} else {
				mqttManager.handleDisconnect(DisconnectReasonCode.UnspecifiedError, { reasonString: 'Internal Server Error.' });
			}
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
		subscriptionManger.clear(client);
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
