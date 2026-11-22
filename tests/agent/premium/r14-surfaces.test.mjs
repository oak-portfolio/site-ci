import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { arcProbe, equalHeightProbe, insetProbe, slackProbe, tintProbe } from "./arc-probe.mjs";
import { openState, stateIds } from "./gallery.mjs";
// contact-menu carries the popover inset check.

// RETRO Q24 round 14, line 1: Oak flagged corners and insets on 10 cells for the second to fourth time in review v11. Each
// earlier fix patched the flagged selectors (a 24px card step in R11, a 40px shell on six selectors in R12), and the R12
// check measured 13 states, parent against child only. A probe of all 95 gallery states found 191 frames at 24px beside
// 15 at 40px (a 24px dropzone over a 40px paste box), copy 16px inside 40px curves, and bordered gray wells in gray frames.
// This walks every gallery state and holds the four surface rules from the R14 role block in oakAgent.css.
const states = stateIds();
const FRAME = 48;

const measure = FRAME => {
  const css = node => getComputedStyle(node);
  const clear = color => /rgba\(0, 0, 0, 0\)|transparent/.test(color);
  const bordered = node => { const s = css(node); return parseFloat(s.borderTopWidth) > 0 && /^(solid|dashed)$/.test(s.borderTopStyle) && !/, 0\)$/.test(s.borderTopColor); };
  const framed = node => !clear(css(node).backgroundColor) || bordered(node);
  const name = node => String(node.className).split(" ")[0] || node.tagName.toLowerCase();
  // A user's question bubble (not the ghost bubble that holds answers), the composer's inner action bar and dialog scrims are not reading-column frames.
  const skip = node => node.matches(".ui-bubble:not(.ui-bubble--ghost), .ui-bubble:not(.ui-bubble--ghost) *, .ui-dialog__backdrop, .oak-composer__surface *, [role=tooltip], .oak-workspace__header *");
  const root = document.querySelector(".oak-workspace");
  const frames = [];
  for (const node of root?.querySelectorAll("*") ?? []) {
    const box = node.getBoundingClientRect();
    if (box.width < 120 || box.height < 40 || !framed(node) || skip(node) || css(node).visibility === "hidden") continue;
    const r = parseFloat(css(node).borderTopLeftRadius);
    if (r >= box.height / 2 - 1) continue;
    let up = node.parentElement;
    while (up && up !== root && !(framed(up) && up.getBoundingClientRect().width > box.width + 4)) up = up.parentElement;
    frames.push({ node, box, r, parent: up && up !== root ? up : null });
  }
  const out = [];
  for (const { node, box, r, parent } of frames) {
    const id = name(node);
    if (!parent && box.width > 300 && box.height > 64 && r && Math.abs(r - FRAME) > 1) out.push(`top-level ${id} is ${r}px, frames are ${FRAME}px`);
    if (parent) {
      const pr = parseFloat(css(parent).borderTopLeftRadius), pb = parent.getBoundingClientRect();
      const inset = Math.round(Math.min(box.left - pb.left, pb.right - box.right, box.top - pb.top, pb.bottom - box.bottom));
      const want = Math.max(16, pr - inset);
      if (inset <= pr && Math.abs(r - want) > 4) out.push(`${name(parent)} ${pr}px holds ${id} ${r}px at ${inset}px (want ${want})`);
      if (bordered(node) && !clear(css(node).backgroundColor) && !clear(css(parent).backgroundColor) && !node.matches(":focus-within"))
        out.push(`${id} has a border on gray inside ${name(parent)}`);
    }
    if (r >= 32) {
      for (const child of node.querySelectorAll("p, h2, h3, label, li, span")) {
        if (child.closest(".ui-button, .ui-badge, .ui-attachment-dropzone, [data-slot=badge]") || !child.childNodes.length) continue;
        const text = [...child.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
        if (!text) continue;
        const range = document.createRange(); range.selectNodeContents(text);
        const rb = range.getBoundingClientRect();
        if (!rb.width || rb.top - box.top > r || box.bottom - rb.bottom > r) continue;
        const inset = Math.round(rb.left - box.left);
        if (inset >= 0 && inset < 20) { out.push(`${id} ${r}px has text "${text.textContent.trim().slice(0, 24)}" ${inset}px from its curve`); break; }
      }
    }
  }
  const groups = new Map();
  // Frames side by side in one column share a corner and an edge: all bordered or none (review v11, question-draft).
  for (const { node, box, r, parent } of frames) if (box.width > 400 && r) groups.set(parent, [...(groups.get(parent) ?? []), { id: name(node), r, edge: node.matches(".oak-composer__surface") ? null : bordered(node) }]);
  for (const kids of groups.values()) {
    if (new Set(kids.map(k => k.r)).size > 1) out.push(`siblings differ: ${kids.map(k => `${k.id}:${k.r}`).join(" ")}`);
    if (new Set(kids.map(k => k.edge).filter(edge => edge !== null)).size > 1) out.push(`sibling edges differ: ${kids.map(k => `${k.id}:${k.edge ? "border" : "none"}`).join(" ")}`);
  }
  return [...new Set(out)];
};

