# Portfolio — project brief

This repository builds and deploys my personal portfolio site: a minimal, static, English-language
timeline of my projects, followed by press & recognition, education, experience, other experience,
and a contact section.

Read this whole file before doing anything. It is the source of truth for scope, rules and design.
If something here is unclear or missing, ask me instead of guessing.

---

## 1. Hard rules

### Commits and authorship
- I am the only author. Commits must contain **no** AI attribution of any kind:
  no `Co-Authored-By:` trailer, no `Generated with ...` line, no `Claude-Session:` trailer,
  no mention of Claude, AI or an assistant in commit messages, PR descriptions, code comments,
  documentation or the site itself.
- First task (Phase 0) enforces this mechanically, see section 9.
- Commit messages: Conventional Commits, English, imperative, small focused commits
  (`feat(build): parse README portfolio sections`).
- Work directly on `main`: commit and push to `main`, with no feature branches or pull requests.
  Every push deploys the site; the tests and the build run first, so run `npm test` and
  `npm run build` locally before pushing.
- Commits are authored as `Tommaso Moro <moroxtommaso@gmail.com>` and are not signed. In a fresh
  clone, set `user.name`, `user.email` and `commit.gpgsign false` for the repo and run `npm run setup`.

### Content
- Never invent facts about me or my projects. Missing information becomes a visible
  `TODO` in fixtures/content, and you tell me what is missing.
- The site is entirely in English.
- Never publish my phone number, home address or date of birth. Public contact = email only.

### Dependencies
- Allowed without asking: `marked` (Markdown → HTML), `js-yaml`.
- Anything else: ask first and explain why. No frontend framework, no CSS framework,
  no bundler. Plain HTML, CSS and a small vanilla JS file.
- Lighthouse may be run with `npx` for audits; it is not a dependency.

### Keep it simple
- It's a portfolio. Prefer the simplest thing that works; don't over-engineer.

---

## 2. How the site works (architecture)

The site is **static**. Node.js runs only at build time, never as a server.
Visitors never call the GitHub API.

```
portfolio.config.yml ──► fetch ──► data/snapshot/ (committed) ──► build ──► dist/ ──► GitHub Pages
   (which repos)        (online)    last good copy of every        (offline,
                                     project + its images           always works)
```

Two separate commands:

- `npm run fetch` — online. For every project in `portfolio.config.yml`, download `README.md`
  and `portfolio.yml` from its GitHub repo (plus the cover and the screenshots) from
  `raw.githubusercontent.com`, and update that project's entry in `data/snapshot/`. The files are
  read at the repo's last commit (one GitHub API request per repo), because a branch is served
  from a five-minute cache; if the commit cannot be resolved, they are read from `HEAD`. Only when a
  project has no `screenshots` list is `docs/screenshots/` listed through the GitHub contents API.
- `npm run build` — offline. Reads **only** `data/snapshot/` and `content/`, writes `dist/`.

### Resilience rules (important)
- If fetching one repo fails (network, 404, rate limit, GitHub down), keep that project's
  previous snapshot entry unchanged, log a warning, continue with the others.
- A fetch failure must never delete a project from the snapshot. A project disappears only
  when I remove it from `portfolio.config.yml`.
- `npm run fetch` exits 0 if at least the snapshot is intact; the build must always be able to
  run from the last good snapshot. Losing the most recent changes is acceptable.
- The cover and the screenshots are downloaded into `data/snapshot/assets/<slug>/` and served
  from the site. Never hotlink `raw.githubusercontent.com` from the site.
- Use `GITHUB_TOKEN` from the environment when present (higher rate limit). Work without it locally.

### Which projects appear
Only the ones listed in `portfolio.config.yml`, never "all public repos". Two kinds of entry:

```yaml
# portfolio.config.yml
projects:
  - repo: <github-username>/spotify-stats
  - repo: <github-username>/cafe-guerbois
    extra_repos: [<github-username>/server-ue5]   # linked from the project, not parsed
  - local: crm-agents                              # private code: content lives in content/local/crm-agents/
```

A `local` entry has the same files as a repo (`README.md`, `portfolio.yml`, `docs/screenshots/`)
inside `content/local/<slug>/`, and `fetch` copies it into the snapshot like any other project.

---

## 3. Contract with each project repo

