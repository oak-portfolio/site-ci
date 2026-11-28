import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

// PR 1e: Explain simply, the brief summary and receipt, and Edit on earlier questions. All three sit behind client constants
// set off (D3). Motion is allowed in every page here, and each behavior is checked on the network, not only on screen.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const GOLDEN = JSON.parse(readFileSync(new URL("./pr1e-golden-d45dded25.json", import.meta.url), "utf8"));
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
  await page.waitForTimeout(500);
};
const withPage = async (run, viewport = { width: 1280, height: 800 }) => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport, reducedMotion: "no-preference", permissions: ["clipboard-read", "clipboard-write"] });
    const page = await context.newPage();
    // A mail link would hand off to the OS, so its default action is held back after the page's own handlers run.
    await page.addInitScript(() => document.addEventListener("click", event => { if (event.target.closest?.("a[href^='mailto:']")) event.preventDefault(); }));
    await run(page);
  } finally { await browser.close(); }
};
/** Every request that could carry a question: anything to the Oak API, and any non-GET fetch. */
const watchNetwork = page => {
  const seen = [];
  page.on("request", request => { if (/\/api\//.test(request.url()) || (["fetch", "xhr"].includes(request.resourceType()) && request.method() !== "GET")) seen.push(`${request.method()} ${new URL(request.url()).pathname}`); });
  return seen;
};
const shapeOf = (page, selector) => page.evaluate(css => {
  const shape = node => node.nodeType === 3 ? (node.textContent.trim() ? JSON.stringify(node.textContent.trim()) : "")
    : `${node.tagName.toLowerCase()}${[...node.classList].sort().map(name => `.${name}`).join("")}${["role", "aria-label", "data-slot", "type"].map(name => node.hasAttribute(name) ? `[${name}=${node.getAttribute(name)}]` : "").join("")}(${[...node.childNodes].map(shape).filter(Boolean).join(",")})`;
  return [...document.querySelectorAll(css)].map(shape);
}, selector);
const store = (page, fn, arg) => page.evaluate(async ([source, value]) => {
  const url = performance.getEntriesByType("resource").map(entry => entry.name).find(name => /\/src\/lib\/oakWorkspace\.ts(\?|$)/.test(name));
  const workspace = await import(url);
  return new Function("workspace", "value", `return (${source})(workspace, value);`)(workspace, value);
}, [fn.toString(), arg]);
// Selects the opening words of the newest answer's text, the way a drag would.
const selectWords = page => page.evaluate(() => {
  const node = [...document.querySelectorAll(".oak-turn__answer p, .oak-turn__answer li")].filter(element => !element.closest(".oak-turn__kind") && element.textContent.trim().length >= 24).at(-1);
  const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode();
  const range = document.createRange();
  range.setStart(text, 0);
  range.setEnd(text, Math.min(text.textContent.length, 44));
  document.getSelection().removeAllRanges();
  document.getSelection().addRange(range);
});
const bar = page => page.getByRole("toolbar", { name: "Selected text" });
const turnIds = page => page.locator(".ui-message").evaluateAll(nodes => nodes.map(node => node.closest("[data-message-id]")?.getAttribute("data-message-id") ?? node.textContent.trim().slice(0, 40)));

test("PR1e-G1 Explain simply and the brief summary are retired (ticket 38); Edit on earlier questions is still off", () => {
  const flags = readFileSync(new URL("../../../src/lib/oakChatFlags.ts", import.meta.url), "utf8");
  for (const name of ["oakExplainSimply", "oakBriefSummary"]) assert.doesNotMatch(flags, new RegExp(name), `${name} is retired`);
  assert.match(flags, /export const oakEditEarlierQuestions = false;/, "oakEditEarlierQuestions is off");
  assert.match(flags, /\/\*\*[^\n]*\(D3, 2026-11-04\)[^\n]*\*\/\nexport const oakEditEarlierQuestions\b/, "oakEditEarlierQuestions records the D3 decision");
  assert.match(flags, /export function forceOakFlags\(/, "gallery-only forcing exists");
});

test("PR1e-G2 constants off: the selection bar, the brief and the questions are the DOM d45dded25 drew", { skip: "ticket 38 retired oakExplainSimply and oakBriefSummary and their off states selection-off and brief-ready-off" }, () => withPage(async page => {
  await open(page, "selection-off");
  await bar(page).waitFor();
  assert.deepEqual(await shapeOf(page, ".oak-pick"), GOLDEN.pick, "selection bar");
  assert.equal(await page.locator(".oak-pick[data-explain]").count(), 0);
  await open(page, "brief-ready-off");
  assert.deepEqual(await shapeOf(page, ".oak-brief-actions"), GOLDEN.briefActions, "brief actions");
  assert.deepEqual(await shapeOf(page, ".oak-brief__proposal"), GOLDEN.briefProposal, "brief proposal");
  assert.equal(await page.locator("#oak-brief-summary, .oak-brief__sent, .sr-only .oak-brief__sent-line").count(), 0);
  await open(page, "earlier-edit-off");
  assert.deepEqual(await shapeOf(page, ".oak-turn__question"), GOLDEN.questions, "question rows");
  assert.equal(await page.getByRole("button", { name: /Edit question/ }).count(), 1, "only the newest question offers Edit");
}));

test("PR1e-G3 Explain simply stages the chip and the prompt, and nothing reaches the network until Send", () => withPage(async page => {
  await open(page, "selection-explain-on");
  const sent = [];
  await page.route("**/api/oak/chat**", async route => { sent.push(route.request().postDataJSON()); await route.abort(); });
  await bar(page).waitFor();
  assert.deepEqual(await bar(page).getByRole("button").allTextContents(), ["Ask about this", "Explain simply", "Copy"]);
  const turns = await turnIds(page);
  const network = watchNetwork(page);
  await bar(page).getByRole("button", { name: "Explain simply" }).click();
  await page.waitForTimeout(1200);
  assert.deepEqual(network, [], "no request after the click");
  assert.equal(sent.length, 0);
  assert.deepEqual(await turnIds(page), turns, "no turn was added");
  assert.equal(await page.locator("#oak-composer-input").inputValue(), "Explain this simply");
  assert.equal(await page.locator(".oak-composer .oak-quote-chip").count(), 1, "one quote chip");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "oak-composer-input", "the box has focus");
  assert.equal(await page.locator(".oak-pick").count(), 0, "the bar leaves");
  await page.locator(".oak-composer button[type=submit]").click();
  for (const started = Date.now(); !sent.length && Date.now() - started < 5000;) await page.waitForTimeout(25);
  assert.equal(sent.length, 1, "Send is the one thing that asks");
  const task = sent[0]?.turn?.task ?? sent[0]?.task;
  assert.match(task?.text ?? "", /^About \u201c.+\u201d\n\nExplain this simply$/s, "the quote leads, then the prompt");
}));

test("PR1e-G4 Explain simply never replaces what the visitor typed (it follows it), and works on an arranged answer", () => withPage(async page => {
  await open(page, "selection-explain-on");
  await store(page, workspace => workspace.setOakDraft("What did he own?"));
  await page.waitForTimeout(300);
  await selectWords(page);
  await bar(page).waitFor();
  await bar(page).getByRole("button", { name: "Explain simply" }).click();
  assert.equal(await page.locator("#oak-composer-input").inputValue(), "What did he own? Explain this simply", "the typed draft stays and the prompt follows it");
  assert.equal(await page.locator(".oak-composer .oak-quote-chip").count(), 1, "the chip is still staged");

  await open(page, "selection-explain-openui-on");
  assert.ok(await page.locator(".oak-turn__answer").count() >= 1);
  await bar(page).waitFor();
  const network = watchNetwork(page);
  await bar(page).getByRole("button", { name: "Explain simply" }).click();
  await page.waitForTimeout(600);
  assert.equal(await page.locator("#oak-composer-input").inputValue(), "Explain this simply");
  assert.deepEqual(network, []);
}));

test("PR1e-G5 Escape drops the bar and the selection without closing the chat, Explain simply included", () => withPage(async page => {
  await open(page, "selection-explain-on");
  await bar(page).waitFor();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  assert.equal(await page.locator(".oak-pick").count(), 0, "the bar left");
  assert.equal(await page.locator("#oak-composer-input").count(), 1, "the chat is still open");
}));

test("PR1e-G6 the brief summary states what Open email draft carries, before the link, and only when it can open", () => withPage(async page => {
  await open(page, "brief-summary-on");
  const summary = page.locator("#oak-brief-summary");
  const length = await page.locator("#oak-brief-text").evaluate(node => node.value.length);
  assert.deepEqual(await summary.locator("span").allTextContents(), ["Goes to Steve", "1 public reference", `${length} characters`, "all editable"]);
  const link = page.getByRole("link", { name: "Open email draft" });
  assert.equal(await link.getAttribute("aria-describedby"), "oak-brief-summary");
  const order = await page.evaluate(() => { const s = document.querySelector("#oak-brief-summary"), a = document.querySelector(".oak-brief-actions a"); return Boolean(s.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING); });
  assert.equal(order, true, "the summary comes before the link");
  // Editing the message changes M; the count follows it.
  await page.locator("#oak-brief-text").fill("Hi Steve, a short note.");
  assert.equal((await summary.locator("span").nth(2).textContent()), "23 characters");
}));

test("PR1e-G7 an invalid draft shows its error and no Open email draft link", () => withPage(async page => {
  for (const state of ["brief-invalid-on"]) {
    await open(page, state);
    assert.equal(await page.getByRole("link", { name: "Open email draft" }).count(), 0, `${state}: no link`);
    assert.equal(await page.locator("#oak-brief-summary").count(), 0, `${state}: no summary`);
    assert.match(await page.locator("#oak-brief-feedback").textContent(), /Ask Steve about personal terms or timing/, `${state}: its error`);
  }
}));

test("PR1e-G8 Open email draft leaves a receipt above Nothing was sent, with Edit and Start over, and no toast", () => withPage(async page => {
  await open(page, "brief-sent-on");
  const network = watchNetwork(page);
  const receipt = page.locator(".oak-brief__sent");
  await receipt.waitFor();
  assert.equal((await page.locator(".oak-brief__sent-line").textContent()).trim(), "Email draft opened in your mail app");
  assert.equal(await page.locator("[data-oak-toast], .oak-toast").filter({ hasText: "Email draft opened" }).count(), 0, "the toast is now the receipt");
  const tops = await page.evaluate(() => [document.querySelector(".oak-brief__sent"), document.querySelector(".oak-brief__receipt")].map(node => node.getBoundingClientRect().top));
  assert.ok(tops[0] < tops[1], "the receipt sits above Nothing was sent by Oak");
  assert.match(await page.locator(".oak-brief__receipt").textContent(), /Nothing was sent by Oak\. You review it and send it yourself\./);
  assert.equal(await page.locator(".oak-brief__sent-line[role='status']").count(), 1, "announced politely");
  // Edit goes back to the message.
  await receipt.getByRole("button", { name: "Edit" }).click();
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => document.activeElement?.id), "oak-brief-text", "Edit returns to the message");
  assert.equal(await page.locator(".oak-brief__sent").count(), 0, "the receipt is gone");
  // Open again, then Start over empties everything.
  await page.getByRole("link", { name: "Open email draft" }).click();
  await page.locator(".oak-brief__sent").waitFor();
  await page.locator(".oak-brief__sent").getByRole("button", { name: "Start over" }).click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator("#oak-brief-goals").inputValue(), "");
  assert.equal(await page.locator("#oak-brief-text").count(), 0, "the brief text is gone");
  assert.equal(await page.locator(".oak-brief-reference[data-checked]").count(), 0, "no reference is left included");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "oak-brief-goals");
  assert.deepEqual(network, [], "nothing was sent");
}));

