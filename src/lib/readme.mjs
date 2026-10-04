import { Lexer, marked } from 'marked';
import { isExternalUrl, resolveRepoPath } from './repo-path.mjs';

/** Sections shown on the site, in display order (a leading "The " in the README heading is ignored). */
export const SECTIONS = [
  { key: 'problem', heading: 'Problem', required: true },
  { key: 'solution', heading: 'Solution', required: true },
  { key: 'inputOutput', heading: 'Input → Output', required: false },
  { key: 'technicalChallenges', heading: 'Technical challenges', required: true },
  { key: 'whatILearned', heading: 'What I learned', required: true },
  { key: 'stack', heading: 'Stack', required: true },
  { key: 'recognition', heading: 'Recognition', required: false },
];

const SUMMARY = /<!--\s*portfolio:summary\s*\n([\s\S]*?)\n\s*-->/g;
const MARKER = /<!--\s*portfolio:(start|end)\s*-->/gi;
const TODO = /\bTODO\b/;
const IMG_TAG = /<img\b[^>]*>/gi;

/**
 * Parse a project README.
 * `source` names the project in warnings (e.g. `owner/repo` or `local:slug`).
 *
 * The text shown on the site comes from the hidden `<!-- portfolio:summary ... -->` block. When a
 * README has no summary yet, the long text between `<!-- portfolio:start -->` and
 * `<!-- portfolio:end -->` is used instead, with a warning. Images in the text are never shown.
 *
 * Returns:
 * - `title`: text of the first H1
 * - `pitch`: inline Markdown of the first blockquote after the H1, or else of the first text paragraph
 * - `textSource`: where the sections come from: `"summary"`, `"markers"` or `"none"`
 * - `sections`: `{ [key]: { heading, markdown } }` for the known H2s;
 *   `stack` also has `items` and `inputOutput` also has `blocks`
 * - `introImages`: images above the start marker, `{ src, alt, path }` (used to find the cover's alt text)
 * - `references`: link reference definitions of the whole README (`{ label: { href, title } }`),
 *   needed to render a section that uses `![alt][label]` defined outside it
 * - `warnings`: messages for anything missing or ignored
 */
export function parseReadme(markdown, { source }) {
  const warnings = [];
  const warn = (message) => warnings.push(`[${source}] README.md: ${message}`);

  // The lexer normalizes \r\n to \n; joining the raw tokens gives the normalized text back.
  const tokens = marked.lexer(markdown);
  const text = tokens.map((token) => token.raw).join('');
  const summary = findSummary(tokens, text);
  if (!summary) warn('no <!-- portfolio:summary --> block; the long text between the portfolio markers is used instead (add a short summary)');
  const { start, end } = findMarkers(tokens, summary ? () => {} : warn);

  const intro = tokensBefore(tokens, start ? start.index : text.length);
  const { title, pitch } = readIntro(intro, warn);

  const result = {
    title,
    pitch,
    textSource: summary ? 'summary' : start && end ? 'markers' : 'none',
    sections: {},
    introImages: collectImages(intro),
    references: { ...tokens.links },
    warnings,
  };
  if (result.textSource === 'none') return result;

  // Lex the summary or the marked region on its own, keeping link references defined anywhere
  // in the README.
  const lexer = new Lexer();
  Object.assign(lexer.tokens.links, tokens.links);
  const regionTokens = lexer.lex(summary ? summary[1] : text.slice(start.index + start.length, end.index));
  // Reference definitions written inside the region are needed to render it too.
  result.references = { ...lexer.tokens.links };
  const where = summary ? 'the portfolio summary' : 'the portfolio markers';

  for (const section of splitSections(regionTokens, where, warn)) {
    const sectionMarkdown = section.tokens.map((token) => token.raw).join('').trim();
    // Images are removed on the site, so a section holding only images counts as empty.
    if (!visibleText(section.tokens).trim()) {
      warn(`section "## ${section.heading}" is empty`);
      continue;
    }
    const entry = { heading: section.heading, markdown: sectionMarkdown };
    if (section.key === 'stack') entry.items = readStackItems(section.tokens, warn);
    if (section.key === 'inputOutput') entry.blocks = readCodeBlocks(section.tokens, warn);
    if (TODO.test(sectionMarkdown)) warn(`section "## ${section.heading}" still contains TODO`);
    if (summary && collectImages(section.tokens).length) {
      warn(`images in "## ${section.heading}" are not shown; list screenshots in portfolio.yml instead`);
    }
    result.sections[section.key] = entry;
  }

  for (const { key, heading, required } of SECTIONS) {
    if (required && !result.sections[key]) warn(`missing required section "## ${heading}"`);
  }
  return result;
}

