import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { openState } from "./gallery.mjs";

// PR 1d (generative UI merge): the composer's chips, Stop, counter, paste offer, paste and drop of files, dictation and safe area.
// Real browser, motion allowed. Requests are read off the wire, not off the UI.
const withPage = async (viewport, run, setup, args = []) => {
  const browser = await chromium.launch({ args });
  try {
    const page = await (await browser.newContext({ viewport })).newPage();
    if (setup) await setup(page);
    await run(page);
  } finally { await browser.close(); }
};
const desktop = { width: 1280, height: 800 };
const jobPost = readFileSync(new URL("./fixtures/job-post.txt", import.meta.url), "utf8");

/** Hold every chat request open and keep what was sent. */
async function holdChat(page) {
  const sent = [];
  await page.route("**/api/oak/chat**", route => { sent.push({ url: route.request().url(), type: route.request().headers()["content-type"], body: route.request().postData() ?? "" }); /* never answered */ });
  return sent;
}
/** Fires a paste and answers whether the box let the browser paste it (false when the box took the files instead). */
const paste = (page, { files = [], text = "" }) => page.evaluate(({ files, text }) => {
  const data = new DataTransfer();
  for (const file of files) data.items.add(new File([file.content], file.name, { type: file.type }));
  if (text) data.setData("text/plain", text);
  const field = document.querySelector("#oak-composer-input");
  field.focus();
  return field.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
}, { files, text });
const drop = (page, files) => page.evaluate(files => {
  const data = new DataTransfer();
  for (const file of files) data.items.add(new File([file.content], file.name, { type: file.type }));
  const surface = document.querySelector(".oak-composer__surface");
  surface.dispatchEvent(new DragEvent("dragover", { dataTransfer: data, bubbles: true, cancelable: true }));
  surface.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
}, files);
const roleFile = { name: "role.txt", type: "text/plain", content: "Senior Design Engineer\nRequirements: 5+ years of experience." };

test("PR1D-G1 a pasted or dropped file takes the paperclip's road: Private documents, staged, the same upload request, nothing on the chat transport", async () => {
  const documents = [];
  const record = page => page.on("request", request => {
    if (request.url().includes("/api/oak/documents/")) documents.push({ method: request.method(), path: new URL(request.url()).pathname.replace(/[0-9a-f-]{36}/g, ":id"), body: request.postData() ?? "" });
  });
  const runs = {};
  // Each way in stages the same file and then prepares it with the panel's own explicit button.
  for (const way of ["paperclip", "paste", "drop"]) await withPage(desktop, async page => {
    documents.length = 0;
    const chat = await holdChat(page);
    await page.route("**/api/oak/documents/**", route => route.fulfill({ status: 503, body: "" }));
    await openState(page, "empty");
    if (way === "paperclip") {
      await page.getByRole("button", { name: "Attach documents" }).click();
      await page.locator("input[type='file']").setInputFiles({ name: roleFile.name, mimeType: roleFile.type, buffer: Buffer.from(roleFile.content) });
    } else if (way === "paste") await paste(page, { files: [roleFile] });
    else await drop(page, [roleFile]);
    await page.getByRole("heading", { name: "Private documents" }).waitFor({ state: "visible" });
    await page.getByText("role.txt", { exact: false }).first().waitFor({ state: "visible" });
    assert.equal(documents.length, 0, `${way}: staging uploads nothing`);
    await page.getByRole("button", { name: "Prepare selected files" }).click();
    await page.waitForTimeout(1200);
    runs[way] = documents.map(item => ({ ...item, body: item.body.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ":uuid") }));
    assert.ok(runs[way].length >= 1, `${way}: preparing reaches the documents route (${JSON.stringify(runs[way])})`);
    assert.equal(chat.length, 0, `${way}: the chat transport carried nothing`);
  }, record);
  assert.deepEqual(runs.paste, runs.paperclip, "a pasted file prepares through the same requests as the paperclip");
  assert.deepEqual(runs.drop, runs.paperclip, "a dropped file prepares through the same requests as the paperclip");
});

