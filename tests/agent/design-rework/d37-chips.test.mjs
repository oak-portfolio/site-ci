import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTsx, strictLoader } from "./load-tsx.mjs";

globalThis.window ??= { innerWidth: 1280, innerHeight: 800, outerWidth: 1280, outerHeight: 900, screen: {}, addEventListener() {}, removeEventListener() {} };
const workspace = loadTsx("src/lib/oakWorkspace.ts");

/** Holds every chat stream open until the test releases it, recording what each request asked. */
function holdChat() {
  const asked = [], release = [];
  globalThis.fetch = async (url, init) => {
    if (url !== "/api/oak/chat") return new Response("{}", { status: 503 });
    const turn = JSON.parse(init.body).turn;
    asked.push(turn.task.text);
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "start", messageId: turn.requestId })}\n\n`));
      release.push(() => controller.error(new Error("released")));
    } }), { headers: { "X-Oak-Request-Id": turn.requestId, "x-vercel-ai-ui-message-stream": "v1" } });
  };
  return { asked, release: () => release.splice(0).forEach(fn => fn()) };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

test("D37-G1 a chip asks its question straight away and gives back what the visitor was typing", async () => {
  const chat = holdChat();
  workspace.setOakWorkspaceFixture({ presentation: "human-agent", viewportSupported: true, messages: [], pending: false, error: null, draft: "half a thought" });
  assert.equal(workspace.askOakSuggestion("What has Steve built?"), true);
  await settle();
  const state = workspace.getOakWorkspace();
  assert.deepEqual(chat.asked, ["What has Steve built?"], "sent on click, with no second step");
  assert.equal(state.pending, true);
  assert.equal(state.messages.at(-2).text, "What has Steve built?");
  assert.equal(state.draft, "half a thought", "the visitor's own typing comes back");

  assert.equal(workspace.askOakSuggestion("What would Steve change next time?"), false, "a running turn is never interrupted by a chip");
  assert.equal(workspace.getOakWorkspace().draft, "What would Steve change next time?", "it waits in the box instead");
  assert.deepEqual(chat.asked, ["What has Steve built?"]);
  chat.release();
  await settle();
});

test("D37-G1 the empty state's starters ask straight away; the draft-a-question starter still opens its helper", () => {
  const calls = [];
  const element = (type, props) => ({ type, props: props ?? {} });
  const starters = ["What has Steve built?", "How does Steve design agents?", "Help me draft a question"];
  const requires = {
    // R11 (intentional update): verification mode lives in OakTurnstile; these render tests never need a Turnstile pass.
    "./OakTurnstile": { OakVerification: "div", useOakVerification: () => ({ verifying: false, mounted: false, attempt: 0, dismiss() {} }) },
    react: { useId: () => "composer", useRef: current => ({ current }), useLayoutEffect() {}, useEffect() {}, useState: value => [value, () => {}] },
    "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "fragment" },
    "@/lib/oakWorkspace": { ...workspace, askOakSuggestion: text => { calls.push(["ask", text]); return true; },
      openOakSurface: surface => calls.push(["open", surface]) },
    "@/lib/oakDocumentsWorkspace": { useOakDocumentsWorkspace: () => ({ pending: false, usedSelections: [], documents: [] }) },
    "@/lib/oakAccountClient": { getOakAccountContext: () => ({ epoch: 0 }) },
    "../../../packages/oak-agent-contracts/src/transport": { roleDescriptionMaxBytes: 8000 },
    "./OakEmptyState": { OakEmptyState: "empty-state", oakStarters: starters },
  };
  const host = strictLoader(import.meta.url, { missing: "empty" })("src/components/agent/OakConversation.tsx", requires);
  workspace.setOakWorkspaceFixture({ presentation: "human-agent", viewportSupported: true, messages: [], pending: false, error: null, draft: "" });
  const nodes = [];
  const visit = node => { if (Array.isArray(node)) return node.forEach(visit); if (!node || typeof node !== "object") return; nodes.push(node); visit(node.props.children); };
  visit(host.OakConversation({ state: workspace.getOakWorkspace(), onContact() {}, geometryKey: "1280:800" }));
  const empty = nodes.find(node => node.type === "empty-state");
  assert.ok(empty, "the empty state shows before the first question");
  empty.props.onStarter(starters[0]);
  empty.props.onStarter(starters[2]);
  assert.deepEqual(calls, [["ask", starters[0]], ["open", "question"]]);
});
