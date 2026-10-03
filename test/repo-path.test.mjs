import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isExternalUrl, isHttpUrl, resolveRepoPath } from '../src/lib/repo-path.mjs';

test('resolveRepoPath normalizes paths relative to the repository root', () => {
  const cases = {
    'docs/cover.png': 'docs/cover.png',
    './docs/cover.png': 'docs/cover.png',
    '/docs/cover.png': 'docs/cover.png',
    'docs/./a/../cover.png': 'docs/cover.png',
    'docs/my%20cover.png': 'docs/my cover.png',
    'docs/cover.png?raw=true': 'docs/cover.png',
    'docs/cover.png#frag': 'docs/cover.png',
    'docs/100%.png': 'docs/100%.png',
  };
  for (const [input, expected] of Object.entries(cases)) assert.equal(resolveRepoPath(input), expected, input);
});

test('resolveRepoPath rejects empty targets, external URLs and paths outside the repository', () => {
  for (const input of ['', '  ', '.', '..', '../x.png', 'docs/../../x.png', 'https://example.com/x.png', '//cdn/x.png', 'data:image/png;base64,AA']) {
    assert.equal(resolveRepoPath(input), null, input);
  }
});

test('isExternalUrl and isHttpUrl', () => {
  assert.equal(isExternalUrl('https://example.com'), true);
  assert.equal(isExternalUrl('mailto:me@example.com'), true);
  assert.equal(isExternalUrl('//example.com/x'), true);
  assert.equal(isExternalUrl('docs/x.png'), false);
  assert.equal(isHttpUrl('https://example.com/a?b=c'), true);
  assert.equal(isHttpUrl('http://example.com'), true);
  assert.equal(isHttpUrl('ftp://example.com'), false);
  assert.equal(isHttpUrl('example.com'), false);
  assert.equal(isHttpUrl('https://'), false);
});