test("PR1D-G1b the question that follows a pasted file is a plain JSON chat request with no file part", async () => {
  await withPage(desktop, async page => {
    const chat = await holdChat(page);
    await openState(page, "empty");
    await paste(page, { files: [roleFile] });
    await page.getByRole("heading", { name: "Private documents" }).waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await page.locator("#oak-composer-input").fill("Hello there");
    await page.getByRole("button", { name: "Send" }).click();
    await page.waitForTimeout(500);
    assert.equal(chat.length, 1);
    assert.match(chat[0].type, /application\/json/);
    assert.doesNotMatch(chat[0].body, /role\.txt|multipart|Requirements: 5\+/, "no file name or file text rides on the chat request");
  });
});

test("PR1D-G2 a file the documents flow cannot read is turned away in the box, and a file pasted mid-answer is left alone", async () => {
  await withPage(desktop, async page => {
    await openState(page, "empty");
    await paste(page, { files: [{ name: "shot.png", type: "image/png", content: "png" }] });
    await page.getByText("Oak reads TXT, DOCX or PDF files").waitFor({ state: "visible" });
    assert.equal(await page.getByRole("heading", { name: "Private documents" }).count(), 0, "an image opens nothing");
  });
  await withPage(desktop, async page => {
    await openState(page, "composer-streaming");
    await drop(page, [roleFile]);
    await page.waitForTimeout(300);
    assert.equal(await page.getByRole("heading", { name: "Private documents" }).count(), 0, "a drop while Oak answers stages nothing");
  });
});

test("PR1D-G2b text copied from Word or Excel (text plus a picture of it) pastes as text and stages nothing", async () => {
  await withPage(desktop, async page => {
    await openState(page, "empty");
    const pasted = await paste(page, { files: [{ name: "image.png", type: "image/png", content: "png" }], text: "Quarter one: 42" });
    assert.equal(pasted, true, "the paste is left to the browser");
    await page.waitForTimeout(300);
    assert.equal(await page.getByRole("heading", { name: "Private documents" }).count(), 0, "nothing was staged");
    assert.equal(await page.getByText("Oak reads TXT, DOCX or PDF files").count(), 0, "and no file note appears");
    const spreadsheet = await paste(page, { files: [{ name: "sheet.txt", type: "text/plain", content: "a" }], text: "A1\tB1" });
    assert.equal(spreadsheet, true, "a readable file beside text still pastes the text");
    assert.equal(await page.getByRole("heading", { name: "Private documents" }).count(), 0);
  });
});

const chatBody = sent => JSON.parse(sent.body).turn;
async function sendFrom(page, edit) {
  const sent = await holdChat(page);
  await openState(page, "composer-chips");
  await edit?.(page);
  await page.getByRole("button", { name: "Send" }).click();
  await page.waitForFunction(() => document.querySelector("[aria-label='Stop']"));
  await page.waitForTimeout(300);
  assert.equal(sent.length, 1, "one chat request");
  return chatBody(sent[0]);
}

test("PR1D-G3 removing a chip removes its text from the request body", async () => {
  const first = "EcoSmartLoop was a team capstone built from September to December 2025", second = "a newer memory-systems workstream";
  let kept;
  await withPage(desktop, async page => { kept = await sendFrom(page); });
  assert.ok(kept.task.text.includes(first) && kept.task.text.includes(second), "both quotes ride with the question");
  assert.deepEqual(kept.sourceIds, ["case-study:ecosmartloop"], "the page's context rides with the question");

  await withPage(desktop, async page => {
    const turn = await sendFrom(page, async () => {
      await page.getByRole("button", { name: /^Remove quote .a newer/ }).click();
      await page.getByRole("button", { name: /^Remove page context/ }).click();
    });
    assert.ok(turn.task.text.includes(first), "the quote that stays still rides");
    assert.ok(!turn.task.text.includes(second), "the removed quote's text is not in the request");
    assert.deepEqual(turn.sourceIds, [], "the removed page chip's context is not in the request");
    assert.ok(turn.task.text.includes("Which part did Steve own?"), "the typed question is untouched");
  });
});

