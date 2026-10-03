import { CORE_SCHEMA, load } from 'js-yaml';
import { isHttpUrl, resolveRepoPath } from './repo-path.mjs';

export const CATEGORIES = ['university', 'school', 'personal', 'client'];
export const STATUSES = ['completed', 'in progress', 'archived'];
export const PRESS_KINDS = ['article', 'competition', 'event', 'award'];

const CATEGORY_ALIASES = { uni: 'university', pers: 'personal', comm: 'client' };
const PROJECT_FIELDS = [
  'title', 'slug', 'category', 'year', 'period', 'status', 'role',
  'course', 'cover', 'demo', 'code_public', 'note', 'screenshots', 'press',
];
const PRESS_FIELDS = ['title', 'source', 'kind', 'date', 'url', 'lang'];
const SCREENSHOT_FIELDS = ['src', 'alt'];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LANG = /^[a-z]{2}$/;
const TODO = /\bTODO\b/;

/**
 * Parse and validate the text of a project's `portfolio.yml`.
 * `source` names the project in messages (e.g. `owner/repo` or `local:slug`).
 * Returns `{ data, errors, warnings }`; `data` is `null` when there are errors.
 * In `data`, `cover` and screenshot `src` are normalized repo-relative paths.
 */
export function parsePortfolioYml(text, { source }) {
  if (!text.replace(/^\s*#.*$/gm, '').trim()) {
    return { data: null, errors: [`[${source}] portfolio.yml: the file is empty`], warnings: [] };
  }
  let raw;
  try {
    // CORE_SCHEMA keeps unquoted dates such as 2023-06-09 as strings.
    raw = load(text, { schema: CORE_SCHEMA });
  } catch (error) {
    const reason = String(error.message).split('\n')[0];
    return { data: null, errors: [`[${source}] portfolio.yml: invalid YAML: ${reason}`], warnings: [] };
  }
  return validatePortfolio(raw, { source });
}

/** Validate an already parsed `portfolio.yml` object. Same result shape as `parsePortfolioYml`. */
export function validatePortfolio(raw, { source }) {
  const prefix = `[${source}] portfolio.yml:`;
  const errors = [];
  const warnings = [];
  const fail = (field, problem) => errors.push(`${prefix} "${field}" ${problem}`);
  const warn = (message) => warnings.push(`${prefix} ${message}`);

  if (!isMapping(raw)) {
    errors.push(`${prefix} expected a mapping of fields at the top level (got ${describe(raw)})`);
    return { data: null, errors, warnings };
  }
  for (const key of Object.keys(raw)) {
    if (!PROJECT_FIELDS.includes(key)) warn(`unknown field "${key}" is ignored`);
  }

  const field = fieldReader(raw, '', fail);
  const data = {
    title: field.string('title', { required: true }),
    slug: field.string('slug', { required: true }),
    category: field.oneOf('category', CATEGORIES, CATEGORY_ALIASES),
    year: field.year('year'),
    period: field.string('period', { required: true }),
    status: field.oneOf('status', STATUSES),
    role: field.string('role', { required: true }),
    course: field.string('course'),
    cover: field.repoPath('cover', { required: true }),
    demo: field.string('demo'),
    code_public: field.boolean('code_public', { fallback: true }),
    note: field.string('note'),
    screenshots: readList(raw, 'screenshots', SCREENSHOT_FIELDS, fail, warn, (item) => ({
      src: item.repoPath('src', { required: true }),
      alt: item.string('alt', { required: true }),
    })),
    press: readList(raw, 'press', PRESS_FIELDS, fail, warn, (item, path) => {
      const entry = {
        title: item.string('title', { required: true }),
        source: item.string('source', { required: true }),
        kind: item.oneOf('kind', PRESS_KINDS),
        date: item.string('date'),
        url: item.string('url', { required: true }),
        lang: item.string('lang'),
      };
      if (entry.date && !isCalendarDate(entry.date)) {
        fail(`${path}.date`, `must be a date in YYYY-MM-DD format, or empty if unknown (got ${describe(entry.date)})`);
      }
      if (entry.url && !isHttpUrl(entry.url)) {
        fail(`${path}.url`, `must be an http(s) URL (got ${describe(entry.url)})`);
      }
      if (entry.lang && !LANG.test(entry.lang)) {
        fail(`${path}.lang`, `must be a two-letter lowercase language code such as "it", or empty for English (got ${describe(entry.lang)})`);
      }
      return entry;
    }),
  };

  if (data.slug && !SLUG.test(data.slug)) {
    fail('slug', `must be lowercase letters and digits separated by single dashes (got ${describe(data.slug)})`);
  }
  if (data.demo && !isHttpUrl(data.demo)) {
    fail('demo', `must be an http(s) URL or empty (got ${describe(data.demo)})`);
  }

  for (const name of todoFields(data)) warn(`"${name}" still contains TODO`);

  return { data: errors.length ? null : data, errors, warnings };
}

/**
 * Report slugs used by more than one project.
 * `projects` is a list of `{ source, slug }`; returns a list of error messages.
 */
export function findDuplicateSlugs(projects) {
  const seen = new Map();
  const errors = [];
  for (const { source, slug } of projects) {
    if (!slug) continue;
    if (seen.has(slug)) {
      errors.push(`slug "${slug}" is used by both [${seen.get(slug)}] and [${source}]; slugs must be unique`);
    } else {
      seen.set(slug, source);
    }
  }
  return errors;
}

function readList(raw, name, fields, fail, warn, readItem) {
  const value = raw[name];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    fail(name, `must be a list (got ${describe(value)})`);
    return [];
  }
  return value.map((item, index) => {
    const path = `${name}[${index}]`;
    if (!isMapping(item)) {
      fail(path, `must be a mapping with ${fields.join(', ')} (got ${describe(item)})`);
      return null;
    }
    for (const key of Object.keys(item)) {
      if (!fields.includes(key)) warn(`unknown field "${path}.${key}" is ignored`);
    }
    return readItem(fieldReader(item, `${path}.`, fail), path);
  }).filter(Boolean);
}

