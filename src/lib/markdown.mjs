import { Lexer, Marked } from 'marked';

const sectionMarked = new Marked();

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
 * - Headings move down one level (`###` → `<h4>`) to sit under the section's `<h3>`.
 * - Images (`![…](…)` and `<img>`) and HTML comments are removed: screenshots have their own gallery.
 * - `link(href)` returns the URL to use for a link.
 * - `references` are the README's link reference definitions.
 */
export function renderSection(markdown, { references = {}, link }) {
  const lexer = new Lexer(sectionMarked.defaults);
  Object.assign(lexer.tokens.links, references);
  const tokens = lexer.lex(markdown);
  sectionMarked.walkTokens(tokens, (token) => {
    if (token.type === 'heading') token.depth = Math.min(token.depth + 1, 6);
    if (token.type === 'link') token.href = link(token.href);
    if (token.type === 'image') {
      token.type = 'text';
      token.text = '';
      delete token.tokens;
    }
    if (token.type === 'html') token.text = token.text.replace(/<!--[\s\S]*?-->/g, '').replace(/<img\b[^>]*>/gi, '');
  });
  return sectionMarked.parser(tokens);
}

/** Render inline Markdown (a pitch) without links or images. */
export function renderInline(markdown) {
  return inlineMarked.parseInline(markdown);
}
