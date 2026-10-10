import { escapeHtml as e } from '../lib/html.mjs';

export const CATEGORY_LABELS = {
  university: 'University',
  school: 'School',
  personal: 'Personal',
  client: 'Freelance',
};
export const CATEGORIES = Object.keys(CATEGORY_LABELS);

const KIND_LABELS = { article: 'Article', contest: 'Competition', event: 'Event', award: 'Award' };
const TEXT_SECTIONS = [
  ['problem', 'Problem'],
  ['solution', 'Solution'],
  ['inputOutput', 'Input → Output'],
  ['challenges', 'Challenges'],
  ['whatILearned', 'What I learned'],
  ['stack', 'Stack'],
];

/** One row of the projects timeline: year, node and line, and the project card. `next` is the
 * category of the project below, which the line blends into. */
export function renderProject(project, { showYear, next }) {
  return `
<li class="row" id="project-${e(project.slug)}" data-category="${project.category}" data-year="${project.year}"${next ? ` data-next="${next}"` : ''}>
  <div class="year">${showYear ? project.year : ''}</div>
  <div class="graph" aria-hidden="true"><i class="line"></i><span class="node"></span></div>
  <details class="card">
    <summary class="card-head">
      <span class="meta"><b>${CATEGORY_LABELS[project.category]}</b>, ${e(capitalize(project.status))}</span>
      <h2>${e(project.title)}</h2>
      ${project.pitchHtml ? `<span class="pitch">${project.pitchHtml}</span>` : ''}
      ${renderBadges(project)}
      <span class="toggle"><span class="when-closed">Open project</span><span class="when-open">Close</span></span>
    </summary>
    <div class="detail">
      ${renderHead(project)}
      ${TEXT_SECTIONS.map(([key, heading]) => renderSection(project, key, heading)).join('')}
      ${renderPress(project)}
      ${renderScreenshots(project)}
      ${renderLinks(project)}
    </div>
  </details>
</li>`;
}

export function kindLabel(kind) {
  return KIND_LABELS[kind] ?? capitalize(kind);
}

export function formatDate(date) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00Z`));
}

/** The press title as a link, followed by "(Italian)" or another language name when `lang` is set. */
export function renderPressTitle(item) {
  const language = item.lang && item.lang !== 'en'
    ? new Intl.DisplayNames(['en'], { type: 'language' }).of(item.lang)
    : '';
  return `<a href="${e(item.url)}" target="_blank" rel="noopener">${e(item.title)}</a>${language ? ` <span class="lang">(${e(language)})</span>` : ''}`;
}

export function capitalize(text) {
  return text ? text[0].toUpperCase() + text.slice(1) : '';
}

function renderBadges(project) {
  const badges = [];
  if (project.press.some((item) => item.kind === 'award')) badges.push('<span class="badge award">Award</span>');
  if (project.press.length) {
    badges.push(`<span class="badge">${project.press.length} press ${project.press.length === 1 ? 'mention' : 'mentions'}</span>`);
  }
  return badges.length ? `<span class="badges">${badges.join('')}</span>` : '';
}

// Cover, facts, demo link and note.
function renderHead(project) {
  const facts = [
    ['Period', project.period],
    ['Role', capitalize(project.role)],
    ['Status', capitalize(project.status)],
    ['Course', project.course],
  ].filter(([, value]) => value);
  return `
      ${project.cover ? `<a class="cover-link" href="${e(project.cover.url)}" target="_blank" rel="noopener"><img class="cover" src="${e(project.cover.url)}" alt="${e(project.cover.alt)}" loading="lazy"></a>` : ''}
      <dl class="facts">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${e(value)}</dd></div>`).join('')}</dl>
      ${project.demo ? `<div class="links"><a class="btn" href="${e(project.demo)}" target="_blank" rel="noopener">Live demo</a></div>` : ''}
      ${project.note ? `<p class="note">${e(project.note)}</p>` : ''}`;
}

function renderSection(project, key, heading) {
  if (key === 'stack') {
    return project.stack.length
      ? `<h3>Stack</h3><ul class="stack">${project.stack.map((item) => `<li>${e(item)}</li>`).join('')}</ul>`
      : '';
  }
  if (key === 'inputOutput') {
    const blocks = project.inputOutput ?? [];
    if (!blocks.length) return '';
    const [input, output] = blocks;
    return `<h3>Input → Output</h3>
      <div class="io">
        <figure><figcaption>Input</figcaption><pre><code>${e(input.code)}</code></pre></figure>
        ${output ? `<span class="arrow" aria-hidden="true">⟶</span>
        <figure><figcaption>Output</figcaption><pre><code>${e(output.code)}</code></pre></figure>` : ''}
      </div>`;
  }
  const html = project.sections[key];
  return html ? `<h3>${heading}</h3>${html}` : '';
}

function renderScreenshots(project) {
  if (!project.screenshots.length) return '';
  return `<h3>Screenshots</h3>
      <div class="shots">${project.screenshots.map((shot) => `
        <a class="shot" href="${e(shot.url)}" target="_blank" rel="noopener"><img src="${e(shot.url)}" alt="${e(shot.alt)}" loading="lazy"></a>`).join('')}
      </div>`;
}

// The press items of portfolio.yml. A project without any shows the Recognition text of its README
// under the same heading; with press items that text would repeat them, so it is left out.
function renderPress(project) {
  if (!project.press.length) {
    return project.sections.recognition ? `<h3>Press &amp; recognition</h3>${project.sections.recognition}` : '';
  }
  return `<h3>Press &amp; recognition</h3>
      <ul class="press">${project.press.map((item) => `
        <li>${renderPressTitle(item)}<small>${[kindLabel(item.kind), e(item.source), item.date ? formatDate(item.date) : ''].filter(Boolean).join(', ')}</small></li>`).join('')}
      </ul>`;
}

function renderLinks(project) {
  const links = [
    project.readmeUrl
      ? `<a class="btn primary" href="${e(project.readmeUrl)}" target="_blank" rel="noopener">Read more on GitHub</a>`
      : '<span class="btn" aria-disabled="true">Code not public</span>',
    ...project.extraRepos.map((repo) => `<a class="btn" href="https://github.com/${e(repo)}" target="_blank" rel="noopener">${e(repo.split('/').pop())} on GitHub</a>`),
  ];
  return `<div class="links">${links.join('')}</div>`;
}
