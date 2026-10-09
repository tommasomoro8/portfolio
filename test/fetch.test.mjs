import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { refreshSnapshot } from '../src/fetch.mjs';

const RAW = 'https://raw.githubusercontent.com';
const API = 'https://api.github.com/repos';

const SHOTS = `screenshots:
  - path: docs/cover.png
    alt: Cover
  - path: docs/shot.png
    alt: Shot
`;

const yml = (slug, extra = SHOTS) => `title: ${slug}
slug: ${slug}
category: personal
year: 2024
period: "2024"
status: completed
role: Solo
cover: docs/cover.png
${extra}`;

const readme = (title) => `# ${title}

> Pitch.

<!-- portfolio:start -->
## Problem

Text ![Only in the README](docs/readme-only.png) ![Badge](https://img.shields.io/x.svg)
<!-- portfolio:end -->
`;

/** A fake fetch that serves `files` ({ url: string | Buffer }), 404s everything else, and records calls. */
function fakeFetch(files, { offline = [] } = {}) {
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push({ url, headers: options.headers ?? {} });
    if (offline.some((prefix) => url.startsWith(prefix))) throw new TypeError('fetch failed');
    if (!(url in files)) return new Response('Not Found', { status: 404 });
    return new Response(files[url], { status: 200 });
  };
  return { fetch, calls };
}

function repoFiles(repo, slug, { cover = 'cover-v1', shot = 'shot-v1' } = {}) {
  return {
    [`${RAW}/${repo}/HEAD/README.md`]: readme(slug),
    [`${RAW}/${repo}/HEAD/portfolio.yml`]: yml(slug),
    [`${RAW}/${repo}/HEAD/docs/cover.png`]: cover,
    [`${RAW}/${repo}/HEAD/docs/shot.png`]: shot,
  };
}

function setup(config) {
  const dir = mkdtempSync(join(tmpdir(), 'portfolio-fetch-'));
  const configFile = join(dir, 'portfolio.config.yml');
  writeFileSync(configFile, config);
  return { dir, configFile, snapshotDir: join(dir, 'snapshot'), localDir: join(dir, 'local'), token: '' };
}

// Every file under dir with its content, to compare snapshots byte for byte.
function tree(dir) {
  const files = {};
  const walk = (current) => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else files[relative(dir, path)] = readFileSync(path, 'utf8');
    }
  };
  if (existsSync(dir)) walk(dir);
  return files;
}

const snapshot = (snapshotDir) => JSON.parse(readFileSync(join(snapshotDir, 'projects.json'), 'utf8')).projects;

test('first fetch: stores README, portfolio.yml, the cover and the listed screenshots (not README images)', async (t) => {
  const env = setup('projects:\n  - repo: me/alpha\n    extra_repos: [me/server]\n');
  t.after(() => rmSync(env.dir, { recursive: true, force: true }));
  // The README's own image is available, but the site never shows it, so it is not downloaded.
  const { fetch, calls } = fakeFetch({ ...repoFiles('me/alpha', 'alpha'), [`${RAW}/me/alpha/HEAD/docs/readme-only.png`]: 'readme-only' });

  const result = await refreshSnapshot({ ...env, fetch });

  assert.deepEqual(result.updated, ['me/alpha']);
  assert.deepEqual(result.warnings, []);
  assert.ok(!calls.some((call) => call.url.endsWith('readme-only.png')));
  assert.deepEqual(snapshot(env.snapshotDir), [{
    id: 'me/alpha', repo: 'me/alpha', slug: 'alpha', extraRepos: ['me/server'],
    readme: readme('alpha'), portfolio: yml('alpha'),
  }]);
  assert.deepEqual(tree(join(env.snapshotDir, 'assets')), {
    'alpha/docs/cover.png': 'cover-v1',
    'alpha/docs/shot.png': 'shot-v1',
  });
});

