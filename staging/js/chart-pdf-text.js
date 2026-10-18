// Preserve paragraphs and long identifiers. Characters unavailable in the
// PDF's standard font retain their exact Unicode code point instead of
// crashing the export or disappearing from the clinical record.
export function layoutPdfText(value, measure, maxWidth) {
  const escapedCodepoints = new Set();
  const safe = [...String(value ?? "")].map(character => {
    if (character === "\n" || character === "\r" || character === "\t") return character;
    try { measure(character); return character; }
    catch {
      const code = character.codePointAt(0).toString(16).toUpperCase();
      escapedCodepoints.add(code); return `[U+${code}]`;
    }
  }).join("");
  const lines = [];
  for (const paragraph of safe.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? line + " " + word : word;
      if (measure(candidate) <= maxWidth) { line = candidate; continue; }
      if (line) { lines.push(line); line = ""; }
      for (const character of word) {
        if (line && measure(line + character) > maxWidth) { lines.push(line); line = ""; }
        line += character;
      }
    }
    lines.push(line);
  }
  return { lines, escapedCodepoints: [...escapedCodepoints] };
}
