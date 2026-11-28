import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTsx } from "./load-tsx.mjs";

// D152: Codex review on PR #119 (a5920df0). A stalled call on a question quoting a private answer was re-asked
// automatically, sending the private quote to the model a second time without a click.
test("D152-G1 a stalled question quoting a private answer is never re-asked without a click; a public one still is", async () => {
  globalThis.window ??= { innerWidth: 1280, innerHeight: 800, outerWidth: 1280, outerHeight: 900, screen: {}, addEventListener() {}, removeEventListener() {} };
  const workspace = loadTsx("src/lib/oakWorkspace.ts");
  const contracts = loadTsx("packages/oak-agent-contracts/src/transport.ts");
  const status = (id, data) => ({ type: "data-status", data: { requestId: id, ...data }, transient: true });
  let ids = [];
  globalThis.fetch = async (url, init) => {
    if (url !== "/api/oak/chat") return new Response("{}", { status: 503 });
    const id = JSON.parse(init.body).turn.requestId;
    ids.push(id);
    const parts = [{ type: "start", messageId: id }, status(id, { phase: "started" }), { type: "error", errorText: contracts.oakModelStallText }];
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({ start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(`data: ${JSON.stringify(part)}\n\n`));
      controller.close();
    } }), { headers: { "X-Oak-Request-Id": id, "x-vercel-ai-ui-message-stream": "v1" } });
  };
  const ask = async privateSource => {
    ids = [];
    const turn = crypto.randomUUID(), base = { cards: [], usage: null, state: "complete", page: "/", research: null, answer: null, taskKind: "question",
      ...(privateSource ? { privateDocumentTurn: true } : {}) };
    workspace.setOakWorkspaceFixture({ presentation: "human-agent", viewportSupported: true, conversationId: crypto.randomUUID(), pending: false, error: null, quotes: [], draft: "",
      messages: [{ ...base, id: `${turn}:user`, role: "user", text: "What does it say?" }, { ...base, id: turn, role: "assistant", text: "An answer." }] });
    workspace.addOakQuote("Steve built the scanner", turn);
    workspace.setOakDraft("Say more about that?");
    await workspace.submitOakTurn();
    return ids.length;
  };
  assert.equal(await ask(true), 1, "a private quote is sent once; Retry stays a click");
  assert.equal(await ask(false), 2, "a public question still gets its one automatic re-ask");
});
