import { escapeHtml as e } from '../lib/html.mjs';
import { CATEGORIES, CATEGORY_LABELS, formatDate, kindLabel, renderPressTitle, renderProject } from './project.mjs';

// Marks a header contact, a school or a company that opens another site.
const EXTERNAL = '<span class="ext" aria-hidden="true">↗</span>';

/** The whole single page. */
export function renderPage({ profile, projects, press, assets }) {
  const hasPress = press.length > 0;
  const intros = profile.intros ?? {};
  const url = profile.url ?? '';
  const title = `${profile.name} — Portfolio`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light only">
<title>${e(title)}</title>
<meta name="description" content="${e(profile.bio)}">
${url ? `<link rel="canonical" href="${e(url)}">` : ''}
<meta property="og:type" content="website">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(profile.bio)}">
${url ? `<meta property="og:url" content="${e(url)}">
<meta property="og:image" content="${e(new URL('og.png', url).href)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${e(profile.name)}: projects, press, education and experience">
<meta name="twitter:card" content="summary_large_image">` : ''}
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="preload" href="fonts/schibsted-grotesk.woff2" as="font" type="font/woff2" crossorigin>
<script>document.documentElement.classList.add('js')</script>
<link rel="stylesheet" href="${assets['styles.css']}">
<script src="${assets['main.js']}" defer></script>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<div class="wrap">
  <header class="site-header">
    <h1>${e(profile.name)}</h1>
    <p class="bio">${e(profile.bio)}</p>
    <div class="contacts">
      <a href="mailto:${e(profile.email)}">${e(profile.email)}</a>
      ${profile.github ? `<a href="${e(profile.github)}" target="_blank" rel="noopener">GitHub${EXTERNAL}</a>` : ''}
      ${profile.linkedin ? `<a href="${e(profile.linkedin)}" target="_blank" rel="noopener">LinkedIn${EXTERNAL}</a>` : ''}
      ${profile.call ? `<a href="${e(profile.call)}" target="_blank" rel="noopener">15-min call${EXTERNAL}</a>` : ''}
    </div>
  </header>

  <main id="main">
${renderProjects(projects)}
${hasPress ? renderPress(press, intros.press) : ''}
${renderEntries('education', 'Education', profile.education ?? [], projects, intros.education)}
${renderEntries('experience', 'Experience', profile.experience ?? [], projects, intros.experience)}
${profile.other_experience?.length ? renderEntries('other-experience', 'Other experience', profile.other_experience, projects, intros.other_experience) : ''}
${renderContact(profile)}
  </main>
</div>
</body>
</html>
`;
}

function renderProjects(projects) {
  if (!projects.length) {
    return `<section id="projects" aria-label="Projects">
  <p class="empty">Projects are on their way.</p>
</section>`;
  }
  const count = (category) => projects.filter((project) => project.category === category).length;
  let previousYear = null;
  const rows = projects.map((project, index) => {
    const showYear = project.year !== previousYear;
    previousYear = project.year;
    return renderProject(project, { showYear, next: projects[index + 1]?.category });
  });
  // The filter needs JavaScript: the CSS shows it only when <html> has the "js" class, set by an
  // inline script before the first paint, so the page does not shift when main.js runs.
  return `<section id="projects" aria-label="Projects">
  <div class="lanes" role="group" aria-label="Show category">
    <button type="button" class="lane-btn all" data-category="all" aria-pressed="true">All (${projects.length})</button>
    ${CATEGORIES.map((category) => `<button type="button" class="lane-btn" data-category="${category}" aria-pressed="false"${count(category) ? '' : ' disabled'}><span class="sw"></span>${CATEGORY_LABELS[category]} (${count(category)})</button>`).join('\n    ')}
  </div>
  <ol class="timeline" aria-label="Projects">${rows.join('')}
  </ol>
</section>`;
}

function renderPress(press, intro) {
  return `<section class="block" id="press" aria-labelledby="press-title">
  <h2 id="press-title">Press &amp; recognition</h2>
  ${intro ? `<p class="lead">${e(intro)}</p>` : ''}
  <ul class="rlist">${press.map((item) => `
    <li data-category="${item.projectCategory}">
      <span class="d">${item.date ? formatDate(item.date) : `${item.projectYear} · date unknown`}</span>
      <span>${renderPressTitle(item)}
        <span class="p">${kindLabel(item.kind)}, ${e(item.source)}. Project: <b>${e(item.projectTitle)}</b></span></span>
    </li>`).join('')}
  </ul>
</section>`;
}

// Education and experience. An entry without a period (such as Languages) shows its title in the
// date column and its text as the heading.
function renderEntries(id, heading, entries, projects, intro) {
  return `<section class="block cv" id="${id}" aria-labelledby="${id}-title">
  <h2 id="${id}-title">${heading}</h2>
  ${intro ? `<p class="lead">${e(intro)}</p>` : ''}
  <ul class="rlist">${entries.map((entry) => {
    const related = entry.related_project && projects.find((project) => project.slug === entry.related_project);
    return `
    <li${related ? ` data-category="${related.category}"` : ''}>
      <span class="d">${e(entry.period || entry.title)}</span>
      <div>
        <h3>${e(entry.period ? entry.title : entry.text.replace(/\.$/, ''))}</h3>
        ${entry.org ? `<span class="where">${entry.url ? `<a href="${e(entry.url)}" target="_blank" rel="noopener">${e(entry.org)}${EXTERNAL}</a>` : e(entry.org)}</span>` : ''}
        ${entry.period && entry.text ? `<p>${e(entry.text)}</p>` : ''}
        ${related ? `<a class="tag" href="#project-${e(related.slug)}">Related project: ${e(related.title)}</a>` : ''}
      </div>
    </li>`;
  }).join('')}
  </ul>
</section>`;
}

function renderContact(profile) {
  const cta = profile.cta ?? {};
  return `<section class="cta" id="contact" aria-labelledby="cta-title">
  <h2 id="cta-title">${e(cta.heading).replace(/\n/g, '<br>')}</h2>
  <p>${e(cta.text)}</p>
  <div class="row-btn">
    <a class="btn primary" href="mailto:${e(profile.email)}?subject=${encodeURIComponent('Hi Tommaso')}">Email me</a>
    ${profile.linkedin ? `<a class="btn" href="${e(profile.linkedin)}" target="_blank" rel="noopener">Connect on LinkedIn</a>` : ''}
    ${profile.call ? `<a class="btn" href="${e(profile.call)}" target="_blank" rel="noopener">Book a 15-min call</a>` : ''}
  </div>
</section>`;
}