test("PR1e-G9 off: Open email draft still raises the toast and leaves no receipt", { skip: "ticket 38 retired oakBriefSummary and its off state brief-ready-off" }, () => withPage(async page => {
  await open(page, "brief-ready-off");
  await page.getByRole("link", { name: "Open email draft" }).click();
  await page.waitForTimeout(500);
  assert.equal(await page.locator(".oak-brief__sent").count(), 0);
  assert.ok(await page.getByText("Email draft opened in your mail app").count() >= 1, "the toast shows");
}));

test("PR1e-G10 Edit on an earlier question fills the box, moves nothing, and says what sending does", () => withPage(async page => {
  await open(page, "earlier-edit-on");
  const edits = page.getByRole("button", { name: /Edit question/ });
  assert.equal(await edits.count(), 3, "all three questions offer Edit");
  const first = edits.first();
  assert.match(await first.getAttribute("aria-label"), /Sending asks it again at the end\. The answers stay\./);
  assert.doesNotMatch(await edits.last().getAttribute("aria-label"), /Sending asks/, "the newest question keeps main's plain Edit");
  const turns = await turnIds(page);
  const firstQuestion = (await page.locator(".oak-turn__question .ui-bubble").first().textContent()).trim();
  const network = watchNetwork(page);
  await first.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  assert.equal((await page.locator("#oak-composer-input").inputValue()).trim(), firstQuestion);
  assert.deepEqual(await turnIds(page), turns, "no turn lost or reordered");
  assert.match(await page.locator(".oak-turn__edit-note").textContent(), /Sending asks it again at the end\. The answers here and below stay as they are\./);
  assert.equal(await page.evaluate(() => document.activeElement?.id), "oak-composer-input");
  assert.deepEqual(network, [], "Edit sends nothing");
  // Sending adds a new question after the last turn; the earlier ones are untouched.
  await page.route("**/api/oak/chat**", route => route.abort());
  await page.locator(".oak-composer button[type=submit]").click();
  await page.waitForFunction(count => document.querySelectorAll(".ui-message").length > count, turns.length);
  assert.deepEqual((await turnIds(page)).slice(0, turns.length), turns, "the earlier turns keep their order, the new question follows them");
  assert.equal(await page.locator(".oak-turn__edit-note").count(), 0, "the note retires once the question is sent");
}));

