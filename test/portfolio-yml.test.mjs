import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicateSlugs, parsePortfolioYml, validatePortfolio } from '../src/lib/portfolio-yml.mjs';

const source = 'owner/repo';
const prefix = `[${source}] portfolio.yml:`;

function project(overrides = {}) {
  return {
    title: 'Project',
    slug: 'project',
    category: 'personal',
    year: 2024,
    period: 'Mar 2024 – Jun 2024',
    status: 'completed',
    role: 'Solo',
    cover: 'docs/screenshots/cover.png',
    code_public: true,
    ...overrides,
  };
}

const validate = (raw) => validatePortfolio(raw, { source });

test('a valid file is normalized with defaults for optional fields', () => {
  const { data, errors, warnings } = validate(project({ title: '  Project  ' }));
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.deepEqual(data, {
    title: 'Project',
    slug: 'project',
    category: 'personal',
    year: 2024,
    period: 'Mar 2024 – Jun 2024',
    status: 'completed',
    role: 'Solo',
    course: '',
    cover: 'docs/screenshots/cover.png',
    demo: '',
    code_public: true,
    note: '',
    press: [],
  });
});

test('parses YAML, keeping unquoted dates as text', () => {
  const yml = [
    'title: Project', 'slug: project', 'category: school', 'year: 2023', 'period: "2023"',
    'status: in progress', 'role: Team of 4, backend', 'course: Web Technologies',
    'cover: ./docs/cover.png', 'demo: https://example.com', 'code_public: false',
    'note: Not publicly testable',
    'press:',
    '  - title: Il digitale oggi',
    '    source: JobOrienta',
    '    kind: event',
    '    date: 2023-11-24',
    '    url: https://example.com/event',
    '    lang: it',
    '  - title: Article',
    '    source: Paper',
    '    kind: article',
    '    date: ""',
    '    url: https://example.com/article',
  ].join('\n');
  const { data, errors } = parsePortfolioYml(yml, { source });
  assert.deepEqual(errors, []);
  assert.equal(data.code_public, false);
  assert.equal(data.period, '2023');
  assert.deepEqual(data.press, [
    { title: 'Il digitale oggi', source: 'JobOrienta', kind: 'event', date: '2023-11-24', url: 'https://example.com/event', lang: 'it' },
    { title: 'Article', source: 'Paper', kind: 'article', date: '', url: 'https://example.com/article', lang: '' },
  ]);
});

test('invalid YAML is an error that names the project', () => {
  const { data, errors } = parsePortfolioYml('title: a\ntitle: b\n', { source });
  assert.equal(data, null);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^\[owner\/repo\] portfolio\.yml: invalid YAML: duplicated mapping key/);
});

test('an empty file is an error', () => {
  for (const text of ['', '  \n', '# only a comment\n']) {
    assert.deepEqual(parsePortfolioYml(text, { source }), { data: null, errors: [`${prefix} the file is empty`], warnings: [] });
  }
});

test('the top level must be a mapping', () => {
  for (const text of ['---\n', '- a\n- b\n', 'just text\n']) {
    const { data, errors } = parsePortfolioYml(text, { source });
    assert.equal(data, null);
    assert.match(errors[0], /expected a mapping of fields at the top level/);
  }
});

test('every missing required field is reported by name', () => {
  const { data, errors } = validate({});
  assert.equal(data, null);
  assert.deepEqual(errors, [
    `${prefix} "title" is required`,
    `${prefix} "slug" is required`,
    `${prefix} "category" is required (one of: university, school, personal, client)`,
    `${prefix} "year" is required (a four-digit year such as 2024)`,
    `${prefix} "period" is required`,
    `${prefix} "status" is required (one of: completed, in progress, archived)`,
    `${prefix} "role" is required`,
    `${prefix} "cover" is required`,
    `${prefix} "code_public" is required (true or false)`,
  ]);
});

test('enum values must match exactly', () => {
  const { errors } = validate(project({ category: 'University', status: 'done' }));
  assert.deepEqual(errors, [
    `${prefix} "category" must be one of: university, school, personal, client (got "University")`,
    `${prefix} "status" must be one of: completed, in progress, archived (got "done")`,
  ]);
});

test('year must be an unquoted four-digit number', () => {
  assert.deepEqual(validate(project({ year: '2024' })).errors, [
    `${prefix} "year" must be a four-digit year such as 2024, without quotes (got "2024")`,
  ]);
  assert.match(validate(project({ year: 24 })).errors[0], /"year" must be a four-digit year/);
  assert.match(validate(project({ year: 2024.5 })).errors[0], /"year" must be a four-digit year/);
});

