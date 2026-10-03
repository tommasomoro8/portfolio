import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CORE_SCHEMA, load } from 'js-yaml';
import { parsePortfolioYml } from './lib/portfolio-yml.mjs';
import { parseReadme } from './lib/readme.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO = /^[\w.-]+\/[\w.-]+$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

class NotFoundError extends Error {}

/**
 * Refresh `data/snapshot/` from the projects listed in `portfolio.config.yml`.
 * A project that cannot be fetched keeps its previous snapshot entry and images; projects are
 * removed only when they are removed from the config. Throws only for an invalid config.
 * Returns `{ updated, kept, failed, removed, warnings }` (lists of project ids).
 */
export async function refreshSnapshot({
  configFile = join(ROOT, 'portfolio.config.yml'),
  localDir = join(ROOT, 'content/local'),
  snapshotDir = join(ROOT, 'data/snapshot'),
  fetch = globalThis.fetch,
  token = process.env.GITHUB_TOKEN,
} = {}) {
  const entries = parseConfig(await readFile(configFile, 'utf8'));
  const previous = await readSnapshot(snapshotDir);
  const result = { updated: [], kept: [], failed: [], removed: [], warnings: [] };
  const projects = [];
  const downloads = new Map();

  for (const entry of entries) {
    const before = previous.find((project) => project.id === entry.id);
    try {
      const read = entry.repo
        ? (path) => download(`https://raw.githubusercontent.com/${entry.repo}/HEAD/${encodePath(path)}`, { fetch, token })
        : (path) => readLocal(join(localDir, entry.local, path));
      const { project, files } = await loadProject(entry, read, result.warnings);
      projects.push(project);
      downloads.set(project.slug, files);
      result.updated.push(entry.id);
    } catch (error) {
      result.warnings.push(`[${entry.id}] could not be fetched (${error.message}); ${before ? 'keeping the previous snapshot' : 'not in the snapshot yet'}`);
      if (before) {
        projects.push({ ...before, extraRepos: entry.extraRepos });
        result.kept.push(entry.id);
      } else {
        result.failed.push(entry.id);
      }
    }
  }
  result.removed = previous.filter((project) => !entries.some((entry) => entry.id === project.id)).map((project) => project.id);

  await writeSnapshot(snapshotDir, projects, downloads);
  return result;
}

function parseConfig(text) {
  const config = load(text, { schema: CORE_SCHEMA });
  if (!Array.isArray(config?.projects)) throw new Error('portfolio.config.yml: "projects" must be a list');
  const entries = config.projects.map((item, index) => {
    const where = `portfolio.config.yml: projects[${index}]`;
    const extraRepos = item?.extra_repos ?? [];
    if (!Array.isArray(extraRepos) || !extraRepos.every((repo) => REPO.test(repo))) {
      throw new Error(`${where}: "extra_repos" must be a list of owner/name`);
    }
    if (typeof item?.repo === 'string' && REPO.test(item.repo)) return { id: item.repo, repo: item.repo, extraRepos };
    if (typeof item?.local === 'string' && SLUG.test(item.local)) return { id: `local:${item.local}`, local: item.local, extraRepos };
    throw new Error(`${where}: needs either "repo: owner/name" or "local: lowercase-slug"`);
  });
  const ids = entries.map((entry) => entry.id);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate) throw new Error(`portfolio.config.yml: "${duplicate}" is listed twice`);
  return entries;
}

async function loadProject(entry, read, warnings) {
  const readme = (await read('README.md')).toString('utf8');
  const portfolio = (await read('portfolio.yml')).toString('utf8');
  const yml = parsePortfolioYml(portfolio, { source: entry.id });
  if (!yml.data) throw new Error(yml.errors.join('; '));
  const parsed = parseReadme(readme, { source: entry.id });

  // Images the site can show: the cover, the screenshots and the images inside the markers.
  const paths = new Set([
    yml.data.cover,
    ...yml.data.screenshots.map((shot) => shot.src),
    ...parsed.images.map((image) => image.path).filter(Boolean),
  ]);
  const files = new Map();
  for (const path of paths) {
    try {
      files.set(path, await read(path));
    } catch (error) {
      // A missing image is skipped; any other failure (network, rate limit) fails the project.
      if (!(error instanceof NotFoundError)) throw error;
      warnings.push(`[${entry.id}] image "${path}" not found in the repository`);
    }
  }

  const project = {
    id: entry.id,
    repo: entry.repo ?? null,
    slug: yml.data.slug,
    extraRepos: entry.extraRepos,
    readme,
    portfolio,
  };
  return { project, files };
}

async function download(url, { fetch, token }) {
  let response = await fetch(url, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(30_000),
  });
  // A token without access to another repository can be refused; public files work without it.
  if (token && [401, 403, 404].includes(response.status)) {
    response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  }
  if (response.status === 404) throw new NotFoundError(`${url}: not found`);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function readLocal(file) {
  try {
    return await readFile(file);
  } catch (error) {
    if (error.code === 'ENOENT') throw new NotFoundError(`${file}: not found`);
    throw error;
  }
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function readSnapshot(snapshotDir) {
  const file = join(snapshotDir, 'projects.json');
  if (!existsSync(file)) return [];
  return JSON.parse(await readFile(file, 'utf8')).projects;
}

async function writeSnapshot(snapshotDir, projects, downloads) {
  const assetsDir = join(snapshotDir, 'assets');
  await mkdir(assetsDir, { recursive: true });

  // Replace the images of updated projects; kept projects keep theirs.
  for (const [slug, files] of downloads) {
    await rm(join(assetsDir, slug), { recursive: true, force: true });
    for (const [path, content] of files) {
      const target = join(assetsDir, slug, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
    }
  }
  // Remove images of projects that are no longer in the snapshot.
  const slugs = new Set(projects.map((project) => project.slug));
  for (const name of await readdir(assetsDir)) {
    if (!slugs.has(name)) await rm(join(assetsDir, name), { recursive: true, force: true });
  }

  const file = join(snapshotDir, 'projects.json');
  const json = `${JSON.stringify({ projects }, null, 2)}\n`;
  if (existsSync(file) && (await readFile(file, 'utf8')) === json) return;
  await writeFile(`${file}.tmp`, json);
  await rename(`${file}.tmp`, file);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await refreshSnapshot();
    for (const warning of result.warnings) console.warn(`warning: ${warning}`);
    const summary = ['updated', 'kept', 'failed', 'removed']
      .filter((key) => result[key].length)
      .map((key) => `${key}: ${result[key].join(', ')}`);
    console.log(`Snapshot refreshed. ${summary.join('; ') || 'No projects in the config.'}`);
  } catch (error) {
    console.error(`fetch failed: ${error.message}`);
    process.exitCode = 1;
  }
}
