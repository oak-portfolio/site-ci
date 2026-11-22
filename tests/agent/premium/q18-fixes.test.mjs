import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { loadTsx } from "../design-rework/load-tsx.mjs";
import { openState } from "./gallery.mjs";

// Q18 findings from the final bulk visual review (artifacts/premium-round/review/v1/findings.json).
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const { oakAsksFit, oakReadsAsRole, oakSelectedText } = loadTsx("src/lib/oakDocumentsWorkspace.ts");

test("Q18 F3 a fit question beside a job post runs the document role-fit task", () => {
  assert.equal(oakAsksFit("How well does Steve match this role, in two sentences?"), true);
  assert.equal(oakAsksFit("Is Steve a good fit for this job?"), true);
  assert.equal(oakAsksFit("What does this text ask for?"), false);
  assert.equal(oakAsksFit("Summarize the responsibilities."), false);
  const documents = [{ documentId: "d1", text: "Senior Design Engineer, AI products\nYou will build agent interfaces." }];
  const selections = [{ documentId: "d1", sectionId: "s1", start: 0, end: 35 }, { documentId: "d1", sectionId: "s2", start: 36, end: 68 }];
  assert.equal(oakSelectedText(documents, selections), "Senior Design Engineer, AI products\nYou will build agent interfaces.");
  assert.equal(oakReadsAsRole(oakSelectedText(documents, selections)), true);
  const source = readFileSync("src/lib/oakWorkspace.ts", "utf8");
  assert.match(source, /const fitSelections = !roleDraft && draftKind === "question" && documentSelection && !quotes\.length && oakAsksFit\(typed\)/);
  assert.match(source, /fitSource\?\.success \? \{ kind: "role-fit", text, requirementSource: fitSource\.data \}/,
    "the fit question is sent as role-fit with the selected sections as its requirement source");
  assert.match(source, /fitSelections && fitSelections\.length > OAK_COMPARE_SECTION_LIMIT\) \{\s*update\(\{ error: `To compare this role, keep up to/,
    "more sections than Compare reads is said plainly instead of sending a public-only answer");
});

test("Q18 F2 Project advice hides the transcript like every other panel, and still focuses the composer", () => {
  const source = readFileSync("src/components/agent/OakConversation.tsx", "utf8");
  assert.match(source, /const transcriptHidden = surface !== "chat";/);
  assert.match(source, /if \(!restoreComposerFocus\.current \|\| composerPanel \|\|/);
});

test("Q18 F4 the composer's document chips can be cleared from the message box", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await openState(page, "answer-document");
    const chips = page.locator('.oak-composer__attachments [aria-label$="review selection"]');
    assert.ok(await chips.count() > 0, "the state starts with document chips");
    await page.getByRole("button", { name: "Stop using these document sections" }).click();
    await page.waitForFunction(() => !document.querySelector(".oak-composer__attachments"));
    assert.equal(await page.evaluate(() => document.activeElement?.id), "oak-composer-input", "focus returns to the message box");
  } finally { await browser.close(); }
});
