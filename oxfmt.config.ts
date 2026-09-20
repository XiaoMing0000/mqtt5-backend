import { defineConfig } from 'oxfmt';
import type { OxfmtConfig } from 'oxfmt';

// 文档: https://oxc.rs/docs/guide/usage/formatter.html

export default defineConfig({
  printWidth: 150, // 每行最大字符数
  useTabs: false, // 是否使用制表符
  tabWidth: 2, // 缩进空格数
  semi: true, // 语句末尾是否加分号
  singleQuote: true, // 是否使用单引号
  quoteProps: 'as-needed', // 对象的键是否使用引号
  bracketSpacing: true, // 对象字面量括号内空格
  trailingComma: 'all', // 是否使用尾逗号
  sortPackageJson: false, // 是否排序 package.json 文件
  endOfLine: 'lf', // 换行符
  insertFinalNewline: true, // 是否在文件末尾插入换行符
  ignorePatterns: ['node_modules', 'dist', 'logs', 'pnpm-lock.json', 'coverage'],
} satisfies OxfmtConfig);
