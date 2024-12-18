import 'dotenv/config';


export const CONFIG = {
	env: process.env.ENV_PRODUCT,
	host: process.env.SERVER_HOST || '',
	port: Number(process.env.SERVER_PORT) || 80,

	// redis
	redisHost: process.env.REDIS_HOST || '127.0.0.1',
	redisPort: Number(process.env.REDIS_PORT) || 6379,
	redisPassword: process.env.REDIS_PASSWORD || '',
	redisDB: Number(process.env.REDIS_DB) || 0,

};