Every project repo contains `README.md` and `portfolio.yml`. The site reads them as follows.

### README.md
```markdown
# Project name

> One-sentence pitch: what it does and for whom.          ← used as the card pitch

![alt text](docs/screenshots/cover.png)

<!-- portfolio:summary
## The problem
One or two sentences.
## The solution
## Input → Output            (optional: two code blocks, input then output)
## Challenges
## What I learned
## Stack                     (a comma-separated line or a list)
## Recognition               (optional)
-->                          ← hidden on GitHub: the short text shown on the site

<!-- portfolio:start -->      ← the long version, used only when there is no summary
## Problem
## Solution
## Input → Output            (optional)
## Technical challenges
## What I learned
## Stack
## Recognition               (optional)
<!-- portfolio:end -->

## Architecture              ← everything below the end marker is GitHub-only
## Running locally
## Repository structure
## Known limitations and next steps
## Credits and license
```

Parsing rules:
- Pitch = first blockquote after the H1; if there is none, the first text paragraph after the H1.
- The text on the site comes from the hidden `<!-- portfolio:summary ... -->` block, extracted with
  `<!--\s*portfolio:summary\s*\n([\s\S]*?)\n\s*-->` after normalizing `\r\n`. Its content is
  Markdown, split by H2; match headings case-insensitively, trimmed, a leading "The " ignored
  (`## The problem` = `## Problem`); the old `## Technical challenges` is read as `## Challenges`
  and shown as "Challenges". Unknown H2s: warn, ignore.
- Sections are always shown in the order above, whatever their order in the README. Missing
  optional sections are fine; missing required ones: warn, render the project anyway, never an
  empty heading. Paragraphs, lists, bold, italic and links are rendered.
- No images in the text: `![…](…)` and `<img>` are removed (screenshots have their own gallery).
- Without a summary block: use the long text between `<!-- portfolio:start -->` and
  `<!-- portfolio:end -->` (images removed), and warn that the README needs a summary. Never
  shorten text automatically.

### portfolio.yml
```yaml
title: ""
slug: ""                 # lowercase-with-dashes, unique
category: ""             # uni | school | pers | comm (also university | personal | client; old: scuola)
year: 2024               # used for timeline ordering
period: ""               # free text, shown as written, e.g. "Mar 2024 – Jun 2024"
status: ""               # completed | in progress | archived (old: completato | in corso | archiviato)
role: ""                 # free text, shown with a capital first letter, e.g. "solo", "team of 4, backend"
course: ""               # optional, university projects
cover: docs/screenshots/cover.png   # image at the top of the project detail, not repeated in the
                                    # gallery; alt text from `screenshots`, else the README image
demo: ""                 # optional URL
code_public: true        # optional, default true; false → "Code not public" instead of the GitHub button
note: ""                 # optional, e.g. "Spotify API in development mode: not publicly testable"
screenshots:             # ordered gallery below the text; without it: every image in
  - path: docs/screenshots/home.png    # docs/screenshots/ alphabetically, file name as alt (warn)
    alt: ""              # required
press:
  - title: ""
    source: ""
    kind: ""             # article | contest | event | award (old: articolo | concorso | evento | riconoscimento)
    date: ""             # YYYY-MM-DD, empty if unknown
    url: ""
    lang: ""             # optional, e.g. "it" → the title is followed by "(Italian)"
```

Validate every `portfolio.yml` (required keys, allowed enum values, date format) with clear
error messages that name the repo and the field. Old values are accepted and converted, so
already published projects keep working. `press` may be an empty list.

---

## 4. Repository layout

```
portfolio/
├── CLAUDE.md
├── portfolio.config.yml
├── content/
│   ├── profile.yml            # bio, links, education, experience, CTA copy
│   └── local/<slug>/          # projects without a public repo
├── data/snapshot/             # committed: projects.json + assets/<slug>/
├── src/
│   ├── fetch.mjs
│   ├── build.mjs
│   ├── lib/                   # readme parser, yml validation, rendering helpers
│   ├── templates/             # HTML template functions (template literals are fine)
│   ├── styles.css
│   └── main.js                # filters + small enhancements only
├── public/                    # favicon, self-hosted fonts, og image
├── test/                      # node:test
├── dist/                      # gitignored
└── .github/workflows/build-deploy.yml
```

