import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadTsx } from "../design-rework/load-tsx.mjs";
import { galleryStates, stateById } from "./gallery.mjs";

// R21 review M2: favicons ride only the live event. The sign-in handoff and the saved conversation never carry them.
const store = new Map();
globalThis.window = { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {},
  sessionStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) } };
const states = galleryStates;
const research = stateById("research-web").workspace.messages[0].research;
const answer = JSON.parse(readFileSync("tests/agent/design-rework/fixtures/live-advice-answer.json", "utf8"));
const handoff = loadTsx("src/lib/oakAuthHandoff.ts");
const { renderOakAnswer } = loadTsx("packages/oak-agent-contracts/src/output.ts");
const { withoutFavicons } = loadTsx("packages/oak-agent-contracts/src/public-research.ts");

test("R21 M2 the fixture has favicons and withoutFavicons removes exactly that field", () => {
  assert.equal(research.sources.filter(source => source.favicon).length, 2);
  const bare = withoutFavicons(research);
  assert.ok(bare.sources.every(source => !("favicon" in source)));
  assert.deepEqual(bare.sources.map(source => source.url), research.sources.map(source => source.url));
  assert.equal(withoutFavicons({ ...research, sources: bare.sources }).sources, bare.sources, "nothing to strip returns the same sources");
});

test("R21 M2 the sign-in handoff drops favicons from the stored research", () => {
  const turn = crypto.randomUUID();
  const base = { cards: [], usage: null, state: "complete", page: "/" };
  const saved = handoff.saveOakAuthHandoff({ conversationId: crypto.randomUUID(), draft: "", draftKind: "question", contactPreference: "open", questionDraft: null,
    roleDraft: null, briefDraft: null, quotes: [], messages: [
      { ...base, id: `${turn}:user`, role: "user", text: "How do teams evaluate agents?", answer: null, taskKind: "question", research: null },
      { ...base, id: turn, role: "assistant", text: renderOakAnswer(answer), answer, startedAt: Date.now(), taskKind: "question", research }] });
  assert.equal(saved, true, "the handoff saves");
  const text = [...store.values()].join("");
  assert.ok(!text.includes("data:image/png"), "no favicon bytes are stored");
  const restored = handoff.readOakAuthHandoff().messages.find(message => message.research).research;
  assert.equal(restored.sources.length, 3);
  assert.ok(restored.sources.every(source => !source.favicon));
});

test("R21 M2 the saved conversation write path drops favicons", () => {
  const { projectOakSavedHistory } = loadTsx("src/lib/oakSavedHistoryClient.ts");
  const turn = crypto.randomUUID();
  const base = { cards: [], usage: null, state: "complete", page: "/" };
  const request = projectOakSavedHistory({ conversationId: crypto.randomUUID(), messages: [
    { ...base, id: `${turn}:user`, role: "user", text: "How do teams evaluate agents?", answer: null, taskKind: "question", research: null },
    { ...base, id: turn, role: "assistant", text: renderOakAnswer(answer), answer, startedAt: Date.now(), taskKind: "question",
      research: { ...research, synthesis: undefined, requestId: turn, sources: research.sources.map((source, at) => ({ ...source, sourceId: `external:${turn}:${at + 1}` })) } }] });
  assert.ok(request, "the conversation projects");
  const saved = request.messages.find(message => message.research).research;
  assert.equal(saved.sources.length, 3);
  assert.ok(saved.sources.every(source => !("favicon" in source)));
  assert.ok(!JSON.stringify(request).includes("data:image/png"));
});
