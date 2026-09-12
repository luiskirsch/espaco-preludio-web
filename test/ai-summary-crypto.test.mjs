import test from "node:test";
import assert from "node:assert/strict";
import { encryptNote, generateDEK } from "../js/crypto.js";
import { createAiSummaryEnvelope, decryptAiSummaryPayload } from "../js/ai-summary-crypto.js";

test("AI summary envelope round-trips only with the therapist DEK", async () => {
  const therapistDek = generateDEK();
  const wrongDek = generateDEK();
  const envelope = await createAiSummaryEnvelope(therapistDek);
  const payload = {
    summary: { summary: "Resumo clínico" },
    signals: { riskLevel: "none" },
    transcript: "Conteúdo da sessão",
  };
  const encrypted = await encryptNote(JSON.stringify(payload), envelope.key);
  const stored = {
    ...encrypted,
    wrappedKey: envelope.headers["X-AI-Wrapped-Key"],
    wrappedKeyIv: envelope.headers["X-AI-Wrapped-Key-IV"],
  };

  assert.deepEqual(await decryptAiSummaryPayload(stored, therapistDek), payload);
  await assert.rejects(() => decryptAiSummaryPayload(stored, wrongDek), /CHAVE_INCORRETA/);
  envelope.key.fill(0);
});