Node 20+, ES modules, `node:test` for tests. Scripts: `fetch`, `build`, `dev` (build + serve
`dist/` locally with watch), `test`.

---

## 5. Page structure

Single page, in this order:

1. **Header** — name, short bio and the contacts: email, GitHub, LinkedIn, "15-min call" (the
   ones that open another site end with a ↗). No section nav.
2. **Category filter** — "All" plus one pill per category, with project counts; one category at a
   time (clicking it again goes back to All). Clicking a pill closes every open project.
3. **Projects timeline** — newest first (by `year`, then config order).
4. **Press & recognition** — every `press` item of every project, newest first; undated items
   sorted by their project's year and shown as "<year> · date unknown". Each item links to the
   source and names the project.
5. **Education**
6. **Experience** — IT work only (for now the internship).
7. **Other experience** — jobs outside programming.
8. **Contact CTA** — the page ends here, with no footer.

### Project card (collapsed)
Category label (in the category colour) + status, title, pitch, badges (award, press mentions),
"Open project".

### Project detail (expanded)
With JavaScript, a compact bar (category and status, title, "Close", without the pitch and the
badges) stays at the top of the window while an open project scrolls by, so it can be closed at
any point; closing it there brings the page back to the start of the project. The bar comes out
from under the card and the gap below it, once the card's own "Close" has left the window, so the
two are never seen together (CSS only, nothing listens to the scroll).

1. Header: cover image, facts (period, role, status, course), "Live demo" if `demo` is set,
   `note` if set.
2. The text from the summary, in the fixed order (Input → Output as two code blocks with an arrow,
   stacked on mobile; Stack as chips).
3. "Press & recognition": the project's `press` items; a project without any shows the README's
   Recognition text here instead (with press items that text is left out, so nothing is repeated).
4. "Screenshots": the gallery from `screenshots`, without the cover.
5. "Read more on GitHub" (the README, with the full version) or "Code not public", plus links to
   `extra_repos`.

**Progressive enhancement:** all project content is rendered into the HTML at build time.
Use `<details>`/`<summary>` so expanding works without JavaScript. `main.js` only adds the
category filters (hide the filter UI when JS is off), recomputes visible year labels and line
colours, runs the timeline scroll animation, adds the bar that closes an open project, and opens the cover and the screenshots of a project
in a full-screen carousel (arrows, arrow keys, swipe, Esc; without JS they are links to the image).

---

## 6. Design

Minimal, black and white. **The only colours on the page are the four category colours.**
The page follows the style of the HTML draft provided in October 2026 (light only, 920px column,
pill filters, rounded badges, a single timeline line with hollow nodes, bordered project detail).

### Tokens
```
--bg #FFFFFF  --soft #F4F4F4  --ink #000000  --muted #6B6B6B  --line #E2E2E2

Category      Lines, dots   Text (AA on white)
university    #6B4BD6       #6B4BD6
school        #1F6FD1       #1F6FD1
personal      #13896A       #117D60
client        #C7731E       #A15D18
```
Light only (`color-scheme: light only`). Respect `prefers-reduced-motion`.

### Type
Schibsted Grotesk (400–800) for everything, JetBrains Mono only for stack chips and the
Input → Output blocks. **Self-host the fonts** (woff2 in `public/fonts/`) — no requests to
Google or any third party. System font fallbacks.

### The signature element: the timeline line
One thin vertical line runs through every project, with a hollow node per project in its
category colour. Between two nodes the line blends from one category colour to the next: it
keeps the project's colour for at least the first half and fades into the next one over the last
stretch before the next node. After the last project the line runs on to the end of the
project's card, open or closed, and fades out there.
Year label in a narrow left column, shown once per year. On mobile the line stays, next to the year.
Scroll animation (JavaScript only, off with `prefers-reduced-motion`): the line is drawn down to
just below the middle of the window as the page scrolls, the rest stays faint, and each node
lights up with a ring spreading out once when the line reaches it. Without it the line is fully drawn.
Category colour also appears as the left border of an expanded project and on its label,
"Open project" link and tags. Everything else is black, white and greys: no shadows, and no
gradients other than the blend on the line.

### Quality bar
- Responsive from 320px; no horizontal page scroll (wide blocks scroll inside themselves).
- Accessible: semantic landmarks, visible focus, `aria-pressed` on filters, alt text on every
  screenshot, AA contrast (category colours used as text take the darker text shades).