test("PR1e-G11 Edit on an earlier question never replaces a message already in the box", () => withPage(async page => {
  await open(page, "earlier-edit-on");
  await store(page, workspace => workspace.setOakDraft("My own words"));
  await page.getByRole("button", { name: /Edit question/ }).first().click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator("#oak-composer-input").inputValue(), "My own words");
  assert.match(await page.locator(".oak-turn__edit-note").textContent(), /Your message is still in the box\. Send or clear it, then edit this question\./);
}));

test("PR1e-G12 at 390 the three behaviors fit the window without sideways scroll", () => withPage(async page => {
  for (const state of ["selection-explain-on", "brief-sent-on", "earlier-edit-on"]) {
    await open(page, state);
    const overflow = await page.evaluate(() => [...document.querySelectorAll(".oak-pick, .oak-brief__sent, .oak-brief__summary, .oak-turn__question")]
      .filter(node => { const box = node.getBoundingClientRect(); return box.left < -1 || box.right > innerWidth + 1; }).length);
    assert.equal(overflow, 0, `${state}: nothing past the window edge`);
  }
}, { width: 390, height: 844 }));

test("PR1e-G12b at 360 the selection bar fits; at 320 the chat waits behind the window-size notice, so no bar can clip", async () => {
  for (const width of [320, 360]) await withPage(async page => {
    await open(page, "selection-explain-on");
    const overflow = await page.evaluate(() => [...document.querySelectorAll(".oak-pick")]
      .filter(node => { const box = node.getBoundingClientRect(); return box.left < -1 || box.right > innerWidth + 1; }).length);
    assert.equal(overflow, 0, `${width}: nothing past the window edge`);
    assert.equal(await page.locator(".oak-pick").count(), width < 360 ? 0 : 1, `${width}: ${width < 360 ? "notice, no bar" : "the bar shows"}`);
  }, { width, height: 844 });
});

