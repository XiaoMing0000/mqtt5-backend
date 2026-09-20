import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractMessage, validateCommitMessage, validateHeader } from './check-commit-msg.js';

describe('extractMessage', () => {
  it('strips BOM, comments and scissors section', () => {
    const raw = '\uFEFFfeat: ok\n# comment\n# ------------------------ >8 ------------------------\ndiff --git a/x\n';
    assert.equal(extractMessage(raw), 'feat: ok');
  });
});

describe('validateHeader', () => {
  it('accepts valid headers', () => {
    assert.deepEqual(validateHeader('feat: 新增登录'), []);
    assert.deepEqual(validateHeader('fix(api): 修复分页'), []);
    assert.deepEqual(validateHeader('feat!: 移除 v1'), []);
  });

  it('rejects uppercase type', () => {
    const errors = validateHeader('Feat: 新增登录');
    assert.ok(errors.some((e) => e.includes('小写')));
  });

  it('rejects missing colon space and empty description', () => {
    assert.ok(validateHeader('feat:ok').length > 0);
    assert.ok(validateHeader('feat: ').some((e) => e.includes('description')));
  });

  it('rejects empty or padded scope', () => {
    assert.ok(validateHeader('feat(): x').some((e) => e.includes('scope')));
    assert.ok(validateHeader('feat( api ): x').some((e) => e.includes('scope')));
  });

  it('rejects unknown type', () => {
    assert.ok(validateHeader('wip: temp').some((e) => e.includes('不在允许列表')));
  });
});

describe('validateCommitMessage', () => {
  it('accepts single-line conventional commits', () => {
    assert.deepEqual(validateCommitMessage('chore: 更新依赖'), []);
  });

  it('skips auto-generated git commits', () => {
    assert.deepEqual(validateCommitMessage("Merge branch 'main' into feature"), []);
    assert.deepEqual(validateCommitMessage('Revert "feat: 新增登录"'), []);
  });

  it('requires blank line before body', () => {
    const errors = validateCommitMessage('feat: 标题\n正文没有空行');
    assert.ok(errors.some((e) => e.includes('空一行')));
  });

  it('accepts body with blank line', () => {
    assert.deepEqual(validateCommitMessage('feat: 标题\n\n这里是正文说明'), []);
  });

  it('validates BREAKING CHANGE footer', () => {
    const ok = validateCommitMessage('feat!: 破坏性变更\n\nBREAKING CHANGE: 旧接口已移除');
    assert.deepEqual(ok, []);

    const badCase = validateCommitMessage('feat: x\n\nbreaking change: 说明');
    assert.ok(badCase.some((e) => e.includes('BREAKING CHANGE')));

    const empty = validateCommitMessage('feat: x\n\nBREAKING CHANGE:   ');
    assert.ok(empty.some((e) => e.includes('必须包含说明')));
  });

  it('rejects empty message', () => {
    assert.deepEqual(validateCommitMessage(''), ['提交信息不能为空']);
  });
});