// The summary block is an HTML comment, so it must start in a top-level HTML token: an example
// of the block shown inside a code block is not the summary.
function findSummary(tokens, text) {
  const htmlRanges = [];
  let offset = 0;
  for (const token of tokens) {
    if (token.type === 'html') htmlRanges.push([offset, offset + token.raw.length]);
    offset += token.raw.length;
  }
  for (const match of text.matchAll(SUMMARY)) {
    if (htmlRanges.some(([from, to]) => match.index >= from && match.index < to)) return match;
  }
  return null;
}

function findMarkers(tokens, warn) {
  // Markers are looked for only in top-level HTML blocks, so markers shown inside code blocks
  // are ignored. One HTML block can contain a marker after other HTML (a block only ends at a
  // blank line), so the marker's offset is computed within the block.
  const markers = [];
  let offset = 0;
  for (const token of tokens) {
    if (token.type === 'html') {
      for (const match of token.raw.matchAll(MARKER)) {
        markers.push({ kind: match[1].toLowerCase(), index: offset + match.index, length: match[0].length });
      }
    }
    offset += token.raw.length;
  }

  const starts = markers.filter((marker) => marker.kind === 'start');
  const ends = markers.filter((marker) => marker.kind === 'end');
  const start = starts[0];
  const end = start && ends.find((marker) => marker.index > start.index);

  if (!starts.length && !ends.length) {
    warn('no <!-- portfolio:start --> / <!-- portfolio:end --> markers; no sections are used on the site');
  } else if (!start) {
    warn('missing <!-- portfolio:start --> marker; no sections are used on the site');
  } else if (!end) {
    warn('missing <!-- portfolio:end --> marker after the start marker; no sections are used on the site');
  } else if (starts.length > 1 || ends.length > 1) {
    warn('more than one start or end marker; using the first start marker and the first end marker after it');
  }
  return { start, end };
}

function tokensBefore(tokens, limit) {
  const result = [];
  let offset = 0;
  for (const token of tokens) {
    if (offset >= limit) break;
    result.push(token);
    offset += token.raw.length;
  }
  return result;
}

function readIntro(tokens, warn) {
  const h1 = tokens.findIndex((token) => token.type === 'heading' && token.depth === 1);
  if (h1 === -1) warn('missing "# Title" heading');
  const title = h1 === -1 ? '' : plainText(tokens[h1].tokens).trim();

  let quote = '';
  let paragraph = '';
  for (const token of h1 === -1 ? [] : tokens.slice(h1 + 1)) {
    if (token.type === 'heading' && token.depth <= 2) break;
    // Skip GitHub alerts such as "> [!NOTE]", which are not a pitch.
    if (token.type === 'blockquote' && !/^\s*\[!\w+\]/.test(token.text)) {
      quote = token.text;
      break;
    }
    // A paragraph made only of images (badges, a cover) is not a pitch.
    if (!paragraph && token.type === 'paragraph' && plainText(token.tokens).trim()) paragraph = token.text;
  }
  const pitch = (quote || paragraph).replace(/\s+/g, ' ').trim();
  if (!pitch) warn('missing pitch: add a one-sentence paragraph or "> blockquote" right after the title');
  if (TODO.test(title)) warn('title still contains TODO');
  if (TODO.test(pitch)) warn('pitch still contains TODO');
  return { title, pitch };
}