- Every link that leaves the page opens in a new tab (`target="_blank" rel="noopener"`),
  screenshots included (with JavaScript they open in the carousel instead); in-page anchors and
  `mailto:` links do not.
- Print: the page prints as a CV. The header links other than the email, the category filter,
  "Open project" and the contact CTA are hidden; nothing is added.
- No cookies, no analytics, no third-party requests at all.
- `<title>`, meta description, Open Graph tags + an OG image, emoji or simple favicon.
- Lighthouse ≥ 95 in every category.

---

## 7. Copy

### Category labels
University · School · Personal · Freelance

### Header bio (draft, I'll refine)
"Computer Science student at Ca' Foscari University of Venice. I started by rebuilding places
in 3D in high school; now I write software that solves concrete problems. Here are my projects
in chronological order, with what each one taught me."

### Section intros
- Press & recognition: "Articles, competitions and events where my projects appeared."
- Other experience: "Jobs outside programming that taught me to work with customers and in a team."

### Contact CTA
- Heading, on two lines: "Curious about my work?" / "Let's get in touch!"
- Line: "Whether it's a project, an internship, or just a chat about something you saw here,
  I'd be glad to hear from you."
- Buttons: "Email me" (`mailto:` with subject "Hi Tommaso") · "Connect on LinkedIn" ·
  "Book a 15-min call" (the `call` link in `content/profile.yml`)

### content/profile.yml — initial data
```yaml
name: Tommaso Moro
email: moroxtommaso@gmail.com
github: TODO
linkedin: TODO
call: https://calendar.app.google/MEdkNxquHeon1kcMA

education:
  - title: Bachelor's degree in Computer Science
    org: Ca' Foscari University of Venice
    url: https://www.unive.it/
    period: Oct 2024 – present
    text: "Turning years of self-taught programming into solid foundations."
  - title: Five-month exchange program
    org: A.R. MacNeill Secondary School, Vancouver, Canada
    url: https://macneill.sd38.bc.ca/
    period: Aug 2022 – Jan 2023
    text: "Five months of adapting to a new life and speaking English every day, in a city I fell in love with."
  - title: High school diploma
    org: Liceo Statale Duca degli Abruzzi, Treviso
    url: https://liceoduca.edu.it/
    period: Sep 2019 – Jun 2024
    text: "An Applied Sciences curriculum with computer science classes, turning an early fascination with computers into a love for building software."
  - title: Languages
    text: "Native Italian, English B2."

experience:
  - title: IT internship
    org: Targa Telematics, Treviso
    url: https://targatelematics.com/
    period: Jan 2024 · two weeks
    text: "Two highly formative weeks that taught me the importance of critical thinking and improved how I analyze and solve complex problems."

other_experience:
  - title: Sales associate
    org: MediaWorld, Treviso
    period: Jun 2025 – Apr 2026
    text: "Selling smartphones and related services, where I learned to turn technical specs into clear advice and to find out what each customer really needed."
  - title: Multiplex operator
    org: The Space Cinema, Treviso
    period: Mar 2024 – Jan 2025
    text: "Balancing shifts at the cinema with full-time studies taught me to manage my time with discipline and to stay reliable under pressure."
    related_project: thespacecinema-schedule   # render a small tag linking to the project
```

---

## 8. Deployment (GitHub Actions → GitHub Pages)

The site is served at `https://tommasomoro8.github.io/` (this repo will be renamed to
`tommasomoro8.github.io`). All links in the page are relative, so it also works under a sub-path.

`.github/workflows/build-deploy.yml`:
- Triggers: push to `main`, `workflow_dispatch`, daily `schedule`.
- Steps: checkout → setup Node 24 with npm cache → `npm ci` → `npm run fetch`
  (`continue-on-error: true`) → if `data/snapshot/` changed, commit it as
  `github-actions[bot]` with message `chore(data): refresh project snapshot` and push →
  `npm test` → `npm run build` → upload `dist/` and deploy it with the official GitHub Pages
  actions.
- No secrets: the workflow's `GITHUB_TOKEN` is used for fetching.
- Least-privilege `permissions:` per job (`contents: write` only because of the snapshot commit;
  `pages: write` and `id-token: write` only on the deploy job).
- Document in `README.md` how to enable GitHub Pages for the repo.

