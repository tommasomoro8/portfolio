import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { CORE_SCHEMA, load } from 'js-yaml';
import { build } from '../src/build.mjs';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const profile = load(readFileSync(new URL('../content/profile.yml', import.meta.url), 'utf8'), { schema: CORE_SCHEMA });

const yml = (fields) => Object.entries({
  title: 'Project', slug: 'project', category: 'pers', year: 2024, period: '2024',
  status: 'completed', role: 'solo', cover: 'docs/cover.png', ...fields,
}).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n');

// The summary lists its sections out of order and contains an image, both handled by the build.
const SUMMARY = (title) => `<!-- portfolio:summary
## Stack
Node.js, SQLite

## The problem
Short problem of ${title}. ![Diagram](docs/diagram.png)

## The solution
Short solution with a [guide](docs/guide.md) and **bold**.

## Challenges
- Short challenge.

## What I learned
- Short lesson.

## Recognition
- Recognition of ${title}.
-->`;

const readme = (title, { summary = true, long = '', cover = 'docs/cover.png' } = {}) => `# ${title}

> Pitch of ${title}, with a [link](https://example.com).

![Cover of ${title}](${cover})

${summary ? SUMMARY(title) : ''}

<!-- portfolio:start -->
## Problem

Long problem of ${title}. ![Long diagram](docs/long.png) <img src="docs/tag.png" alt="Tag">

[![Linked screenshot](docs/long.png)](docs/long.png)

<!-- a comment in the long text -->

## Solution

Long solution.
${long}
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

const detailOf = (html, slug) => {
  const start = html.indexOf(`id="project-${slug}"`);
  return html.slice(start, html.indexOf('</details>', start));
};

test('builds the page from a snapshot', async (t) => {
  const { dir, snapshotDir, outDir } = setup([
    {
      id: 'owner/older', repo: 'owner/older', slug: 'older', extraRepos: ['owner/server'],
      readme: readme('Older'),
      portfolio: yml({
        title: 'Older', slug: 'older', category: 'scuola', year: 2021, status: 'completato',
        note: 'Not publicly testable', demo: 'https://example.com/demo',
        screenshots: [
          { path: 'docs/shot-b.png', alt: 'Second screen' },
          { path: 'docs/cover.png', alt: 'Cover alt from portfolio.yml' },
          { path: 'docs/shot-a.png', alt: 'First screen' },
          { path: 'docs/missing.png', alt: 'Not downloaded' },
        ],
        press: [
          { title: 'Articolo', source: 'Giornale', kind: 'articolo', date: '', url: 'https://example.com/a', lang: 'it' },
          { title: 'Prize', source: 'Jury', kind: 'award', date: '2021-05-01', url: 'https://example.com/b' },
        ],
      }),
    },
    {
      id: 'owner/newer', repo: 'owner/newer', slug: 'newer', extraRepos: [],
      readme: readme('Newer'),
      portfolio: yml({ title: 'Newer', slug: 'newer', category: 'uni', year: 2025, code_public: false, screenshots: [{ path: 'docs/cover.png', alt: 'Cover' }] }),
    },
    { id: 'owner/broken', repo: 'owner/broken', slug: 'broken', extraRepos: [], readme: readme('Broken'), portfolio: 'title: [' },
  ], ['older/docs/cover.png', 'older/docs/shot-a.png', 'older/docs/shot-b.png', 'older/docs/unused.png']);
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const { warnings, projects } = await build({ snapshotDir, outDir });
  const html = readFileSync(join(outDir, 'index.html'), 'utf8');
  const older = detailOf(html, 'older');

  // Newest first; the invalid project is skipped with a warning; old values are converted.
  assert.deepEqual(projects.map((project) => project.slug), ['newer', 'older']);
  assert.ok(warnings.some((warning) => warning.includes('[owner/broken] skipped')));
  assert.match(older, /<b>School<\/b>, Completed/);

  // Progressive enhancement: <details> cards; the one-at-a-time filter is shown only with JavaScript
  // (the "js" class is set before the first paint, so nothing shifts).
  assert.match(html, /<details class="card">\s*<summary class="card-head">/);
  assert.match(html, /<script>document\.documentElement\.classList\.add\('js'\)<\/script>/);
  assert.match(html, /<div class="lanes" role="group" aria-label="Show category">/);
  assert.match(html, /data-category="all" aria-pressed="true">All \(2\)<\/button>/);
  assert.match(html, /data-category="school" aria-pressed="false"><span class="sw"><\/span>School \(1\)<\/button>/);
  assert.match(html, /data-category="client" aria-pressed="false" disabled><span class="sw"><\/span>Freelance \(0\)<\/button>/);
  assert.doesNotMatch(html, /lanes-hint|site-footer/);

  // One timeline line: each row names the category of the next one, which its line blends into;
  // the last row names none, and its line fades out.
  assert.match(html, /id="project-newer" data-category="[a-z]+" data-year="\d+" data-next="school">/);
  assert.match(html, /id="project-older" data-category="school" data-year="\d+">/);
  assert.equal(html.match(/<i class="line"><\/i><span class="node"><\/span>/g).length, 2);

  // Header of the detail: cover with the alt text from portfolio.yml, facts, demo, note. Like the
  // screenshots, the cover links to its image, which main.js opens in the lightbox.
  assert.match(older, /<a class="cover-link" href="assets\/older\/docs\/cover\.png" target="_blank" rel="noopener"><img class="cover" src="assets\/older\/docs\/cover\.png" alt="Cover alt from portfolio\.yml" loading="lazy"><\/a>/);
  assert.match(older, /<dt>Period<\/dt><dd>2024<\/dd><\/div><div><dt>Role<\/dt><dd>Solo<\/dd><\/div><div><dt>Status<\/dt><dd>Completed<\/dd>/);
  assert.match(older, /<a class="btn" href="https:\/\/example\.com\/demo" target="_blank" rel="noopener">Live demo<\/a>/);
  assert.match(older, /<p class="note">Not publicly testable<\/p>/);

  // Text from the summary, in the fixed order, without images; the long version is not used.
  const order = ['>Problem<', '>Solution<', '>Challenges<', '>What I learned<', '>Stack<', '>Press &amp; recognition<', '>Screenshots<', 'Read more on GitHub']
    .map((marker) => older.indexOf(marker));
  assert.ok(order.every((index, i) => index > -1 && (i === 0 || index > order[i - 1])), `order: ${order}`);
  assert.match(older, /Short problem of Older\./);
  assert.match(older, /<strong>bold<\/strong>/);
  assert.match(older, /href="https:\/\/github\.com\/owner\/older\/blob\/HEAD\/docs\/guide\.md" target="_blank" rel="noopener">/);
  assert.match(older, /<ul class="stack"><li>Node\.js<\/li><li>SQLite<\/li><\/ul>/);
  assert.doesNotMatch(html, /Long problem|GitHub only|Diagram/);
  assert.doesNotMatch(html, /portfolio:summary|portfolio:start/);

  // One "Press & recognition" block per project: the press items, or, for a project without any,
  // the Recognition text of its README, which is not repeated next to the press items.
  assert.equal(older.match(/recognition<\/h3>/gi).length, 1);
  assert.doesNotMatch(older, /Recognition of Older/);
  assert.match(detailOf(html, 'newer'), /<h3>Press &amp; recognition<\/h3>\s*<ul>\s*<li>Recognition of Newer\.<\/li>/);

  // Gallery: listed order, without the cover (already in the header), only downloaded files.
  const shots = [...older.matchAll(/class="shot" href="([^"]+)" target="_blank" rel="noopener"><img src="[^"]+" alt="([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`);
  assert.deepEqual(shots, ['assets/older/docs/shot-b.png Second screen', 'assets/older/docs/shot-a.png First screen']);
  assert.ok(warnings.some((warning) => warning.includes('[owner/older] image "docs/missing.png" was not downloaded')));
  assert.ok(existsSync(join(outDir, 'assets/older/docs/shot-a.png')));
  assert.ok(!existsSync(join(outDir, 'assets/older/docs/unused.png')));

  // Every link that leaves the page opens in a new tab; in-page anchors and mailto: do not.
  for (const [tag, href] of html.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>/g)) {
    const samePage = href.startsWith('#') || href.startsWith('mailto:');
    assert.equal(/ target="_blank" rel="noopener"/.test(tag), !samePage, tag);
  }

  // Links: README on GitHub, or "Code not public"; extra repos.
  assert.match(older, /href="https:\/\/github\.com\/owner\/older#readme" target="_blank" rel="noopener">Read more on GitHub<\/a>/);
  assert.match(older, /href="https:\/\/github\.com\/owner\/server" target="_blank" rel="noopener">server on GitHub<\/a>/);
  assert.match(detailOf(html, 'newer'), /<span class="btn" aria-disabled="true">Code not public<\/span>/);

  // Press: newest first, undated items placed by project year, Italian marker, badges.
  const press = html.slice(html.indexOf('id="press"'));
  assert.ok(press.indexOf('Prize') < press.indexOf('Articolo'));
  assert.match(press, /Articolo<\/a> <span class="lang">\(Italian\)<\/span>/);
  assert.match(press, /<span class="d">2021 · date unknown<\/span>/);
  assert.match(press, /<span class="d">1 May 2021<\/span>/);
  assert.match(press, /<span class="p">Article, Giornale\. Project: <b>Older<\/b><\/span>/);
  assert.match(older, /<span class="badge award">Award<\/span><span class="badge">2 press mentions<\/span>/);

  // No third-party requests: every script, stylesheet and image is local.
  for (const [, url] of html.matchAll(/<(?:script|img)[^>]+src="([^"]+)"/g)) assert.doesNotMatch(url, /^(https?:)?\/\//);
  for (const [, url] of html.matchAll(/<link[^>]+href="([^"]+)"/g)) {
    if (!url.startsWith(profile.url)) assert.doesNotMatch(url, /^(https?:)?\/\//);
  }
  assert.ok(existsSync(join(outDir, 'styles.css')));
  assert.ok(existsSync(join(outDir, 'main.js')));
  // Their links carry a version, so a new deploy is never shown with the files of the old one.
  assert.match(html, /<link rel="stylesheet" href="styles\.css\?v=[0-9a-f]{8}">/);
  assert.match(html, /<script src="main\.js\?v=[0-9a-f]{8}" defer><\/script>/);
  assert.ok(existsSync(join(outDir, 'fonts/schibsted-grotesk.woff2')));
});

