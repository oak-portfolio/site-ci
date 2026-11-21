import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// Ticket 23 part A: chat chrome fixes in the selection bar, the next step and its drawer, Related, and the composer.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
  await page.waitForTimeout(500);
};
const withPage = async (run, viewport = { width: 1280, height: 800 }) => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport, reducedMotion: "no-preference" });
    await run(await context.newPage());
  } finally { await browser.close(); }
};
const store = (page, fn, arg) => page.evaluate(async ([source, value]) => {
  const url = performance.getEntriesByType("resource").map(entry => entry.name).find(name => /\/src\/lib\/oakWorkspace\.ts(\?|$)/.test(name));
  const workspace = await import(url);
  return new Function("workspace", "value", `return (${source})(workspace, value);`)(workspace, value);
}, [fn.toString(), arg]);
const selectIn = (page, which) => page.evaluate(which => {
  const nodes = [...document.querySelectorAll(".oak-turn__answer p, .oak-turn__answer li")].filter(element => !element.closest(".oak-turn__kind") && element.textContent.trim().length >= 24);
  const node = which === "first" ? nodes[0] : nodes.at(-1);
  const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode();
  const range = document.createRange();
  range.setStart(text, 0);
  range.setEnd(text, Math.min(text.textContent.length, 20));
  document.getSelection().removeAllRanges();
  document.getSelection().addRange(range);
  const box = range.getBoundingClientRect();
  return { top: box.top, bottom: box.bottom };
}, which);
const bar = page => page.getByRole("toolbar", { name: "Selected text" });
const activeId = page => page.evaluate(() => document.activeElement?.id ?? "");

test("T23a-1 at 360 and 390 the selection bar stays inside the panel, its width measured; 320 gets the window-size notice", async () => {
  await withPage(async page => {
    await open(page, "selection-explain-on");
    assert.equal(await page.getByRole("region", { name: "Window size" }).count(), 1, "320 is under the 360 minimum, so the chat waits");
    assert.equal(await page.locator(".oak-pick").count(), 0);
  }, { width: 320, height: 760 });
  for (const width of [360, 390]) await withPage(async page => {
    await open(page, "selection-explain-on");
    await bar(page).waitFor();
    const edges = await page.evaluate(() => {
      const pick = document.querySelector(".oak-pick").getBoundingClientRect();
      const area = document.querySelector(".oak-pick").offsetParent.getBoundingClientRect();
      return { left: pick.left - Math.max(0, area.left), right: Math.min(innerWidth, area.right) - pick.right };
    });
    assert.ok(edges.left >= 4 && edges.right >= 4, `${width}: bar is inside with room (${JSON.stringify(edges)})`);
  }, { width, height: 760 });
});

test("T23a-2 with answer text directly below, the bar sits above the selection", () => withPage(async page => {
  await open(page, "selection-explain-on");
  await bar(page).waitFor();
  const range = await selectIn(page, "first");
  await page.waitForTimeout(400);
  const pick = await page.locator(".oak-pick").boundingBox();
  assert.ok(pick.y + pick.height <= range.top + 1, `bar bottom ${pick.y + pick.height} is above the selection top ${range.top}`);
  assert.equal(await page.locator(".oak-pick").getAttribute("data-side"), "top");
}));

test("T23a-3 focus inside the bar keeps it while the selection goes", () => withPage(async page => {
  await open(page, "selection-explain-on");
  await bar(page).waitFor();
  await bar(page).getByRole("button", { name: "Copy" }).focus();
  await page.evaluate(() => document.getSelection().removeAllRanges());
  await page.waitForTimeout(300);
  assert.equal(await bar(page).count(), 1, "the bar stays while focus is in it");
}));

test("T23a-4 Explain simply with a typed draft adds the prompt after the visitor's words", () => withPage(async page => {
  await open(page, "selection-explain-on");
  await store(page, workspace => workspace.setOakDraft("What did he own?"));
  await page.waitForTimeout(300);
  await selectIn(page, "last");
  await bar(page).waitFor();
  await bar(page).getByRole("button", { name: "Explain simply" }).click();
  assert.equal(await page.locator("#oak-composer-input").inputValue(), "What did he own? Explain this simply");
  assert.equal(await page.locator(".oak-composer .oak-quote-chip").count(), 1);
}));

