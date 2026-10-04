import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseReadme, SECTIONS } from '../src/lib/readme.mjs';

const fixture = (path) => readFileSync(new URL(`./fixtures/${path}`, import.meta.url), 'utf8');
const parse = (markdown, source = 'test') => parseReadme(markdown, { source });
const NO_SUMMARY = (source = 'test') =>
  `[${source}] README.md: no <!-- portfolio:summary --> block; the long text between the portfolio markers is used instead (add a short summary)`;

const summaryReadme = (summary, long = '## Problem\n\nLong problem text.\n') => `# Chess

A chess game for the browser.

![Game in progress](docs/screenshots/cover.png)

<!-- portfolio:summary
${summary}
-->

<!-- portfolio:start -->
${long}
<!-- portfolio:end -->

## Architecture

GitHub only.
`;

const FULL_SUMMARY = `## The problem
Short problem.

## The solution
Short solution with **bold**, *italic* and a [link](https://example.com).

## Technical challenges
- One challenge.
- Another one.

## What I learned
- One lesson.

## Stack
HTML, CSS, JavaScript (no libraries), Google Fonts`;

test('the text comes from the portfolio:summary block, not from the long version', () => {
  const result = parse(summaryReadme(FULL_SUMMARY));

  assert.equal(result.textSource, 'summary');
  assert.equal(result.title, 'Chess');
  assert.equal(result.pitch, 'A chess game for the browser.');
  assert.deepEqual(Object.keys(result.sections), ['problem', 'solution', 'technicalChallenges', 'whatILearned', 'stack']);
  assert.equal(result.sections.problem.heading, 'Problem');
  assert.equal(result.sections.problem.markdown, 'Short problem.');
  assert.equal(result.sections.technicalChallenges.markdown, '- One challenge.\n- Another one.');
  assert.deepEqual(result.sections.stack.items, ['HTML', 'CSS', 'JavaScript (no libraries)', 'Google Fonts']);
  assert.doesNotMatch(JSON.stringify(result.sections), /Long problem text|GitHub only/);
  assert.deepEqual(result.warnings, []);
});

test('summary headings match case-insensitively, in any order; unknown ones are ignored', () => {
  const result = parse(summaryReadme([
    'Intro text before any heading.',
    '## STACK', '- Node.js', '- SQLite', '',
    '## What I Learned', 'Lessons.', '',
    '## Motivation', 'Not a section.', '',
    '## the solution', 'Solution.', '',
    '## Recognition', 'A prize.', '',
    '## The Problem', 'Problem.', '',
    '## Technical challenges', 'Hard parts.',
  ].join('\n')));

  assert.equal(result.textSource, 'summary');
  assert.deepEqual(Object.keys(result.sections).sort(), ['problem', 'recognition', 'solution', 'stack', 'technicalChallenges', 'whatILearned']);
  assert.deepEqual(result.sections.stack.items, ['Node.js', 'SQLite']);
  assert.deepEqual(result.warnings, [
    '[test] README.md: content before the first "##" heading in the portfolio summary is ignored',
    '[test] README.md: unknown section "## Motivation" in the portfolio summary is ignored',
  ]);
});

test('missing required summary sections are reported; optional ones are fine', () => {
  const result = parse(summaryReadme('## The problem\nOnly this.'));
  assert.deepEqual(Object.keys(result.sections), ['problem']);
  assert.deepEqual(result.warnings, [
    '[test] README.md: missing required section "## Solution"',
    '[test] README.md: missing required section "## Technical challenges"',
    '[test] README.md: missing required section "## What I learned"',
    '[test] README.md: missing required section "## Stack"',
  ]);
});

test('images in the summary are reported (the build removes them)', () => {
  const result = parse(summaryReadme(`${FULL_SUMMARY}\n\n## Recognition\nA prize ![Medal](docs/medal.png) <img src="docs/x.png" alt="X">`));
  assert.deepEqual(result.warnings, [
    '[test] README.md: images in "## Recognition" are not shown; list screenshots in portfolio.yml instead',
  ]);
});

test('Windows line endings in the summary are handled', () => {
  const result = parse(summaryReadme(FULL_SUMMARY).replace(/\n/g, '\r\n'));
  assert.equal(result.textSource, 'summary');
  assert.equal(result.sections.problem.markdown, 'Short problem.');
  assert.deepEqual(result.sections.stack.items, ['HTML', 'CSS', 'JavaScript (no libraries)', 'Google Fonts']);
});

