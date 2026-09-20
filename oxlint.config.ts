import { defineConfig } from 'oxlint';
import type { OxlintConfig } from 'oxlint';

// 文档: https://oxc.rs/docs/guide/usage/linter.html

export default defineConfig({
  plugins: ['eslint', 'typescript'],
  ignorePatterns: ['dist', 'node_modules', 'coverage', '**/*min.js', 'examples/test.ts'],
  categories: {
    correctness: 'warn',
  },
  rules: {
    'prefer-const': 'error', // 从未重新赋值的 let 应改为 const
    'typescript/no-explicit-any': 'off', // 关闭类型为 any 报错
    'no-unused-expressions': 'off', // 关闭未使用表达式报错
    'import/no-cycle': 'error', // 循环引入报错
    'no-unused-vars': [
      'error', // 将变量未引用设置为 warn
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      },
    ],
  },
} satisfies OxlintConfig);
