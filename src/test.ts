import { MqttServer } from '.';
import { CONFIG } from './config';
import { ConnectAckException } from './exception';
import { MemoryManager } from './manager/memoryManager';
import { RedisManager } from './manager/redisManager';

// const clientManager = new RedisManager({
// 	host: CONFIG.redisHost,
// 	port: CONFIG.redisPort,
// 	password: CONFIG.redisPassword,
// 	db: CONFIG.redisDB,
// });
const clientManager = new MemoryManager();

const server = new MqttServer(clientManager);

// 异步错误处理
// process.on('uncaughtException', (err) => {
// 	console.error('uncaughtException:', err);
// });

// 异步错误处理
// process.on('unhandledRejection', (reason, promise) => {
// 	console.error('unhandledRejection:', reason, promise);
// });

console.log((() => {})());

// 客户端推送事件
server.onPublish(async (data, client, clientManager) => {
	console.log('clientId: ', clientManager.clientIdentifierManager.getClient(client)?.identifier);
	console.log('onPublish: ', data);
	// throw new Error('test');
	return false;
	// return true;
});

// TODO 支持 Websocket 协议
// TODO 支持 TLS 协议

server.listen(CONFIG.mqttPort, () => {
	console.log(`MQTT server listening on port ${CONFIG.mqttPort}`);
});