test('a one-line <!-- portfolio:summary --> comment is not a summary block', () => {
  const result = parse('# T\n\nPitch.\n\n<!-- portfolio:summary -->\n\n<!-- portfolio:start -->\n## Problem\n\nLong.\n<!-- portfolio:end -->\n');
  assert.equal(result.textSource, 'markers');
  assert.equal(result.warnings[0], NO_SUMMARY());
});

test('fixture project: the summary is used and only TODO warnings remain', () => {
  const result = parse(fixture('projects/software-engineering-app/README.md'), 'fixture');

  assert.equal(result.title, 'Software Engineering course app');
  assert.equal(result.pitch, 'TODO: one-sentence pitch, what it does and for whom.');
  assert.equal(result.textSource, 'summary');
  assert.deepEqual(Object.keys(result.sections), ['problem', 'solution', 'technicalChallenges', 'whatILearned', 'stack']);
  assert.equal(result.sections.problem.markdown, 'TODO: one or two sentences.');
  assert.deepEqual(result.sections.stack.items, ['TODO']);
  assert.doesNotMatch(JSON.stringify(result.sections), /Architecture|Running locally/);
  assert.ok(result.warnings.every((warning) => warning.includes('still contains TODO')), result.warnings.join('\n'));
});

// Without a summary block, the long text between the markers is used, as before.

test('fallback: no summary, the markers are used and the README is reported', () => {
  const result = parse(fixture('readme/missing-sections.md'), 'missing');

  assert.equal(result.textSource, 'markers');
  assert.deepEqual(Object.keys(result.sections), ['problem', 'stack']);
  assert.deepEqual(result.warnings, [
    NO_SUMMARY('missing'),
    '[missing] README.md: section "## Solution" is empty',
    '[missing] README.md: missing required section "## Solution"',
    '[missing] README.md: missing required section "## Technical challenges"',
    '[missing] README.md: missing required section "## What I learned"',
  ]);
});

test('fallback: unknown headings are ignored, known ones match case-insensitively', () => {
  const result = parse(fixture('readme/unknown-headings.md'), 'unknown');

  assert.deepEqual(Object.keys(result.sections), ['problem', 'solution', 'technicalChallenges', 'whatILearned', 'stack']);
  assert.equal(result.sections.problem.markdown, 'Problem text.');
  assert.equal(result.sections.whatILearned.heading, 'What I learned');
  assert.deepEqual(result.sections.stack.items, ['Node.js', 'Express', 'SQLite']);
  assert.deepEqual(result.warnings, [
    NO_SUMMARY('unknown'),
    '[unknown] README.md: content before the first "##" heading in the portfolio markers is ignored',
    '[unknown] README.md: unknown section "## Motivation" in the portfolio markers is ignored',
    '[unknown] README.md: duplicate section "## Problem" is ignored',
  ]);
});

test('no summary and no markers: keeps title and pitch, uses no sections', () => {
  const result = parse(fixture('readme/no-markers.md'), 'none');

  assert.equal(result.title, 'No markers');
  assert.equal(result.pitch, 'A README without the portfolio markers.');
  assert.equal(result.textSource, 'none');
  assert.deepEqual(result.sections, {});
  assert.deepEqual(result.warnings, [
    NO_SUMMARY('none'),
    '[none] README.md: no <!-- portfolio:start --> / <!-- portfolio:end --> markers; no sections are used on the site',
  ]);
});