test("PR1D-G3b the page chip can come back, and a new page re-arms it", async () => {
  await withPage(desktop, async page => {
    await openState(page, "composer-chips");
    await page.getByRole("button", { name: /^Remove page context/ }).click();
    assert.equal(await page.locator(".oak-page-chip").count(), 0);
    await page.getByRole("button", { name: "Add this page back" }).click();
    assert.equal(await page.locator(".oak-page-chip").count(), 1);
    assert.equal(await page.locator("#oak-composer-input").evaluate(node => node === document.activeElement), true, "focus stays in the box");
  });
});

test("PR1D-G3c a removed page chip stays removed through the first send and the second: both requests carry no page context", async () => {
  await withPage(desktop, async page => {
    const sent = await holdChat(page);
    // A truly fresh chat: no conversation yet. The page announces its context the way a real navigation does.
    await openState(page, "empty");
    await page.evaluate(() => { document.body.dataset.oakSourceIds = JSON.stringify(["case-study:ecosmartloop"]); document.dispatchEvent(new Event("astro:page-load")); });
    await page.getByRole("button", { name: /^Remove page context/ }).click();
    const send = async text => {
      await page.locator("#oak-composer-input").fill(text);
      await page.getByRole("button", { name: "Send" }).click();
      await page.getByRole("button", { name: "Stop", exact: true }).waitFor({ state: "visible" });
      await page.waitForTimeout(300);
      await page.getByRole("button", { name: "Stop", exact: true }).click();
      await page.getByRole("button", { name: "Send" }).waitFor({ state: "visible" });
    };
    await send("First question");
    await send("Second question");
    assert.equal(sent.length, 2, "two chat requests");
    for (const request of sent) assert.deepEqual(chatBody(request).sourceIds, [], "no page context rides");
    assert.equal(await page.locator(".oak-page-chip").count(), 0, "the chip stays removed");
  });
});

test("PR1D-G4 the counter appears at 3,200 characters and not at 3,199", async () => {
  await withPage(desktop, async page => {
    await openState(page, "empty");
    const field = page.locator("#oak-composer-input"), count = page.locator(".oak-composer__count");
    await field.fill("a".repeat(3199));
    assert.equal(await count.count(), 0, "no counter at 3,199");
    await field.press("b");
    await count.waitFor({ state: "visible" });
    assert.equal((await count.innerText()).trim(), "3,200 / 4,000");
    assert.equal(await field.getAttribute("aria-describedby"), "oak-composer-count", "the field is described by its counter");
    await field.press("Backspace");
    assert.equal(await count.count(), 0, "gone again at 3,199");
    await field.fill("c".repeat(4000));
    assert.equal(await count.getAttribute("data-state"), "limit", "at the cap the counter says so");
    assert.equal((await field.inputValue()).length, 4000, "the box stops taking text at the cap");
  });
});

test("PR1D-G5 Stop takes Send's place while an answer streams, and Send comes back", async () => {
  await withPage(desktop, async page => {
    await holdChat(page);
    await openState(page, "composer-chips");
    const send = await page.getByRole("button", { name: "Send" }).boundingBox();
    await page.getByRole("button", { name: "Send" }).click();
    const stop = page.getByRole("button", { name: "Stop", exact: true });
    await stop.waitFor({ state: "visible" });
    assert.equal(await page.getByRole("button", { name: "Send" }).count(), 0, "Send is gone while it streams");
    const at = await stop.boundingBox();
    assert.ok(Math.abs(at.x - send.x) <= 2 && Math.abs(at.y - send.y) <= 2, `Stop sits where Send sat (${JSON.stringify(send)} then ${JSON.stringify(at)})`);
    await stop.click();
    await page.getByRole("button", { name: "Send" }).waitFor({ state: "visible" });
    assert.equal(await page.getByRole("button", { name: "Stop", exact: true }).count(), 0);
  });
});