test('a failing repo keeps its previous entry while the others update', async (t) => {
  const env = setup('projects:\n  - repo: me/alpha\n  - repo: me/beta\n');
  t.after(() => rmSync(env.dir, { recursive: true, force: true }));
  await refreshSnapshot({ ...env, fetch: fakeFetch({ ...repoFiles('me/alpha', 'alpha'), ...repoFiles('me/beta', 'beta') }).fetch });
  const before = snapshot(env.snapshotDir);

  // alpha is unreachable; beta has a new screenshot.
  const { fetch } = fakeFetch(repoFiles('me/beta', 'beta', { shot: 'shot-v2' }), { offline: [`${RAW}/me/alpha/`] });
  const result = await refreshSnapshot({ ...env, fetch });

  assert.deepEqual(result.kept, ['me/alpha']);
  assert.deepEqual(result.updated, ['me/beta']);
  assert.match(result.warnings[0], /^\[me\/alpha\] could not be fetched \(fetch failed\); keeping the previous snapshot$/);
  assert.deepEqual(snapshot(env.snapshotDir), before);
  assert.deepEqual(tree(join(env.snapshotDir, 'assets')), {
    'alpha/docs/cover.png': 'cover-v1',
    'alpha/docs/shot.png': 'shot-v1',
    'beta/docs/cover.png': 'cover-v1',
    'beta/docs/shot.png': 'shot-v2',
  });
});

test('a fully offline run leaves the snapshot byte-for-byte intact', async (t) => {
  const env = setup('projects:\n  - repo: me/alpha\n  - repo: me/beta\n');
  t.after(() => rmSync(env.dir, { recursive: true, force: true }));
  await refreshSnapshot({ ...env, fetch: fakeFetch({ ...repoFiles('me/alpha', 'alpha'), ...repoFiles('me/beta', 'beta') }).fetch });
  const before = tree(env.snapshotDir);

  const result = await refreshSnapshot({ ...env, fetch: fakeFetch({}, { offline: [RAW] }).fetch });

  assert.deepEqual(result.kept, ['me/alpha', 'me/beta']);
  assert.deepEqual(result.updated, []);
  assert.deepEqual(tree(env.snapshotDir), before);
});

test('an HTTP error such as a rate limit also keeps the previous entry', async (t) => {
  const env = setup('projects:\n  - repo: me/alpha\n');
  t.after(() => rmSync(env.dir, { recursive: true, force: true }));
  await refreshSnapshot({ ...env, fetch: fakeFetch(repoFiles('me/alpha', 'alpha')).fetch });
  const before = tree(env.snapshotDir);

  const fetch = async () => new Response('Too Many Requests', { status: 429 });
  const result = await refreshSnapshot({ ...env, fetch });

  assert.deepEqual(result.kept, ['me/alpha']);
  assert.match(result.warnings[0], /HTTP 429/);
  assert.deepEqual(tree(env.snapshotDir), before);
});

test('an invalid portfolio.yml keeps the previous entry; a new project that fails is not added', async (t) => {
  const env = setup('projects:\n  - repo: me/alpha\n');
  t.after(() => rmSync(env.dir, { recursive: true, force: true }));
  await refreshSnapshot({ ...env, fetch: fakeFetch(repoFiles('me/alpha', 'alpha')).fetch });
  const before = tree(env.snapshotDir);

  writeFileSync(env.configFile, 'projects:\n  - repo: me/alpha\n  - repo: me/new\n');
  const files = { ...repoFiles('me/alpha', 'alpha'), [`${RAW}/me/alpha/HEAD/portfolio.yml`]: yml('alpha').replace('personal', 'hobby') };
  const result = await refreshSnapshot({ ...env, fetch: fakeFetch(files).fetch });

  assert.deepEqual(result.kept, ['me/alpha']);
  assert.deepEqual(result.failed, ['me/new']);
  assert.match(result.warnings[0], /"category" must be one of/);
  assert.match(result.warnings[1], /^\[me\/new\] could not be fetched \(.*README\.md: not found\); not in the snapshot yet$/);
  assert.deepEqual(tree(env.snapshotDir), before);
});

test('a missing image is skipped with a warning and the project still updates', async (t) => {
  const env = setup('projects:\n  - repo: me/alpha\n');
  t.after(() => rmSync(env.dir, { recursive: true, force: true }));
  const files = repoFiles('me/alpha', 'alpha');
  delete files[`${RAW}/me/alpha/HEAD/docs/shot.png`];

  const result = await refreshSnapshot({ ...env, fetch: fakeFetch(files).fetch });

  assert.deepEqual(result.updated, ['me/alpha']);
  assert.deepEqual(result.warnings, ['[me/alpha] image "docs/shot.png" not found in the repository']);
  assert.deepEqual(Object.keys(tree(join(env.snapshotDir, 'assets'))), ['alpha/docs/cover.png']);
});