test("T23a-5 opening Other ways to continue brings its whole panel into view at 390", () => withPage(async page => {
  await open(page, "answer-next-step-drawer");
  const trigger = page.locator(".oak-other-ways__trigger");
  await trigger.evaluate(node => {
    const scroller = node.closest(".oak-conversation__scroll, [data-slot='conversation-content'], .oak-transcript") ?? document.scrollingElement;
    let parent = node.parentElement;
    while (parent && !(parent.scrollHeight > parent.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(parent).overflowY))) parent = parent.parentElement;
    const area = (parent ?? scroller);
    area.scrollTop += node.getBoundingClientRect().bottom - area.getBoundingClientRect().bottom + 4;
  });
  await trigger.click();
  await page.waitForTimeout(900);
  const fits = await page.evaluate(() => {
    const panel = document.querySelector(".oak-other-ways__panel").getBoundingClientRect();
    let parent = document.querySelector(".oak-other-ways").parentElement;
    while (parent && !(parent.scrollHeight > parent.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(parent).overflowY))) parent = parent.parentElement;
    const view = parent.getBoundingClientRect();
    return { panel: panel.bottom, view: view.bottom };
  });
  assert.ok(fits.panel <= fits.view + 1, `panel bottom ${fits.panel} inside the transcript ${fits.view}`);
}, { width: 390, height: 760 }));

test("T23a-6 the next-step button's name holds its visible text", () => withPage(async page => {
  await open(page, "answer-next-step");
  const button = page.locator(".oak-next-step").first();
  const visible = (await button.innerText()).replace(/\s+/g, " ").trim();
  const snapshot = await button.ariaSnapshot();
  const name = snapshot.match(/button "([^"]*)"/)?.[1] ?? "";
  assert.ok(name.replace(/\s+/g, " ").includes(visible), `name "${name}" contains "${visible}"`);
}));

test("T23a-7 Compare a role carries the composer text only when it reads as a job post", () => withPage(async page => {
  await open(page, "composer-counter");
  const chat = await store(page, workspace => { workspace.setOakDraft("What did Steve own on EcoSmartLoop?"); workspace.openOakSurface("role"); const s = workspace.getOakWorkspace(); return { role: s.roleDraft?.roleDescription, draft: s.draft }; });
  assert.equal(chat.role, "", "a chat question is not a role description");
  assert.equal(chat.draft, "What did Steve own on EcoSmartLoop?", "the question stays in the box");
  await open(page, "composer-paste-offer");
  const post = await store(page, workspace => { workspace.openOakSurface("role"); return workspace.getOakWorkspace().roleDraft?.roleDescription; });
  assert.match(post, /Senior Design Engineer/, "a job post carries");
}));

test("T23a-8 inside the drawer the inner Related heading is hidden but still names the rows", () => withPage(async page => {
  await open(page, "answer-next-step-drawer");
  await page.locator(".oak-other-ways__trigger").click();
  await page.waitForTimeout(500);
  const title = page.locator(".oak-other-ways .oak-related__title");
  assert.equal(await title.count(), 1);
  assert.equal(await title.isVisible(), false, "no second visible Related heading");
  assert.ok(await page.locator(".oak-other-ways").getByRole("region", { name: "Related" }).count() >= 1, "the section keeps its name");
}));

test("T23a-9 pressing a Related row in the drawer collapses it and focuses the composer", async () => {
  for (const state of ["answer-next-step-drawer", "answer-openui-next-step-drawer"]) await withPage(async page => {
    await open(page, state);
    await page.route("**/api/oak/chat**", route => route.abort());
    await page.locator(".oak-other-ways__trigger").click();
    await page.waitForSelector(".oak-other-ways .ui-suggestion", { state: "visible", timeout: 15000 });
    await page.locator(".oak-other-ways .ui-suggestion").first().click();
    await page.waitForTimeout(600);
    const expanded = await page.locator(".oak-other-ways__trigger").evaluateAll(nodes => nodes.map(node => node.getAttribute("aria-expanded")));
    assert.ok(!expanded.includes("true"), `${state}: no drawer left open (${expanded})`);
    assert.equal(await activeId(page), "oak-composer-input", `${state}: composer has focus`);
  });
});

test("T23a-10 a disabled Send is described by its reason", () => withPage(async page => {
  await open(page, "composer-chips");
  await store(page, workspace => { workspace.setOakDraft(""); for (const quote of workspace.getOakWorkspace().quotes) workspace.removeOakQuote(quote.id); });
  await page.waitForTimeout(300);
  const send = page.locator(".oak-composer button[type=submit]");
  assert.equal(await send.getAttribute("aria-disabled"), "true");
  const describedBy = await send.getAttribute("aria-describedby");
  assert.ok(describedBy, "Send has aria-describedby");
  assert.equal((await page.locator(`#${describedBy}`).textContent()).trim(), "Type a question to send");
}));

