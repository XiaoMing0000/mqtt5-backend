/**
 * MQTT topic filter wildcard rules (summary).
 *
 * **Multi-level `#`**
 * - Valid: `#` must be a whole segment — either the entire filter is `#`, or the filter ends with `/#`.
 * - Valid examples: `#`, `sport/#`, `sport/tennis/#`. For instance, `sport/#` matches `sport`, `sport/`, `sport/layer1`, and deeper paths under `sport/`.
 * - Invalid examples: `sport/#/tennis`, `sport/tennis#`, `#/tennis`.
 *
 * **Single-level `+`**
 * - Valid: `+` must be a whole topic level — alone as `+`, or as `/+` within the path.
 * - Valid examples: `+`, `+/#`, `sport/+`, `sport/+/tennis/+`. For instance, `sport/+` matches one segment after `sport/` (e.g. `sport/layer1`) but not `sport` alone or `sport/a/b`.
 * - Invalid examples: `sport+`, `sport/tennis#`, `#/tennis`.
 */

/**
 * Validates whether a string is a legal MQTT topic filter (wildcards `#`, `+`, and `$` placement).
 *
 * @param topic - Topic filter to validate.
 * @returns `true` if the filter is valid; `false` otherwise.
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
 * Converts a topic filter to an anchored regex pattern string, or rejects invalid filters.
 * Filters without `#`/`+` become a literal match pattern.
 *
 * @param topic - Topic filter to convert.
 * @returns `false` if the filter is invalid; otherwise a pattern string for matching (e.g. passed to `RegExp`).
 */
export function topicToRegEx(topic: string): string | false {
	if (!verifyTopic(topic)) {
		// Invalid topic filter
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
 * Returns whether the topic filter uses MQTT wildcards (`#` or `+`).
 *
 * @param topic - Topic filter to inspect.
 * @returns `true` if `#` or `+` appears in the filter.
 */
export function isWildcardTopic(topic: string) {
	return /[#+]/.test(topic);
}
