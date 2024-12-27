import 'dotenv/config';

export const CONFIG = {
	env: process.env.ENV_PRODUCT,
	mqttHost: process.env.MQTT_HOST || '',
	mqttPort: Number(process.env.MQTT_PORT) || 1883,

	// redis
	redisHost: process.env.REDIS_HOST || '127.0.0.1',
	redisPort: Number(process.env.REDIS_PORT) || 6379,
	redisPassword: process.env.REDIS_PASSWORD || '',
	redisDB: Number(process.env.REDIS_DB) || 0,
};
