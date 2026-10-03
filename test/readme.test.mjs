import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseReadme, SECTIONS } from '../src/lib/readme.mjs';

const fixture = (path) => readFileSync(new URL(`./fixtures/${path}`, import.meta.url), 'utf8');
const parse = (markdown, source = 'test') => parseReadme(markdown, { source });

test('good README: title, pitch, every required section, and only content inside the markers', () => {
  const result = parse(fixture('projects/software-engineering-app/README.md'), 'fixture');

  assert.equal(result.title, 'Software Engineering course app');
  assert.equal(result.pitch, 'TODO: one-sentence pitch, what it does and for whom.');
  assert.equal(result.hasMarkers, true);
  assert.deepEqual(Object.keys(result.sections), [
    'problem', 'solution', 'technicalChallenges', 'whatILearned', 'stack',
  ]);
  assert.equal(result.sections.problem.heading, 'Problem');
  assert.equal(result.sections.problem.markdown, 'TODO');
  assert.deepEqual(result.sections.stack.items, ['TODO']);
  assert.doesNotMatch(JSON.stringify(result.sections), /Architecture|Running locally/);
  // The cover above the markers is not collected; images inside the markers are.
  assert.deepEqual(result.images, [{
    section: 'solution',
    src: 'docs/screenshots/screenshot-1.png',
    alt: 'TODO: describe this screenshot',
    path: 'docs/screenshots/screenshot-1.png',
  }]);
  assert.ok(result.warnings.every((warning) => warning.includes('still contains TODO')), result.warnings.join('\n'));
});

test('missing sections: warns for each missing required section and renders the rest', () => {
  const result = parse(fixture('readme/missing-sections.md'), 'missing');

  assert.deepEqual(Object.keys(result.sections), ['problem', 'stack']);
  assert.deepEqual(result.warnings, [
    '[missing] README.md: section "## Solution" is empty',
    '[missing] README.md: missing required section "## Solution"',
    '[missing] README.md: missing required section "## Technical challenges"',
    '[missing] README.md: missing required section "## What I learned"',
  ]);
});

test('unknown headings: warns and ignores them, matches known headings case-insensitively', () => {
  const result = parse(fixture('readme/unknown-headings.md'), 'unknown');

  assert.deepEqual(Object.keys(result.sections), [
    'problem', 'solution', 'technicalChallenges', 'whatILearned', 'stack',
  ]);
  assert.equal(result.sections.problem.markdown, 'Problem text.');
  assert.equal(result.sections.whatILearned.heading, 'What I learned');
  assert.deepEqual(result.sections.stack.items, ['Node.js', 'Express', 'SQLite']);
  assert.deepEqual(result.warnings, [
    '[unknown] README.md: content between <!-- portfolio:start --> and the first "##" heading is ignored',
    '[unknown] README.md: unknown section "## Motivation" inside the portfolio markers is ignored',
    '[unknown] README.md: duplicate section "## Problem" is ignored',
  ]);
});

test('no markers: keeps title and pitch, uses no sections, warns once', () => {
  const result = parse(fixture('readme/no-markers.md'), 'none');

  assert.equal(result.title, 'No markers');
  assert.equal(result.pitch, 'A README without the portfolio markers.');
  assert.equal(result.hasMarkers, false);
  assert.deepEqual(result.sections, {});
  assert.deepEqual(result.images, []);
  assert.deepEqual(result.warnings, [
    '[none] README.md: no <!-- portfolio:start --> / <!-- portfolio:end --> markers; no sections are used on the site',
  ]);
});

