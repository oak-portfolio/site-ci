import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { loadTsx } from "../design-rework/load-tsx.mjs";
import { openState } from "./gallery.mjs";

globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const { oakBriefSeed } = loadTsx("src/lib/oakWorkspace.ts");
const { oakNextStep, oakUsedTools } = loadTsx("src/lib/oakNextStep.ts");
const { oakReadsAsRole } = loadTsx("src/components/agent/OakDocumentsPanel.tsx");

const msg = (id, role, text, answer = null, extra = {}) => ({ id, role, text, answer, cards: [], usage: null, state: "complete", ...extra });
const roleFit = { kind: "role-fit", rows: [], contactTopics: [] };
const open = async (page, state) => {
  await openState(page, state);
};

test("Q06-G1 the brief opens with the compared role, else the visitor's latest question, never Oak's words", () => {
  // Q16 (intentional update): the compared role seeds as its title line, never the whole post, and the Compare panel's
  // default request is Oak's words, not the visitor's (D8).
  const role = "Senior Design Engineer, AI products. You will build agent interfaces in React.";
  const messages = [msg("r1:user", "user", "Compare this role with Steve's supported experience.", null, { taskKind: "role-fit" }), msg("r1", "assistant", "", roleFit)];
  assert.equal(oakBriefSeed(messages, new Map([["r1", role]])), `The role I compared: ${role}`);
  // A later question is newer than the comparison, so it wins.
  assert.equal(oakBriefSeed([...messages, msg("q2:user", "user", "Can Steve start in March?"), msg("q2", "assistant", "Oak text")], new Map([["r1", role]])),
    "Can Steve start in March?");
  assert.equal(oakBriefSeed(messages, new Map([["r1", `Staff Engineer\n${"x".repeat(2500)}`]])), "The role I compared: Staff Engineer",
    "a long post seeds only its title line");
  assert.equal(oakBriefSeed(messages.slice(0, 1), new Map()), "", "the default Compare request alone is not the visitor's words");
  assert.equal(oakBriefSeed([msg("a", "assistant", "Only Oak spoke.")], new Map()), "");
  assert.equal(oakBriefSeed([msg("p:user", "user", "x".repeat(1501))], new Map()), "", "never past the field's limit");
  assert.equal(oakBriefSeed([msg("d:user", "user", "My resume text", null, { privateDocumentTurn: true })], new Map()), "", "a private document turn stays out");
  const source = readFileSync("src/lib/oakWorkspace.ts", "utf8");
  assert.match(source, /export function openOakContactBrief\(\)[\s\S]*?draft\.goals\.trim\(\) \? "" : oakBriefSeed\(state\.messages, roleDescriptions\)/,
    "opening the brief seeds an empty goals field from the chat");
});

test("Q06-G2 the Contact menu offers Draft a brief from this chat, and it opens the brief prefilled", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "contact-menu");
    const offer = page.locator(".oak-contact__brief");
    await offer.waitFor({ state: "visible" });
    assert.match(await offer.innerText(), /Draft a brief from this chat/);
    const asked = await page.locator(".ui-message[data-align='end'] .ui-bubble").last().innerText();
    await offer.click();
    const goals = page.locator(".oak-brief-editor textarea").first();
    await goals.waitFor({ state: "visible" });
    assert.equal((await goals.inputValue()).trim(), asked.trim());
  } finally { await browser.close(); }
});

test("Q06-G3 the next-step card never offers a tool this chat already used", () => {
  const sourced = { kind: "sourced" };
  assert.equal(oakNextStep("Is Steve a fit for this role?", sourced, "open")?.action, "role");
  const used = oakUsedTools([msg("u", "user", "x"), msg("a", "assistant", "", roleFit)], false);
  assert.notEqual(oakNextStep("Is Steve a fit for this role?", sourced, "open", used)?.action, "role");
  assert.equal(oakNextStep("Is Steve a fit for this role?", { ...sourced, nextTool: "role" }, "open", used), null, "the Worker's pick is skipped too");
  assert.equal(oakNextStep("How do I contact Steve?", sourced, "open", oakUsedTools([], true)), null, "an opened brief counts as used");
  assert.deepEqual([...oakUsedTools([msg("a", "assistant", "", { kind: "advice" }), msg("b", "assistant", "", { kind: "document" })], false)].sort(), ["advice", "documents"]);
  const transcript = readFileSync("src/components/agent/OakTranscript.tsx", "utf8");
  assert.match(transcript, /usedTools=\{oakUsedTools\(state\.messages\.slice\(0, index\), Boolean\(state\.briefDraft\)\)\}/, "only earlier turns count");
});

test("Q06-G4 selected document text that reads as a role offers Compare this role, which opens the comparison on that selection", async () => {
  assert.equal(oakReadsAsRole("Senior Design Engineer, AI products\n\nYou will design and build agent interfaces end to end."), true);
  assert.equal(oakReadsAsRole("I enjoyed hiking last weekend and wrote some notes about it."), false);
  // One action: the selected sections become this turn's reading set, then Compare a role opens on them (beginOakRoleDraft
  // builds the document requirement source from exactly those sections).
  assert.match(readFileSync("src/components/agent/OakDocumentsPanel.tsx", "utf8"), /if \(controller\.selectForTurn\(\)\) openOakSurface\("role"\);/);
  assert.match(readFileSync("src/lib/oakWorkspace.ts", "utf8"), /const documents = getOakDocumentTurnContext\(\);[\s\S]*?requirementSource: source\.data/);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "document-selected");
    const compare = page.getByRole("button", { name: "Compare this role" });
    await compare.waitFor({ state: "visible" });
    // Deselecting the role lines removes the offer.
    const selected = page.locator(".oak-documents__section[data-selected] [role='checkbox']");
    while (await selected.count()) await selected.first().click();
    await compare.waitFor({ state: "hidden" });
  } finally { await browser.close(); }
});

test("Q06-G5 every tool panel says in one line what it returns", () => {
  const titles = { "Your contact brief": "src/components/agent/OakContactBriefEditor.tsx", "Compare a role": "src/components/agent/OakConversation.tsx",
    "Private documents": "src/components/agent/OakDocumentsPanel.tsx", "Project advice": "src/components/agent/OakWorkflowPanels.tsx",
    "Dictate a message": "src/components/agent/OakWorkflowPanels.tsx", "Model funding": "src/components/agent/OakWorkflowPanels.tsx",
    "Your conversation": "src/components/agent/OakWorkflowPanels.tsx" };
  const lines = new Set();
  for (const [title, file] of Object.entries(titles)) {
    // Dictate names its processor only while voice is available (returns={available ? "..." : "..."}); the first line counts.
    // Q11 (intentional update): funding's line follows the allowance note, with the default line as its fallback.
    const match = readFileSync(file, "utf8").match(new RegExp(`<WorkflowPanel title="${title}" returns=\\{?(?:available \\? |allowance\\?\\.note \\?\\? )?"([^"]+)"`));
    assert.ok(match, `${title} has a returns line`);
    assert.ok(match[1].length <= 90, `${title}: one short line`);
    lines.add(match[1]);
  }
  assert.equal(lines.size, 7, "each tool says its own thing");
  assert.match(readFileSync("src/components/agent/WorkflowPanel.tsx", "utf8"), /\{returns \? <p className="oak-workflow__returns">\{returns\}<\/p> : null\}/);
});
