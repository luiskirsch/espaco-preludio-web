import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

for (const prefix of ["", "staging/"]) {
  test(`${prefix || "produção/"} portal oferece hover consistente nos controles`, async () => {
    const css = await readFile(new URL(`../${prefix}app/app.css`, import.meta.url), "utf8");

    assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/);
    assert.match(css, /\.a-btn--accent:not\(:disabled\):hover/);
    assert.match(css, /\.a-btn--ghost:not\(:disabled\):hover/);
    assert.match(css, /\.home-hero__btn:hover/);
    assert.match(css, /\.a-chip:not\(\.is-active\)/);
    assert.match(css, /\.a-slot:not\(\.is-selected\)/);
    assert.match(css, /\.a-cal__day:not\(\.is-selected\)/);
    assert.match(css, /\.learning-module:not\(:disabled\):hover/);
    assert.match(css, /\.home-section-head > a/);
    assert.match(css, /\.menu-item, \.conv-item/);
    assert.match(css, /body\.a-portal-authenticated :where\(a\[href\], button:not\(:disabled\), summary, \[role="button"\]\):hover/);
    assert.match(css, /\.a-nav__urgent:hover/);
    assert.match(css, /\.emergency-primary a, \.emergency-more > div a/);
    assert.match(css, /\.emergency-sources a:hover/);
  });
}

test("páginas do portal requisitam a versão nova do CSS interativo", async () => {
  const versions = new Map();
  for (const directory of ["app", "staging/app"]) {
    const files = (await readdir(new URL(`../${directory}/`, import.meta.url)))
      .filter(file => file.endsWith(".html"));
    for (const file of files) {
      const html = await readFile(new URL(`../${directory}/${file}`, import.meta.url), "utf8");
      const version = html.match(/\.\/app\.css\?h=(\w+)/);
      if (version) versions.set(`${directory}/${file}`, version[1]);
    }
  }
  assert.ok(versions.size > 0);
  assert.equal(new Set(versions.values()).size, 1, JSON.stringify(Object.fromEntries(versions)));
});

for (const prefix of ["", "staging/"]) {
  test(`${prefix || "produção/"} botão de avançar da agenda não se desloca no hover`, async () => {
    const html = await readFile(new URL(`../${prefix}app/agendar.html`, import.meta.url), "utf8");

    assert.match(
      html,
      /#footerBtn \.a-btn:hover\s*\{\s*transform:\s*none;\s*filter:\s*none;\s*\}/
    );
  });
}
