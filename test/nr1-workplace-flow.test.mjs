import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = file => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("fluxo NR-1 cobre governança, inventário, ação, AEP/PGR e conclusão", async () => {
  const [adminHtml, companyHtml, adminJs, companyJs] = await Promise.all([
    read("admin-nr1.html"), read("empresa-nr1.html"),
    read("js/nr1-admin.js"), read("js/nr1-company.js")
  ]);
  for (const field of ["scope", "workerParticipationPlan", "privacyContact", "plannedCloseDate"]) {
    assert.match(adminHtml, new RegExp(`name=["']${field}["']`));
  }
  for (const field of ["processEnvironment", "affectedGroup", "possibleHarm", "controlType",
    "aepReference", "pgrStatus", "reviewDueDate"]) {
    assert.match(companyHtml, new RegExp(`name=["']${field}["']`));
  }
  assert.match(adminHtml, /id="finalizeForm"/);
  assert.match(adminJs, /confirmTechnicalResponsibility/);
  assert.match(companyJs, /privacyNoticeVersion|riskCriteria/);
});

test("participante aceita aviso versionado e empresa recebe somente agregados", async () => {
  const [employeeHtml, employeeJs, companyJs] = await Promise.all([
    read("paciente-nr1.html"), read("js/nr1-employee.js"), read("js/nr1-company.js")
  ]);
  assert.match(employeeHtml, /id="acknowledge"/);
  assert.match(employeeHtml, /id="privacyDetails"/);
  assert.match(employeeJs, /noticeAccepted/);
  assert.match(employeeJs, /privacyNoticeVersion/);
  assert.match(companyJs, /unitBreakdownSuppressed/);
  assert.doesNotMatch(companyJs, /responses\/[^`"']+\/individual/);
});