test('fallback edge cases: setext title, GitHub alert before the pitch, markers inside code and HTML', () => {
  const result = parse(fixture('readme/edge-cases.md'), 'edge');

  assert.equal(result.title, 'Setext title');
  assert.equal(result.pitch, 'The real pitch, with a [link](https://example.com) over two lines.');
  assert.equal(result.textSource, 'markers');
  // The end marker inside the code block is ignored; the real one shares an HTML block with a <p>.
  assert.match(result.sections.problem.markdown, /## Not a section/);
  assert.equal(result.sections.solution.markdown, `<p align="center"><img src='/docs/root-relative.png' alt="Root-relative"></p>`);
  assert.deepEqual(result.sections.stack.items, ['Node.js & npm', 'Express']);
  assert.deepEqual(result.sections.inputOutput.blocks, [
    { lang: 'csv', code: 'date,shift' },
    { lang: 'text', code: 'Monday: 18:00' },
  ]);
  assert.deepEqual(result.references.diagram, { href: './docs/diagram.png', title: 'Diagram' });
  assert.deepEqual(result.warnings, [NO_SUMMARY('edge')]);
});

test('a start marker without an end marker publishes nothing', () => {
  const result = parse('# T\n\n> Pitch.\n\n<!-- portfolio:start -->\n## Problem\n\nText.\n\n## Architecture\n\nPrivate.\n');
  assert.equal(result.textSource, 'none');
  assert.deepEqual(result.sections, {});
  assert.deepEqual(result.warnings, [
    NO_SUMMARY(),
    '[test] README.md: missing <!-- portfolio:end --> marker after the start marker; no sections are used on the site',
  ]);
});

test('an end marker without a start marker publishes nothing', () => {
  const result = parse('# T\n\n> Pitch.\n\n## Problem\n\nText.\n\n<!-- portfolio:end -->\n');
  assert.equal(result.textSource, 'none');
  assert.deepEqual(result.warnings, [
    NO_SUMMARY(),
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
  assert.equal(result.textSource, 'markers');
  assert.deepEqual(Object.keys(result.sections), ['problem']);
  assert.equal(result.warnings[1], '[test] README.md: more than one start or end marker; using the first start marker and the first end marker after it');
});

test('marker warnings are not shown when there is a summary', () => {
  const result = parse('# T\n\nPitch.\n\n<!-- portfolio:summary\n## Problem\nP.\n## Solution\nS.\n## Technical challenges\nC.\n## What I learned\nL.\n## Stack\nX\n-->\n');
  assert.equal(result.textSource, 'summary');
  assert.deepEqual(result.warnings, []);
});

test('missing title and pitch are reported', () => {
  const result = parse('Just text.\n\n<!-- portfolio:start -->\n<!-- portfolio:end -->\n');
  assert.equal(result.title, '');
  assert.equal(result.pitch, '');
  assert.ok(result.warnings.includes('[test] README.md: missing "# Title" heading'));
  assert.ok(result.warnings.includes('[test] README.md: missing pitch: add a one-sentence paragraph or "> blockquote" right after the title'));
});

test('images above the markers are collected to find the cover alt text', () => {
  const markdown = [
    '# Chess', '',
    'A chess game for the browser.', '',
    '[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)', '',
    '![Game in progress](docs/screenshots/cover.png)', '',
    '<!-- portfolio:start -->',
    '## The problem', '', 'Problem text.', '',
    '<!-- portfolio:end -->', '',
  ].join('\n');
  const result = parse(markdown);
  assert.equal(result.pitch, 'A chess game for the browser.');
  assert.deepEqual(result.introImages, [
    { src: 'https://img.shields.io/badge/license-MIT-blue', alt: 'License: MIT', path: null },
    { src: 'docs/screenshots/cover.png', alt: 'Game in progress', path: 'docs/screenshots/cover.png' },
  ]);
});

test('a blockquote pitch wins over an earlier paragraph; images alone are never a pitch', () => {
  assert.equal(parse('# T\n\nIntro paragraph.\n\n> The pitch.\n').pitch, 'The pitch.');
  assert.equal(parse('# T\n\n![Cover](c.png)\n\nText pitch.\n').pitch, 'Text pitch.');
});

test('the pitch must come before the first section heading', () => {
  const result = parse('# T\n\n## Problem\n\n> A quote inside a section.\n');
  assert.equal(result.pitch, '');
});

test('Input → Output must contain exactly two code blocks', () => {
  const markdown = '# T\n\n> P.\n\n<!-- portfolio:summary\n## Input → Output\n\n```\nonly one\n```\n-->\n';
  const result = parse(markdown);
  assert.deepEqual(result.sections.inputOutput.blocks, [{ lang: '', code: 'only one' }]);
  assert.ok(result.warnings.includes(
    '[test] README.md: section "## Input → Output" should contain exactly two code blocks (input, then output); found 1',
  ));
});

test('a Stack section without items is reported', () => {
  const markdown = '# T\n\n> P.\n\n<!-- portfolio:summary\n## Stack\n\n```\ncode\n```\n-->\n';
  const result = parse(markdown);
  assert.deepEqual(result.sections.stack.items, []);
  assert.ok(result.warnings.includes('[test] README.md: section "## Stack" should be a list of technologies (one per item)'));
});

test('SECTIONS lists the sections in display order', () => {
  assert.deepEqual(SECTIONS.map((section) => section.heading), [
    'Problem', 'Solution', 'Input → Output', 'Technical challenges', 'What I learned', 'Stack', 'Recognition',
  ]);
  assert.deepEqual(SECTIONS.filter((section) => !section.required).map((section) => section.key), ['inputOutput', 'recognition']);
});
