# Portfolio — project brief

This repository builds and deploys my personal portfolio site: a minimal, static, English-language
timeline of my projects, followed by press & recognition, education, experience, and a contact section.

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

### Content
- Never invent facts about me or my projects. Missing information becomes a visible
  `TODO` in fixtures/content, and you tell me what is missing.
- The site is entirely in English.
- Never publish my phone number, home address or date of birth. Public contact = email only.

### Dependencies
- Allowed without asking: `marked` (Markdown → HTML), `js-yaml`, `wrangler` (dev only).
- Anything else: ask first and explain why. No frontend framework, no CSS framework,
  no bundler. Plain HTML, CSS and a small vanilla JS file.

---

## 2. How the site works (architecture)

The site is **static**. Node.js runs only at build time, never as a server.
Visitors never call the GitHub API.

```
portfolio.config.yml ──► fetch ──► data/snapshot/ (committed) ──► build ──► dist/ ──► Cloudflare Pages
   (which repos)        (online)    last good copy of every        (offline,
                                     project + its images           always works)
```

Two separate commands:

- `npm run fetch` — online. For every project in `portfolio.config.yml`, download `README.md`
  and `portfolio.yml` from its GitHub repo (plus referenced images), and update that project's
  entry in `data/snapshot/`.
- `npm run build` — offline. Reads **only** `data/snapshot/` and `content/`, writes `dist/`.

### Resilience rules (important)
- If fetching one repo fails (network, 404, rate limit, GitHub down), keep that project's
  previous snapshot entry unchanged, log a warning, continue with the others.
- A fetch failure must never delete a project from the snapshot. A project disappears only
  when I remove it from `portfolio.config.yml`.
- `npm run fetch` exits 0 if at least the snapshot is intact; the build must always be able to
  run from the last good snapshot. Losing the most recent changes is acceptable.
- Images are downloaded into `data/snapshot/assets/<slug>/` and README links are rewritten to
  point there. Never hotlink `raw.githubusercontent.com` from the site.
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

A `local` entry has the same files as a repo (`README.md`, `portfolio.yml`, `screenshots/`)
inside `content/local/<slug>/`, and `fetch` copies it into the snapshot like any other project.

---

## 3. Contract with each project repo

Every project repo contains `README.md` and `portfolio.yml`. The site reads them as follows.

### README.md
```markdown
# Project name

> One-sentence pitch: what it does and for whom.          ← used as the card pitch

![alt text](docs/screenshots/cover.png)

<!-- portfolio:start -->
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
- Pitch = first blockquote after the H1.
- Only content between the two markers is used on the site. Split it by H2; match headings
  exactly (case-insensitive, trimmed). Unknown H2s inside the markers: warn, ignore.
- Missing optional sections are fine. Missing required sections: warn, render the project anyway.
- Relative image paths are resolved against the repo and downloaded (see resilience rules).

### portfolio.yml
```yaml
title: ""
slug: ""                 # lowercase-with-dashes, unique
category: ""             # university | school | personal | client
year: 2024               # used for timeline ordering
period: ""               # e.g. "Mar 2024 – Jun 2024"
status: ""               # completed | in progress | archived
role: ""                 # e.g. "Solo", "Team of 4, backend"
course: ""               # optional, university projects
cover: docs/screenshots/cover.png
demo: ""                 # optional URL
code_public: true        # false → show "Code not public" instead of the GitHub button
note: ""                 # optional, e.g. "Spotify API in development mode: not publicly testable"
press:
  - title: ""
    source: ""
    kind: ""             # article | competition | event | award
    date: ""             # YYYY-MM-DD, empty if unknown
    url: ""
```

Validate every `portfolio.yml` (required keys, allowed enum values, date format) with clear
error messages that name the repo and the field.

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

1. **Header** — name, short bio, email, GitHub, LinkedIn; small anchor nav:
   Projects · Press & recognition · Education · Experience · Contact.
2. **Category filters** — one toggle per category with project count. At least one stays active.
3. **Projects timeline** — newest first (by `year`, then config order).
4. **Press & recognition** — every `press` item of every project, newest first; undated items
   sorted by their project's year and shown as "<year> · date unknown". Each item links to the
   source and names the project.
5. **Education**
6. **Experience** (jobs outside programming, plus the internship)
7. **Contact CTA**
8. **Footer** — one line: each project has a README on GitHub with the same content plus
   technical details.

### Project card (collapsed)
Category label + status, title, pitch, badges (press count, award if any), "Open project".

### Project detail (expanded)
Facts row (period, status, role, course), Problem, Solution, Input → Output (two code blocks
side by side, stacked on mobile), note (if any), Technical challenges, What I learned,
Stack (chips), screenshots grid, press list, buttons: "Code & README on GitHub" (or
"Code not public"), "Live demo" if present, links to `extra_repos`.

**Progressive enhancement:** all project content is rendered into the HTML at build time.
Use `<details>`/`<summary>` so expanding works without JavaScript. `main.js` only adds the
category filters (hide the filter UI when JS is off) and recomputes visible year labels.

---

## 6. Design

Minimal, black and white. **The only colours on the page are the four category colours.**

### Tokens
```
Light: --bg #FFFFFF  --soft #F4F4F4  --ink #000000  --muted #6B6B6B  --line #E2E2E2
Dark:  --bg #000000  --soft #161616  --ink #FFFFFF  --muted #9A9A9A  --line #2A2A2A

