import { escapeHtml as e } from '../lib/html.mjs';
import { CATEGORY_LABELS, capitalize, formatPressDate, renderPressTitle, renderProject } from './project.mjs';

/** The whole single page. */
export function renderPage({ profile, projects, press }) {
  const hasPress = press.length > 0;
  const nav = [
    ['projects', 'Projects'],
    hasPress && ['press', 'Press & recognition'],
    ['education', 'Education'],
    ['experience', 'Experience'],
    ['contact', 'Contact'],
  ].filter(Boolean);
  const url = profile.url ?? '';
  const title = `${profile.name} · Projects`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)}</title>
<meta name="description" content="${e(profile.bio)}">
<meta name="color-scheme" content="light dark">
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
<link rel="stylesheet" href="styles.css">
<script src="main.js" defer></script>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header wrap">
  <h1>${e(profile.name)}</h1>
  <p class="bio">${e(profile.bio)}</p>
  <ul class="contacts">
    <li><a href="mailto:${e(profile.email)}">${e(profile.email)}</a></li>
    ${profile.github ? `<li><a href="${e(profile.github)}">GitHub</a></li>` : ''}
    ${profile.linkedin ? `<li><a href="${e(profile.linkedin)}">LinkedIn</a></li>` : ''}
  </ul>
  <nav class="nav" aria-label="Sections">
    <ul>${nav.map(([id, label]) => `<li><a href="#${id}">${e(label)}</a></li>`).join('')}</ul>
  </nav>
</header>
<main id="main" class="wrap">
${renderProjects(projects)}
${hasPress ? renderPress(press) : ''}
${renderEntries('education', 'Education', profile.education ?? [], projects)}
${renderEntries('experience', 'Experience', profile.experience ?? [], projects)}
${renderContact(profile)}
</main>
<footer class="site-footer wrap">
  <p>Each project has a README on GitHub with the same content plus technical details.</p>
</footer>
</body>
</html>
`;
}

function renderProjects(projects) {
  const lanes = Object.keys(CATEGORY_LABELS).filter((category) => projects.some((project) => project.category === category));
  const filters = lanes.length > 1 ? `
  <div class="filters" role="group" aria-label="Filter projects by category" hidden>
    ${lanes.map((category) => `<button type="button" class="filter" data-category="${category}" aria-pressed="true"><span class="swatch"></span>${CATEGORY_LABELS[category]} <span class="count">${projects.filter((project) => project.category === category).length}</span></button>`).join('')}
  </div>` : '';
  let previousYear = null;
  const rows = projects.map((project) => {
    const showYear = project.year !== previousYear;
    previousYear = project.year;
    return renderProject(project, { lanes, showYear });
  });
  return `<section id="projects" aria-labelledby="projects-title">
  <h2 id="projects-title">Projects</h2>${filters}
  ${rows.length ? `<ol class="timeline">${rows.join('')}</ol>` : '<p class="muted">Projects are on their way.</p>'}
</section>`;
}

function renderPress(press) {
  return `<section id="press" aria-labelledby="press-title">
  <h2 id="press-title">Press &amp; recognition</h2>
  <ol class="press-list">${press.map((item) => `
    <li>${renderPressTitle(item)}<span class="small-meta">${e(item.source)} · ${capitalize(item.kind)} · ${formatPressDate(item)} · <a href="#project-${e(item.projectSlug)}">${e(item.projectTitle)}</a></span></li>`).join('')}
  </ol>
</section>`;
}

function renderEntries(id, heading, entries, projects) {
  return `<section id="${id}" aria-labelledby="${id}-title">
  <h2 id="${id}-title">${heading}</h2>
  <ol class="entries">${entries.map((entry) => {
    const related = entry.related_project && projects.find((project) => project.slug === entry.related_project);
    const meta = [entry.org, entry.period].filter(Boolean).map(e).join(' · ');
    return `
    <li>
      <h3>${e(entry.title)}</h3>
      ${meta ? `<p class="small-meta">${meta}</p>` : ''}
      ${entry.text ? `<p>${e(entry.text)}</p>` : ''}
      ${related ? `<a class="tag" href="#project-${e(related.slug)}">Related project: ${e(related.title)}</a>` : ''}
    </li>`;
  }).join('')}
  </ol>
</section>`;
}

function renderContact(profile) {
  const cta = profile.cta ?? {};
  return `<section id="contact" class="contact" aria-labelledby="contact-title">
  <h2 id="contact-title">${e(cta.heading)}</h2>
  <p>${e(cta.text)}</p>
  <p class="actions">
    <a class="button primary" href="mailto:${e(profile.email)}?subject=${encodeURIComponent('Hi Tommaso')}">Email me</a>
    ${profile.linkedin ? `<a class="button" href="${e(profile.linkedin)}">Connect on LinkedIn</a>` : ''}
  </p>
</section>`;
}
