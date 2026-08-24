import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { parseAndAutofixHtmlDoc, extractHtmlSections, validateHtmlDoc } from "./html-doc-parser";

describe("html-doc-parser", () => {
  it("extracts title, summary, SVGs, sections, and capabilities from raw HTML", () => {
    const sampleHtml = `<!DOCTYPE html>
    <html>
      <head>
        <title>Spark Memory Allocator Deep Dive</title>
        <meta name="description" content="Detailed analysis of Unified Memory Manager in Fabric Spark." />
      </head>
      <body>
        <h1>Spark Memory Allocator</h1>
        <h2 id="exec-storage">Execution vs Storage Memory</h2>
        <p>This document explains Spark memory boundaries and Polaris integration.</p>
        <ul>
          <li>Unified Memory Manager partitions off-heap and on-heap memory.</li>
          <li>Dynamic borrow mechanism allows execution to borrow from storage.</li>
        </ul>
        <h3 id="off-heap">Off-Heap Allocations</h3>
        <p>Off-heap allocations avoid JVM garbage collection pauses for tungsten sort buffers.</p>
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

    // Sections
    expect(metadata.sections.length).toBe(3);
    expect(metadata.sections[0].title).toBe("Spark Memory Allocator");
    expect(metadata.sections[0].level).toBe(1);
    expect(metadata.sections[1].title).toBe("Execution vs Storage Memory");
    expect(metadata.sections[1].id).toBe("exec-storage");
    expect(metadata.sections[1].level).toBe(2);
    expect(metadata.sections[2].title).toBe("Off-Heap Allocations");
    expect(metadata.sections[2].level).toBe(3);
    expect(metadata.sections[2].hasSvg).toBe(true);
    expect(metadata.sections[2].hasInteractive).toBe(true);
  });

  it("handles duplicate hashing deterministically", () => {
    const htmlA = "<html><head><title>Test</title></head><body><p>Hello world</p></body></html>";
    const htmlB = "<html><head><title>Test</title></head><body><p>Hello world</p></body></html>";
    const resA = parseAndAutofixHtmlDoc(htmlA);
    const resB = parseAndAutofixHtmlDoc(htmlB);

    expect(resA.metadata.contentHash).toBe(resB.metadata.contentHash);
  });

  it("validates well-formed and malformed HTML documents", () => {
    const validHtml = `<!DOCTYPE html>
    <html>
      <head><title>Valid Document</title><meta name="description" content="Valid description for test." /></head>
      <body>
        <h1>Valid Document</h1>
        <h2>Section 1</h2>
        <p>This is a long enough paragraph with Fabric and Spark details to pass validation thresholds properly.</p>
        <p>This is a long enough paragraph with Microsoft Fabric and Spark engine details to pass validation thresholds properly. It explains distributed query execution and storage partition layouts.</p>
        <h2>Section 2</h2>
        <p>Another section discussing OneLake architecture and storage mechanics in detail.</p>
        <p>Another comprehensive section discussing OneLake architecture and storage mechanics in detail with Parquet formatting, Delta Lake transaction log commits, and Direct Lake semantic model paging.</p>
      </body>
    </html>`;

    const validResult = validateHtmlDoc(validHtml);
    expect(validResult.valid).toBe(true);
    expect(validResult.errors).toHaveLength(0);
    expect(validResult.metadata.sections.length).toBe(3);

    const invalidHtml = "<html><body><p>Too short</p></body></html>";
    const invalidResult = validateHtmlDoc(invalidHtml);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors.length).toBeGreaterThan(0);
  });

  it("validates all toolkit-source reference HTML documents on disk", () => {
    const toolkitDir = path.resolve(process.cwd(), "public/toolkit-source");
    if (!fs.existsSync(toolkitDir)) return;

    const files = fs
      .readdirSync(toolkitDir)
      .filter((f) => f.endsWith(".html") && f !== "index.html");
    expect(files.length).toBeGreaterThanOrEqual(4);

    for (const file of files) {
      const content = fs.readFileSync(path.join(toolkitDir, file), "utf8");
      const result = validateHtmlDoc(content);
      expect(result.valid).toBe(true);
      expect(result.metadata.title.length).toBeGreaterThan(0);
      expect(result.metadata.sections.length).toBeGreaterThan(0);
      expect(result.metadata.wordCount).toBeGreaterThan(100);
      expect(result.metadata.capabilities.length).toBeGreaterThan(0);
    }
  });
});
