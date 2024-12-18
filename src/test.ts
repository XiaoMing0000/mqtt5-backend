import { MqttServer } from '.';
const server = new MqttServer({});

// TODO 支持 Websocket 协议
// TODO 支持 TLS 协议
// TODO 使用 clientIdentifier (等待 redis 支持时校验)

server.listen(1883, () => {
	console.log('MQTT server listening on port 1883');
});