test('a project removed from the config is removed with its images', async (t) => {
  const env = setup('projects:\n  - repo: me/alpha\n  - repo: me/beta\n');
  t.after(() => rmSync(env.dir, { recursive: true, force: true }));
  const files = { ...repoFiles('me/alpha', 'alpha'), ...repoFiles('me/beta', 'beta') };
  await refreshSnapshot({ ...env, fetch: fakeFetch(files).fetch });

  writeFileSync(env.configFile, 'projects:\n  - repo: me/beta\n');
  const result = await refreshSnapshot({ ...env, fetch: fakeFetch(files).fetch });

  assert.deepEqual(result.removed, ['me/alpha']);
  assert.deepEqual(snapshot(env.snapshotDir).map((project) => project.id), ['me/beta']);
  assert.ok(!existsSync(join(env.snapshotDir, 'assets/alpha')));
});

test('a local entry is read from content/local/<slug>/', async (t) => {
  const env = setup('projects:\n  - local: crm\n');
  t.after(() => rmSync(env.dir, { recursive: true, force: true }));
  const files = { 'README.md': readme('crm'), 'portfolio.yml': yml('crm', 'code_public: false\n'), 'docs/cover.png': 'local-cover' };
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(env.localDir, 'crm', path)), { recursive: true });
    writeFileSync(join(env.localDir, 'crm', path), content);
  }
  const { fetch, calls } = fakeFetch({});

  const result = await refreshSnapshot({ ...env, fetch });

  assert.deepEqual(result.updated, ['local:crm']);
  assert.equal(calls.length, 0);
  assert.equal(snapshot(env.snapshotDir)[0].repo, null);
  assert.deepEqual(tree(join(env.snapshotDir, 'assets')), { 'crm/docs/cover.png': 'local-cover' });
});

test('GITHUB_TOKEN is sent when present and the request is retried without it if refused', async (t) => {
  const env = setup('projects:\n  - repo: me/alpha\n');
  t.after(() => rmSync(env.dir, { recursive: true, force: true }));
  const files = repoFiles('me/alpha', 'alpha');
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push(options.headers ?? {});
    if (options.headers?.authorization) return new Response('Forbidden', { status: 403 });
    return url in files ? new Response(files[url]) : new Response('', { status: 404 });
  };

  const result = await refreshSnapshot({ ...env, fetch, token: 'secret' });

  assert.deepEqual(result.updated, ['me/alpha']);
  assert.equal(calls[0].authorization, 'Bearer secret');
  assert.equal(calls[1].authorization, undefined);
});

test('an invalid config is an error and does not touch the snapshot', async (t) => {
  for (const config of ['projects: nope\n', 'projects:\n  - repo: not a repo\n', 'projects:\n  - repo: me/a\n  - repo: me/a\n']) {
    const env = setup(config);
    t.after(() => rmSync(env.dir, { recursive: true, force: true }));
    await assert.rejects(refreshSnapshot({ ...env, fetch: fakeFetch({}).fetch }), /portfolio\.config\.yml/);
    assert.ok(!existsSync(env.snapshotDir));
  }
});

test('without a screenshots list, the images in docs/screenshots/ are used in alphabetical order', async (t) => {
  const env = setup('projects:\n  - repo: me/alpha\n');
  t.after(() => rmSync(env.dir, { recursive: true, force: true }));
  const listing = [
    { name: 'b.png', type: 'file' },
    { name: 'a.jpg', type: 'file' },
    { name: 'notes.txt', type: 'file' },
    { name: 'old', type: 'dir' },
  ];
  const { fetch } = fakeFetch({
    [`${RAW}/me/alpha/HEAD/README.md`]: readme('alpha'),
    [`${RAW}/me/alpha/HEAD/portfolio.yml`]: yml('alpha', ''),
    [`${RAW}/me/alpha/HEAD/docs/cover.png`]: 'cover',
    [`${API}/me/alpha/contents/docs/screenshots`]: JSON.stringify(listing),
    [`${RAW}/me/alpha/HEAD/docs/screenshots/a.jpg`]: 'a',
    [`${RAW}/me/alpha/HEAD/docs/screenshots/b.png`]: 'b',
  });

  const result = await refreshSnapshot({ ...env, fetch });

  assert.deepEqual(result.updated, ['me/alpha']);
  assert.deepEqual(result.warnings, ['[me/alpha] no "screenshots" in portfolio.yml; using the images in docs/screenshots/ (add the list)']);
  assert.deepEqual(tree(join(env.snapshotDir, 'assets')), {
    'alpha/docs/cover.png': 'cover',
    'alpha/docs/screenshots/a.jpg': 'a',
    'alpha/docs/screenshots/b.png': 'b',
  });
});

