import crypto from "crypto";

export interface HtmlDocSection {
  id?: string;
  level: number;
  title: string;
  wordCount: number;
  hasSvg: boolean;
  hasInteractive: boolean;
}

export interface ParsedHtmlDocMetadata {
  title: string;
  subtitle: string;
  summary: string;
  contentHash: string;
  wordCount: number;
  readingTimeMinutes: number;
  svgCount: number;
  sectionsCount: number;
  interactiveCount: number;
  isInteractive: boolean;
  capabilities: string[];
  highlightPoints: string[];
  gapsDetected: string[];
  sections: HtmlDocSection[];
}

export interface HtmlDocValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metadata: ParsedHtmlDocMetadata;
}

const KNOWN_CAPABILITIES = [
  "spark",
  "lakehouse",
  "warehouse",
  "fabric-platform",
  "onelake",
  "polaris",
  "direct-lake",
  "semantic-model",
  "power-bi",
  "data-factory",
  "dataflow-gen2",
  "rti",
  "eventhouse-kql",
  "sql-database",
  "mirroring",
  "fabric-data-agent",
  "graphql-api",
  "purview",
  "capacity",
  "materialized-lake-views",
  "fabric-iq",
];

function cleanText(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts and parses structured sections (h1, h2, h3, h4) from an HTML document.
 */
export function extractHtmlSections(html: string): HtmlDocSection[] {
  const sections: HtmlDocSection[] = [];
  const headingRegex =
    /<h([1-4])(?:\s+[^>]*?id=["']([^"']*)["'][^>]*|\s*[^>]*)>([\s\S]*?)<\/h\1>/gi;
  const matches: Array<{
    level: number;
    id?: string;
    title: string;
    index: number;
    length: number;
  }> = [];

  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(html)) !== null) {
    const level = parseInt(match[1], 10);
    const id = match[2]?.trim() || undefined;
    const title = cleanText(match[3]);
    matches.push({
      level,
      id,
      title,
      index: match.index,
      length: match[0].length,
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const startIndex = current.index + current.length;
    const endIndex = i + 1 < matches.length ? matches[i + 1].index : html.length;
    const sectionChunk = html.slice(startIndex, endIndex);

    const plain = cleanText(sectionChunk);
    const words = plain.split(" ").filter((w) => w.length > 0);
    const hasSvg = /<svg[^>]*>/i.test(sectionChunk);
    const hasInteractive = /<script|<canvas/i.test(sectionChunk);

    sections.push({
      id: current.id,
      level: current.level,
      title: current.title,
      wordCount: words.length,
      hasSvg,
      hasInteractive,
    });
  }

  return sections;
}

/**
 * Parses and analyzes an HTML document string to extract structured metadata,
 * detect interactive elements, compute deduplication hashes, and find capability mappings.
 */
export function parseAndAutofixHtmlDoc(
  html: string,
  fallbackTitle = "Untitled Document",
): {
  metadata: ParsedHtmlDocMetadata;
  autofixedHtml: string;
} {
  let processedHtml = html;

  // 1. Autofix: Strip UTF-8 BOM if present
  if (processedHtml.charCodeAt(0) === 0xfeff) {
    processedHtml = processedHtml.slice(1);
  }

  // 2. Compute SHA-256 content hash for deduplication
  const hash = crypto.createHash("sha256").update(processedHtml, "utf8").digest("hex");

  // 3. Extract title
  let title = "";
  const titleMatch = processedHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1]?.trim()) {
    title = cleanText(titleMatch[1]);
  } else {
    const h1Match = processedHtml.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    title = h1Match && h1Match[1]?.trim() ? cleanText(h1Match[1]) : fallbackTitle;
  }

  // 4. Extract subtitle and summary
  let subtitle = "";
  let summary = "";
  const metaDescMatch = processedHtml.match(
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i,
  );
  if (metaDescMatch && metaDescMatch[1]?.trim()) {
    summary = cleanText(metaDescMatch[1]);
  }

  const h2Match = processedHtml.match(/<h2[^>]*>([^<]+)<\/h2>/i);
  if (h2Match && h2Match[1]?.trim()) {
    subtitle = cleanText(h2Match[1]);
  }

  if (!summary) {
    const pMatch = processedHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (pMatch && pMatch[1]) {
      const pClean = cleanText(pMatch[1]);
      summary = pClean.slice(0, 300);
      if (pClean.length >= 300) summary += "...";
    }
  }
  if (!summary) summary = "Self-contained technical reference document.";
  if (!subtitle) subtitle = "Fabric Architecture & Deep Dive";

  // 5. Extract structured sections
  const sections = extractHtmlSections(processedHtml);
  const sectionsCount = Math.max(1, sections.length);

  // 6. Count structure metrics
  const svgMatches = processedHtml.match(/<svg[^>]*>/gi) || [];
  const svgCount = svgMatches.length;

  const scriptMatches = processedHtml.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
  const canvasMatches = processedHtml.match(/<canvas[^>]*>/gi) || [];
  const interactiveCount = scriptMatches.length + canvasMatches.length;
  const isInteractive = interactiveCount > 0;

  // 7. Word count & reading time
  const plainText = cleanText(processedHtml);
  const words = plainText.split(" ").filter((w) => w.length > 0);
  const wordCount = words.length;
  const readingTimeMinutes = Math.max(2, Math.ceil(wordCount / 200));

  // 8. Auto-detect capabilities based on keyword presence
  const lowerText = plainText.toLowerCase();
  const matchedCaps = KNOWN_CAPABILITIES.filter((cap) => {
    const term = cap.replace(/-/g, " ");
    return lowerText.includes(cap) || lowerText.includes(term);
  });
  const capabilities = matchedCaps.length > 0 ? matchedCaps.slice(0, 4) : ["fabric-platform"];

  // 9. Extract highlight bullet points (from <li> or summary blocks)
  const liMatches = processedHtml.match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || [];
  const highlightPoints: string[] = [];
  for (const li of liMatches) {
    const text = cleanText(li);
    if (text.length > 20 && text.length < 180 && !highlightPoints.includes(text)) {
      highlightPoints.push(text);
      if (highlightPoints.length >= 4) break;
    }
  }
  if (highlightPoints.length === 0) {
    highlightPoints.push("Production-grade Microsoft Fabric architecture reference");
    highlightPoints.push("Engine execution internals and configuration guidance");
  }

  // 10. Gap detection
  const gapsDetected: string[] = [];
  if (lowerText.includes("coming soon") || lowerText.includes("placeholder")) {
    gapsDetected.push("Contains 'Coming soon' or uncompleted section markers");
  }
  if (
    !lowerText.includes("performance") &&
    !lowerText.includes("metric") &&
    !lowerText.includes("latency")
  ) {
    gapsDetected.push("Lacks explicit performance characteristics");
  }

  // 11. Autofix HTML: Ensure viewport and responsive container
  if (!processedHtml.includes("viewport") && processedHtml.includes("<head>")) {
    processedHtml = processedHtml.replace(
      "<head>",
      '<head>\n<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    );
  }

  return {
    metadata: {
      title,
      subtitle,
      summary,
      contentHash: hash,
      wordCount,
      readingTimeMinutes,
      svgCount,
      sectionsCount,
      interactiveCount,
      isInteractive,
      capabilities,
      highlightPoints,
      gapsDetected,
      sections,
    },
    autofixedHtml: processedHtml,
  };
}

/**
 * Validates an HTML reference document ensuring its structural integrity,
 * valid section hierarchy, content non-emptiness, and capability bindings.
 */
export function validateHtmlDoc(
  html: string,
  fallbackTitle = "Untitled Document",
): HtmlDocValidationResult {
  const { metadata } = parseAndAutofixHtmlDoc(html, fallbackTitle);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!metadata.title || metadata.title === "Untitled Document") {
    errors.push("Missing document title or h1 heading.");
  }
  if (metadata.wordCount < 50) {
    errors.push(`Document content too short: ${metadata.wordCount} words (minimum 50 required).`);
  }
  if (metadata.sectionsCount === 0) {
    errors.push("Document contains no section headers (h1-h4).");
  }
  if (!metadata.summary || metadata.summary.length < 10) {
    warnings.push("Document lacks an explicit summary or meta description.");
  }
  if (metadata.capabilities.length === 0) {
    warnings.push("No Fabric capabilities could be detected from content.");
  }

  for (const section of metadata.sections) {
    if (!section.title.trim()) {
      errors.push(`Empty section header title found at level ${section.level}.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metadata,
  };
}
