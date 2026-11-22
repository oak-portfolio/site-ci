import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { loadTsx } from "./load-tsx.mjs";

// D141: Codex review on PR #119 (71c6b92a): a P1 (a quote from a private document answer made an ordinary turn) and a P2
// (research after an automatic re-ask kept the replacement request id, so saving failed).
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

test("D141-G1 a question quoting a private document answer stays private and never joins later model history", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route("**/api/oak/chat**", route => route.abort());
    await page.goto(`${galleryUrl}/__dev/oak-states?state=answer-points`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    const result = await page.evaluate(async () => {
      const find = name => performance.getEntriesByType("resource").map(entry => entry.name).find(url => new RegExp(`/${name}\\.ts(\\?|$)`).test(url));
      const workspace = await import(find("src/lib/oakWorkspace")), saved = await import(find("src/lib/oakSavedHistoryClient"));
      const send = async (privateSource, quote) => {
        const turn = crypto.randomUUID();
        const base = { cards: [], usage: null, state: "complete", page: "/", research: null };
        workspace.setOakWorkspaceFixture({ conversationId: crypto.randomUUID(), quotes: [], draft: "", pending: false, error: null, messages: [
          { ...base, id: `${turn}:user`, role: "user", text: "What does my resume say?", answer: null, taskKind: "question", ...(privateSource ? { privateDocumentTurn: true } : {}) },
          { ...base, id: turn, role: "assistant", text: "An answer.", answer: null, ...(privateSource ? { privateDocumentTurn: true } : {}) }] });
        workspace.addOakQuote(quote, turn);
        workspace.setOakDraft("Can you say more about that?");
        await workspace.submitOakTurn();
        const state = workspace.getOakWorkspace();
        return { asked: state.messages.at(-2)?.privateDocumentTurn ?? null, answered: state.messages.at(-1)?.privateDocumentTurn ?? null,
          // D157 (intentional update): history carries the question as the visitor's own words, so the turn shows up by them.
          // R19 (intentional update): only a question whose answer completed goes back, so the follow-up is marked answered here
          // (the gallery has no Worker); privacy is what this checks.
          history: JSON.stringify(saved.oakOrdinaryModelHistory({ ...state, messages: state.messages.map((message, index, all) =>
            index === all.length - 1 ? { ...message, state: "complete", text: message.text || "Answered." } : message) })).includes("Can you say more about that?") };
      };
      return { fromPrivate: await send(true, "Led design for an AI meeting-notes app"), fromPublic: await send(false, "Steve owned the scanner") };
    });
    assert.deepEqual(result.fromPrivate, { asked: true, answered: true, history: false }, "the quoting turn is private and stays out of model history");
    assert.deepEqual(result.fromPublic, { asked: null, answered: null, history: true }, "a quote from a public answer keeps the turn ordinary, and later prompts may read it");
  } finally {
    await browser.close();
  }
});

test("D141-G2 research found after an automatic re-ask belongs to the visible turn, so the saved record accepts it", async () => {
  globalThis.window ??= { innerWidth: 1280, innerHeight: 800, outerWidth: 1280, outerHeight: 900, screen: {}, addEventListener() {}, removeEventListener() {} };
  const workspace = loadTsx("src/lib/oakWorkspace.ts");
  const contracts = loadTsx("packages/oak-agent-contracts/src/transport.ts");
  const { publicResearchEventSchema } = loadTsx("packages/oak-agent-contracts/src/public-research.ts");
  const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "fixture", hardPolicyVersion: "fixture", knowledgeRevision: "fixture",
    operations: ["search", "read"], kind: "sourced", acknowledgment: null,
    claims: [{ id: "streaming", text: "Steve's agent streams staged progress.", citations: [{ documentId: "work:ecosmartloop", passageId: "public-passage",
      sectionId: "ownership", url: "https://steveoak.com/work/ecosmartloop/#ownership" }] }] };
  const status = (id, data) => ({ type: "data-status", data: { requestId: id, ...data }, transient: true });
  const research = id => ({ requestId: id, topicId: "ai-sdk-streaming", provider: "Exa", phase: "completed", reason: "none", returnedSources: 1,
    sources: [{ sourceId: `external:${id}:1`, origin: "external-web", title: "Stream protocols", url: "https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol",
      publishedAt: null, retrievedAt: 1760000000000, excerpt: "The UI message stream carries typed parts.", contentStatus: "read" }] });
  const scripts = [
    id => [{ type: "start", messageId: id }, status(id, { phase: "started" }), { type: "error", errorText: contracts.oakModelStallText }],
    id => [{ type: "start", messageId: id }, status(id, { phase: "started" }), { type: "data-research", id: `${id}:research`, data: research(id) },
      { type: "data-answer", data: answer }, { type: "data-usage", data: { requestId: id, state: "settled", actualMicroUsd: 450, heldMicroUsd: 0 } },
      { type: "finish", finishReason: "stop" }],
  ];
  const ids = [];
  globalThis.fetch = async (url, init) => {
    if (url !== "/api/oak/chat") return new Response("{}", { status: 503 });
    const id = JSON.parse(init.body).turn.requestId;
    ids.push(id);
    const parts = scripts[ids.length - 1](id), encoder = new TextEncoder();
    return new Response(new ReadableStream({ start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(`data: ${JSON.stringify(part)}\n\n`));
      controller.close();
    } }), { headers: { "X-Oak-Request-Id": id, "x-vercel-ai-ui-message-stream": "v1" } });
  };
  workspace.setOakWorkspaceFixture({ presentation: "human-agent", viewportSupported: true, messages: [], pending: false, error: null,
    draft: "What is the latest AI SDK streaming guidance?" });
  await workspace.submitOakTurn();
  const last = workspace.getOakWorkspace().messages.at(-1);
  assert.equal(ids.length, 2, "one automatic re-ask");
  assert.equal(last.id, ids[0], "the visible turn keeps its first id");
  assert.equal(last.research?.requestId, last.id, "the research belongs to the visible turn, as the saved record requires");
  assert.equal(last.research.sources[0].sourceId, `external:${last.id}:1`, "its sources are re-addressed with it");
  assert.equal(publicResearchEventSchema.safeParse(last.research).success, true, "and the event still passes its own checks");
});
