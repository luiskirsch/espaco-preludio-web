import test from "node:test";
import assert from "node:assert/strict";
import { TOPIC_LIBRARY, getDeckTopics, topicKey } from "../js/topics.js";
import { readFileSync } from "node:fs";
import { parse } from "acorn";

test("existing profiles keep the full library and custom topics", () => {
  assert.deepEqual(getDeckTopics(), TOPIC_LIBRARY);
  const custom = { id: "mine", abord: "custom", text: "Minha pergunta" };
  assert.deepEqual(getDeckTopics({ sessionTopics: [custom] }), [custom, ...TOPIC_LIBRARY]);
});

test("saved exclusions remove only chosen topics and preserve custom text", () => {
  const custom = { id: "mine", abord: "custom", text: "Minha pergunta", enabled: false };
  const profile = { sessionTopics: [custom], disabledSessionTopics: [topicKey(TOPIC_LIBRARY[0])] };
  const deck = getDeckTopics(JSON.parse(JSON.stringify(profile)));
  assert.deepEqual(deck, TOPIC_LIBRARY.slice(1));
  assert.equal(profile.sessionTopics[0].text, "Minha pergunta");
  custom.enabled = true;
  profile.disabledSessionTopics = [];
  assert.equal(getDeckTopics(profile).length, TOPIC_LIBRARY.length + 1);
});

test("all topics can be disabled without silently restoring the library", () => {
  assert.deepEqual(getDeckTopics({ disabledSessionTopics: TOPIC_LIBRARY.map(topicKey) }), []);
  assert.equal(new Set(TOPIC_LIBRARY.map(topicKey)).size, TOPIC_LIBRARY.length);
});

test("profile and consultation scripts parse and consultation uses selected topics for listing and drawing", () => {
  for (const file of ["perfil.html", "consultorio.html"]) {
    const html = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (script[1].includes("speculationrules")) continue;
      parse(script[2], { ecmaVersion: "latest", sourceType: script[1].includes("module") ? "module" : "script" });
    }
    if (file === "perfil.html") assert.match(html, /disabledSessionTopics:\s*\[\.\.\.disabledSessionTopics\]/);
    else {
      assert.match(html, /filtered = deckTopics/);
      assert.match(html, /pool = deckTopics/);
      assert.doesNotMatch(html, /TOPIC_LIBRARY/);
    }
  }
});
