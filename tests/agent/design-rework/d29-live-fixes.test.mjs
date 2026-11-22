import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "./load-tsx.mjs";

globalThis.window ??= { innerWidth: 1280, innerHeight: 800, outerWidth: 1280, outerHeight: 900, screen: {}, addEventListener() {}, removeEventListener() {} };
const workspace = loadTsx("src/lib/oakWorkspace.ts");
const { OakWorkAnswer, OakAnswerSources } = loadTsx("src/components/agent/OakWorkAnswer.tsx");

const cite = (id, section = "") => ({ documentId: `work:${id}`, passageId: "p", sectionId: "s", url: `https://steveoak.com/work/${id}/${section}` });
const jobPost = "Senior design engineer, AI products. Own the agent interface end to end. Responsibilities: ship the chat surface, its states and its motion with the platform team. Requirements: 5+ years of experience building product UI in React, and a portfolio of shipped AI features.";

test("D29-G2 citation numbers run across the whole answer, and a repeated page keeps its number even from another section", () => {
  const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "f", hardPolicyVersion: "f", knowledgeRevision: "f", operations: ["search"],
    kind: "sourced", acknowledgment: null, claims: [
      { id: "a", text: "First.", citations: [cite("profile")] },
      { id: "b", text: "Second.", citations: [cite("uhttention")] },
      { id: "c", text: "Third.", citations: [cite("pnpp"), cite("profile", "#approach")] },
      { id: "d", text: "Fourth.", citations: [cite("uhttention", "#role"), cite("uhttention", "#team")] }] };
  const html = renderToStaticMarkup(createElement(OakWorkAnswer, { answer }));
  // D122: points carry an unnumbered chip; the answer-wide numbers live in the Sources panel (d122-sources G4).
  // A chip counts documents, so two sections of one page are one source and add no +N.
  assert.deepEqual([...html.matchAll(/<section class="oak-answer__point"[\s\S]*?<\/section>/g)].map(match => match[0].match(/oak-source-chip__more"[^>]*>([^<]+)</)?.[1] ?? ""),
    ["", "", "+1", ""]);
  // Review v4 supersedes D29's in-answer Sources button: the pill leads the turn's footer row, rendered there on its own.
  assert.doesNotMatch(html, /oak-answer__sources-button/, "the answer body no longer carries the Sources button");
  const sources = renderToStaticMarkup(createElement(OakAnswerSources, { answer }));
  assert.match(sources, /class="oak-answer__sources-button"[\s\S]*?>3<\/span>/, "three distinct pages across the answer");
});

test("D29-G2 a code chunk that fails to load is not reported as a dropped connection", () => {
  assert.equal(workspace.oakTurnFailure(new TypeError("Failed to fetch dynamically imported module: http://127.0.0.1:4321/node_modules/.vite/deps/ai.js")), undefined);
  assert.equal(workspace.oakTurnFailure(new TypeError("Failed to fetch")), "offline");
});

test("D29-G2 opening Compare a role or project advice keeps what the visitor already typed", () => {
  // Ticket 23 :167 (intentional update, M5 hiring minor 4): only text that passes the job-post check carries into the role
  // description; a chat question stays in the message box. Either way nothing the visitor typed is lost.
  const question = "Senior design engineer for AI agent interfaces";
  workspace.setOakWorkspaceFixture({ presentation: "human-agent", viewportSupported: true, viewportNotice: false, messages: [], pending: false,
    draft: question, draftKind: "question", roleDraft: null, questionDraft: null });
  workspace.beginOakRoleDraft();
  assert.equal(workspace.getOakWorkspace().roleDraft?.roleDescription, "", "a chat question does not carry into the role description");
  assert.equal(workspace.getOakWorkspace().draft, question, "it stays in the message box");
  workspace.leaveOakRoleDraft();
  const typed = jobPost;
  workspace.setOakDraft(typed);
  workspace.beginOakRoleDraft();
  assert.equal(workspace.getOakWorkspace().roleDraft?.roleDescription, typed, "a pasted job post carries into the role description");
  workspace.leaveOakRoleDraft();
  assert.equal(workspace.getOakWorkspace().draft, typed, "leaving puts it back in the message box");
  workspace.beginOakAdviceDraft();
  assert.equal(workspace.getOakWorkspace().draftKind, "advice");
  assert.equal(workspace.getOakWorkspace().draft, typed, "advice reads the same message box");
});

test("D29-G2 a failed role comparison never swaps the pasted description for the canned intent", async () => {
  const pasted = jobPost;
  globalThis.fetch = async () => new Response("<html>Method Not Allowed</html>", { status: 405, headers: { "Content-Type": "text/html" } });
  workspace.setOakWorkspaceFixture({ presentation: "human-agent", viewportSupported: true, viewportNotice: false, messages: [], pending: false,
    draft: "", draftKind: "question", questionDraft: null, roleDraft: { roleDescription: pasted, intent: "Compare this role with Steve's supported experience." } });
  await workspace.submitOakTurn();
  assert.equal(workspace.getOakWorkspace().draft, "", "the fixed intent is not the visitor's typing");
  workspace.leaveOakRoleDraft();
  assert.equal(workspace.getOakWorkspace().draft, pasted, "leaving puts the pasted description back");
  workspace.beginOakRoleDraft();
  assert.equal(workspace.getOakWorkspace().roleDraft?.roleDescription, pasted, "reopening carries the same description");
});

test("D29-G2 the workspace opens on the message box only when it can be typed in", () => {
  const { oakWorkspaceInitialFocus } = loadTsx("src/components/agent/OakWorkspace.tsx");
  const close = { id: "close" };
  const composer = (blocked) => ({ id: "composer", closest: () => (blocked ? {} : null) });
  const popup = (box) => ({ querySelector: () => box });
  assert.equal(oakWorkspaceInitialFocus(popup(composer(false)), close, { unsupported: false, touch: false }).id, "composer");
  assert.equal(oakWorkspaceInitialFocus(popup(composer(false)), close, { unsupported: true, touch: false }), close, "the larger-window notice starts on Close");
  assert.equal(oakWorkspaceInitialFocus(popup(composer(false)), close, { unsupported: false, touch: true }), close, "a touch open raises no keyboard");
  assert.equal(oakWorkspaceInitialFocus(popup(composer(true)), close, { unsupported: false, touch: false }), close, "an inert or hidden box is skipped");
  assert.equal(oakWorkspaceInitialFocus(popup(null), close, { unsupported: false, touch: false }), close);
});

test("D29-G2 the workspace opens on the message box, the brief lists a page once, and voice off drops the processor note", async () => {
  const read = (file) => import("node:fs").then(fs => fs.readFileSync(file, "utf8"));
  assert.match(await read("src/components/agent/OakWorkspace.tsx"), /initialFocus=\{\(openType\) => oakWorkspaceInitialFocus\(popup\.current, close\.current, \{ unsupported, touch: openType === "touch" \}\)\}/);
  const { OakContactBriefEditor } = loadTsx("src/components/agent/OakContactBriefEditor.tsx");
  const empty = { goals: "", constraints: "", startDateQuestion: "", references: [], text: "", needsFormat: false };
  const html = renderToStaticMarkup(createElement(OakContactBriefEditor, { draft: empty, error: null,
    references: [cite("ecosmartloop", "#ownership"), cite("ecosmartloop", "#system"), cite("oakminder")] }));
  assert.equal([...html.matchAll(/class="oak-brief-reference[ "]/g)].length, 2, "two pages, two rows");
  const references = [cite("ecosmartloop", "#ownership"), cite("ecosmartloop", "#system"), cite("oakminder")];
  const included = renderToStaticMarkup(createElement(OakContactBriefEditor, { draft: { ...empty, references: [cite("ecosmartloop", "#system")] }, error: null, references }));
  assert.equal([...included.matchAll(/class="oak-brief-reference[ "]/g)].length, 2, "an included section stands for its page");
  // D89: references are checkmark rows; a row's toggle and its page link sit inside one row.
  assert.match(included, /<div class="oak-brief-reference[^>]*>(?:(?!<\/div>)[\s\S])*?aria-checked="true"(?:(?!<\/div>)[\s\S])*?href="https:\/\/steveoak\.com\/work\/ecosmartloop\/#system"/, "the included section keeps its row, checked");
  const removed = renderToStaticMarkup(createElement(OakContactBriefEditor, { draft: empty, error: null, references }));
  assert.match(removed, /<div class="oak-brief-reference[^>]*>(?:(?!<\/div>)[\s\S])*?aria-checked="false"(?:(?!<\/div>)[\s\S])*?href="https:\/\/steveoak\.com\/work\/ecosmartloop\/#ownership"/, "after removal the page offers its first section again");
  const { OakVoiceCapture } = loadTsx("src/components/agent/OakVoiceCapture.tsx");
  const voice = loadTsx("src/lib/oakVoiceCapture.ts");
  const configuration = { enabled: false, status: null, fetch: async () => { throw new Error("offline test"); } };
  const capture = voice.createVoiceCapture(() => configuration);
  const off = renderToStaticMarkup(createElement(OakVoiceCapture, { configuration, controller: capture, onUseTranscript() {} }));
  assert.doesNotMatch(off, /Oak turns your clip into text/);
  capture.dispose();
});