test("T23a-11 a question that never reached the server shows Failed to send with Retry on the visitor's bubble", () => withPage(async page => {
  await open(page, "composer-chips");
  let calls = 0;
  await page.route("**/api/oak/chat**", route => { calls++; return route.abort("internetdisconnected"); });
  await store(page, workspace => { for (const quote of workspace.getOakWorkspace().quotes) workspace.removeOakQuote(quote.id); workspace.setOakDraft("Which projects used Astro?"); });
  await page.locator(".oak-composer button[type=submit]").click();
  const note = page.locator(".oak-turn__send-failed");
  await note.waitFor({ timeout: 15000 });
  assert.match(await note.textContent(), /Failed to send/);
  assert.equal(await page.locator(".ui-message").filter({ has: note }).locator(".oak-turn__question").count(), 1, "on the visitor's own bubble");
  assert.equal(await page.getByRole("button", { name: /Retry/ }).count(), 1, "one Retry: the error card and the trail step drop theirs");
  const before = calls;
  await note.getByRole("button", { name: /Retry/ }).click();
  for (const started = Date.now(); calls === before && Date.now() - started < 5000;) await page.waitForTimeout(25);
  assert.ok(calls > before, "Retry sends again");
}));

test("T23a-11b a research question that never reached the server keeps one Retry: the trail step drops its own", () => withPage(async page => {
  await open(page, "composer-chips");
  await page.route("**/api/oak/chat**", route => route.abort("internetdisconnected"));
  await store(page, workspace => { for (const quote of workspace.getOakWorkspace().quotes) workspace.removeOakQuote(quote.id); workspace.setOakDraft("What is the latest Astro React islands guidance?"); });
  await page.locator(".oak-composer button[type=submit]").click();
  await page.locator(".oak-turn__send-failed").waitFor({ timeout: 15000 });
  assert.equal(await page.getByRole("button", { name: /Retry/ }).count(), 1);
}));

test("T23a-12 a paste over 4,000 characters is kept whole, the counter shows the overflow and Send stays blocked", () => withPage(async page => {
  await open(page, "composer-chips");
  await store(page, workspace => { workspace.setOakDraft(""); for (const quote of workspace.getOakWorkspace().quotes) workspace.removeOakQuote(quote.id); });
  const text = "word ".repeat(862) + "end.";
  await page.locator("#oak-composer-input").focus();
  await page.evaluate(value => {
    const data = new DataTransfer(); data.setData("text/plain", value);
    const box = document.querySelector("#oak-composer-input");
    box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
  await page.keyboard.insertText(text);
  await page.waitForTimeout(300);
  assert.equal((await page.locator("#oak-composer-input").inputValue()).length, text.length, "nothing cut");
  const count = page.locator("#oak-composer-count");
  assert.equal(await count.getAttribute("data-state"), "over");
  assert.match(await count.textContent(), /4,314 \/ 4,000.*314 over/s);
  assert.equal(await page.locator(".oak-composer button[type=submit]").getAttribute("aria-disabled"), "true");
  await store(page, workspace => workspace.setOakDraft(workspace.getOakWorkspace().draft.slice(0, 3990)));
  await page.waitForTimeout(200);
  assert.notEqual(await page.locator(".oak-composer button[type=submit]").getAttribute("aria-disabled"), "true", "fits again, Send opens");
}));

test("T23a-13 ArrowUp in an empty box opens the last question when Edit on earlier questions is on; Enter says send", () => withPage(async page => {
  await open(page, "earlier-edit-on");
  const box = page.locator("#oak-composer-input");
  assert.equal(await box.getAttribute("enterkeyhint"), "send");
  await box.focus();
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(200);
  const last = await page.locator(".oak-turn__question").last().innerText();
  assert.equal((await box.inputValue()).trim(), last.trim(), "the last question is back in the box");
  await page.keyboard.press("ArrowUp");
  assert.equal((await box.inputValue()).trim(), last.trim(), "a filled box keeps ArrowUp for the caret");

  await open(page, "composer-counter");
  await store(page, workspace => workspace.setOakDraft(""));
  await page.locator("#oak-composer-input").focus();
  await page.keyboard.press("ArrowUp");
  assert.equal(await page.locator("#oak-composer-input").inputValue(), "", "flag off: ArrowUp does nothing");
}));