---

## 9. Work plan

Work in phases. At the end of each phase: run tests, commit, then stop and give me a short
summary plus anything you need from me. Don't start the next phase until I say so.

**Phase 0 — Setup and attribution guard**
- `git init` if needed, `.gitignore` (node_modules, dist, .env*), `package.json`, `.editorconfig`.
- Create `.claude/settings.json` containing `{ "attribution": { "commit": "", "pr": "" } }`.
- Add a versioned `commit-msg` hook in `.githooks/commit-msg` that removes any line matching
  `Co-Authored-By: .*Claude`, `Generated with .*Claude`, or `Claude-Session:` (case-insensitive)
  and trims trailing blank lines. Make it executable and set `git config core.hooksPath .githooks`.
  Add `npm run setup` that sets `core.hooksPath`, and mention it in README.
- Verify with a test commit that the trailers are stripped, then amend/remove that test commit.

**Phase 1 — Content model and parser**
- `portfolio.yml` validation, README parser (pitch, marker extraction, H2 splitting,
  image path collection), with unit tests on fixtures (good README, missing sections,
  unknown headings, no markers).
- Create two realistic fixture projects in `test/fixtures/` using `TODO` text, not invented facts.

**Phase 2 — Build and design**
- `npm run build` from a hand-written snapshot, full page per sections 5–7, `npm run dev`.
- Self-hosted fonts, light only, responsive, accessibility pass.

**Phase 3 — Fetch and resilience**
- `npm run fetch` with per-repo fallback, cover and screenshot download, token support.
- Tests that simulate a failing repo and a fully offline run: the snapshot must stay intact.

**Phase 4 — CI and deploy**
- Workflow from section 8; README for the repo (setup, commands, how to add a project,
  how to deploy).

**Phase 5 — Polish**
- Lighthouse pass, OG image, final copy review with me.

---

## 10. Known project facts (for reference)

Each project's real content will live in its own repo. These are facts I've already confirmed,
useful for fixtures and to double-check what the repos say. Categories and years marked `?`
are not confirmed yet.

| Project | Category | Year | Notes |
|---|---|---|---|
| Software Engineering course app | university | 2026 | In progress |
| Overseas student management (Ca' Foscari) | university | ? | Course: Web Technologies |
| CRM for sales agents, Treviso | client ? | ? | Private code → `local` entry |
| The Space Cinema schedule sheet | personal | 2024 ? | Built while I worked at the cinema; show input → output |
| spotify-stats | personal | ? | Spotify API in dev mode, not publicly testable; screenshots only |
| Café Guerbois in the metaverse | school | ? | Unreal Engine 5; backend in repo `server-ue5` |
| Scrovegni Chapel | school | 2023 | Competition "To Digital Competence 4.0" |
| Treviso Cathedral 3D reconstruction | school | ? | Website donated by the class |
| Chess with minimax | personal | 2021 | Repo `tommasomoro8/chess` (the first one ready) |

Press links already known (to be moved into each repo's `portfolio.yml`):
- Café Guerbois — Antenna Tre Nordest (article):
  https://antennatre.medianordest.it/116968/treviso-didattica-interattiva-al-duca-degli-abruzzi-si-studia-nel-metaverso/
- Café Guerbois — Repubblica@Scuola (article): https://scuola.repubblica.it/post/64333/teacher/show
- Scrovegni — USR Veneto official document, 2023-06-09:
  https://istruzioneveneto.gov.it/wp-content/uploads/2023/06/m_pi.AOODRVE.REGISTRO-UFFICIALEU.0015352.09-06-2023.pdf
- Scrovegni — JobOrienta, "Il digitale oggi" (event), 2023-11-24:
  https://www.joborienta.net/site/it/ev/2023/11/24/il-digitale-oggi/
- Scrovegni — Liceo Duca degli Abruzzi, competition page, 2023-12-03:
  https://liceoduca.edu.it/2023/12/03/concorso-to-digital-competence-4-0/
- Treviso Cathedral — La Vita del Popolo (article):
  https://www.lavitadelpopolo.it/paesi-citta/treviso/classe-del-duca-degli-abruzzi-dona-un-sito-internet-sulle-bellezze-del-duomo-LFVP126490

Titles of Italian articles stay in Italian on the site, with an "(Italian)" marker.