Category      Light     Dark
university    #6B4BD6   #9C84F0
school        #1F6FD1   #5C9DF0
personal      #13896A   #3CC39B
client        #C7731E   #E79B4F
```
Dark mode follows `prefers-color-scheme`. Respect `prefers-reduced-motion`.

### Type
Schibsted Grotesk (400–800) for everything, JetBrains Mono only for stack chips and the
Input → Output blocks. **Self-host the fonts** (woff2 in `public/fonts/`) — no requests to
Google or any third party. System font fallbacks.

### The signature element: commit-graph timeline
Each category is a thin vertical lane (like a git graph). Each project is a node on its
category's lane; that lane is drawn at full opacity in the project's row, the others faint.
Year label in a narrow left column, shown once per year. On mobile the lanes narrow but stay.
Category colour also appears as the left border of an expanded project and on its label.
Everything else is black, white and greys: no shadows, no gradients, no rounded "cards".

### Quality bar
- Responsive from 320px; no horizontal page scroll (wide blocks scroll inside themselves).
- Accessible: semantic landmarks, visible focus, `aria-pressed` on filters, alt text on every
  screenshot, AA contrast (check muted text and category colours on both themes).
- No cookies, no analytics, no third-party requests at all.
- `<title>`, meta description, Open Graph tags + an OG image, emoji or simple favicon.
- Lighthouse ≥ 95 in every category.

---

## 7. Copy

### Category labels
University · School · Personal · Client work

### Header bio (draft, I'll refine)
"Computer Science student at Ca' Foscari University of Venice. I started by rebuilding places
in 3D in high school; now I write software that solves concrete problems. Here are my projects
in chronological order, with what each one taught me."

### Contact CTA
- Heading: "Curious about my work? Let's get in touch!"
- Line: "Whether it's a project, an internship, or just a chat about something you saw here,
  I'd be glad to hear from you."
- Buttons: "Email me" (`mailto:` with subject "Hi Tommaso") · "Connect on LinkedIn"

### content/profile.yml — initial data
```yaml
name: Tommaso Moro
email: moroxtommaso@gmail.com
github: TODO
linkedin: TODO

education:
  - title: BSc in Computer Science (L-31)
    org: Ca' Foscari University of Venice
    period: Oct 2024 – present
    text: "Track: Information Technologies and Sciences."
  - title: Five-month exchange program
    org: A.R. MacNeill Secondary School, Vancouver, Canada
    period: Aug 2022 – Jan 2023
    text: "A semester of high school in Canada: independence, adaptability, and English every day."
  - title: High school diploma, Applied Sciences
    org: Liceo Statale Duca degli Abruzzi, Treviso
    period: 2019 – 2024
    text: "Where my digital reconstruction projects started: Treviso Cathedral, the Scrovegni Chapel, Café Guerbois."
  - title: Languages
    text: "Italian (native), English (B2)."

experience:
  - title: Sales associate, mobile department
    org: MediaWorld, Olmi (Treviso)
    period: Jun 2025 – Apr 2026
    text: "Advising customers on smartphones and accessories, activating contracts and services, merchandising and restocking, after-sales support."
  - title: Multiplex operator
    org: The Space Cinema, Silea (Treviso)
    period: Mar 2024 – Jan 2025
    text: "Welcoming guests, ticket and concession sales, access control, handling issues in the theatres."
    related_project: thespacecinema-schedule   # render a small tag linking to the project
  - title: IT internship (two weeks)
    org: Targa Telematics, Treviso
    period: Jan 2024
    text: "Hands-on work in a tech company and a first look at the ethical questions of applied AI."
```

---

## 8. Deployment (GitHub Actions → Cloudflare Pages)

`.github/workflows/build-deploy.yml`:
- Triggers: push to `main`, `workflow_dispatch`, daily `schedule`.
- Steps: checkout → setup Node 20 with npm cache → `npm ci` → `npm run fetch`
  (`continue-on-error: true`) → if `data/snapshot/` changed, commit it as
  `github-actions[bot]` with message `chore(data): refresh project snapshot` and push →
  `npm test` → `npm run build` → deploy `dist/` with `cloudflare/wrangler-action`
  (`pages deploy`).
- Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Use the workflow's `GITHUB_TOKEN`
  for the GitHub API.
- Least-privilege `permissions:` (`contents: write` only because of the snapshot commit).
- Document in `README.md` how to create the Cloudflare Pages project and the secrets.

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
- Self-hosted fonts, both themes, responsive, accessibility pass.

**Phase 3 — Fetch and resilience**
- `npm run fetch` with per-repo fallback, image download and link rewriting, token support.
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
| Chess with minimax | personal | ? | |

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