test("R14 every gallery state keeps frames, insets, borders and siblings on the surface roles", async () => {
  const browser = await chromium.launch();
  const failures = [];
  try {
    const queue = [...states];
    await Promise.all(Array.from({ length: 4 }, async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      for (let state = queue.shift(); state; state = queue.shift()) {
        await openState(page, state);
        await page.waitForTimeout(500);
        for (const miss of await page.evaluate(measure, FRAME)) failures.push(`${state}: ${miss}`);
        // R15: content clears every 20px+ corner arc by 8px or more.
        for (const miss of await page.evaluate(arcProbe)) failures.push(`${state}: ${miss}`);
        // R17: the four gaps of every frame reach its role pad, and top matches bottom.
        for (const miss of await page.evaluate(insetProbe)) failures.push(`${state}: ${miss}`);
        // R18: no square fill inside a filled frame (tint in tint).
        for (const miss of await page.evaluate(tintProbe)) failures.push(`${state}: ${miss}`);
        // R19: framed siblings side by side in one row share one height.
        for (const miss of await page.evaluate(equalHeightProbe)) failures.push(`${state}: ${miss}`);
        // RETRO Q24 rounds 27j to 27n: no Stats tile holds a stretched empty run.
        for (const miss of await slackProbe(page)) failures.push(`${state}: ${miss}`);
      }
    }));
  } finally { await browser.close(); }
  if (failures.length) process.stderr.write(`${failures.sort().join("\n")}\n`);
  assert.equal(FRAME, 48);
  assert.deepEqual(failures.sort(), []);
});

// Ticket 25 review r25: at 390 the 32px frame pad left the next-step row's copy 6px from its 48px arc, under the 8px bar.
test("R25 at 390 the next-step row keeps its tile and copy 8px off the 48px arc in every state", async () => {
  const browser = await chromium.launch();
  const failures = [];
  let seen = 0;
  try {
    const queue = [...states];
    await Promise.all(Array.from({ length: 4 }, async () => {
      const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
      for (let state = queue.shift(); state; state = queue.shift()) {
        await openState(page, state);
        await page.waitForTimeout(500);
        if (await page.locator(".oak-next-step").count()) seen++;
        for (const miss of await page.evaluate(arcProbe)) if (miss.startsWith("oak-next-step")) failures.push(`${state}: ${miss}`);
      }
    }));
  } finally { await browser.close(); }
  assert.ok(seen > 10, `${seen} states render a next-step row`);
  assert.deepEqual(failures.sort(), []);
});

// Ticket 134 (review r25b note 3): at 390 every next-step hint stopped mid-word ("...job you have i...") and the brief hint
// lost "yourself". On a phone the hint wraps whole; at 1280 it stays one line.
test("R25 every next-step hint reads whole at 360, 390 and 430, and on one line at 1280", async () => {
  const browser = await chromium.launch();
  const failures = [];
  const actions = new Set();
  const probe = () => [...document.querySelectorAll(".oak-next-step__hint")].map(hint => ({
    action: hint.closest(".oak-next-step")?.dataset.action, text: hint.textContent,
    cut: hint.scrollWidth > hint.clientWidth,
    lines: Math.round(hint.offsetHeight / parseFloat(getComputedStyle(hint).lineHeight)),
  }));
  try {
    const ids = stateIds(state => /answer|research|role-fit/.test(state.id));
    await Promise.all([360, 390, 430, 1280].map(async width => {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      for (const state of ids) {
        await openState(page, state);
        for (const hint of await page.evaluate(probe)) {
          actions.add(hint.action);
          if (hint.cut) failures.push(`${width} ${state}: "${hint.text}" is cut`);
          if (width === 1280 && hint.lines !== 1) failures.push(`1280 ${state}: "${hint.text}" takes ${hint.lines} lines`);
          if (width < 560 && hint.lines > 2) failures.push(`${width} ${state}: "${hint.text}" takes ${hint.lines} lines`);
        }
      }
      await page.close();
    }));
  } finally { await browser.close(); }
  assert.ok(actions.size >= 3, `hints seen for ${[...actions].join(", ")}`);
  assert.deepEqual([...new Set(failures)].sort(), []);
});

// Ticket 134 (review r25b note 1): a truncated line paints only inside the box that clips it, so arcProbe measures the
// visible box. A long hidden tail past the arc passes; the same tail left visible fails.
test("R25 the arc probe measures a truncated line's visible box, not its hidden tail", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
    await openState(page, "answer-openui-proposal");
    await page.waitForTimeout(500);
    const tail = "Ask about a resume or job post you have and a very long hidden tail that runs far past the row's right curve";
    await page.evaluate(text => { for (const hint of document.querySelectorAll(".oak-next-step__hint")) hint.textContent = text; }, tail);
    await page.addStyleTag({ content: ".oak-workspace .oak-next-step__hint { white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }" });
    await page.waitForTimeout(200);
    const hidden = (await page.evaluate(arcProbe)).filter(miss => miss.startsWith("oak-next-step"));
    assert.deepEqual(hidden, [], "a clipped tail is not ink near the arc");
    // The text column keeps its width (width 0 under flex 1), so the tail spills past the curve instead of widening the row.
    await page.addStyleTag({ content: ".oak-workspace .oak-next-step__hint { overflow: visible !important; } .oak-workspace .oak-next-step__text { width: 0 !important; }" });
    await page.waitForTimeout(200);
    const shown = (await page.evaluate(arcProbe)).filter(miss => miss.startsWith("oak-next-step"));
    assert.ok(shown.length > 0, "the same tail left visible crosses the arc");
  } finally { await browser.close(); }
});

