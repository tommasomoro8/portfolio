# Portfolio

Source of my personal portfolio site, published at <https://tommasomoro8.github.io/>: a static,
single-page timeline of my projects, followed by press & recognition, education, experience and
a contact section.

Each project's content comes from the `README.md` and `portfolio.yml` of its own repository, so
the site and the repositories never drift apart.

## Requirements

- Node.js 20 or newer (CI uses Node 24)
- Git

## Setup

```sh
npm install
npm run setup
```

`npm run setup` points `core.hooksPath` to the versioned `.githooks/` directory. Its
`commit-msg` hook removes automated co-author and attribution lines from commit messages
and trims trailing blank lines. Run it once after cloning.

## Commands

| Command         | What it does                                                                    |
| --------------- | ------------------------------------------------------------------------------- |
| `npm run setup` | Enable the git hooks                                                            |
| `npm run fetch` | Download every project in `portfolio.config.yml` into `data/snapshot/` (online) |
| `npm run build` | Build the site into `dist/` from `data/snapshot/` and `content/` (offline)      |
| `npm run dev`   | Build, serve `dist/` at <http://localhost:8080> and rebuild on changes          |
| `npm test`      | Run the tests                                                                   |

## How it works

```
portfolio.config.yml ──► fetch ──► data/snapshot/ (committed) ──► build ──► dist/ ──► GitHub Pages
```

- `npm run fetch` reads the files from `raw.githubusercontent.com` (using `GITHUB_TOKEN` when it
  is set) and stores them, with the images the site shows, in `data/snapshot/`. If a project
  can't be fetched (network, rate limit, invalid `portfolio.yml`), its previous snapshot is kept.
  A project leaves the snapshot only when it is removed from `portfolio.config.yml`.
- `npm run build` never goes online, so the site can always be rebuilt from the last good
  snapshot. The page makes no third-party requests: fonts are self-hosted and images are served
  from the site itself.
- Warnings name the project and the problem (a missing section, a `TODO` left in the content,
  an image that wasn't found), so both commands are worth a glance after editing a project.

| Path                   | Contents                                                       |
| ---------------------- | -------------------------------------------------------------- |
| `portfolio.config.yml` | Which projects appear                                          |
| `content/profile.yml`  | Bio, links, education, experience, contact copy                |
| `content/local/<slug>` | Projects without a public repository (same files as a repo)    |
| `data/snapshot/`       | Last good copy of every project and its images                 |
| `src/`                 | Fetch and build scripts, templates, styles and the page script |
| `public/`              | Fonts, favicon and share image, copied as they are             |

## Adding a project

1. In the project's repository, add a `portfolio.yml`:

   ```yaml
   title: Chess
   slug: chess                  # lowercase-with-dashes, unique
   category: personal           # university | school | personal | client (or uni | pers | comm)
   year: 2021                   # timeline order
   period: Mar 2021 – May 2021
   status: completed            # completed | in progress | archived
   role: Solo
   course: ""                   # optional
   cover: docs/screenshots/cover.png
   demo: https://example.com    # optional
   code_public: true            # optional, default true
   note: ""                     # optional
   screenshots:                 # optional
     - src: docs/screenshots/home.png
       alt: Home screen with the three game modes
   press:                       # optional
     - title: Il digitale oggi
       source: JobOrienta
       kind: event              # article | competition | event | award
       date: 2023-11-24         # YYYY-MM-DD, or "" if unknown
       url: https://example.com
       lang: it                 # optional: shows "(Italian)" after the title
   ```

2. In its `README.md`, put the pitch right after the title (a paragraph or a `>` quote) and wrap
   the sections shown on the site in markers:

   ```markdown
   # Chess

   A chess game for the browser, with a minimax AI to play against.

   <!-- portfolio:start -->
   ## Problem
   ## Solution
   ## Input → Output          (optional: two code blocks, input then output)
   ## Technical challenges
   ## What I learned
   ## Stack                   (a list: each item becomes a chip)
   ## Recognition             (optional)
   <!-- portfolio:end -->

   Everything below the end marker stays on GitHub only.
   ```

   Headings match without regard to case or a leading "The" (`## The problem` works).

3. Add the repository to `portfolio.config.yml`:

   ```yaml
   projects:
     - repo: tommasomoro8/chess
       extra_repos: [tommasomoro8/server-ue5]   # optional, linked from the project
   ```

   For a project without a public repository, use `- local: <slug>` and put its `README.md`,
   `portfolio.yml` and images in `content/local/<slug>/`.

4. Run `npm run fetch && npm run dev`, check the warnings and the page, then commit
   `portfolio.config.yml` and `data/snapshot/`.

## Deployment (GitHub Pages)

`.github/workflows/build-deploy.yml` runs on every push to `main`, every day at 05:17 UTC and on
demand (Actions → Build and deploy → Run workflow). It fetches the projects, commits
`data/snapshot/` if it changed (as `github-actions[bot]`), runs the tests, builds the site and
deploys `dist/` to GitHub Pages. If fetching fails, the last committed snapshot is deployed. No
secrets are needed.

One-time setup on GitHub:

1. **Settings → General → Default branch:** set it to `main`.
2. **Settings → Pages → Build and deployment → Source:** choose **GitHub Actions**.
3. To serve the site at the root URL, rename the repository to `tommasomoro8.github.io`
   (**Settings → General → Repository name**). Until then it is served at
   `https://tommasomoro8.github.io/portfolio/`; every link in the page is relative, so both work.
   If the address changes (for example a custom domain), update `url` in `content/profile.yml`;
   it is used for the canonical link and the share image.
4. Run the workflow once (Actions → Build and deploy → Run workflow), or push to `main`.
