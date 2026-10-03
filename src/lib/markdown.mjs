import { Lexer, Marked } from 'marked';
import { escapeHtml } from './html.mjs';

const sectionMarked = new Marked({
  renderer: {
    image({ href, text }) {
      return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}" loading="lazy">`;
    },
  },
});

// Used inside <summary>, where links would be nested interactive content.
const inlineMarked = new Marked({
  renderer: {
    link({ tokens }) {
      return this.parser.parseInline(tokens);
    },
    image() {
      return '';
    },
  },
});

/**
 * Render a README section to HTML.
 * - Headings move down two levels (`###` → `<h5>`) to sit under the section's `<h4>`.
 * - `image(src)` returns the URL to use for an image, or `null` to replace it with its alt text.
 * - `link(href)` returns the URL to use for a link.
 * - `references` are the README's link reference definitions.
 */
export function renderSection(markdown, { references = {}, image, link }) {
  const lexer = new Lexer(sectionMarked.defaults);
  Object.assign(lexer.tokens.links, references);
  const tokens = lexer.lex(markdown);
  sectionMarked.walkTokens(tokens, (token) => {
    if (token.type === 'heading') token.depth = Math.min(token.depth + 2, 6);
    if (token.type === 'link') token.href = link(token.href);
    if (token.type === 'image') {
      const url = image(token.href);
      if (url) {
        token.href = url;
      } else {
        token.type = 'text';
        delete token.tokens;
      }
    }
    if (token.type === 'html') token.text = rewriteImgTags(token.text, image);
  });
  return sectionMarked.parser(tokens);
}

/** Render inline Markdown (a pitch) without links or images. */
export function renderInline(markdown) {
  return inlineMarked.parseInline(markdown);
}

function rewriteImgTags(html, image) {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const url = src && image(src[1] ?? src[2] ?? src[3]);
    if (!url) {
      const alt = /\salt\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
      return alt ? (alt[1] ?? alt[2]) : '';
    }
    const rewritten = tag.replace(src[0], ` src="${escapeHtml(url)}"`);
    return /\sloading\s*=/i.test(rewritten) ? rewritten : rewritten.replace(/^<img\b/i, '<img loading="lazy"');
  });
}
