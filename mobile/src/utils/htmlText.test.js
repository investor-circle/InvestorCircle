import { parseHtmlBlocks, decodeEntities } from "./htmlText";

// About Us is admin-authored rich text, served as an HTML string. React
// Native cannot render HTML, and the alternatives were a WebView or a second
// copy of the text that would drift. This flattens the document to prose.
//
// The properties that matter: the words all survive, markup never shows up as
// visible text, and nothing an admin can type into the editor makes the
// screen crash or opens a URL scheme the app should not open.

const texts = (blocks) => blocks.map((b) => b.spans.map((s) => s.text).join(""));

describe("block structure", () => {
  it("keeps headings, paragraphs and their order", () => {
    const b = parseHtmlBlocks("<h2>About</h2><p>First.</p><p>Second.</p>");
    expect(b.map((x) => x.type)).toEqual(["h2", "p", "p"]);
    expect(texts(b)).toEqual(["About", "First.", "Second."]);
  });

  it("folds h4-h6 into the smallest heading rather than inventing sizes", () => {
    expect(parseHtmlBlocks("<h5>Small</h5>")[0].type).toBe("h3");
  });

  it("numbers ordered list items and leaves bulleted ones unnumbered", () => {
    const b = parseHtmlBlocks("<ol><li>one</li><li>two</li></ol><ul><li>dot</li></ul>");
    expect(b.map((x) => [x.type, x.ordered, x.index])).toEqual([
      ["li", true, 1],
      ["li", true, 2],
      ["li", false, null],
    ]);
  });

  it("restarts numbering for a second list", () => {
    const b = parseHtmlBlocks("<ol><li>a</li></ol><ol><li>b</li></ol>");
    expect(b.map((x) => x.index)).toEqual([1, 1]);
  });

  it("emits a rule for <hr> and keeps blockquotes distinct", () => {
    const b = parseHtmlBlocks("<hr><blockquote>Quoted</blockquote>");
    expect(b.map((x) => x.type)).toEqual(["hr", "quote"]);
  });

  it("breaks a paragraph at <br> instead of running the lines together", () => {
    expect(texts(parseHtmlBlocks("<p>one<br>two</p>"))).toEqual(["one", "two"]);
  });

  it("drops blocks that hold no words, so styling wrappers add no blank space", () => {
    expect(parseHtmlBlocks("<div><div>   </div><p>Real.</p></div>")).toHaveLength(1);
  });
});

describe("inline formatting", () => {
  it("marks bold and italic spans", () => {
    const [p] = parseHtmlBlocks("<p>plain <strong>bold</strong> <em>italic</em></p>");
    expect(p.spans.map((s) => [s.text, s.bold, s.italic])).toEqual([
      ["plain ", false, false],
      ["bold", true, false],
      [" ", false, false],
      ["italic", false, true],
    ]);
  });

  it("survives unbalanced markup without flipping the rest of the page bold", () => {
    // A stray </strong> from a rich-text editor must not turn formatting
    // inside out for everything after it.
    const [p] = parseHtmlBlocks("<p></strong>after</p>");
    expect(p.spans[0].bold).toBe(false);
  });

  it("carries a link's href on its spans", () => {
    const [p] = parseHtmlBlocks('<p>See <a href="https://example.com">this</a>.</p>');
    expect(p.spans.find((s) => s.text === "this").link).toBe("https://example.com");
    expect(p.spans[0].link).toBeNull();
  });

  it("accepts mailto links", () => {
    const [p] = parseHtmlBlocks('<p><a href="mailto:hello@example.com">mail</a></p>');
    expect(p.spans[0].link).toBe("mailto:hello@example.com");
  });

  it("refuses a link the app has no business opening", () => {
    // Whatever comes back is passed to Linking.openURL.
    for (const href of ["javascript:alert(1)", "intent://evil", "file:///etc/passwd", "/relative"]) {
      const [p] = parseHtmlBlocks(`<p><a href="${href}">tap</a></p>`);
      expect(p.spans[0].link).toBeNull();
    }
  });
});

describe("what must never leak through as visible text", () => {
  it("drops script and style contents entirely", () => {
    const b = parseHtmlBlocks("<style>.x{color:red}</style><p>Hi</p><script>alert(1)</script>");
    expect(texts(b)).toEqual(["Hi"]);
  });

  it("drops comments", () => {
    expect(texts(parseHtmlBlocks("<p>Hi<!-- note -->there</p>"))).toEqual(["Hithere"]);
  });

  it("ignores attributes, including ones containing angle brackets", () => {
    const b = parseHtmlBlocks('<p style="font-family:\'a>b\'" data-x="<y>">Text</p>');
    expect(texts(b)).toEqual(["Text"]);
  });

  it("keeps the text of a tag it does not understand", () => {
    // New markup should degrade to readable prose, not vanish.
    expect(texts(parseHtmlBlocks("<p>a <mark>b</mark> c</p>"))).toEqual(["a b c"]);
  });
});

describe("text handling", () => {
  it("collapses source whitespace, which is indentation and not content", () => {
    expect(texts(parseHtmlBlocks("<p>one\n   two</p>"))).toEqual(["one two"]);
  });

  it("trims the edges of a block", () => {
    expect(texts(parseHtmlBlocks("<p>  spaced  </p>"))).toEqual(["spaced"]);
  });

  it("decodes the entities a rich-text editor emits", () => {
    expect(decodeEntities("Tom &amp; Jerry &mdash; &quot;hi&quot; &#39;x&#39; &#x41;")).toBe(
      "Tom & Jerry — \"hi\" 'x' A"
    );
  });

  it("leaves an entity it does not know alone rather than mangling it", () => {
    expect(decodeEntities("&notarealentity;")).toBe("&notarealentity;");
  });

  it("returns nothing for empty or non-string input instead of throwing", () => {
    for (const bad of ["", null, undefined, 42, {}]) {
      expect(parseHtmlBlocks(bad)).toEqual([]);
    }
  });

  it("handles bare text with no markup at all", () => {
    expect(texts(parseHtmlBlocks("Just words."))).toEqual(["Just words."]);
  });

  it("does not hang or throw on truncated markup", () => {
    expect(() => parseHtmlBlocks("<p>text<a href=")).not.toThrow();
  });
});