test("PR1D-G6 a pasted job post offers Compare a role; Escape collapses the offer, keeps focus in the box and leaves the chat open", async () => {
  await withPage(desktop, async page => {
    await openState(page, "empty");
    await paste(page, { text: "What did Steve build?" });
    await page.waitForTimeout(200);
    assert.equal(await page.getByRole("button", { name: "Compare a role" }).count(), 0, "a short question gets no offer");
    await page.locator("#oak-composer-input").fill("");
    await page.locator("#oak-composer-input").fill(jobPost);
    await paste(page, { text: jobPost });
    const offer = page.getByRole("group", { name: "Compare a role offer" });
    await offer.waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await offer.waitFor({ state: "detached" });
    assert.equal(await page.locator("#oak-composer-input").evaluate(node => node === document.activeElement), true, "focus returns to the box");
    assert.equal(await page.locator(".oak-workspace").isVisible(), true, "the chat stays open");
  });
});

test("PR1D-G6b Compare a role carries the pasted post into the comparison", async () => {
  await withPage(desktop, async page => {
    await openState(page, "empty");
    await page.locator("#oak-composer-input").fill(jobPost);
    await paste(page, { text: jobPost });
    await page.getByRole("button", { name: "Compare a role" }).click();
    const description = page.locator("#oak-role-description");
    await description.waitFor({ state: "visible" });
    assert.equal((await description.inputValue()).trim(), jobPost.trim());
  });
});

const voiceStatus = () => {
  const now = Date.now();
  return { schemaVersion: 1, service: "transcription", enabled: true, admission: "available", failure: "none",
    evidence: { settings: "verified", providerUsage: "unknown", localReservations: "verified" },
    allowance: { unit: "micro-usd", limit: null, providerObserved: null, reserved: 0, conservativeUsed: null, remainingBound: null, periodStart: null, periodEnd: null, reset: "unknown" },
    health: { accepted: 0, failed: 0, timedOut: 0, lastAttemptAt: null, lastSuccessAt: null, lastCheckAt: now, settingsObservedAt: now, usageObservedAt: null },
    admissionBasis: "local-cap", localBudget: { limit: 200_000_000, reserved: 0, remainingBound: 200_000_000 } };
};
const countMicrophone = page => page.addInitScript(() => {
  window.__microphone = 0;
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => { window.__microphone++; throw new DOMException("denied", "NotAllowedError"); } } });
});

test("PR1D-G7 dictation opens inside the box without starting the microphone; Record asks permission; Escape collapses it and returns to the mic button", async () => {
  await withPage(desktop, async page => {
    await page.route("**/api/oak/transcription/status", route => route.fulfill({ status: 200, contentType: "application/json", json: voiceStatus() }));
    await openState(page, "empty");
    const mic = page.getByRole("button", { name: "Dictate a message" });
    await mic.click();
    const strip = page.locator(".oak-composer__dictation");
    await strip.getByRole("button", { name: "Record", exact: true }).waitFor({ state: "visible" });
    assert.equal(await mic.getAttribute("aria-expanded"), "true");
    assert.equal(await page.locator(".oak-composer__surface").evaluate((surface, strip) => surface.contains(document.querySelector(strip)), ".oak-composer__dictation"), true, "the strip is inside the box");
    assert.equal(await page.getByRole("heading", { name: "Dictate a message" }).count(), 0, "no separate panel");
    assert.equal(await page.evaluate(() => window.__microphone), 0, "opening never starts the microphone");
    await strip.getByRole("button", { name: "Record", exact: true }).click();
    await page.waitForFunction(() => window.__microphone === 1);
    await page.keyboard.press("Escape");
    await strip.waitFor({ state: "detached" });
    await page.waitForTimeout(400);
    assert.equal(await mic.evaluate(node => node === document.activeElement), true, "focus returns to the mic button");
    assert.equal(await page.locator(".oak-workspace").isVisible(), true, "the chat stays open");
    assert.equal(await mic.getAttribute("aria-expanded"), "false");
  }, async page => { await countMicrophone(page); });
});

