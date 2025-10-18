import tls from 'tls';
import fs from 'fs';
import path from 'path';
import { MqttServer, MqttServerTLS, MqttServerWebSocket, MqttServerWebSocketSecure } from '../src';
import http from 'http';
import https from 'https';
import { CONFIG } from './config';
import { MemoryManager } from '../src/manager/memoryManager';
import { RedisManager } from '../src/manager/redisManager';
import { Redis2Manager } from '../src/manager/redis2Manager';
import { WebSocketServer } from 'ws';

// const clientManager = new RedisManager({
// 	host: CONFIG.redisHost,
// 	port: CONFIG.redisPort,
// 	password: CONFIG.redisPassword,
// 	db: CONFIG.redisDB,
// });

// const clientManager = new MemoryManager();
const clientManager = new Redis2Manager({
	host: CONFIG.redisHost,
	port: CONFIG.redisPort,
	username: CONFIG.redisUsername,
	password: CONFIG.redisPassword,
	db: CONFIG.redisDB,
});

const server = new MqttServer(clientManager);

const tlsOptions: tls.TlsOptions = {
	cert: fs.readFileSync(path.join(__dirname, '../temp/test.com.crt')),
	key: fs.readFileSync(path.join(__dirname, '../temp/test.com.key')),
	keepAlive: true,
};
const tlsServer = new MqttServerTLS(tlsOptions, clientManager);

// 异步错误处理
// process.on('uncaughtException', (err) => {
// 	console.error('uncaughtException:', err);
// });

// 异步错误处理
// process.on('unhandledRejection', (reason, promise) => {
// 	console.error('unhandledRejection:', reason, promise);
// });

// 客户端推送事件
server.onPublish(async (data, client, clientManager) => {
	console.log('clientId: ', clientManager.clientIdentifierManager.getClient(client)?.identifier);
	console.log('onPublish: ', data);
	// throw new Error('test');
	// return false;
	return true;
});

server.onConnect(async (data, client, clientManager) => {
	console.log('connectionData: ', data);
	return true;
});

server.listen(CONFIG.mqttPort, () => {
	console.log(`MQTT server listening on port ${CONFIG.mqttPort}`);
});
tlsServer.listen(8883, () => {
	console.log(`MQTT TLS server listening on port ${8883}`);
});

// MQTT server 支持 HTTP 协议 WebSocket
const wsServer = new MqttServerWebSocket(clientManager);
wsServer.onConnect(async (data, client, clientManager) => {
	console.log('connectionData: ', data);
	return true;
});
wsServer.listen(8083, () => {
	console.log('MQTT over WebSocket server listening on port 8083');
});

// MQTT server 支持 TLS 协议 WebSocket
const wssServer = new MqttServerWebSocketSecure(tlsOptions, clientManager);
wssServer.onConnect(async (data, client, clientManager) => {
	console.log('connectionData: ', data);
	return true;
});
wssServer.listen(8084, () => {
	console.log('MQTT over WebSocket server listening on port 8084');
});

// TODO 共享订阅
// TODO 消息队列
