# Portfolio

Source of my personal portfolio site: a static, single-page timeline of my projects,
built from the `README.md` and `portfolio.yml` of each project repository.

## Requirements

- Node.js 20 or newer
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

| Command         | What it does         |
| --------------- | -------------------- |
| `npm run setup` | Enable the git hooks |
| `npm test`      | Run the test suite   |

More commands (`fetch`, `build`, `dev`) and deployment instructions will be documented here
as they are added.
