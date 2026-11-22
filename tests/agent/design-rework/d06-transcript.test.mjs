import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx, strictLoader } from "./load-tsx.mjs";

globalThis.window ??= { innerWidth: 1280, innerHeight: 800, outerWidth: 1280, outerHeight: 900, screen: {}, addEventListener() {}, removeEventListener() {} };
const workspace = loadTsx("src/lib/oakWorkspace.ts");
const steps = loadTsx("src/lib/oakToolSteps.ts");
const { OakTurn } = loadTsx("src/components/agent/OakTurn.tsx");
const { OakChainOfThought } = loadTsx("src/components/agent/OakChainOfThought.tsx");

const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "fixture", hardPolicyVersion: "fixture", knowledgeRevision: "fixture",
  operations: ["search", "read"], kind: "sourced", acknowledgment: null,
  claims: [{ id: "ownership", text: "Steve owned the app around the classifier.", citations: [{ documentId: "work:ecosmartloop", passageId: "p", sectionId: "s", url: "https://steveoak.com/work/ecosmartloop/#ownership" }] }] };
const message = value => ({ id: "a1", role: "assistant", text: "", answer: null, cards: [], usage: null, state: "pending", page: "/", ...value });
const turn = (props) => renderToStaticMarkup(createElement(OakTurn, { question: "What did Steve own?", progress: "", contactPreference: "open", retry: null, copied: null, onCopy() {}, onContact() {}, ...props }));

function stream(parts, hold) {
  globalThis.fetch = async (_url, init) => {
    const id = JSON.parse(init.body).turn.requestId;
    const encode = part => new TextEncoder().encode(`data: ${JSON.stringify(part)}\n\n`);
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(encode({ type: "start", messageId: id }));
      for (const part of parts) controller.enqueue(encode({ ...part, data: { requestId: id, ...part.data } }));
      hold.fail = () => controller.error(new Error("network"));
    } }), { headers: { "X-Oak-Request-Id": id, "x-vercel-ai-ui-message-stream": "v1" } });
  };
}

test("D06-G1 the step fold covers pending, running, done and error", () => {
  let rows = [{ id: "research", operation: "research", state: "pending" }];
  rows = steps.advanceOakToolSteps(rows, { kind: "tool", operation: "search", phase: "started" });
  assert.deepEqual(rows.map(row => row.state), ["pending", "running"]);
  rows = steps.advanceOakToolSteps(rows, { kind: "tool", operation: "search", phase: "completed" });
  rows = steps.advanceOakToolSteps(rows, { kind: "research", phase: "started" });
  assert.deepEqual(rows.map(row => row.state), ["running", "done"]);
  rows = steps.advanceOakToolSteps(rows, { kind: "research", phase: "failed" });
  rows = steps.advanceOakToolSteps(rows, { kind: "tool", operation: "read", phase: "started" });
  assert.deepEqual(rows.map(row => `${row.operation}:${row.state}`), ["research:error", "search:done", "read:running"]);
  assert.deepEqual(steps.settleOakToolSteps(rows, "failed").map(row => row.state), ["error", "done", "error"]);
  assert.deepEqual(steps.settleOakToolSteps([{ id: "research", operation: "research", state: "pending" }, ...rows.slice(1)], "complete").map(row => row.state), ["done", "done"]);
});

test("D06-G1 a turn keeps its tool steps on its own message, and a failure marks the open step as an error", async () => {
  const hold = {};
  stream([
    { type: "data-status", data: { phase: "tool-start", step: 1, operation: "search" } },
    { type: "data-status", data: { phase: "tool-end", step: 1, operation: "search" } },
    { type: "data-status", data: { phase: "tool-start", step: 2, operation: "read" } },
  ], hold);
  workspace.setOakWorkspaceFixture({ presentation: "human-agent", viewportSupported: true, messages: [], pending: false, draft: "What did Steve build?" });
  const run = workspace.submitOakTurn();
  for (let i = 0; i < 50 && workspace.getOakWorkspace().messages.at(-1)?.steps?.length !== 2; i++) await new Promise(resolve => setTimeout(resolve, 10));
  const [user, pending] = workspace.getOakWorkspace().messages;
  assert.equal(user.steps, undefined, "the visitor's message holds no steps");
  assert.deepEqual(pending.steps.map(row => `${row.operation}:${row.state}`), ["search:done", "read:running"]);
  hold.fail();
  await run;
  const failed = workspace.getOakWorkspace().messages.at(-1);
  assert.equal(failed.state, "failed");
  assert.deepEqual(failed.steps.map(row => `${row.operation}:${row.state}`), ["search:done", "read:error"]);
});

