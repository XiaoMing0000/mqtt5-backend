// import tls from 'tls';
// import fs from 'fs';
// import path from 'path';
import { IConnectData, IDisconnectData, IPublishData, ISubscribeData, Manager, MqttClient, MqttServer, MqttServerWebSocket } from '../src';
// import http from 'http';
// import https from 'https';
import { CONFIG } from './config';
import { MemoryManager } from '../src/manager/memoryManager';
// import { RedisManager } from '../src/manager/redisManager';
// import { Redis2Manager } from '../src/manager/redis2Manager';
// import { WebSocketServer } from 'ws';

// const clientManager = new RedisManager({
// 	host: CONFIG.redisHost,
// 	port: CONFIG.redisPort,
// 	password: CONFIG.redisPassword,
// 	db: CONFIG.redisDB,
// });

const clientManager = new MemoryManager();
// const clientManager = new Redis2Manager({
//   host: CONFIG.redisHost,
//   port: CONFIG.redisPort,
//   username: CONFIG.redisUsername,
//   password: CONFIG.redisPassword,
//   db: CONFIG.redisDB,
// });

const server = new MqttServer(clientManager);

const wsMqttServer = new MqttServerWebSocket(clientManager);

// 异步错误处理
// process.on('uncaughtException', (err) => {
// 	console.error('uncaughtException:', err);
// });

// 异步错误处理
// process.on('unhandledRejection', (reason, promise) => {
// 	console.error('unhandledRejection:', reason, promise);
// });
let count = 0;
let count2 = 0;
let count3 = 0;
server.onConnection(async (socket) => {
  let identifier = '';
  socket.on('connect', (data: IConnectData, _client: MqttClient, _clientManager: Manager) => {
    count++;
    console.log('connect: ', count);
    identifier = data.payload.clientIdentifier;
  });

  socket.on('publish', (data: IPublishData, _client: MqttClient, _clientManager: Manager) => {
    console.log('publish: ', identifier);
    console.log('publish: ', data);
  });

  socket.on('subscribe', (data: ISubscribeData, _client: MqttClient, _clientManager: Manager) => {
    console.log('subscribe: ', data.payload);
    count3++;
    console.log('subscribe: ', count3);
  });

  socket.on('close', (_data: IDisconnectData, _client: MqttClient, _clientManager: Manager) => {
    console.log('disconnect: ', identifier);
    count2++;
    console.log('disconnect: ', count2);
  });
});

server.listen(CONFIG.mqttPort, () => {
  console.log(`MQTT server listening on port ${CONFIG.mqttPort}`);
});
wsMqttServer.listen(8083, async () => {
  console.log(`MQTT WebSocket server listening on port ${8083}`);
});

// TODO 共享订阅
// TODO 消息队列

// TODO 3.1.2.11.2 会话过期间隔 Session Expiry Interval
