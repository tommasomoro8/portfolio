import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hooksDir = fileURLToPath(new URL('../.githooks', import.meta.url));
const hook = join(hooksDir, 'commit-msg');

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'commit-msg-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runHook(message) {
  return withTempDir((dir) => {
    const file = join(dir, 'COMMIT_EDITMSG');
    writeFileSync(file, message);
    execFileSync(hook, [file]);
    return readFileSync(file, 'utf8');
  });
}

test('hook is executable', () => {
  assert.ok(statSync(hook).mode & 0o111, 'commit-msg must have the executable bit');
});

test('leaves an ordinary message unchanged', () => {
  const message = 'feat(build): parse README portfolio sections\n\nSplit the marked block by H2.\n';
  assert.equal(runHook(message), message);
});

test('removes the three attribution patterns and trims trailing blank lines', () => {
  const message = [
    'chore: set up project',
    '',
    'Body line.',
    '',
    'Co-Authored-By: Claude Opus <noreply@anthropic.com>',
    '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
    'Claude-Session: https://example.com/session',
    '',
    '',
  ].join('\n');
  assert.equal(runHook(message), 'chore: set up project\n\nBody line.\n');
});

test('matching is case-insensitive', () => {
  const message = [
    'fix: something',
    '',
    'co-authored-by: CLAUDE <x@example.com>',
    'GENERATED WITH claude code',
    'claude-SESSION: abc',
    '',
  ].join('\n');
  assert.equal(runHook(message), 'fix: something\n');
});

test('keeps co-author trailers that are not attribution lines', () => {
  const message = 'docs: update README\n\nCo-Authored-By: Jane Doe <jane@example.com>\n';
  assert.equal(runHook(message), message);
});

test('handles CRLF line endings and a missing final newline', () => {
  const message = 'fix: crlf\r\n\r\nCo-Authored-By: Claude <x@example.com>\r\n\r\n';
  assert.equal(runHook(message), 'fix: crlf\r\n');
  assert.equal(runHook('fix: no newline'), 'fix: no newline\n');
});

test('strips attribution from a real commit when core.hooksPath points to .githooks', () => {
  withTempDir((dir) => {
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    };
    const git = (...args) =>
      execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd: dir, env, encoding: 'utf8' });

    git('init', '--quiet');
    git('config', 'core.hooksPath', hooksDir);
    git(
      'commit',
      '--quiet',
      '--allow-empty',
      '-m', 'test: hook check',
      '-m', 'Co-Authored-By: Claude <noreply@anthropic.com>\nClaude-Session: https://example.com/s',
    );
    assert.equal(git('log', '-1', '--format=%B').trimEnd(), 'test: hook check');
  });
});
