import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

for (const file of ["painel.html", "staging/painel.html"]) {
  test(`${file} mantém o nome legível no destaque de consulta pendente`, async () => {
    const html = await readFile(resolve(root, file), "utf8");
    assert.match(
      html,
      /#heroNextSession\.is-overdue #heroNextPatient\s*\{[^}]*color:\s*#fffaf0/i
    );
  });
}
