import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "./load-tsx.mjs";

globalThis.window ??= { innerWidth: 1280, innerHeight: 800, outerWidth: 1280, outerHeight: 900, screen: {}, addEventListener() {}, removeEventListener() {} };
const workspace = loadTsx("src/lib/oakWorkspace.ts");
const { OakTurn } = loadTsx("src/components/agent/OakTurn.tsx");

const ask = async (status) => {
  globalThis.fetch = async () => new Response(status === 501 ? "" : "<html>Method Not Allowed</html>", { status, headers: { "Content-Type": "text/html" } });
  workspace.setOakWorkspaceFixture({ presentation: "human-agent", viewportSupported: true, messages: [], pending: false, draft: "What has Steve built?" });
  await workspace.submitOakTurn();
  return workspace.getOakWorkspace();
};

test("D28-G1 a site with no agent behind it says so, keeps the question and offers no retry", async () => {
  for (const status of [404, 405, 501]) {
    const state = await ask(status);
    const last = state.messages.at(-1);
    assert.equal(last.state, "failed", `${status}`);
    assert.equal(last.failure, "unavailable", `${status}`);
    assert.equal(state.draft, "What has Steve built?", "the question stays in the composer");
    assert.equal(state.error, workspace.oakUnavailableNotice);
    assert.equal(workspace.oakRetryKind(state, last.id), null, "sending again would meet the same closed door");
  }
  for (const status of [502, 504]) {
    const state = await ask(status);
    // A proxy in front of a live agent: never the closed-door state, and since D39 it names the cause honestly.
    assert.equal(state.messages.at(-1).failure, "unreachable", `${status} may come from a proxy in front of a live agent`);
    assert.equal(workspace.oakRetryKind(state, state.messages.at(-1).id), "resend", `${status} keeps Retry`);
  }
  assert.equal(workspace.oakTurnFailure(new Error("answer-unavailable")), undefined, "a real answer failure keeps its retry");

  const html = renderToStaticMarkup(createElement(OakTurn, { question: "What has Steve built?", progress: "", contactPreference: "open", retry: null, copied: null,
    onCopy() {}, onContact() {}, message: { id: "a1", role: "assistant", text: "", answer: null, cards: [], usage: null, state: "failed", failure: "unavailable", page: "/" } }));
  assert.match(html, /data-failure="unavailable"/);
  assert.match(html, /I can’t answer on this site yet\./);
  assert.match(html, /Contact Steve/);
  assert.doesNotMatch(html, />Retry</, "no retry on a closed door");
  assert.doesNotMatch(html, /stopped before it finished/);
  const chatgpt = html.match(/href="(https:\/\/chatgpt\.com\/\?prompt=[^"]+)"/);
  assert.ok(chatgpt, "the question can go to another assistant");
  const prompt = new URL(chatgpt[1].replaceAll("&amp;", "&").replaceAll("&#x27;", "'")).searchParams.get("prompt");
  assert.match(prompt, /https:\/\/steveoak\.com\/llms\.txt/);
  assert.match(prompt, /My question: What has Steve built\?/);
});
