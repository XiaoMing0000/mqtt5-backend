/**
mqtt 通配符规则
1. 匹配一个或多个层级 #
	- 有效：# 通配符必须与 /# 结尾或 # 单独使用
	- 有效示例：#、sport/#、sport/tennis/#
		- sport/# 可以匹配: sport、sport/、sport/layer1、sport/layer1/layer_n...
	- 无效示例：sport/#/tennis、sport/tennis#、#/tennis

2. 匹配单层 +
	- 有效：+ 通配符必须与 /+ 结合或 # 单独使用
	- 有效示例：+、+/#、sport/+、sport/+/tennis/+、
		- sport/+ 可以匹配: sport/、sport/layer1；不匹配：sport、sport/layer1/layer2
	- 无效示例：sport+、sport/tennis#、#/tennis
 */

/**
 * 校验主题名是否有效
 * @param topic
 * @returns true 有效主题过滤器；false 无效主题过滤器
 */
export function verifyTopic(topic: string) {
	if (/[$#+]/.test(topic)) {
		if (topic === '+' || topic === '#') {
			return true;
		}
		if ((topic.includes('#') && /[^/]#$/.test(topic)) || topic.split('#').length > 2) {
			return false;
		}

		if (/[^/]\+|\+[^/]/.test(topic)) {
			return false;
		}

		if ((topic.includes('$') && !/^\$/.test(topic)) || topic.split('$').length > 2) {
			return false;
		}
	}
	return true;
}

/**
 * 格式化主题过滤器，如果主题过滤器包含通配符则将主题过滤器转化为正则表达式，否则返回原主题过滤器
 * @param topic
 * @returns false 表示无效主题；string 表示字符串主题；RegExp 表示具有统配符的主题订阅
 */
export function topicToRegEx(topic: string): string | false {
	if (!verifyTopic(topic)) {
		// 无效的主题过滤器
		return false;
	}
	if (/$|#|\+/.test(topic)) {
		if (topic === '#') {
			return `^.*`;
		}
		if (topic === '+') {
			return `^[^/]*$`;
		}

		let regStr = topic;
		regStr = regStr.replace('$', '\\$');
		regStr = regStr.replace('/#', '/?.*');
		regStr = regStr.replace(/\+/g, '[^/]*');
		return `^${regStr}$`;
	}
	return `^${topic}$`;
}

/**
 * 校验主题是否是通配符主题
 * @param topic
 * @returns
 */
export function isWildcardTopic(topic: string) {
	return /[#+]/.test(topic);
}
