import crypto from "crypto";

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
    title = titleMatch[1].trim();
  } else {
    const h1Match = processedHtml.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    title = h1Match && h1Match[1]?.trim() ? h1Match[1].trim() : fallbackTitle;
  }
  // Decode basic HTML entities in title
  title = title
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // 4. Extract subtitle and summary
  let subtitle = "";
  let summary = "";
  const metaDescMatch = processedHtml.match(
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i,
  );
  if (metaDescMatch && metaDescMatch[1]?.trim()) {
    summary = metaDescMatch[1].trim();
  }

  const h2Match = processedHtml.match(/<h2[^>]*>([^<]+)<\/h2>/i);
  if (h2Match && h2Match[1]?.trim()) {
    subtitle = h2Match[1].trim();
  }

  if (!summary) {
    const pMatch = processedHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (pMatch && pMatch[1]) {
      // Strip tags from first paragraph
      summary = pMatch[1]
        .replace(/<[^>]+>/g, "")
        .trim()
        .slice(0, 300);
      if (summary.length >= 300) summary += "...";
    }
  }
  if (!summary) summary = "Self-contained technical reference document.";
  if (!subtitle) subtitle = "Fabric Architecture & Deep Dive";

  // 5. Count structure metrics
  const h2Matches = processedHtml.match(/<h2[^>]*>/gi) || [];
  const h3Matches = processedHtml.match(/<h3[^>]*>/gi) || [];
  const sectionsCount = Math.max(1, h2Matches.length + h3Matches.length);

  const svgMatches = processedHtml.match(/<svg[^>]*>/gi) || [];
  const svgCount = svgMatches.length;

  const scriptMatches = processedHtml.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
  const canvasMatches = processedHtml.match(/<canvas[^>]*>/gi) || [];
  const interactiveCount = scriptMatches.length + canvasMatches.length;
  const isInteractive = interactiveCount > 0;

  // 6. Word count & reading time
  const plainText = processedHtml
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = plainText.split(" ").filter((w) => w.length > 0);
  const wordCount = words.length;
  const readingTimeMinutes = Math.max(2, Math.ceil(wordCount / 200));

  // 7. Auto-detect capabilities based on keyword presence
  const lowerText = plainText.toLowerCase();
  const matchedCaps = KNOWN_CAPABILITIES.filter((cap) => {
    const term = cap.replace(/-/g, " ");
    return lowerText.includes(cap) || lowerText.includes(term);
  });
  const capabilities = matchedCaps.length > 0 ? matchedCaps.slice(0, 4) : ["fabric-platform"];

  // 8. Extract highlight bullet points (from <li> or summary blocks)
  const liMatches = processedHtml.match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || [];
  const highlightPoints: string[] = [];
  for (const li of liMatches) {
    const text = li.replace(/<[^>]+>/g, "").trim();
    if (text.length > 20 && text.length < 180 && !highlightPoints.includes(text)) {
      highlightPoints.push(text);
      if (highlightPoints.length >= 4) break;
    }
  }
  if (highlightPoints.length === 0) {
    highlightPoints.push("Production-grade Microsoft Fabric architecture reference");
    highlightPoints.push("Engine execution internals and configuration guidance");
  }

  // 9. Gap detection
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

  // 10. Autofix HTML: Ensure viewport and responsive container
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
    },
    autofixedHtml: processedHtml,
  };
}