// RETRO Q24 round 14 pass 2: on steveoak.com an account notice ("Sign in again to continue...") sat at the window's left
// edge, 256px outside the reading column, because no gallery state renders an .oak-workspace__status line (contact,
// error, save and account notices all use it). This places one where OakConversation renders it, beside the message box,
// and holds its text to the message box's column at full width and at full screen.
test("R14 a workspace status line reads in the message box's column", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const misses = [];
    for (const state of ["empty", "answer-sourced", "sign-in-again"]) {
      await openState(page, state);
      await page.waitForTimeout(400);
      const gap = await page.evaluate(() => {
        const composer = document.querySelector(".oak-composer");
        const line = Object.assign(document.createElement("p"), { className: "oak-workspace__status", textContent: "Sign in again to continue. Your draft is still here." });
        composer.parentElement.insertBefore(line, composer);
        const range = document.createRange(); range.selectNodeContents(line);
        return Math.round(range.getBoundingClientRect().left - document.querySelector(".oak-composer__surface").getBoundingClientRect().left);
      });
      if (gap < 0 || gap > 40) misses.push(`${state}: status text starts ${gap}px from the message box`);
    }
    assert.deepEqual(misses, []);
  } finally { await browser.close(); }
});

// R15 review (interrogate): the arc probe first skipped capsule frames, filled controls, icons and every answer (answers
// render in a ghost bubble, which the question-bubble filter caught), so it passed with nothing measured. A judge that
// cannot fail is no judge: stripping the padding from an answer's next-step row and from the reasoning header must fail it.
test("R15 the arc probe fails when an answer row's content touches its corner", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const caught = {};
    for (const [state, selector] of [["answer-openui-proposal", ".oak-next-step"], ["tool-running", ".ui-chain-of-thought__header"]]) {
      await openState(page, state);
      await page.waitForTimeout(500);
      assert.deepEqual(await page.evaluate(arcProbe), [], `${state} passes as shipped`);
      await page.addStyleTag({ content: `.oak-workspace ${selector} { padding: 0 !important; }` });
      await page.waitForTimeout(200);
      caught[state] = await page.evaluate(arcProbe);
    }
    for (const [state, misses] of Object.entries(caught)) assert.ok(misses.length > 0, `${state}: the probe catches content on the curve`);
  } finally { await browser.close(); }
});

// R17 (Oak, review v14: "add vertical padding for visual harmony" on 12 cells): the inset probe has to be able to fail. Zeroing
// the top padding of a panel and of an answer's reasoning header must each be caught, while both pass as shipped.
test("R17 the inset probe fails when a panel's top padding is stripped", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const caught = {};
    for (const [state, selector] of [["saved-list", ".oak-saved__inset, .oak-saved__inset .oak-saved__row"], ["contact-menu", ".ui-popover__popup"], ["tool-running", ".ui-chain-of-thought__header"]]) {
      await openState(page, state);
      await page.waitForTimeout(500);
      assert.deepEqual(await page.evaluate(insetProbe), [], `${state} passes as shipped`);
      await page.addStyleTag({ content: `${selector.split(",").map(part => `.oak-workspace ${part.trim()}`).join(", ")} { padding-top: 0 !important; margin-top: 0 !important; }` });
      await page.waitForTimeout(200);
      caught[state] = await page.evaluate(insetProbe);
    }
    for (const [state, misses] of Object.entries(caught)) assert.ok(misses.length > 0, `${state}: the probe catches a stripped top pad`);
  } finally { await browser.close(); }
});

// R18 (Oak, review v15, document-selected: "these minor error thing and gap fix"): the tint probe has to be able to fail. A
// 5% fill on one document row, the very thing that read as a square lighter strip under the list's curve, must be caught,
// while the shipped state passes.
test("R18 the tint probe fails when a row paints a fill inside the list's fill", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await openState(page, "document-selected");
    await page.waitForTimeout(500);
    assert.deepEqual(await page.evaluate(tintProbe), [], "document-selected passes as shipped");
    await page.addStyleTag({ content: ".oak-workspace .oak-documents__section[data-selected] { background: color-mix(in srgb, white 5%, transparent) !important; }" });
    await page.waitForTimeout(200);
    const misses = await page.evaluate(tintProbe);
    assert.ok(misses.some(miss => miss.startsWith("oak-documents__section")), "the probe catches a filled row inside the list");
  } finally { await browser.close(); }
});
