import tls from 'tls';
import fs from 'fs';
import path from 'path';
import { IConnectData, IPublishData, Manager, MqttServer, TClient } from '../src';
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

// 异步错误处理
// process.on('uncaughtException', (err) => {
// 	console.error('uncaughtException:', err);
// });

// 异步错误处理
// process.on('unhandledRejection', (reason, promise) => {
// 	console.error('unhandledRejection:', reason, promise);
// });

server.onConnection(async (client) => {
	let identifier = '';
	client.on('connect', (data: IConnectData, client: TClient, clientManager: Manager) => {
		identifier = data.payload.clientIdentifier;
		console.log('connect', data);
	});

	client.on('publish', (data: IPublishData, client: TClient, clientManager: Manager) => {
		console.log('clientId: ', identifier);
		console.log('publish: ', data);
	});
});

server.listen(CONFIG.mqttPort, () => {
	console.log(`MQTT server listening on port ${CONFIG.mqttPort}`);
});

// TODO 共享订阅
// TODO 消息队列

// TODO 3.1.2.11.2 会话过期间隔 Session Expiry Interval
