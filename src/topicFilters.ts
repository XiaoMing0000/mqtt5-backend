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
export function topicToRegEx(topic: string): string | false | RegExp {
	if (!verifyTopic(topic)) {
		// 无效的主题过滤器
		return false;
	}
	if (/$|#|\+/.test(topic)) {
		if (topic === '#') {
			return new RegExp(`.*`);
		}
		if (topic === '+') {
			return new RegExp(`^[^/]*$`);
		}

		let regStr = topic;
		regStr = regStr.replace('$', '\\$');
		regStr = regStr.replace('/#', '/?.*');
		regStr = regStr.replace(/\+/g, '[^/]*');
		return new RegExp(`^${regStr}$`);
	}
	return topic;
}
