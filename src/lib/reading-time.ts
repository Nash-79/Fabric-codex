/** Estimate reading time in minutes from markdown/plain text (~200 wpm, min 1). */
export function readingTime(text: string, wpm = 200): number {
  const words = (text || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / wpm));
}
