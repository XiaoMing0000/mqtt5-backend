import { MqttServer } from '.';
import { CONFIG } from './config';
import { MemoryManager } from './manager/memoryManager';
import { RedisManager } from './manager/redisManager';

const clientManager = new RedisManager({
	host: CONFIG.redisHost,
	port: CONFIG.redisPort,
	password: CONFIG.redisPassword,
	db: CONFIG.redisDB,
});
// const clientManager = new MemoryManager();

const server = new MqttServer(clientManager);

// TODO 支持 Websocket 协议
// TODO 支持 TLS 协议

server.listen(CONFIG.mqttPort, () => {
	console.log(`MQTT server listening on port ${CONFIG.mqttPort}`);
});
