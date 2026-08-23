import { describe, it, expect } from "vitest";
import { parseAndAutofixHtmlDoc } from "./html-doc-parser";

describe("html-doc-parser", () => {
  it("extracts title, summary, SVGs, and capabilities from raw HTML", () => {
    const sampleHtml = `<!DOCTYPE html>
    <html>
      <head>
        <title>Spark Memory Allocator Deep Dive</title>
        <meta name="description" content="Detailed analysis of Unified Memory Manager in Fabric Spark." />
      </head>
      <body>
        <h1>Spark Memory Allocator</h1>
        <h2>Execution vs Storage Memory</h2>
        <p>This document explains Spark memory boundaries and Polaris integration.</p>
        <ul>
          <li>Unified Memory Manager partitions off-heap and on-heap memory.</li>
          <li>Dynamic borrow mechanism allows execution to borrow from storage.</li>
        </ul>
        <svg width="100" height="100"><circle cx="50" cy="50" r="40" /></svg>
        <script>console.log("interactive widget");</script>
      </body>
    </html>`;

    const { metadata, autofixedHtml } = parseAndAutofixHtmlDoc(sampleHtml);

    expect(metadata.title).toBe("Spark Memory Allocator Deep Dive");
    expect(metadata.summary).toBe("Detailed analysis of Unified Memory Manager in Fabric Spark.");
    expect(metadata.svgCount).toBe(1);
    expect(metadata.isInteractive).toBe(true);
    expect(metadata.interactiveCount).toBe(1);
    expect(metadata.capabilities).toContain("spark");
    expect(metadata.capabilities).toContain("polaris");
    expect(metadata.contentHash).toBeDefined();
    expect(metadata.highlightPoints.length).toBeGreaterThanOrEqual(1);
    expect(autofixedHtml).toContain("viewport");
  });

  it("handles duplicate hashing deterministically", () => {
    const htmlA = "<html><head><title>Test</title></head><body><p>Hello world</p></body></html>";
    const htmlB = "<html><head><title>Test</title></head><body><p>Hello world</p></body></html>";
    const resA = parseAndAutofixHtmlDoc(htmlA);
    const resB = parseAndAutofixHtmlDoc(htmlB);

    expect(resA.metadata.contentHash).toBe(resB.metadata.contentHash);
  });
});