function splitSections(tokens, where, warn) {
  const sections = [];
  const seen = new Set();
  let current = null;
  let ignoring = false;
  let warnedPreamble = false;

  for (const token of tokens) {
    if (token.type === 'heading' && token.depth === 2) {
      const heading = plainText(token.tokens).trim();
      const known = SECTIONS.find((section) => headingKey(section.heading) === headingKey(heading));
      if (!known) {
        warn(`unknown section "## ${heading}" in ${where} is ignored`);
      } else if (seen.has(known.key)) {
        warn(`duplicate section "## ${heading}" is ignored`);
      }
      ignoring = !known || seen.has(known.key);
      current = ignoring ? null : { key: known.key, heading: known.heading, tokens: [] };
      if (current) {
        seen.add(current.key);
        sections.push(current);
      }
      continue;
    }
    if (current) {
      current.tokens.push(token);
    } else if (!ignoring && token.type !== 'space' && !warnedPreamble) {
      warn(`content before the first "##" heading in ${where} is ignored`);
      warnedPreamble = true;
    }
  }
  return sections;
}

// Headings match case-insensitively, ignoring a leading "The " ("The problem" = "Problem").
function headingKey(heading) {
  return heading.trim().toLowerCase().replace(/^the\s+/, '');
}

function readStackItems(tokens, warn) {
  const list = tokens.find((token) => token.type === 'list');
  let items;
  if (list) {
    items = list.items.map((item) => {
      const first = item.tokens.find((token) => token.type === 'text' || token.type === 'paragraph');
      return first ? plainText(first.tokens ?? [first]).trim() : '';
    });
  } else {
    // Also accept a single comma-separated line; commas inside parentheses don't split.
    const paragraph = tokens.find((token) => token.type === 'paragraph');
    items = paragraph ? plainText(paragraph.tokens).split(/[,·](?![^()]*\))/) : [];
  }
  items = items.map((item) => item.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!items.length) warn('section "## Stack" should be a list of technologies (one per item)');
  return items;
}

function readCodeBlocks(tokens, warn) {
  const blocks = tokens
    .filter((token) => token.type === 'code')
    .map((token) => ({ lang: token.lang ?? '', code: token.text }));
  if (blocks.length !== 2) {
    warn(`section "## Input → Output" should contain exactly two code blocks (input, then output); found ${blocks.length}`);
  }
  return blocks;
}

// Markdown images and <img> tags (not commented out), as `{ src, alt, path }`; `path` is the
// repo-relative path of a local image and `null` for an external URL.
function collectImages(tokens) {
  const images = [];
  const add = (src, alt) => {
    const target = (src ?? '').trim();
    if (!target) return;
    images.push({ src: target, alt, path: isExternalUrl(target) ? null : resolveRepoPath(target) });
  };

  marked.walkTokens(tokens, (token) => {
    if (token.type === 'image') add(token.href, token.text ?? '');
    if (token.type === 'html') {
      const html = token.raw.replace(/<!--[\s\S]*?-->/g, '');
      for (const [tag] of html.matchAll(IMG_TAG)) add(attribute(tag, 'src'), attribute(tag, 'alt') ?? '');
    }
  });
  return images;
}

function attribute(tag, name) {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
}

// The text a section shows on the site: like plainText, but HTML counts without its tags and comments.
function visibleText(tokens = []) {
  return tokens
    .map((token) => {
      if (token.type === 'image') return '';
      if (token.type === 'html') return token.raw.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, '');
      if (token.tokens) return visibleText(token.tokens);
      if (token.type === 'list') return visibleText(token.items);
      return token.text ?? '';
    })
    .join('');
}

function plainText(tokens = []) {
  return tokens
    .map((token) => {
      if (token.type === 'html' || token.type === 'image') return '';
      if (token.type === 'br') return ' ';
      if (token.tokens) return plainText(token.tokens);
      return token.text ?? '';
    })
    .join('');
}
