import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTsx } from "./load-tsx.mjs";

globalThis.window ??= { innerWidth: 1280, innerHeight: 800, outerWidth: 1280, outerHeight: 900, screen: {}, addEventListener() {}, removeEventListener() {} };
const workspace = loadTsx("src/lib/oakWorkspace.ts");
const kinds = rows => rows.map(row => `${row.operation}:${row.state}`);

test("ticket 168 a planned turn's stream with no model-start for step 1 still renders understand, search, then weigh", async () => {
  const hold = {};
  globalThis.fetch = async (_url, init) => {
    const id = JSON.parse(init.body).turn.requestId;
    const encode = part => new TextEncoder().encode(`data: ${JSON.stringify(part)}\n\n`);
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(encode({ type: "start", messageId: id }));
      for (const data of [{ phase: "started" }, { phase: "tool-start", step: 1, operation: "search" },
        { phase: "tool-end", step: 1, operation: "search", count: 3 }, { phase: "model-start", step: 2 }])
        controller.enqueue(encode({ type: "data-status", data: { requestId: id, ...data }, transient: true }));
      hold.fail = () => controller.error(new Error("network"));
    } }), { headers: { "X-Oak-Request-Id": id, "x-vercel-ai-ui-message-stream": "v1" } });
  };
  workspace.setOakWorkspaceFixture({ presentation: "human-agent", viewportSupported: true, messages: [], pending: false, draft: "What did Steve do at each of his recent roles?" });
  const run = workspace.submitOakTurn();
  for (let i = 0; i < 80 && workspace.getOakWorkspace().messages.at(-1)?.steps?.length !== 3; i++) await new Promise(resolve => setTimeout(resolve, 10));
  const live = workspace.getOakWorkspace();
  assert.deepEqual(kinds(live.messages.at(-1).steps), ["understand:done", "search:done", "weigh:running"]);
  assert.equal(live.messages.at(-1).steps[1].count, 3);
  assert.equal(live.progress, "Weighing what I found");
  hold.fail();
  await run;
});
