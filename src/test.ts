import { MqttServer } from '.';
import { CONFIG } from './config';
const server = new MqttServer({
	redis: {
		host: CONFIG.redisHost,
		port: CONFIG.redisPort,
		password: CONFIG.redisPassword,
		db: CONFIG.redisDB,
	},
});

// TODO 支持 Websocket 协议
// TODO 支持 TLS 协议
// TODO 使用 clientIdentifier (等待 redis 支持时校验)

server.listen(CONFIG.mqttPort, () => {
	console.log(`MQTT server listening on port ${CONFIG.mqttPort}`);
});
