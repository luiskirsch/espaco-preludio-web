import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const mirrors = [
  "js/crypto.js",
  "js/session-ai-capture.js",
  "js/ai-summary-crypto.js",
  "logo_oficial_fundo_transparente.png",
];

for (const source of mirrors) {
  const production = await readFile(resolve(root, source));
  const staging = await readFile(resolve(root, "staging", source));
  assert.deepEqual(staging, production, `${source} divergiu entre produção e staging`);
}

console.log(`${mirrors.length} ativos críticos sincronizados entre produção e staging.`);
