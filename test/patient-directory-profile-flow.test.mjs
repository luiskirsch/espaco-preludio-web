import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

for (const prefix of ["", "staging/"]) {
  test(`${prefix || "produção/"} seleção da rede carrega o perfil completo por UID`, async () => {
    const search = await readFile(new URL(`../${prefix}app/buscar.html`, import.meta.url), "utf8");
    const schedule = await readFile(new URL(`../${prefix}app/agendar.html`, import.meta.url), "utf8");

    assert.match(search, /agendar\.html\?uid=\$\{encodeURIComponent\(professional\.uid\)\}/);
    assert.match(schedule, /\/public\/profissionais\/\$\{encodeURIComponent\(professionalUid\)\}/);
    assert.match(schedule, /id="profLocation"/);
    assert.match(schedule, /id="profBio"/);
    assert.match(schedule, /publicSchedulingEnabled === true/);
    assert.match(schedule, /encodeURIComponent\(bookingSlug\).*\/slots/);
    assert.match(schedule, /filter\(slot => slot\.available\)/);
    assert.match(schedule, /availableSlotsByDay\.set\(key, \[\]\)/);
    assert.match(schedule, /for \(const \[key, slots\] of availableSlotsByDay\)/);
    assert.doesNotMatch(schedule, /for \(let i = 1; i <= 30; i\+\+\)/);
    assert.match(schedule, /Agenda online indisponível/);
    assert.doesNotMatch(schedule, /public\/profissionais\?q=/);
  });
}