test("PR1D-G7c with Tools open, Escape closes the menu and leaves the dictation strip; the next Escape collapses the strip", async () => {
  await withPage(desktop, async page => {
    await page.route("**/api/oak/transcription/status", route => route.fulfill({ status: 200, contentType: "application/json", json: voiceStatus() }));
    await openState(page, "empty");
    await page.getByRole("button", { name: "Dictate a message" }).click();
    const strip = page.locator(".oak-composer__dictation");
    await strip.waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Tools" }).click();
    const menu = page.locator("[role='menu'][aria-label='Oak tools']");
    await menu.waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "detached" });
    assert.equal(await strip.isVisible(), true, "the strip stays while a menu closes");
    assert.equal(await page.locator(".oak-workspace").isVisible(), true);
    await page.keyboard.press("Escape");
    await strip.waitFor({ state: "detached" });
    assert.equal(await page.locator(".oak-workspace").isVisible(), true, "the chat stays open");
  });
});

for (const [layer, trigger, popup] of [["Contact popover", "[data-oak-contact-trigger]", ".oak-contact__popup"], ["account menu", "[data-oak-account-trigger]", "[role='menu'][aria-label='Account and settings']"]]) {
  test(`PR1D-G7e with the ${layer} open, Escape closes only that layer and leaves the dictation strip`, async () => {
    await withPage(desktop, async page => {
      await openState(page, "composer-dictation");
      const strip = page.locator(".oak-composer__dictation");
      await strip.waitFor({ state: "visible" });
      await page.locator(trigger).first().click();
      const open = page.locator(popup).first();
      await open.waitFor({ state: "visible" });
      await page.waitForFunction(selector => document.querySelector(selector)?.contains(document.activeElement), popup, { timeout: 5000 });
      await page.keyboard.press("Escape");
      await open.waitFor({ state: "detached" });
      assert.equal(await strip.count(), 1, "the strip stays while the other layer closes");
      assert.equal(await page.locator(".oak-workspace").isVisible(), true);
      await page.locator("#oak-composer-input").focus();
      await page.keyboard.press("Escape");
      await strip.waitFor({ state: "detached" });
    });
  });
}

test("PR1D-G7d after a recording, Review in full opens the Dictate panel with the transcript in it, and Use transcript fills the box", async () => {
  await withPage(desktop, async page => {
    await page.route("**/api/oak/transcription/status", route => route.fulfill({ status: 200, contentType: "application/json", json: voiceStatus() }));
    await page.route("**/api/oak/transcription", route => route.fulfill({ status: 200, contentType: "application/json",
      json: { requestId: route.request().headers()["x-oak-request-id"], text: "Tell me about the memory work" } }));
    await openState(page, "empty");
    await page.getByRole("button", { name: "Dictate a message" }).click();
    const strip = page.locator(".oak-composer__dictation");
    assert.equal(await strip.getByRole("button", { name: "Review in full" }).count(), 0, "nothing to review before a recording");
    await strip.getByRole("button", { name: "Record", exact: true }).click();
    await strip.getByRole("button", { name: "Stop recording" }).waitFor({ state: "visible" });
    await page.waitForTimeout(1200);
    await strip.getByRole("button", { name: "Stop recording" }).click();
    await strip.getByRole("button", { name: "Transcribe clip" }).click();
    await strip.getByRole("textbox", { name: "Your editable transcript" }).waitFor({ state: "visible" });
    await strip.getByRole("button", { name: "Review in full" }).click();
    await page.getByRole("heading", { name: "Dictate a message" }).waitFor({ state: "visible" });
    const transcript = page.getByRole("textbox", { name: "Your editable transcript" });
    await transcript.waitFor({ state: "visible" });
    assert.equal(await transcript.inputValue(), "Tell me about the memory work", "the words carried over");
    await page.getByRole("button", { name: "Use transcript" }).click();
    await page.locator("#oak-composer-input").waitFor({ state: "visible" });
    assert.equal(await page.locator("#oak-composer-input").inputValue(), "Tell me about the memory work");
  }, undefined, ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]);
});