// PR 1e review round: the summary counts links in the email, Edit brings quotes back, Start over can be undone,
// a second Edit replaces the first, and the summary line never ends or starts a row with a dot.
test("PR1e-R1 the summary counts the unique public pages linked in the email text, not the references ticked", () => withPage(async page => {
  await open(page, "brief-summary-two-passages");
  const summary = page.locator("#oak-brief-summary");
  assert.equal(await page.locator(".oak-brief-reference[data-checked]").count() >= 1, true);
  assert.equal(await page.evaluate(() => (document.querySelector("#oak-brief-text").value.match(/https:\/\/steveoak\.com\/work\/oakminder\//g) ?? []).length), 1, "the email holds one link");
  assert.equal(await summary.locator("span").nth(1).textContent(), "1 public reference", "two passages from one page are one reference");
  // A link the visitor deleted is not counted; a second page they typed in is.
  await page.locator("#oak-brief-text").fill("Hi Steve, no links here.");
  assert.equal(await summary.locator("span").nth(1).textContent(), "0 public references");
  await page.locator("#oak-brief-text").fill("Hi Steve,\nhttps://steveoak.com/work/oakminder/#a\nhttps://steveoak.com/work/oakminder/#b\nhttps://steveoak.com/about/");
  assert.equal(await summary.locator("span").nth(1).textContent(), "2 public references");
}));

test("PR1e-R2 Edit on an earlier quoted question brings the quote chip back with the words", () => withPage(async page => {
  await open(page, "earlier-edit-quoted-on");
  const network = watchNetwork(page);
  await page.getByRole("button", { name: /Edit question/ }).nth(1).click();
  await page.waitForTimeout(300);
  assert.equal((await page.locator("#oak-composer-input").inputValue()).trim(), "Explain this simply");
  const staged = await page.locator(".oak-composer .oak-quote-chip__text").allTextContents();
  assert.ok(staged.join(" ").includes("Each point needs its own passage."), `the quote chip is staged: ${JSON.stringify(staged)}`);
  assert.match(await page.locator(".oak-turn__edit-note").textContent(), /Sending asks it again at the end/);
  // Send folds the quote with the words: the request carries both.
  let body = "";
  await page.route("**/api/oak/chat**", route => { body = route.request().postData() ?? ""; return route.abort(); });
  await page.locator(".oak-composer button[type=submit]").click();
  await page.waitForTimeout(600);
  assert.match(body, /Each point needs its own passage\./, "the quote goes out with the question");
  assert.match(body, /Explain this simply/);
  assert.equal(network.filter(entry => /chat/.test(entry)).length, 1, "one question went out");
}));

test("PR1e-R3 a second earlier Edit replaces what the first Edit put in the box, but never the visitor's own words", () => withPage(async page => {
  await open(page, "earlier-edit-on");
  const edits = page.getByRole("button", { name: /Edit question/ });
  const questions = await page.locator(".oak-turn__question .ui-bubble").allTextContents();
  await edits.nth(0).click();
  assert.equal((await page.locator("#oak-composer-input").inputValue()).trim(), questions[0].trim());
  await edits.nth(1).click();
  await page.waitForTimeout(200);
  assert.equal((await page.locator("#oak-composer-input").inputValue()).trim(), questions[1].trim(), "the second Edit replaced the first");
  assert.match(await page.locator(".oak-turn__edit-note").first().textContent(), /In the message box\./);
  assert.equal(await page.locator(".oak-turn__edit-note").filter({ hasText: "still in the box" }).count(), 0);
  // After the visitor edits it, it is theirs.
  await page.locator("#oak-composer-input").fill(`${questions[1].trim()} and more`);
  await edits.nth(0).click();
  await page.waitForTimeout(200);
  assert.equal((await page.locator("#oak-composer-input").inputValue()).trim(), `${questions[1].trim()} and more`);
  assert.match(await page.locator(".oak-turn__edit-note").filter({ hasText: "still in the box" }).first().textContent(), /Your message is still in the box/);
}));

test("PR1e-R4 Start over can be undone and the brief comes back exactly", () => withPage(async page => {
  await open(page, "brief-sent-on");
  const before = await page.evaluate(() => ({ goals: document.querySelector("#oak-brief-goals").value, text: document.querySelector("#oak-brief-text").value }));
  await page.locator("#oak-brief-text").fill(`${before.text}\nOne more line.`);
  await page.getByRole("link", { name: "Open email draft" }).click();
  await page.locator(".oak-brief__sent").waitFor();
  const edited = await page.locator("#oak-brief-text").inputValue();
  await page.locator(".oak-brief__sent").getByRole("button", { name: "Start over" }).click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator("#oak-brief-text").count(), 0);
  const undo = page.locator(".oak-brief__cleared").getByRole("button", { name: "Undo" });
  await undo.click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator("#oak-brief-goals").inputValue(), before.goals);
  assert.equal(await page.locator("#oak-brief-text").inputValue(), edited, "the message returns with the visitor's edit");
  assert.equal(await page.locator(".oak-brief-reference[data-checked]").count() >= 1, true, "the reference is included again");
  assert.equal(await page.locator(".oak-brief__cleared").count(), 0, "the Undo is spent");
  assert.equal(await page.getByRole("link", { name: "Open email draft" }).count(), 1, "the brief can open again");
  // Typing new words after Start over retires the Undo.
  await page.locator(".oak-brief__sent, .oak-brief__summary").first().waitFor({ state: "attached" });
  await page.getByRole("link", { name: "Open email draft" }).click();
  await page.locator(".oak-brief__sent").getByRole("button", { name: "Start over" }).click();
  await page.waitForTimeout(250);
  await page.locator("#oak-brief-goals").fill("Something new");
  await page.waitForTimeout(200);
  assert.equal(await page.locator(".oak-brief__cleared").count(), 0, "new input retires the Undo");
}));

test("PR1e-R5 the summary line wraps by item: no row starts or ends with a dot", () => withPage(async page => {
  await open(page, "brief-summary-on");
  for (const width of [170, 230, 300]) {
    const rows = await page.evaluate(w => {
      const box = document.querySelector("#oak-brief-summary");
      box.style.width = `${w}px`; box.style.flex = "none";
      const container = box.getBoundingClientRect(), style = getComputedStyle(box);
      const gap = parseFloat(style.columnGap), spans = [...box.querySelectorAll("span")];
      return spans.map((span, index) => {
        const rect = span.getBoundingClientRect(), previous = spans[index - 1]?.getBoundingClientRect();
        const startsRow = !previous || rect.top > previous.top + 1;
        const dot = getComputedStyle(span, "::before").content;
        const dotCentre = rect.left - gap / 2;
        return { index, startsRow, hasDot: dot !== "none" && dot !== "normal", dotShown: dot !== "none" && dot !== "normal" && dotCentre >= container.left, clipped: style.overflow === "hidden", nowrap: getComputedStyle(span).whiteSpace === "nowrap", right: rect.right <= container.right + 1 };
      });
    }, width);
    assert.ok(rows.some(row => row.startsRow && row.index > 0), `width ${width}: the line really wraps`);
    for (const row of rows) {
      assert.equal(row.clipped && row.nowrap && row.right, true, `width ${width}: item ${row.index} is one unit inside the line`);
      if (row.index === 0) assert.equal(row.hasDot, false, "the first item has no dot");
      if (row.startsRow) assert.equal(row.dotShown, false, `width ${width}: item ${row.index} starts a row with no dot`);
      else assert.equal(row.hasDot, true, `width ${width}: item ${row.index} keeps its separating dot`);
    }
    // No item carries a trailing dot either: the dot is only ever drawn before an item.
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#oak-brief-summary span"), "::after").content), "none");
  }
}, { width: 390, height: 844 }));
