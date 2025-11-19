import {
	IAuthData,
	IConnectData,
	IDisconnectData,
	IPingData,
	IPubAckData,
	IPubCompData,
	IPubRecData,
	IPubRelData,
	IPublishData,
	ISubscribeData,
	IUnsubscribeData,
	Manager,
	MqttServer,
	MqttServerTLS,
	MqttServerWebSocket,
	MqttServerWebSocketSecure,
	TClient,
} from '../src';
import { MemoryManager } from '../src/manager/memoryManager';
import tls from 'tls';
import fs from 'fs';
import path from 'path';

const tlsOptions: tls.TlsOptions = {
	cert: fs.readFileSync(path.join(__dirname, '../temp/test.com.crt')),
	key: fs.readFileSync(path.join(__dirname, '../temp/test.com.key')),
	keepAlive: true,
};

// Create an in-memory client manager; ideal for demos or single-node setups
const clientManager = new MemoryManager();

// Instantiate MQTT servers for all transport variants (TCP, TLS, WS, WSS)
// Sharing the same clientManager enables cross-protocol communication
const mqttServer = new MqttServer(clientManager);
const mqttsServer = new MqttServerTLS(tlsOptions, clientManager);
const wsMqttServer = new MqttServerWebSocket(clientManager);
const wssMqttServer = new MqttServerWebSocketSecure(tlsOptions, clientManager);

/**
 * Register connect listeners to install per-client packet listeners and isolate context.
 *
 * MQTT hook option 1 (server-level):
 *   server.onConnect / onDisconnect / onPing / onPublish / onPubRel / onPubRec / onPubComp / onSubscribe / onAuth
 * MQTT hook option 2 (client-level):
 *   client.on('connect' | 'disconnect' | 'ping' | 'publish' | 'pubRel' | 'pubRec' | 'pubComp' | 'subscribe' | 'auth')
 *
 * Server-level listeners have higher priority. Returning false or throwing from either level rejects the client.
 */

const connectListener = async (data: IConnectData, client: TClient, clientManager: Manager) => {
	console.log('MQTT server connected.');
	return true;
};

// Attach connect listeners for every transport; acts like a decorator around client sessions
mqttServer.onConnect(connectListener);
mqttsServer.onConnect(connectListener);
wsMqttServer.onConnect(connectListener);
wssMqttServer.onConnect(connectListener);

// Register packet listeners when a client connects to keep per-client context encapsulated
mqttServer.onConnection(async (client: TClient) => {
	let contentData: any = {};

	client.on('connect', (data: IConnectData, client: TClient, clientManager: Manager) => {
		console.log(contentData);
		console.log('MQTT client connected.', data);

		// Deny an incoming client by either:
		// 1. Returning false
		// return false;
		// 2. Throwing an exception
		// throw new ConnectAckException('disconnect the client', ConnectAckReasonCode.ProtocolError);
	});

	client.on('disconnect', (data: IDisconnectData, client: TClient, clientManager: Manager) => {
		console.log(contentData);
		console.log('MQTT client disconnected.', data);
	});

	client.on('publish', (data: IPublishData, client: TClient, clientManager: Manager) => {
		console.log('MQTT client published.', data);
	});

	client.on('pubAck', (data: IPubAckData, client: TClient, clientManager: Manager) => {
		console.log('MQTT client pubAck.', data);
	});

	client.on('pubRec', (data: IPubRecData, client: TClient, clientManager: Manager) => {
		console.log('MQTT client pubRec.', data);
	});

	client.on('pubRel', (data: IPubRelData, client: TClient, clientManager: Manager) => {
		console.log('MQTT client pubRel.', data);
	});

	client.on('pubComp', (data: IPubCompData, client: TClient, clientManager: Manager) => {
		console.log('MQTT client pubComp.', data);
	});

	client.on('subscribe', (data: ISubscribeData, client: TClient, clientManager: Manager) => {
		console.log('MQTT client subscribed.', data);
	});
	client.on('unsubscribe', (data: IUnsubscribeData, client: TClient, clientManager: Manager) => {
		console.log('MQTT client unsubscribed.', data);
	});
	client.on('ping', (data: IPingData, client: TClient, clientManager: Manager) => {
		console.log('MQTT client ping.', data);
	});
	client.on('auth', (data: IAuthData, client: TClient, clientManager: Manager) => {
		console.log('MQTT client auth.', data);
	});
});

// Start all listeners; each runs independently on its own port
mqttServer.listen(1883, () => {
	console.log(`MQTT server listening on port 1883.`);
});

mqttsServer.listen(8883, () => {
	console.log(`MQTT TLS server listening on port 8883.`);
});

wsMqttServer.listen(8083, () => {
	console.log(`MQTT WebSocket server listening on port 8083.`);
});

wssMqttServer.listen(8084, () => {
	console.log(`MQTT WebSocket Secure server listening on port 8084.`);
});