test('without a summary block, the long text is used without images and the project is reported', async (t) => {
  const { dir, snapshotDir, outDir } = setup([{
    id: 'owner/legacy', repo: 'owner/legacy', slug: 'legacy', extraRepos: [],
    readme: readme('Legacy', { summary: false }),
    portfolio: yml({ title: 'Legacy', slug: 'legacy', screenshots: [{ path: 'docs/cover.png', alt: 'Cover' }] }),
  }], ['legacy/docs/cover.png', 'legacy/docs/long.png', 'legacy/docs/tag.png']);
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const { warnings } = await build({ snapshotDir, outDir });
  const detail = detailOf(readFileSync(join(outDir, 'index.html'), 'utf8'), 'legacy');

  assert.match(detail, /Long problem of Legacy\./);
  assert.doesNotMatch(detail, /long\.png|tag\.png|Long diagram|a comment in the long text|<!--/);
  // No empty links or paragraphs are left where the images were.
  assert.doesNotMatch(detail, /<a\b[^>]*>\s*<\/a>|<p>\s*<\/p>/);
  assert.ok(warnings.includes('[owner/legacy] README.md: no <!-- portfolio:summary --> block; the long text between the portfolio markers is used instead (add a short summary)'));
});

test('without a screenshots list, the images in docs/screenshots/ are shown alphabetically', async (t) => {
  const { dir, snapshotDir, outDir } = setup([{
    id: 'owner/old', repo: 'owner/old', slug: 'old', extraRepos: [],
    readme: readme('Old', { cover: 'docs/screenshots/cover.png' }),
    portfolio: yml({ title: 'Old', slug: 'old', cover: 'docs/screenshots/cover.png' }),
  }], ['old/docs/screenshots/home.png', 'old/docs/screenshots/cover.png', 'old/docs/screenshots/about-page.jpg']);
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const { warnings } = await build({ snapshotDir, outDir });
  const detail = detailOf(readFileSync(join(outDir, 'index.html'), 'utf8'), 'old');

  // The cover (alt text from the README image) heads the detail and is not repeated in the gallery.
  assert.match(detail, /class="cover" src="assets\/old\/docs\/screenshots\/cover\.png" alt="Cover of Old"/);
  const shots = [...detail.matchAll(/<img src="([^"]+)" alt="([^"]+)" loading="lazy"><\/a>/g)].map((m) => `${m[1]} ${m[2]}`);
  assert.deepEqual(shots, [
    'assets/old/docs/screenshots/about-page.jpg about-page',
    'assets/old/docs/screenshots/home.png home',
  ]);
  assert.ok(warnings.includes('[owner/old] no "screenshots" in portfolio.yml; showing the images in docs/screenshots/'));
});

