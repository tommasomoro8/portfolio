import { escapeHtml as e } from '../lib/html.mjs';

export const CATEGORY_LABELS = {
  university: 'University',
  school: 'School',
  personal: 'Personal',
  client: 'Client work',
};

const SECTION_ORDER_BEFORE_IO = [['problem', 'Problem'], ['solution', 'Solution']];
const SECTION_ORDER_AFTER_IO = [['technicalChallenges', 'Technical challenges'], ['whatILearned', 'What I learned']];

/** One row of the projects timeline. `lanes` are the categories drawn as graph lanes. */
export function renderProject(project, { lanes, showYear }) {
  return `
<li class="project" id="project-${e(project.slug)}" data-category="${project.category}" data-year="${project.year}">
  <span class="year${showYear ? '' : ' is-repeat'}">${project.year}</span>
  <span class="lanes" aria-hidden="true">${lanes.map((lane) => `<span class="lane${lane === project.category ? ' is-active' : ''}" data-category="${lane}"></span>`).join('')}</span>
  <details>
    <summary>
      <span class="meta"><span class="cat">${CATEGORY_LABELS[project.category]}</span><span>${e(capitalize(project.status))}</span></span>
      <h3 class="title">${e(project.title)}</h3>
      ${project.pitchHtml ? `<span class="pitch">${project.pitchHtml}</span>` : ''}
      ${renderBadges(project)}
      <span class="toggle"><span class="when-closed">Open project</span><span class="when-open">Close project</span></span>
    </summary>
    <div class="detail">
      ${renderFacts(project)}
      ${SECTION_ORDER_BEFORE_IO.map(([key, heading]) => renderSection(project, key, heading)).join('')}
      ${renderInputOutput(project)}
      ${project.note ? `<p class="note">${e(project.note)}</p>` : ''}
      ${SECTION_ORDER_AFTER_IO.map(([key, heading]) => renderSection(project, key, heading)).join('')}
      ${project.stack.length ? `<h4>Stack</h4><ul class="chips">${project.stack.map((item) => `<li>${e(item)}</li>`).join('')}</ul>` : ''}
      ${renderScreenshots(project)}
      ${renderSection(project, 'recognition', 'Recognition')}
      ${renderProjectPress(project)}
      ${renderActions(project)}
    </div>
  </details>
</li>`;
}

export function formatPressDate(item) {
  if (!item.date) return `${item.projectYear} · date unknown`;
  const date = new Date(`${item.date}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

/** The press title followed by "(Italian)" or another language name when `lang` is set. */
export function renderPressTitle(item) {
  const language = item.lang && item.lang !== 'en'
    ? new Intl.DisplayNames(['en'], { type: 'language' }).of(item.lang)
    : '';
  return `<a class="press-title" href="${e(item.url)}">${e(item.title)}</a>${language ? ` <span class="muted">(${e(language)})</span>` : ''}`;
}

export function capitalize(text) {
  return text ? text[0].toUpperCase() + text.slice(1) : '';
}

function renderBadges(project) {
  const badges = [];
  if (project.press.length) {
    badges.push(`${project.press.length} press ${project.press.length === 1 ? 'item' : 'items'}`);
  }
  if (project.press.some((item) => item.kind === 'award')) badges.push('Award');
  if (!badges.length) return '';
  return `<span class="badges">${badges.map((badge) => `<span class="badge">${badge}</span>`).join('')}</span>`;
}

function renderFacts(project) {
  const facts = [
    ['Period', project.period],
    ['Status', capitalize(project.status)],
    ['Role', capitalize(project.role)],
    ['Course', project.course],
  ].filter(([, value]) => value);
  return `<dl class="facts">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${e(value)}</dd></div>`).join('')}</dl>`;
}

function renderSection(project, key, heading) {
  const html = project.sections[key];
  return html ? `<h4>${heading}</h4>${html}` : '';
}

function renderInputOutput(project) {
  const blocks = project.inputOutput;
  if (!blocks?.length) return '';
  const labels = ['Input', 'Output'];
  return `<h4>Input → Output</h4><div class="io">${blocks.slice(0, 2).map((block, index) => `
    <figure><figcaption>${labels[index]}</figcaption><pre><code>${e(block.code)}</code></pre></figure>`).join('')}</div>`;
}

function renderScreenshots(project) {
  if (!project.screenshots.length) return '';
  return `<h4>Screenshots</h4><ul class="shots">${project.screenshots.map((shot) => `
    <li><a href="${e(shot.url)}"><img src="${e(shot.url)}" alt="${e(shot.alt)}" loading="lazy"></a></li>`).join('')}</ul>`;
}

function renderProjectPress(project) {
  if (!project.press.length) return '';
  return `<h4>Press &amp; recognition</h4><ul class="press-list compact">${project.press.map((item) => `
    <li>${renderPressTitle(item)}<span class="small-meta">${e(item.source)} · ${capitalize(item.kind)} · ${formatPressDate(item)}</span></li>`).join('')}</ul>`;
}

function renderActions(project) {
  const actions = [];
  if (project.codeUrl) actions.push(`<a class="button primary" href="${e(project.codeUrl)}">Code &amp; README on GitHub</a>`);
  else actions.push('<span class="button disabled">Code not public</span>');
  if (project.demo) actions.push(`<a class="button" href="${e(project.demo)}">Live demo</a>`);
  for (const repo of project.extraRepos) actions.push(`<a class="button" href="https://github.com/${e(repo)}">${e(repo.split('/').pop())} on GitHub</a>`);
  return `<p class="actions">${actions.join('')}</p>`;
}
