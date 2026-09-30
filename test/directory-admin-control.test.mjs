import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (file) => readFile(resolve(root, file), "utf8");

for (const prefix of ["", "staging/"]) {
  test(`${prefix || "produção/"} diretório é controlado somente pelo admin`, async () => {
    const [profile, admin, directory] = await Promise.all([
      read(`${prefix}perfil.html`),
      read(`${prefix}admin-profissionais.html`),
      read(`${prefix}profissionais.html`)
    ]);

    assert.doesNotMatch(profile, /id=["']listPublicly["']/);
    assert.doesNotMatch(profile, /listPublicly\s*:/);
    assert.match(admin, /setAdminDirectoryVisible/);
    assert.match(admin, /Exibir na rede/);
    assert.match(admin, /Ocultar da rede/);
    assert.match(directory, /item\.publicSchedulingEnabled/);
  });
}
