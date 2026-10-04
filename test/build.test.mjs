import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { build } from '../src/build.mjs';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

const yml = (fields) => Object.entries({
  title: 'Project', slug: 'project', category: 'personal', year: 2024, period: '2024',
  status: 'completed', role: 'Solo', cover: 'docs/cover.png', ...fields,
}).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n');

const readme = (title, body = '') => `# ${title}

> Pitch of ${title}, with a [link](https://example.com).

![Cover of ${title}](docs/cover.png)

<!-- portfolio:start -->
## Problem

Problem of ${title}. ![Diagram](docs/diagram.png) ![Badge](https://img.shields.io/x.svg)

See [the docs](docs/guide.md).

## Solution

Solution text.

## Technical challenges

Challenges text.

## What I learned

Learned text.

## Stack

- Node.js
- SQLite
${body}
<!-- portfolio:end -->

## Architecture

GitHub only.
`;

function setup(projects, assets = []) {
  const dir = mkdtempSync(join(tmpdir(), 'portfolio-build-'));
  const snapshotDir = join(dir, 'snapshot');
  for (const path of assets) {
    mkdirSync(dirname(join(snapshotDir, 'assets', path)), { recursive: true });
    writeFileSync(join(snapshotDir, 'assets', path), PNG);
  }
  mkdirSync(snapshotDir, { recursive: true });
  writeFileSync(join(snapshotDir, 'projects.json'), JSON.stringify({ projects }));
  return { dir, snapshotDir, outDir: join(dir, 'dist') };
}

test('builds the page from a snapshot', async (t) => {
  const { dir, snapshotDir, outDir } = setup([
    {
      id: 'owner/older', repo: 'owner/older', extraRepos: ['owner/server'],
      readme: readme('Older', '\n## Input → Output\n\n```csv\na,b\n```\n\n```text\nresult\n```'),
      portfolio: yml({
        title: 'Older', slug: 'older', category: 'school', year: 2021, note: 'Not publicly testable',
        press: [
          { title: 'Articolo', source: 'Giornale', kind: 'article', date: '', url: 'https://example.com/a', lang: 'it' },
          { title: 'Prize', source: 'Jury', kind: 'award', date: '2021-05-01', url: 'https://example.com/b' },
        ],
      }),
    },
    {
      id: 'owner/newer', repo: 'owner/newer', extraRepos: [],
      readme: readme('Newer'),
      portfolio: yml({ title: 'Newer', slug: 'newer', year: 2025, code_public: false, demo: 'https://example.com/demo' }),
    },
    { id: 'owner/broken', repo: 'owner/broken', extraRepos: [], readme: readme('Broken'), portfolio: 'title: [' },
  ], ['older/docs/cover.png', 'older/docs/diagram.png', 'older/docs/unused.png']);
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const { warnings, projects } = await build({ snapshotDir, outDir });
  const html = readFileSync(join(outDir, 'index.html'), 'utf8');

  // Newest first; the invalid project is skipped with a warning.
  assert.deepEqual(projects.map((project) => project.slug), ['newer', 'older']);
  assert.ok(html.indexOf('id="project-newer"') < html.indexOf('id="project-older"'));
  assert.ok(warnings.some((warning) => warning.includes('[owner/broken] skipped')));

  // Progressive enhancement: content is in <details>, filters are hidden until JavaScript runs.
  assert.match(html, /<details>\s*<summary>/);
  assert.match(html, /<div class="filters" role="group" aria-label="Filter projects by category" hidden>/);
  assert.match(html, /aria-pressed="true"/);

  // README content: sections, GitHub-only parts excluded, relative links point to GitHub.
  assert.match(html, /Problem of Older/);
  assert.doesNotMatch(html, /GitHub only/);
  assert.match(html, /href="https:\/\/github\.com\/owner\/older\/blob\/HEAD\/docs\/guide\.md"/);
  assert.match(html, /<figcaption>Input<\/figcaption><pre><code>a,b<\/code><\/pre>/);
  assert.match(html, /<ul class="chips"><li>Node\.js<\/li><li>SQLite<\/li><\/ul>/);
  assert.match(html, /<p class="note">Not publicly testable<\/p>/);

  // Images: downloaded ones are copied and shown, external and missing ones are dropped.
  assert.match(html, /<img src="assets\/older\/docs\/diagram\.png" alt="Diagram" loading="lazy">/);
  assert.match(html, /<img src="assets\/older\/docs\/cover\.png" alt="Cover of Older" loading="lazy">/);
  assert.doesNotMatch(html, /img\.shields\.io/);
  assert.ok(existsSync(join(outDir, 'assets/older/docs/cover.png')));
  assert.ok(!existsSync(join(outDir, 'assets/older/docs/unused.png')));
  assert.ok(warnings.some((warning) => warning.includes('external image "https://img.shields.io/x.svg" is not shown')));
  assert.ok(warnings.some((warning) => warning.includes('[owner/newer] image "docs/cover.png" was not downloaded')));

  // Buttons.
  assert.match(html, /<span class="button disabled">Code not public<\/span><a class="button" href="https:\/\/example\.com\/demo">Live demo<\/a>/);
  assert.match(html, /href="https:\/\/github\.com\/owner\/older">Code &amp; README on GitHub/);
  assert.match(html, /href="https:\/\/github\.com\/owner\/server">server on GitHub/);

  // Press: newest first, undated items placed by project year, Italian marker, award badge.
  const press = html.slice(html.indexOf('id="press"'));
  assert.ok(press.indexOf('Prize') < press.indexOf('Articolo'));
  assert.match(press, /Articolo<\/a> <span class="muted">\(Italian\)<\/span>/);
  assert.match(press, /2021 · date unknown/);
  assert.match(press, /1 May 2021/);
  assert.match(html, /<span class="badge">2 press items<\/span><span class="badge">Award<\/span>/);

  // No third-party requests: every script, stylesheet and image is local.
  for (const [, url] of html.matchAll(/<(?:script|img)[^>]+src="([^"]+)"/g)) assert.doesNotMatch(url, /^(https?:)?\/\//);
  for (const [, url] of html.matchAll(/<link[^>]+href="([^"]+)"/g)) {
    if (!url.startsWith('https://tommasomoro8.github.io/')) assert.doesNotMatch(url, /^(https?:)?\/\//);
  }
  assert.ok(existsSync(join(outDir, 'styles.css')));
  assert.ok(existsSync(join(outDir, 'main.js')));
  assert.ok(existsSync(join(outDir, 'fonts/schibsted-grotesk.woff2')));
});

test('an empty snapshot still builds a complete page', async (t) => {
  const { dir, snapshotDir, outDir } = setup([]);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  await build({ snapshotDir, outDir });
  const html = readFileSync(join(outDir, 'index.html'), 'utf8');
  assert.match(html, /Projects are on their way\./);
  assert.doesNotMatch(html, /id="press"/);
  for (const id of ['education', 'experience', 'contact']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /href="mailto:moroxtommaso@gmail\.com\?subject=Hi%20Tommaso">Email me/);
});

test('an experience entry links to its related project when that project is on the site', async (t) => {
  const { dir, snapshotDir, outDir } = setup([{
    id: 'owner/tsc', repo: 'owner/tsc', extraRepos: [], readme: readme('Schedule sheet'),
    portfolio: yml({ title: 'Schedule sheet', slug: 'thespacecinema-schedule' }),
  }]);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  await build({ snapshotDir, outDir });
  const html = readFileSync(join(outDir, 'index.html'), 'utf8');
  assert.match(html, /<a class="tag" href="#project-thespacecinema-schedule">Related project: Schedule sheet<\/a>/);
});
