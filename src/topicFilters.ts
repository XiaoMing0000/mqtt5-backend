const TOPIC_LEVEL_SEPARATOR = '/';
const MULTI_LEVEL_WILDCARD = '#';
const SINGLE_LEVEL_WILDCARD = '+';
// const BEGIN_DOLLAR_WILDCARD = '$';

/**
 * Returns whether the topic filter uses MQTT wildcards (`#` or `+`).
 *
 * @param topic - Topic filter to inspect.
 * @returns `true` if `#` or `+` appears in the filter.
 */
export function isWildcardTopic(topic: string) {
  return topic.includes('+') || topic.includes('#');
}

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
  // check #
  const multiIndex = topic.indexOf(MULTI_LEVEL_WILDCARD);
  if (multiIndex >= 0) {
    if (multiIndex !== topic.length - 1 || (topic[multiIndex - 1] !== TOPIC_LEVEL_SEPARATOR && topic[multiIndex - 1] !== undefined)) {
      return false;
    }
  }

  let singleIndex = topic.indexOf(SINGLE_LEVEL_WILDCARD);
  while (singleIndex >= 0) {
    if (
      (topic[singleIndex - 1] !== TOPIC_LEVEL_SEPARATOR && topic[singleIndex - 1] !== undefined) ||
      (topic[singleIndex + 1] !== TOPIC_LEVEL_SEPARATOR && topic[singleIndex + 1] !== undefined)
    ) {
      return false;
    }
    singleIndex = topic.indexOf(SINGLE_LEVEL_WILDCARD, singleIndex + 1);
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

export function matchTopic(testTopic: string, wildcardTopic: string): boolean {
  if (testTopic === wildcardTopic) {
    return true;
  }

  const testLevels = testTopic.split('/');
  const wildcardLevels = wildcardTopic.split('/');

  if (testLevels[0].charCodeAt(0) === 36 && wildcardTopic.charCodeAt(0) !== 36) {
    return false;
  }

  const testLength = testLevels.length;
  const wildcardLength = wildcardLevels.length;

  let ti = 0;

  for (let wi = 0; wi < wildcardLength; wi++) {
    const level = wildcardLevels[wi];

    if (level === '#') {
      return wi === wildcardLength - 1;
    }

    if (ti >= testLength) {
      return false;
    }

    if (level !== '+' && testLevels[ti] !== level) {
      return false;
    }

    ti++;
  }

  return ti === testLength;
}
