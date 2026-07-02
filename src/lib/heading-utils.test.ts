import { describe, expect, it } from "vitest";
import { slugifyHeading, stripMarkdownInline, textFromNode } from "./heading-utils";

describe("slugifyHeading", () => {
  it("lowercases and hyphenates", () => {
    expect(slugifyHeading("Architecture & design")).toBe("architecture-design");
  });
  it("trims leading/trailing separators", () => {
    expect(slugifyHeading("  How it works internally!  ")).toBe("how-it-works-internally");
  });
});

describe("stripMarkdownInline", () => {
  it("unwraps links to their label", () => {
    expect(stripMarkdownInline("See [the docs](https://x) now")).toBe("See the docs now");
  });
  it("unwraps inline code", () => {
    expect(stripMarkdownInline("Using `OPTIMIZE` well")).toBe("Using OPTIMIZE well");
  });
  it("drops emphasis markers", () => {
    expect(stripMarkdownInline("**Bold** and *em* and ~~gone~~")).toBe("Bold and em and gone");
  });
});

describe("textFromNode", () => {
  it("flattens strings, numbers, and arrays", () => {
    expect(textFromNode(["a", 1, ["b"]])).toBe("a1b");
  });
  it("descends into element-like objects via props.children", () => {
    const node = { props: { children: ["Using ", { props: { children: "OPTIMIZE" } }] } };
    expect(textFromNode(node as never)).toBe("Using OPTIMIZE");
  });
  it("ignores null/booleans", () => {
    expect(textFromNode([null, true, "x", false])).toBe("x");
  });
});

describe("renderer/ToC anchor agreement", () => {
  // The regression this guards: a markdown heading with inline formatting must produce the
  // same slug whether derived from the raw markdown (ToC) or the rendered children (article).
  it("matches for a heading containing a link and code", () => {
    const raw = "Tuning [Direct Lake](https://learn) with `OPTIMIZE`";
    const rendered = [
      "Tuning ",
      { props: { children: "Direct Lake" } },
      " with ",
      { props: { children: "OPTIMIZE" } },
    ];
    expect(slugifyHeading(stripMarkdownInline(raw))).toBe(
      slugifyHeading(textFromNode(rendered as never)),
    );
  });
});
