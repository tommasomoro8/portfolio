import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CORE_SCHEMA, load } from 'js-yaml';
import { renderInline, renderSection } from './lib/markdown.mjs';
import { findDuplicateSlugs, parsePortfolioYml } from './lib/portfolio-yml.mjs';
import { parseReadme } from './lib/readme.mjs';
import { isExternalUrl, resolveRepoPath } from './lib/repo-path.mjs';
import { renderPage } from './templates/page.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Build the site into `outDir`. Works offline: reads only `contentDir`, `snapshotDir`
 * and the files in `src/` and `public/`. Returns `{ warnings, projects }`.
 */
export async function build({
  contentDir = join(ROOT, 'content'),
  snapshotDir = join(ROOT, 'data/snapshot'),
  outDir = join(ROOT, 'dist'),
} = {}) {
  const warnings = [];
  const profile = load(await readFile(join(contentDir, 'profile.yml'), 'utf8'), { schema: CORE_SCHEMA });
  const snapshot = await readSnapshot(snapshotDir);

  let projects = snapshot.projects
    .map((entry, order) => loadProject(entry, order, snapshotDir, warnings))
    .filter(Boolean);
  const duplicates = findDuplicateSlugs(projects.map(({ id, slug }) => ({ source: id, slug })));
  if (duplicates.length) {
    warnings.push(...duplicates.map((message) => `${message}; only the first is shown`));
    projects = projects.filter((project, index) => projects.findIndex((other) => other.slug === project.slug) === index);
  }
  projects.sort((a, b) => b.year - a.year || a.order - b.order);

  const html = renderPage({ profile, projects, press: collectPress(projects) });

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await cp(join(ROOT, 'public'), outDir, { recursive: true });
  await cp(join(ROOT, 'src/styles.css'), join(outDir, 'styles.css'));
  await cp(join(ROOT, 'src/main.js'), join(outDir, 'main.js'));
  for (const project of projects) {
    for (const path of project.assets) {
      const target = join(outDir, 'assets', project.slug, path);
      await mkdir(dirname(target), { recursive: true });
      await cp(join(snapshotDir, 'assets', project.slug, path), target);
    }
  }
  await writeFile(join(outDir, 'index.html'), html);
  return { warnings, projects };
}

async function readSnapshot(snapshotDir) {
  const file = join(snapshotDir, 'projects.json');
  if (!existsSync(file)) return { projects: [] };
  return JSON.parse(await readFile(file, 'utf8'));
}

function loadProject(entry, order, snapshotDir, warnings) {
  const source = entry.id;
  const yml = parsePortfolioYml(entry.portfolio, { source });
  const readme = parseReadme(entry.readme, { source });
  warnings.push(...yml.errors, ...yml.warnings, ...readme.warnings);
  if (!yml.data) {
    warnings.push(`[${source}] skipped: portfolio.yml is not valid`);
    return null;
  }

  const data = yml.data;
  const assets = new Set();
  // Returns the site URL of a downloaded image, or null (the image is then not shown).
  const image = (src) => {
    if (isExternalUrl(src)) {
      warnings.push(`[${source}] external image "${src}" is not shown (the site loads no third-party files)`);
      return null;
    }
    const path = resolveRepoPath(src);
    if (!path || !existsSync(join(snapshotDir, 'assets', data.slug, path))) {
      warnings.push(`[${source}] image "${src}" was not downloaded and is not shown`);
      return null;
    }
    assets.add(path);
    return `assets/${data.slug}/${encodeURI(path)}`;
  };
  const link = (href) => {
    if (href.startsWith('#') || isExternalUrl(href) || !entry.repo) return href;
    const path = resolveRepoPath(href);
    return path ? `https://github.com/${entry.repo}/blob/HEAD/${encodeURI(path)}` : href;
  };

  const sections = {};
  for (const [key, section] of Object.entries(readme.sections)) {
    sections[key] = renderSection(section.markdown, { references: readme.references, image, link });
  }

  const coverAlt = readme.introImages.find((img) => img.path === data.cover)?.alt;
  const screenshots = [
    { src: data.cover, alt: coverAlt || `${data.title}: cover image` },
    ...data.screenshots.filter((shot) => shot.src !== data.cover),
  ]
    .map((shot) => ({ url: image(shot.src), alt: shot.alt }))
    .filter((shot) => shot.url);

  return {
    id: entry.id,
    order,
    ...data,
    pitchHtml: renderInline(readme.pitch),
    sections,
    stack: readme.sections.stack?.items ?? [],
    inputOutput: readme.sections.inputOutput?.blocks ?? null,
    screenshots,
    press: data.press.map((item) => ({ ...item, projectYear: data.year })),
    codeUrl: entry.repo && data.code_public ? `https://github.com/${entry.repo}` : null,
    extraRepos: entry.extraRepos ?? [],
    assets,
  };
}

// Every press item of every project, newest first. Undated items are placed by their project's year.
function collectPress(projects) {
  return projects
    .flatMap((project) => project.press.map((item) => ({
      ...item,
      projectSlug: project.slug,
      projectTitle: project.title,
    })))
    .map((item) => ({ ...item, sortKey: item.date || String(item.projectYear) }))
    .sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { warnings, projects } = await build();
  for (const warning of warnings) console.warn(`warning: ${warning}`);
  console.log(`Built dist/ with ${projects.length} project${projects.length === 1 ? '' : 's'}.`);
}
