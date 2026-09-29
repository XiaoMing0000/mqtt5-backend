import {
  IAuthData,
  IConnectData,
  Manager,
  MqttClient,
  MqttServer,
  MqttServerTLS,
  MqttServerWebSocket,
  MqttServerWebSocketSecure,
  TSocket,
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
 * Register connect listeners to install per-socket packet listeners and isolate context.
 *
 * MQTT hook option 1 (server-level):
 *   server.onConnect / onDisconnect / onPing / onPublish / onPubRel / onPubRec / onPubComp / onSubscribe / onAuth
 * MQTT hook option 2 (socket-level):
 *   socket.on('connect' | 'disconnect' | 'ping' | 'publish' | 'pubRel' | 'pubRec' | 'pubComp' | 'subscribe' | 'auth')
 *
 * Server-level listeners have higher priority. Returning false or throwing from either level rejects the client.
 */

const connectListener = async (_data: IConnectData, _client: MqttClient, _clientManager: Manager) => {
  console.log('MQTT server connected.');
  return true;
};

// Attach connect listeners for every transport; acts like a decorator around client sessions
mqttServer.onConnect(connectListener);
mqttsServer.onConnect(connectListener);
wsMqttServer.onConnect(connectListener);
wssMqttServer.onConnect(connectListener);

// Register packet listeners when a socket connects to keep per-connection context encapsulated
mqttServer.onConnection(async (socket: TSocket) => {
  const contentData: any = {};

  socket.on('connect', (data: IConnectData, _client, _clientManager) => {
    console.log(contentData);
    console.log('MQTT client connected.', data);

    // Deny an incoming client by either:
    // 1. Returning false
    // return false;
    // 2. Throwing an exception
    // throw new ConnectAckException('disconnect the client', ConnectAckReasonCode.ProtocolError);
  });

  socket.on('disconnect', (data, _client, _clientManager) => {
    console.log(contentData);
    console.log('MQTT client disconnected.', data);
  });

  socket.on('publish', (data, _client, _clientManager) => {
    console.log('MQTT client published.', data);
  });

  socket.on('pubAck', (data, _client, _clientManager) => {
    console.log('MQTT client pubAck.', data);
  });

  socket.on('pubRec', (data, _client, _clientManager) => {
    console.log('MQTT client pubRec.', data);
  });

  socket.on('pubRel', (data, _client, _clientManager) => {
    console.log('MQTT client pubRel.', data);
  });

  socket.on('pubComp', (data, _client, _clientManager) => {
    console.log('MQTT client pubComp.', data);
  });

  socket.on('subscribe', (data, _client, _clientManager) => {
    console.log('MQTT client subscribed.', data);
  });
  socket.on('unsubscribe', (data, _client, _clientManager) => {
    console.log('MQTT client unsubscribed.', data);
  });
  socket.on('ping', (_client, _clientManager) => {
    console.log('MQTT client ping.');
  });
  socket.on('auth', (data: IAuthData, _client, _clientManager) => {
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
