/**
 * A very small HTML → block/span parser, for the About page only.
 *
 * WHY THIS EXISTS: About Us is admin-authored rich text stored in
 * app_settings.about_us_content and served as an HTML string (lookups
 * action=about-us). The web app can hand that straight to
 * dangerouslySetInnerHTML; React Native has no HTML renderer at all.
 *
 * The alternatives were a WebView (a native dependency, and a whole browser
 * to show one page of prose) or shipping the text twice and letting the two
 * copies drift. Neither is worth it for content that is, in practice, a
 * Quill editor's output: headings, paragraphs, lists, bold/italic and links.
 *
 * So this deliberately does NOT try to be an HTML renderer. It flattens the
 * document to a list of text blocks and, within each, a list of inline spans.
 * Everything it does not understand — styling, tables, images, layout — is
 * dropped rather than approximated, which is why the output is prose and not
 * a reproduction of the web page. Unknown tags contribute their TEXT, so new
 * markup degrades to readable content instead of disappearing.
 *
 * Pure and side-effect free, so it can be tested directly.
 */

// Tags that end the current block. Anything else is inline.
const BLOCK = new Set([
  "p", "div", "section", "article", "header", "footer", "main", "aside",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "blockquote", "pre", "hr", "table", "tr", "td", "th", "br",
]);
const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
// Content that is markup, not prose: dropped whole, tags and text alike.
const DROP = new Set(["script", "style", "head", "title", "noscript", "svg"]);

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  mdash: "—", ndash: "–", hellip: "…", middot: "·",
};

export function decodeEntities(text) {
  return String(text).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, code) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X"
        ? parseInt(code.slice(2), 16)
        : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    const hit = ENTITIES[code.toLowerCase()];
    return hit === undefined ? whole : hit;
  });
}

/**
 * @returns Array<{ type, spans: Array<{text, bold, italic, link}>, ordered, index }>
 *          type: "h1".."h3" | "p" | "li" | "quote" | "hr"
 */
export function parseHtmlBlocks(html) {
  if (!html || typeof html !== "string") return [];

  const blocks = [];
  let spans = [];
  let type = "p";
  // Inline state as counters rather than booleans: <strong><strong>x</strong>y
  // must still leave y bold, and unbalanced markup must not flip formatting on
  // for the rest of the document.
  let bold = 0;
  let italic = 0;
  const links = [];
  const listStack = []; // "ul" | "ol", with the running item number for "ol"

  const flush = () => {
    const text = spans.map((s) => s.text).join("");
    if (text.trim()) {
      const list = listStack[listStack.length - 1];
      blocks.push({
        type,
        spans: trimSpans(spans),
        ordered: type === "li" ? list?.tag === "ol" : false,
        index: type === "li" && list?.tag === "ol" ? ++list.n : null,
      });
    }
    spans = [];
    type = "p";
  };

  // One pass over tags and the text between them.
  const TOKEN = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
  let last = 0;
  let skipUntil = null; // inside a DROP element: swallow everything
  let m;
  while ((m = TOKEN.exec(html)) !== null) {
    const between = html.slice(last, m.index);
    last = TOKEN.lastIndex;
    if (!skipUntil && between) pushText(between);

    const tag = (m[1] || "").toLowerCase();
    if (!tag) continue; // a comment
    const closing = m[0][1] === "/";
    const selfClosing = /\/\s*>$/.test(m[0]);

    if (skipUntil) {
      if (closing && tag === skipUntil) skipUntil = null;
      continue;
    }
    if (DROP.has(tag)) {
      if (!closing && !selfClosing) skipUntil = tag;
      continue;
    }

    if (BLOCK.has(tag)) {
      flush();
      if (!closing) {
        if (tag === "hr") blocks.push({ type: "hr", spans: [] });
        else if (tag === "ul" || tag === "ol") listStack.push({ tag, n: 0 });
        else if (tag === "li") type = "li";
        else if (tag === "blockquote") type = "quote";
        else if (HEADINGS.has(tag)) type = headingLevel(tag);
      } else if (tag === "ul" || tag === "ol") {
        listStack.pop();
      }
      continue;
    }

    // Inline formatting.
    if (tag === "b" || tag === "strong") bold += closing ? -1 : 1;
    else if (tag === "i" || tag === "em") italic += closing ? -1 : 1;
    else if (tag === "a") {
      if (closing) links.pop();
      else links.push(hrefOf(m[2] || ""));
    }
    bold = Math.max(0, bold);
    italic = Math.max(0, italic);
  }
  if (!skipUntil && last < html.length) pushText(html.slice(last));
  flush();

  return blocks;

  function pushText(raw) {
    // Collapse HTML whitespace: newlines and indentation in the source are
    // not content, and rendering them literally would leave ragged gaps.
    const text = decodeEntities(raw).replace(/\s+/g, " ");
    if (!text) return;
    spans.push({
      text,
      bold: bold > 0,
      italic: italic > 0,
      link: links.length ? links[links.length - 1] : null,
    });
  }
}

function headingLevel(tag) {
  // h4-h6 are rare in this content and there is no room on a phone for six
  // sizes; fold them into the smallest heading rather than inventing more.
  const n = Number(tag[1]);
  return n <= 3 ? `h${n}` : "h3";
}

function hrefOf(attrs) {
  const m = attrs.match(/href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const raw = m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? "").trim() : "";
  // Only ever hand an http(s) or mailto URL to Linking.openURL. Admin-authored
  // content is trusted-ish, but a javascript: or intent: URL from a page this
  // app did not write has no business being opened by it.
  return /^(https?:|mailto:)/i.test(raw) ? raw : null;
}

function trimSpans(spans) {
  const out = spans.map((s) => ({ ...s }));
  if (out.length) {
    out[0].text = out[0].text.replace(/^\s+/, "");
    out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, "");
  }
  return out.filter((s) => s.text);
}