test("PR1D-G7b dictation says plainly when the service is off, and never leaves the box checking forever", async () => {
  await withPage(desktop, async page => {
    await page.route("**/api/oak/transcription/status", route => route.fulfill({ status: 503, body: "" }));
    await openState(page, "empty");
    await page.getByRole("button", { name: "Dictate a message" }).click();
    await page.getByText("Voice input is off right now").waitFor({ state: "visible" });
    assert.equal(await page.getByRole("button", { name: "Record", exact: true }).count(), 0);
  });
});

test("PR1D-G8 the box fits 390 and 844 by 390 with every chip showing, and keeps its safe-area margins", async () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) await withPage(viewport, async page => {
    await openState(page, "composer-safe-area");
    const shape = await page.evaluate(() => {
      const composer = document.querySelector(".oak-composer"), surface = document.querySelector(".oak-composer__surface");
      const box = surface.getBoundingClientRect();
      return { overflow: composer.scrollWidth > composer.clientWidth + 1, right: box.right, left: box.left, width: window.innerWidth,
        chips: document.querySelectorAll(".oak-page-chip, .oak-quote-chip").length, count: document.querySelector(".oak-composer__count")?.textContent };
    });
    assert.equal(shape.overflow, false, `${viewport.width}: no sideways overflow`);
    assert.ok(shape.left >= 0 && shape.right <= shape.width, `${viewport.width}: the box stays on screen`);
    assert.ok(shape.chips >= 2, `${viewport.width}: the page chip and the quote chip show`);
    assert.match(shape.count, /3,240 \/ 4,000/);
  });
  await withPage({ width: 390, height: 844 }, async page => {
    await openState(page, "composer-safe-area");
    // A real device sets the insets; here the stylesheet is read for the rule that uses them.
    const rule = await page.evaluate(() => [...document.styleSheets].flatMap(sheet => { try { return [...sheet.cssRules]; } catch { return []; } })
      .flatMap(item => [item, ...(item.cssRules ? [...item.cssRules] : [])]).map(item => item.cssText ?? "")
      .find(text => text.includes(".oak-composer") && text.includes("safe-area-inset-left") && text.includes("safe-area-inset-right")) ?? "");
    assert.match(rule, /margin-inline/, "the full-screen composer keeps its side margins inside the safe area");
  });
});

test("PR1D-G9 the kept selectors survive: .oak-composer, __surface and __meter", async () => {
  await withPage(desktop, async page => {
    await openState(page, "meter-answers-low");
    for (const selector of [".oak-composer", ".oak-composer__surface", ".oak-composer__meter"]) assert.equal(await page.locator(selector).count(), 1, selector);
  });
});
test("PR1D-G6c an ordinary question about Steve's role gets no offer, however long; the job post still does", async () => {
  const question = "What was Steve's role on EcoSmartLoop, and how did the 2 years he spent on its memory work shape the way he now designs agent interfaces for products used by real people every day? I am asking because I would like to understand how the team worked together over those months and what changed.";
  assert.ok(question.length >= 240, "long enough to pass the length check");
  await withPage(desktop, async page => {
    await openState(page, "empty");
    await page.locator("#oak-composer-input").fill(question);
    await paste(page, { text: question });
    await page.waitForTimeout(300);
    assert.equal(await page.getByRole("button", { name: "Compare a role" }).count(), 0, "a question is not a job post");
    await page.locator("#oak-composer-input").fill(jobPost);
    await paste(page, { text: jobPost });
    await page.getByRole("button", { name: "Compare a role" }).waitFor({ state: "visible" });
  });
});

