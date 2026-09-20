/**
 * Git commit-msg 钩子：校验提交信息是否符合 Conventional Commits 1.0.0。
 * @see https://www.conventionalcommits.org/en/v1.0.0/#specification
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/**
 * @commitlint/config-conventional（Angular 约定）推荐的 type，规范本身允许扩展。
 * feat：新增功能（对应 SemVer MINOR），示例：feat: 新增用户登录
 * fix：修复代码库中的错误（对应 SemVer PATCH），示例：fix: 修复分页偏移错误
 * docs：仅文档变更，示例：docs: 补充环境变量说明
 * style：纯格式调整，不影响代码含义，示例：style: 统一使用单引号
 * refactor：重构，既非修 bug 也非加功能，示例：refactor: 抽取校验逻辑到独立函数
 * perf：性能优化，示例：perf: 缓存重复的正则编译
 * test：新增或修正测试，示例：test: 补充提交信息校验用例
 * build：构建系统或外部依赖，示例：build: 升级 esbuild 到 0.28
 * ci：CI/CD 配置或脚本，示例：ci: 推送前增加 lint 检查
 * chore：杂项维护，通常不改 src 或测试，示例：chore: 更新 .gitignore
 * revert：回滚某次提交，示例：revert: 回滚 feat: 新增用户登录
 */
export const ALLOWED_TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'];

/** Git 自动生成的提交，跳过校验 */
const AUTO_GENERATED_RE = /^(Merge |Revert |fixup! |squash! )/i;

/** <type>[optional scope][optional !]: <description>；type 必须小写 */
const HEADER_RE = /^(?<type>[a-z]+)(?:\((?<scope>[^()\r\n]*)\))?(?<breaking>!)?: (?<description>.*)$/;

