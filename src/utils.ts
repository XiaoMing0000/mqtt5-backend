import crypto from 'crypto';

/**
 * 生成 MQTT 客户端标识符,格式为 mqtt_XXXX-XXXX-XXXX-XXXX-XXXX,其中 XXXX 为 16 进制字符串
 * 客户端标识符使用 uuid 的形式避免冲突
 * @returns string
 */
export function generateClientIdentifier() {
	return 'mqtt_' + crypto.randomUUID().replace(/-/g, '');
}