test('an empty screenshots list shows no gallery and does not fall back to docs/screenshots/', async (t) => {
  const { dir, snapshotDir, outDir } = setup([{
    id: 'owner/none', repo: 'owner/none', slug: 'none', extraRepos: [],
    readme: readme('None'),
    portfolio: yml({ title: 'None', slug: 'none', screenshots: [] }),
  }], ['none/docs/cover.png', 'none/docs/screenshots/home.png']);
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const { warnings } = await build({ snapshotDir, outDir });
  const detail = detailOf(readFileSync(join(outDir, 'index.html'), 'utf8'), 'none');

  assert.match(detail, /class="cover" src="assets\/none\/docs\/cover\.png" alt="Cover of None"/);
  assert.doesNotMatch(detail, />Screenshots<|home\.png/);
  assert.ok(!warnings.some((warning) => warning.includes('no "screenshots"')));
});

test('an empty snapshot still builds a complete page', async (t) => {
  const { dir, snapshotDir, outDir } = setup([]);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  await build({ snapshotDir, outDir });
  const html = readFileSync(join(outDir, 'index.html'), 'utf8');
  assert.match(html, /Projects are on their way\./);
  assert.doesNotMatch(html, /id="press"|class="lanes"/);
  for (const id of ['education', 'experience', 'other-experience', 'contact']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /<h2 id="cta-title">Curious about my work\?<br>Let&#39;s get in touch!<\/h2>/);
  assert.match(html, /href="mailto:moroxtommaso@gmail\.com\?subject=Hi%20Tommaso">Email me/);
  // Experience holds the IT work; the jobs outside programming follow under "Other experience".
  const [it, other] = html.split('id="other-experience"');
  assert.match(it, /<h2 id="experience-title">Experience<\/h2>[\s\S]*IT internship/);
  assert.doesNotMatch(it, /MediaWorld|The Space Cinema/);
  assert.match(other, /<h2 id="other-experience-title">Other experience<\/h2>\s*<p class="lead">Jobs outside programming/);
  assert.match(other, /MediaWorld[\s\S]*The Space Cinema/);
  assert.doesNotMatch(other, /IT internship/);
  // A school or company with a `url` is a link to its site; the others stay plain text.
  assert.match(html, /<span class="where"><a href="https:\/\/www\.unive\.it\/" target="_blank" rel="noopener">Ca&#39; Foscari University of Venice<span class="ext" aria-hidden="true">↗<\/span><\/a><\/span>/);
  assert.match(html, /<span class="where">MediaWorld, Treviso<\/span>/);
  // No section nav: the header holds only the name, the bio and the contacts.
  assert.doesNotMatch(html, /<nav\b/);
  // The 15-minute call is offered twice: with the header contacts and with the contact buttons.
  assert.match(html, /<a href="https:\/\/calendar\.app\.google\/[^"]+" target="_blank" rel="noopener">15-min call<span class="ext" aria-hidden="true">↗<\/span><\/a>/);
  assert.match(html, /<a class="btn" href="https:\/\/calendar\.app\.google\/[^"]+" target="_blank" rel="noopener">Book a 15-min call<\/a>/);
  assert.match(html, /<span class="d">Languages<\/span>\s*<div>\s*<h3>Native Italian, English B2<\/h3>/);
});

test('an experience entry links to its related project when that project is on the site', async (t) => {
  const { dir, snapshotDir, outDir } = setup([{
    id: 'owner/tsc', repo: 'owner/tsc', slug: 'thespacecinema-schedule', extraRepos: [], readme: readme('Schedule sheet'),
    portfolio: yml({ title: 'Schedule sheet', slug: 'thespacecinema-schedule' }),
  }]);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  await build({ snapshotDir, outDir });
  const html = readFileSync(join(outDir, 'index.html'), 'utf8');
  assert.match(html, /<li data-category="personal">\s*<span class="d">Mar 2024 – Jan 2025<\/span>/);
  assert.match(html, /<a class="tag" href="#project-thespacecinema-schedule">Related project: Schedule sheet<\/a>/);
});