const SCISSORS_RE = /^# -+ >8 -+$/m;
const BREAKING_FOOTER_RE = /^(BREAKING CHANGE|BREAKING-CHANGE): (.+)$/;
const GENERIC_FOOTER_RE = /^[A-Za-z0-9-]+(?:: | #)(.+)$/;

function colorEnabled() {
  return Boolean(process.stderr.isTTY) && process.env.NO_COLOR !== '1';
}

function red(text) {
  return colorEnabled() ? `\x1b[31m${text}\x1b[0m` : text;
}

function bold(text) {
  return colorEnabled() ? `\x1b[1m${text}\x1b[0m` : text;
}

function dim(text) {
  return colorEnabled() ? `\x1b[2m${text}\x1b[0m` : text;
}

/**
 * 去掉 Git 编辑模板中的注释与 scissors 之后的内容。
 * @param {string} raw
 */
export function extractMessage(raw) {
  let text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const scissors = text.search(SCISSORS_RE);
  if (scissors !== -1) {
    text = text.slice(0, scissors);
  }

  return text
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .join('\n')
    .trim();
}

/**
 * @param {string} header
 * @returns {string[]}
 */
export function validateHeader(header) {
  const errors = [];
  const match = header.match(HEADER_RE);

  if (!match?.groups) {
    if (!header.includes(':')) {
      errors.push('标题缺少冒号，格式应为 <type>[optional scope][optional !]: <description>');
      return errors;
    }
    if (/^[A-Z]/.test(header)) {
      errors.push('type 必须使用小写，例如 feat: 而非 Feat:');
    }
    if (/:($|[^ ])/.test(header)) {
      errors.push('type/scope 之后必须是冒号加空格（": "），例如 feat: 新增登录');
    }
    errors.push('首行必须为：<type>[optional scope][optional !]: <description>');
    return errors;
  }

  const { type, scope, description } = match.groups;

  if (!ALLOWED_TYPES.includes(type)) {
    errors.push(`type「${type}」不在允许列表中：${ALLOWED_TYPES.join(', ')}`);
  }

  if (scope !== undefined && scope.trim() === '') {
    errors.push('scope 不能为空，正确示例：feat(api): 新增限流');
  } else if (scope !== undefined && scope !== scope.trim()) {
    errors.push('scope 两侧不能有空格，正确示例：fix(parser): 修复空格解析');
  }

  if (description.trim() === '') {
    errors.push('description 不能为空');
  }

  return errors;
}

/**
 * 按规范第 8–10、12、16 条识别页脚起始行。
 * @param {string} line
 */
function isFooterLine(line) {
  return BREAKING_FOOTER_RE.test(line) || GENERIC_FOOTER_RE.test(line);
}

/**
 * @param {string[]} lines 标题之后的全部行（含可能的空行）
 * @returns {string[]}
 */
export function validateBodyAndFooters(lines) {
  const errors = [];

  if (lines.length === 0) {
    return errors;
  }

  if (lines[0] !== '') {
    errors.push('正文或页脚必须与标题空一行（规范第 6、8 条）');
    return errors;
  }

  const content = lines.slice(1);
  while (content.length > 0 && content[0] === '') {
    content.shift();
  }

  if (content.length === 0) {
    return errors;
  }

  for (const line of content) {
    if (/^breaking[ -]change\s*:/i.test(line) && !BREAKING_FOOTER_RE.test(line)) {
      errors.push('破坏性变更页脚必须为「BREAKING CHANGE: <description>」（BREAKING CHANGE 必须大写，冒号后有空格）');
    }
  }

  let footerStart = -1;
  for (let i = 0; i < content.length; i += 1) {
    if (isFooterLine(content[i]) && (i === 0 || content[i - 1] === '')) {
      footerStart = i;
      break;
    }
  }

  if (footerStart === -1) {
    return errors;
  }

  const footerLines = content.slice(footerStart);
  for (let i = 0; i < footerLines.length; i += 1) {
    const line = footerLines[i];
    if (line === '') {
      continue;
    }
    if (isFooterLine(line)) {
      const breaking = line.match(BREAKING_FOOTER_RE);
      if (breaking && breaking[2].trim() === '') {
        errors.push('BREAKING CHANGE 页脚必须包含说明');
      }
      continue;
    }

    let previous = '';
    for (let j = i - 1; j >= 0; j -= 1) {
      if (footerLines[j] !== '') {
        previous = footerLines[j];
        break;
      }
    }
    if (!previous || !isFooterLine(previous)) {
      errors.push(`无法识别的页脚「${line}」。页脚格式为 Token: value 或 Token #value（Token 中的空格需写成 -）`);
    }
  }

  return errors;
}

/**
 * @param {string} message
 * @returns {string[]}
 */
export function validateCommitMessage(message) {
  if (message === '') {
    return ['提交信息不能为空'];
  }

  if (AUTO_GENERATED_RE.test(message)) {
    return [];
  }

  const lines = message.split('\n');
  const header = lines[0] ?? '';
  return [...validateHeader(header), ...validateBodyAndFooters(lines.slice(1))];
}

function printFailure(errors) {
  const usage = [
    '',
    red(bold('提交信息不符合 Conventional Commits 规范，已中止提交。')),
    '',
    bold('错误：'),
    ...errors.map((error) => `  - ${error}`),
    '',
    bold('格式：'),
    '  <type>[optional scope][optional !]: <description>',
    '',
    '  [optional body]',
    '',
    '  [optional footer(s)]',
    '',
    bold('示例：'),
    '  feat: 新增用户登录',
    '  fix(api): 修复分页偏移错误',
    '  feat!: 移除已废弃的 v1 接口',
    '',
    '  BREAKING CHANGE: /v1 接口已移除，请改用 /v2',
    '',
    bold('允许的 type（小写）：'),
    `  ${ALLOWED_TYPES.join(', ')}`,
    '',
    dim('规范：https://www.conventionalcommits.org/en/v1.0.0/#specification'),
    '',
  ];

  process.stderr.write(`${usage.join('\n')}\n`);
}

export function main(argv = process.argv) {
  const file = argv[2];
  if (!file) {
    process.stderr.write('用法: node scripts/check-commit-msg.js <commit-msg-file>\n');
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(file)) {
    process.stderr.write(`${red('找不到提交信息文件：')}${file}\n`);
    process.exitCode = 1;
    return;
  }

  const message = extractMessage(fs.readFileSync(file, 'utf8'));
  const errors = validateCommitMessage(message);
  if (errors.length > 0) {
    printFailure(errors);
    process.exitCode = 1;
  }
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main();
}