test("D06-G2 a pending turn renders its live reasoning header as a visible label inside the turn", () => {
  const html = turn({ message: message({ steps: [{ id: "search-0", operation: "search", state: "running" }] }), progress: "Searching public sources" });
  assert.match(html, /^<div data-slot="message"[^>]*data-state="pending"/);
  // Q03-G4 (intentional update): the transcript's one live region announces each step, so the turn holds no region of its
  // own; the visible step name is its own label, which rises in over the last one.
  assert.doesNotMatch(html, /aria-live|role="status"/);
  assert.match(html, /<span aria-hidden="true" class="oak-turn__shimmer oak-cot__label"[^>]*>Searching public sources<\/span>/);
  assert.match(html, /Searching Steve&#x27;s public work/);
});

test("D06-G2 the workspace status line carries errors only, never progress", () => {
  const element = (type, props) => ({ type, props: props ?? {} });
  const requires = {
    // R11 (intentional update): verification mode lives in OakTurnstile; these render tests never need a Turnstile pass.
    "./OakTurnstile": { OakVerification: "div", useOakVerification: () => ({ verifying: false, mounted: false, attempt: 0, dismiss() {} }) },
    react: { useId: () => "composer", useRef: current => ({ current }), useLayoutEffect() {}, useEffect() {}, useState: value => [value, () => {}] },
    "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "fragment" },
    "@/lib/oakWorkspace": { ...workspace, oakSurface: () => "chat" },
    "@/lib/oakDocumentsWorkspace": { useOakDocumentsWorkspace: () => ({ open: false, documents: [], usedSelections: [] }) },
    "./OakEmptyState": { oakStarters: [] },
    // v3 review (intentional update): the newest answer's Related rows and the conversation-memory meter.
    "@/lib/oakSuggestions": { oakComposerSuggestions: () => [] },
    "@/lib/oakSavedHistoryClient": { oakContextWindow: () => ({ used: 0, limit: 12, firstKeptId: null }) },
  };
  const host = strictLoader(import.meta.url, { missing: "empty" })("src/components/agent/OakConversation.tsx", requires);
  const statusText = (state, className = "oak-workspace__status") => {
    const found = [];
    const visit = node => {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== "object") return;
      if (node.props.className === className) found.push(JSON.stringify(node.props.children));
      visit(node.props.children);
    };
    visit(host.OakConversation({ state: { ...workspace.getOakWorkspace(), messages: [message({})], ...state }, onContact() {}, geometryKey: "k" }));
    return found.join(" ");
  };
  assert.doesNotMatch(statusText({ pending: true, progress: "Searching public sources", error: null }), /Searching public sources/);
  assert.match(statusText({ pending: false, progress: "", error: "The answer could not finish." }), /The answer could not finish\./);
  const failed = { pending: false, progress: "", error: workspace.oakTurnFailedNotice, messages: [message({ state: "failed" })] };
  assert.equal(statusText(failed), "", "the failed turn's stopped card already shows the generic failure");
  // Q03-G4 (intentional update): the transcript's one live region announces the failure, so no second sr-only line repeats it.
  assert.equal(statusText(failed, "sr-only"), "");
});

test("D06-G3 the reasoning trail's tool rows collapse and expand and show input, output and error text; a stopped turn folds under its notice", () => {
  const chain = state => renderToStaticMarkup(createElement(OakChainOfThought, { question: "What are the current limits?", progress: "", message: message({ state,
    steps: [{ id: "understand", operation: "understand", state: "done" }, { id: "search-0", operation: "search", state: "done" }, { id: "research", operation: "research", state: "error" }] }) }));
  // Q03 (intentional update): a stopped turn folds; its one notice says what happened, and the header names the stopped step.
  const failed = chain("failed");
  assert.match(failed, /aria-expanded="false"/, "a stopped turn keeps its reasoning folded");
  assert.match(failed, /1 of 3 steps stopped/);
  const live = chain("pending");
  assert.match(live, /oak-cot__detail">What are the current limits\?/, "the question row shows its input");
  assert.match(live, /oak-cot__detail">Case studies, articles and experience/, "the search row shows what it searched");
  // Brief O5: research the answer can live without is a neutral note, not a red error.
  assert.match(live, /oak-cot__detail oak-cot__detail--note">Current public research is unavailable/);
  const folded = chain("complete");
  assert.match(folded, /aria-expanded="false"/, "a finished turn keeps its reasoning folded");
  assert.doesNotMatch(folded, /Case studies, articles and experience/, "a folded trail hides its rows");
});

test("D06-G5 complete answers show copy and retry; interrupted and failed turns share one treatment", () => {
  const complete = turn({ message: message({ state: "complete", answer, text: "Steve owned the app." }), retry: "ask-again" });
  assert.match(complete, /aria-label="Copy answer"/);
  assert.match(complete, /aria-label="Ask again"/);
  const stopped = state => turn({ message: message({ state }), retry: "resend" }).replace(/data-state="\w+"/, "").replace(/<div data-slot="marker"[^>]*>.*?<\/div>/, "");
  // Q09 (intentional update): one anatomy, but each state names its own verb: a stopped answer continues, a failed one retries.
  assert.equal(stopped("interrupted").replace(/Continue/g, "Retry").replace(/data-icon="continue"/g, 'data-icon="retry"'), stopped("failed"));
  assert.match(stopped("failed"), /This answer stopped before it finished\..*Retry/);
  assert.match(stopped("interrupted"), /This answer stopped before it finished\..*Continue/);
  const messages = [{ id: "u1", role: "user", text: "Hi", state: "complete" }, { id: "a1", role: "assistant", state: "complete", answer, text: "x" }];
  assert.equal(workspace.oakRetryKind({ pending: false, messages }, "a1"), "ask-again");
  assert.equal(workspace.oakRetryKind({ pending: false, messages: [...messages, { id: "u2", role: "user", text: "Again", state: "complete" }, { id: "a2", role: "assistant", state: "failed" }] }, "a1"), null, "only the latest turn retries");
  assert.equal(workspace.oakRetryKind({ pending: false, messages: [messages[0], { ...messages[1], state: "interrupted" }] }, "a1"), "resend");
  assert.equal(workspace.oakRetryKind({ pending: false, messages: [messages[0], { ...messages[1], taskKind: "role-fit" }] }, "a1"), null);
});
