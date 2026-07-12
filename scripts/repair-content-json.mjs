import { readFileSync, writeFileSync } from "node:fs";

const targets = process.argv.slice(2);
if (!targets.length) throw new Error("Pass one or more JSON files to repair.");

function repair(raw) {
  const marker = '"body_md": "';
  const start = raw.indexOf(marker);
  const suffixes = ['",\n  "cited_source_keys"', '",\r\n  "cited_source_keys"'];
  const end = Math.max(...suffixes.map((suffix) => raw.lastIndexOf(suffix)));
  if (start < 0 || end < start) throw new Error("Could not isolate body_md string.");
  const bodyStart = start + marker.length;
  const body = raw.slice(bodyStart, end).replace(/\r?\n/g, "\\n");
  let escapedBody = "";
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char !== '"') {
      escapedBody += char;
      continue;
    }
    let backslashes = 0;
    for (let cursor = index - 1; cursor >= 0 && body[cursor] === "\\"; cursor -= 1) {
      backslashes += 1;
    }
    escapedBody += backslashes % 2 === 1 ? '"' : '\\"';
  }
  return `${raw.slice(0, bodyStart)}${escapedBody}${raw.slice(end)}`;
}

for (const target of targets) {
  const raw = readFileSync(target, "utf8");
  try {
    JSON.parse(raw);
    console.log(`${target}: already valid`);
    continue;
  } catch {
    const repaired = repair(raw);
    JSON.parse(repaired);
    writeFileSync(target, `${JSON.stringify(JSON.parse(repaired), null, 2)}\n`);
    console.log(`${target}: repaired`);
  }
}
