import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";

const read = (file) => readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

test("D66-G1 the signed-in path works end to end: setup finishes, saving survives a reload, and the account panels read cleanly", async () => {
  // A blank optional last question no longer traps Continue: Submit skips it, then the questionnaire submits.
  const questionnaire = read("src/components/ui/questionnaire.tsx");
  assert.match(questionnaire, /export function QuestionnaireSubmit\(/);
  assert.match(questionnaire, /if \(active && !answered && skip && !skip\.disabled\) \{ event\.preventDefault\(\); skip\.click\(\); \}/);
  assert.match(questionnaire, /<Base\.Skip data-questionnaire-skip="" /);
  // After a reload the saved commands load the account SDK before giving up, and a stale cookie renews before "session ended".
  const workspace = read("src/lib/oakWorkspace.ts"), saved = read("src/lib/oakSavedHistoryWorkspace.ts");
  assert.equal((saved.match(/if \(!owner\.ready\(\)\) await owner\.resume\?\.\(\);/g) ?? []).length, 3, "save, list and open resume first");
  assert.match(workspace, /resume: resumeReadyAccount,/);
  assert.match(workspace, /return refreshOakAuthStatus\(true\);/);
  // A guest who reloads mid sign-in has no session to lose; the mounted sign-in carries on and reports a new session itself.
  assert.match(workspace, /if \(status\.kind === "guest"\) return;/);
  // A ready account shows no banner over the panels; the composer ring carries the count.
  assert.match(read("src/components/agent/OakAccountContinuation.tsx"), /if \(status\?\.phase === "ready" && !state\.authReauthenticate\) return null;/);
  // Clerk's "Last used" badge sits inside the Google button instead of past the panel's edge.
  assert.match(read("src/lib/oakAccountClient.ts"), /lastAuthenticationStrategyBadge: \{ inset: "auto", top: "50%", right: "0\.75rem"/);
  const css = read("src/styles/oakAgent.css");
  assert.match(css, /\.oak-saved__chip\[data-saved\] \{[^}]*var\(--oak-tint-leaf\)/, "saved wears the leaf success");
  assert.match(css, /\.oak-workspace \.ui-questionnaire__input \{[^}]*background: var\(--oak-raised\)/, "questionnaire text answers are raised fields");
  assert.match(css, /\.oak-workspace \.ui-questionnaire__input:focus-visible \{[^}]*var\(--oak-ring\) border-box/, "and focus with the launcher ring");
  // The renewal and session tests in the transitions suite pass.
  const root = new URL("../../../", import.meta.url);
  const run = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "--test-name-pattern", "D66", "tests/agent/transitions.test.mjs"],
    { encoding: "utf8", cwd: root, env: { ...process.env, NODE_TEST_CONTEXT: undefined } });
  assert.match(run.stdout, /# pass 2\n/, (run.stdout + run.stderr).slice(-400));
  assert.match(run.stdout, /# fail 0\n/);

  // In the gallery the account questionnaire's text field is a raised field, not a black hole.
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=account-purpose`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    await page.locator(".ui-questionnaire__choice").first().click();
    await page.getByRole("button", { name: "Next" }).click();
    const field = page.locator(".ui-questionnaire__input:visible").first();
    await field.waitFor();
    const background = await field.evaluate(node => getComputedStyle(node).backgroundColor);
    assert.notEqual(background, "rgb(0, 0, 0)", "the field is raised");
    await page.locator(".oak-workspace").screenshot({ path: "/tmp/d66-questionnaire-1440x900.png" });
  } finally {
    await browser.close();
  }
});
