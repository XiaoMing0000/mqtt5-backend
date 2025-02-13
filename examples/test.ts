import tls from 'tls';
import fs from 'fs';
import path from 'path';
import { MqttServer, MqttServerTLS } from '../src';
import { CONFIG } from './config';
import { MemoryManager } from '../src/manager/memoryManager';
import { RedisManager } from '../src/manager/redisManager';

const clientManager = new RedisManager({
	host: CONFIG.redisHost,
	port: CONFIG.redisPort,
	password: CONFIG.redisPassword,
	db: CONFIG.redisDB,
});

// const clientManager = new MemoryManager();

const tlsOptions: tls.TlsOptions = {
	cert: fs.readFileSync(path.join(__dirname, '../temp/test.com.crt')),
	key: fs.readFileSync(path.join(__dirname, '../temp/test.com.key')),
	keepAlive: true,
};

const tlsServer = new MqttServerTLS(tlsOptions, clientManager);
const server = new MqttServer(clientManager);

// tlsServer.listen(8883, () => {
// 	console.log(`MQTT server listening on port ${8883}`);
// });

// 异步错误处理
// process.on('uncaughtException', (err) => {
// 	console.error('uncaughtException:', err);
// });

// 异步错误处理
// process.on('unhandledRejection', (reason, promise) => {
// 	console.error('unhandledRejection:', reason, promise);
// });

// 客户端推送事件
// server.onPublish(async (data, client, clientManager) => {
// 	console.log('clientId: ', clientManager.clientIdentifierManager.getClient(client)?.identifier);
// 	console.log('onPublish: ', data);
// 	throw new Error('test');
// 	// return false;
// 	return true;
// });

// TODO 支持 Websocket 协议

server.listen(CONFIG.mqttPort, () => {
	console.log(`MQTT server listening on port ${CONFIG.mqttPort}`);
});
tlsServer.listen(8883, () => {
	console.log(`MQTT server listening on port ${8883}`);
});

// TODO 共享订阅
// TODO 遗留消息