test('edge cases: setext title, GitHub alert before the pitch, markers inside code and HTML', () => {
  const result = parse(fixture('readme/edge-cases.md'), 'edge');

  assert.equal(result.title, 'Setext title');
  assert.equal(result.pitch, 'The real pitch, with a [link](https://example.com) over two lines.');
  assert.equal(result.hasMarkers, true);
  // The end marker inside the code block is ignored; the real one shares an HTML block with a <p>.
  assert.match(result.sections.problem.markdown, /## Not a section/);
  assert.equal(result.sections.solution.markdown, `<p align="center"><img src='/docs/root-relative.png' alt="Root-relative"></p>`);
  assert.deepEqual(result.sections.stack.items, ['Node.js & npm', 'Express']);
  assert.deepEqual(result.sections.inputOutput.blocks, [
    { lang: 'csv', code: 'date,shift' },
    { lang: 'text', code: 'Monday: 18:00' },
  ]);
  assert.deepEqual(result.references.diagram, { href: './docs/diagram.png', title: 'Diagram' });
});

test('edge cases: image collection resolves paths and skips code, comments and GitHub-only content', () => {
  const result = parse(fixture('readme/edge-cases.md'), 'edge');

  assert.deepEqual(result.images, [
    { section: 'problem', src: './docs/diagram.png', alt: 'Diagram', path: 'docs/diagram.png' },
    { section: 'problem', src: './docs/a%20b.png?raw=true', alt: 'Spaced', path: 'docs/a b.png' },
    { section: 'technicalChallenges', src: 'docs/no-alt.png', alt: '', path: 'docs/no-alt.png' },
    { section: 'technicalChallenges', src: 'https://img.shields.io/badge/x-y-blue.svg', alt: 'Badge', path: null },
    { section: 'solution', src: '/docs/root-relative.png', alt: 'Root-relative', path: 'docs/root-relative.png' },
  ]);
  assert.deepEqual(result.warnings, [
    '[edge] README.md: image "docs/no-alt.png" in "## Technical challenges" has no alt text',
    '[edge] README.md: image "../outside.png" in "## Technical challenges" points outside the repository and is ignored',
  ]);
});

test('a start marker without an end marker publishes nothing', () => {
  const result = parse('# T\n\n> Pitch.\n\n<!-- portfolio:start -->\n## Problem\n\nText.\n\n## Architecture\n\nPrivate.\n');
  assert.equal(result.hasMarkers, false);
  assert.deepEqual(result.sections, {});
  assert.deepEqual(result.warnings, [
    '[test] README.md: missing <!-- portfolio:end --> marker after the start marker; no sections are used on the site',
  ]);
});

test('an end marker without a start marker publishes nothing', () => {
  const result = parse('# T\n\n> Pitch.\n\n## Problem\n\nText.\n\n<!-- portfolio:end -->\n');
  assert.equal(result.hasMarkers, false);
  assert.deepEqual(result.warnings, [
    '[test] README.md: missing <!-- portfolio:start --> marker; no sections are used on the site',
  ]);
});

test('extra markers: uses the first start and the first end after it', () => {
  const result = parse([
    '# T', '', '> Pitch.', '',
    '<!-- portfolio:end -->', '',
    '<!--portfolio:START-->', '## Problem', '', 'Inside.', '',
    '<!-- portfolio:end -->', '',
    '## Solution', '', 'Outside.', '',
    '<!-- portfolio:end -->', '',
  ].join('\n'));
  assert.equal(result.hasMarkers, true);
  assert.deepEqual(Object.keys(result.sections), ['problem']);
  assert.equal(result.warnings[0], '[test] README.md: more than one start or end marker; using the first start marker and the first end marker after it');
});

test('missing title and pitch are reported', () => {
  const result = parse('Just text.\n\n<!-- portfolio:start -->\n<!-- portfolio:end -->\n');
  assert.equal(result.title, '');
  assert.equal(result.pitch, '');
  assert.ok(result.warnings.includes('[test] README.md: missing "# Title" heading'));
  assert.ok(result.warnings.includes('[test] README.md: missing pitch: add a "> one-sentence pitch" blockquote right after the title'));
});

test('the pitch must come before the first section heading', () => {
  const result = parse('# T\n\n## Problem\n\n> A quote inside a section.\n');
  assert.equal(result.pitch, '');
});

test('Input → Output must contain exactly two code blocks', () => {
  const markdown = '# T\n\n> P.\n\n<!-- portfolio:start -->\n## Input → Output\n\n```\nonly one\n```\n<!-- portfolio:end -->\n';
  const result = parse(markdown);
  assert.deepEqual(result.sections.inputOutput.blocks, [{ lang: '', code: 'only one' }]);
  assert.ok(result.warnings.includes(
    '[test] README.md: section "## Input → Output" should contain exactly two code blocks (input, then output); found 1',
  ));
});

test('a Stack section without items is reported', () => {
  const markdown = '# T\n\n> P.\n\n<!-- portfolio:start -->\n## Stack\n\n```\ncode\n```\n<!-- portfolio:end -->\n';
  const result = parse(markdown);
  assert.deepEqual(result.sections.stack.items, []);
  assert.ok(result.warnings.includes('[test] README.md: section "## Stack" should be a list of technologies (one per item)'));
});

test('Windows line endings are handled', () => {
  const markdown = '# T\r\n\r\n> Pitch.\r\n\r\n<!-- portfolio:start -->\r\n## Problem\r\n\r\nText.\r\n<!-- portfolio:end -->\r\n';
  const result = parse(markdown);
  assert.equal(result.title, 'T');
  assert.equal(result.sections.problem.markdown, 'Text.');
});

test('SECTIONS lists the headings of the README contract in display order', () => {
  assert.deepEqual(SECTIONS.map((section) => section.heading), [
    'Problem', 'Solution', 'Input → Output', 'Technical challenges', 'What I learned', 'Stack', 'Recognition',
  ]);
  assert.deepEqual(SECTIONS.filter((section) => !section.required).map((section) => section.key), ['inputOutput', 'recognition']);
});