test('files are read from the last commit, so a cached branch cannot serve an old version', async (t) => {
  const env = setup('projects:\n  - repo: me/alpha\n');
  t.after(() => rmSync(env.dir, { recursive: true, force: true }));
  const sha = 'a'.repeat(40);
  const stale = repoFiles('me/alpha', 'alpha', { cover: 'cover-old' });
  const current = Object.fromEntries(Object.entries(repoFiles('me/alpha', 'alpha', { cover: 'cover-new' })).map(([url, content]) => [url.replace('/HEAD/', `/${sha}/`), content]));
  const { fetch, calls } = fakeFetch({ ...stale, ...current, [`${API}/me/alpha/commits/HEAD`]: `${sha}\n` });

  const result = await refreshSnapshot({ ...env, fetch });

  assert.deepEqual(result.updated, ['me/alpha']);
  assert.equal(tree(join(env.snapshotDir, 'assets'))['alpha/docs/cover.png'], 'cover-new');
  assert.equal(calls.filter((call) => call.url.startsWith(API)).length, 1);
  assert.ok(!calls.some((call) => call.url.includes('/HEAD/')));
});

test('without a screenshots list or a docs/screenshots/ folder, only the cover is stored', async (t) => {
  const env = setup('projects:\n  - repo: me/alpha\n');
  t.after(() => rmSync(env.dir, { recursive: true, force: true }));
  const files = { ...repoFiles('me/alpha', 'alpha'), [`${RAW}/me/alpha/HEAD/portfolio.yml`]: yml('alpha', '') };

  const result = await refreshSnapshot({ ...env, fetch: fakeFetch(files).fetch });

  assert.deepEqual(result.updated, ['me/alpha']);
  assert.deepEqual(Object.keys(tree(join(env.snapshotDir, 'assets'))), ['alpha/docs/cover.png']);
});

test('a failing docs/screenshots/ listing fails the project like any other download', async (t) => {
  const env = setup('projects:\n  - repo: me/alpha\n');
  t.after(() => rmSync(env.dir, { recursive: true, force: true }));
  const files = { ...repoFiles('me/alpha', 'alpha'), [`${RAW}/me/alpha/HEAD/portfolio.yml`]: yml('alpha', '') };
  const { fetch: serve } = fakeFetch(files);
  const fetch = async (url, options) => (url.startsWith(API) ? new Response('Forbidden', { status: 500 }) : serve(url, options));

  const result = await refreshSnapshot({ ...env, fetch });

  assert.deepEqual(result.failed, ['me/alpha']);
  assert.match(result.warnings.at(-1), /contents\/docs\/screenshots: HTTP 500/);
});

test('a local entry without a screenshots list reads docs/screenshots/ from disk', async (t) => {
  const env = setup('projects:\n  - local: crm\n');
  t.after(() => rmSync(env.dir, { recursive: true, force: true }));
  const files = {
    'README.md': readme('crm'),
    'portfolio.yml': yml('crm', ''),
    'docs/cover.png': 'cover',
    'docs/screenshots/z.webp': 'z',
    'docs/screenshots/m.gif': 'm',
    'docs/screenshots/readme.md': 'not an image',
  };
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(env.localDir, 'crm', path)), { recursive: true });
    writeFileSync(join(env.localDir, 'crm', path), content);
  }

  await refreshSnapshot({ ...env, fetch: fakeFetch({}).fetch });

  assert.deepEqual(Object.keys(tree(join(env.snapshotDir, 'assets'))).sort(), [
    'crm/docs/cover.png', 'crm/docs/screenshots/m.gif', 'crm/docs/screenshots/z.webp',
  ]);
});