test('slug must be lowercase-with-dashes', () => {
  for (const slug of ['Spotify-Stats', 'spotify_stats', '-x', 'x--y', 'x y']) {
    assert.deepEqual(validate(project({ slug })).errors, [
      `${prefix} "slug" must be lowercase letters and digits separated by single dashes (got ${JSON.stringify(slug)})`,
    ]);
  }
  assert.deepEqual(validate(project({ slug: 'spotify-stats-2' })).errors, []);
});

test('code_public must be a boolean', () => {
  assert.deepEqual(validate(project({ code_public: 'yes' })).errors, [
    `${prefix} "code_public" must be true or false (got "yes")`,
  ]);
});

test('text fields reject lists and mappings but accept numbers', () => {
  assert.deepEqual(validate(project({ role: ['Solo'], note: { a: 1 } })).errors, [
    `${prefix} "role" must be text (got a list)`,
    `${prefix} "note" must be text (got a mapping)`,
  ]);
  assert.equal(validate(project({ title: 2048 })).data.title, '2048');
});

test('cover must stay inside the repository; demo must be an http(s) URL', () => {
  assert.deepEqual(validate(project({ cover: '../other/cover.png', demo: 'example.com' })).errors, [
    `${prefix} "cover" must be a path inside the repository or an http(s) URL (got "../other/cover.png")`,
    `${prefix} "demo" must be an http(s) URL or empty (got "example.com")`,
  ]);
  assert.deepEqual(validate(project({ cover: 'https://example.com/c.png', demo: 'https://example.com' })).errors, []);
});

test('press items are validated field by field', () => {
  const { data, errors } = validate(project({
    press: [
      { title: 'A', source: 'S', kind: 'article', date: '2023-06-09', url: 'https://example.com' },
      { title: '', source: 'S', kind: 'interview', date: '2023-6-9', url: 'example.com', lang: 'IT' },
      { title: 'C', source: 'S', kind: 'award', date: '2023-02-30', url: 'https://example.com' },
      'not a mapping',
    ],
  }));
  assert.equal(data, null);
  assert.deepEqual(errors, [
    `${prefix} "press[1].title" is required`,
    `${prefix} "press[1].kind" must be one of: article, competition, event, award (got "interview")`,
    `${prefix} "press[1].date" must be a date in YYYY-MM-DD format, or empty if unknown (got "2023-6-9")`,
    `${prefix} "press[1].url" must be an http(s) URL (got "example.com")`,
    `${prefix} "press[1].lang" must be a two-letter lowercase language code such as "it", or empty for English (got "IT")`,
    `${prefix} "press[2].date" must be a date in YYYY-MM-DD format, or empty if unknown (got "2023-02-30")`,
    `${prefix} "press[3]" must be a mapping with title, source, kind, date and url (got "not a mapping")`,
  ]);
});

test('press must be a list when present', () => {
  assert.deepEqual(validate(project({ press: 'none' })).errors, [`${prefix} "press" must be a list (got "none")`]);
  assert.deepEqual(validate(project({ press: null })).data.press, []);
});

test('unknown fields are warnings, not errors', () => {
  const { data, errors, warnings } = validate(project({
    catgory: 'personal',
    press: [{ title: 'A', source: 'S', kind: 'event', url: 'https://example.com', link: 'x' }],
  }));
  assert.deepEqual(errors, []);
  assert.ok(data);
  assert.deepEqual(warnings, [
    `${prefix} unknown field "catgory" is ignored`,
    `${prefix} unknown field "press[0].link" is ignored`,
  ]);
});

test('fields still containing TODO are reported as warnings', () => {
  const { errors, warnings } = validate(project({
    role: 'TODO',
    press: [{ title: 'TODO', source: 'S', kind: 'event', url: 'https://example.com' }],
  }));
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, [
    `${prefix} "role" still contains TODO`,
    `${prefix} "press[0].title" still contains TODO`,
  ]);
});

test('duplicate slugs across projects are reported', () => {
  assert.deepEqual(findDuplicateSlugs([
    { source: 'owner/a', slug: 'same' },
    { source: 'owner/b', slug: 'other' },
    { source: 'local:c', slug: 'same' },
  ]), ['slug "same" is used by both [owner/a] and [local:c]; slugs must be unique']);
  assert.deepEqual(findDuplicateSlugs([{ source: 'owner/a', slug: 'a' }, { source: 'owner/b', slug: 'b' }]), []);
});
