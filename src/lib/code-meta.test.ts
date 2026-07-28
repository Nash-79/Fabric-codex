import { describe, expect, it } from "vitest";
import { parseCodeMeta, isOutputBlock } from "./code-meta";

describe("parseCodeMeta", () => {
  it("returns empty defaults for no meta string", () => {
    expect(parseCodeMeta(undefined)).toEqual({ highlightLines: new Set() });
    expect(parseCodeMeta(null)).toEqual({ highlightLines: new Set() });
    expect(parseCodeMeta("")).toEqual({ highlightLines: new Set() });
  });

  it("parses a title", () => {
    const meta = parseCodeMeta('title="direct_lake.py"');
    expect(meta.title).toBe("direct_lake.py");
    expect(meta.highlightLines.size).toBe(0);
  });

  it("parses a highlighted-line list with a range", () => {
    const meta = parseCodeMeta("{2,4-6}");
    expect([...meta.highlightLines].sort((a, b) => a - b)).toEqual([2, 4, 5, 6]);
  });

  it("parses title and highlighted lines together", () => {
    const meta = parseCodeMeta('title="example.py" {1,3}');
    expect(meta.title).toBe("example.py");
    expect([...meta.highlightLines].sort((a, b) => a - b)).toEqual([1, 3]);
  });

  it("ignores malformed range fragments without throwing", () => {
    const meta = parseCodeMeta("{1,,abc,3}");
    expect([...meta.highlightLines].sort((a, b) => a - b)).toEqual([1, 3]);
  });
});

describe("isOutputBlock", () => {
  it("detects the data-output marker", () => {
    expect(isOutputBlock("data-output")).toBe(true);
    expect(isOutputBlock('title="Output" data-output')).toBe(true);
  });

  it("returns false when absent", () => {
    expect(isOutputBlock('title="example.py"')).toBe(false);
    expect(isOutputBlock(undefined)).toBe(false);
  });
});
