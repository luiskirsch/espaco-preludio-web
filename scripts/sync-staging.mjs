// Espelha a produção (raiz do repositório) em staging/, byte a byte.
// Regra do projeto: o staging tem que estar idêntico à produção.
// Uso: node scripts/sync-staging.mjs          → copia o que divergir
//      node scripts/sync-staging.mjs --check  → só verifica (sai com erro se divergir)
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const check = process.argv.includes("--check");

// Arquivos que só existem na raiz: infraestrutura do domínio, ferramentas do
// repositório e fontes de marketing que nenhuma página referencia.
const ROOT_ONLY = [
  /^staging\//, /^\.github\//, /^docs\//, /^scripts\//, /^test\//, /^assets\//, /^security\//,
  /^\.git/, /^CNAME$/, /^robots\.txt$/, /^sitemap\.xml$/, /^llms\.txt$/, /^404\.html$/,
  /^[0-9a-f]{32}\.txt$/, /^README\.md$/, /^package(-lock)?\.json$/,
  /^og-(app|escolas|portal)\.(png|jpg)$/, /^og-image\.jpg$/, /^og-escolas\.png$/,
];

const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
const tracked = new Set(git(["ls-files"]));
const untracked = git(["ls-files", "--others", "--exclude-standard"]);
const prod = [...tracked, ...untracked].filter(f => !ROOT_ONLY.some(rx => rx.test(f)) && existsSync(resolve(root, f)));
const prodSet = new Set(prod);

let changed = 0;
for (const f of prod) {
  const src = readFileSync(resolve(root, f));
  const dst = resolve(root, "staging", f);
  if (existsSync(dst) && Buffer.compare(src, readFileSync(dst)) === 0) continue;
  changed++;
  if (check) { console.log(`divergente: staging/${f}`); continue; }
  mkdirSync(dirname(dst), { recursive: true });
  writeFileSync(dst, src);
}

// Arquivos que só existem no staging não têm par em produção.
const stagingOnly = [...tracked, ...untracked]
  .filter(f => f.startsWith("staging/"))
  .map(f => f.slice("staging/".length))
  .filter(f => !prodSet.has(f) && existsSync(resolve(root, "staging", f)));
for (const f of stagingOnly) {
  changed++;
  if (check) { console.log(`só no staging: staging/${f}`); continue; }
  rmSync(resolve(root, "staging", f));
}

if (check && changed) {
  console.error(`\n${changed} arquivo(s) do staging divergem da produção. Rode: node scripts/sync-staging.mjs`);
  process.exit(1);
}
console.log(check ? `Staging idêntico à produção (${prod.length} arquivos).` : `${changed} arquivo(s) sincronizado(s); ${prod.length} arquivos espelhados.`);