function fieldReader(obj, prefix, fail) {
  const isMissing = (value) => value === undefined || value === null || value === '';
  const reader = {
    string(key, { required = false } = {}) {
      const value = obj[key];
      if (isMissing(value)) {
        if (required) fail(prefix + key, 'is required');
        return '';
      }
      if (typeof value !== 'string' && typeof value !== 'number') {
        fail(prefix + key, `must be text (got ${describe(value)})`);
        return '';
      }
      const text = String(value).trim();
      if (!text && required) fail(prefix + key, 'is required');
      return text;
    },
    repoPath(key, options) {
      const text = reader.string(key, options);
      if (!text) return '';
      const path = resolveRepoPath(text);
      if (!path) fail(prefix + key, `must be a path to a file inside the repository (got ${describe(text)})`);
      return path ?? '';
    },
    oneOf(key, allowed, aliases = {}) {
      const value = aliases[obj[key]] ?? obj[key];
      if (isMissing(value)) {
        fail(prefix + key, `is required (one of: ${allowed.join(', ')})`);
        return '';
      }
      if (!allowed.includes(value)) {
        fail(prefix + key, `must be one of: ${allowed.join(', ')} (got ${describe(value)})`);
        return '';
      }
      return value;
    },
    year(key) {
      const value = obj[key];
      if (isMissing(value)) {
        fail(prefix + key, 'is required (a four-digit year such as 2024)');
        return null;
      }
      if (!Number.isInteger(value) || value < 1000 || value > 9999) {
        fail(prefix + key, `must be a four-digit year such as 2024, without quotes (got ${describe(value)})`);
        return null;
      }
      return value;
    },
    boolean(key, { fallback }) {
      const value = obj[key];
      if (isMissing(value)) return fallback;
      if (typeof value !== 'boolean') {
        fail(prefix + key, `must be true or false (got ${describe(value)})`);
        return fallback;
      }
      return value;
    },
  };
  return reader;
}

function* todoFields(data) {
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' && TODO.test(value)) yield key;
  }
  for (const list of ['screenshots', 'press']) {
    for (const [index, entry] of data[list].entries()) {
      for (const [key, value] of Object.entries(entry)) {
        if (TODO.test(value)) yield `${list}[${index}].${key}`;
      }
    }
  }
}

function isCalendarDate(text) {
  const match = DATE.exec(text);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isMapping(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function describe(value) {
  if (value === undefined) return 'nothing';
  if (value === null) return 'an empty value';
  if (Array.isArray(value)) return 'a list';
  if (typeof value === 'object') return 'a mapping';
  if (typeof value === 'string') return JSON.stringify(value);
  return String(value);
}
