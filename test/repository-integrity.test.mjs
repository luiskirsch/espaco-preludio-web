import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const IGNORED_DIRS = new Set([".git", "node_modules"]);

function filesUnder(directory, extension, output = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) filesUnder(absolute, extension, output);
    else if (entry.isFile() && extname(entry.name) === extension) output.push(absolute);
  }
  return output;
}

test("local HTML references resolve to versioned files", () => {
  const failures = [];
  const attribute = /\b(?:href|src)\s*=\s*["']([^"']+)["']/gi;

  for (const htmlFile of filesUnder(ROOT, ".html")) {
    const html = readFileSync(htmlFile, "utf8");
    for (const match of html.matchAll(attribute)) {
      const value = match[1].trim();
      if (!value || value.includes("${") || /^(?:#|https?:|mailto:|tel:|data:|blob:|javascript:|\/\/)/i.test(value)) continue;
      const clean = value.split(/[?#]/, 1)[0];
      if (!clean) continue;
      const target = clean.startsWith("/") ? join(ROOT, clean.slice(1)) : resolve(dirname(htmlFile), clean);
      if (!existsSync(target)) failures.push(`${relative(ROOT, htmlFile)} -> ${value}`);
    }
  }

  assert.deepEqual(failures, []);
});

test("app service worker keeps documents fresh and notification navigation same-origin", () => {
  const source = readFileSync(join(ROOT, "sw-app.js"), "utf8");
  assert.match(source, /request\.mode === "navigate"/);
  assert.match(source, /const fresh = await fetch\(request\)/);
  assert.match(source, /target\.origin !== self\.location\.origin/);
  assert.doesNotMatch(source, /event\.data\?\.json\(\)\.catch/);
});

test("app bootstrap registers its service worker once", () => {
  const html = readFileSync(join(ROOT, "app", "index.html"), "utf8");
  assert.equal((html.match(/serviceWorker\.register/g) || []).length, 0);
  assert.equal((html.match(/sw-register\.js/g) || []).length, 1);
});
