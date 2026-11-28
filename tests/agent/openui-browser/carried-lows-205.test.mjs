import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

// Ticket 205: m7 carried lows on the gallery at 1280 and 390, the revoked send, the signed-in menu and Sources chips.
const root = path.resolve(import.meta.dirname, "../../..");
const gallery = process.env.OAK_GALLERY_URL;
const ownGallery = gallery && (await fetch(`${gallery}/@fs${encodeURI(path.join(root, "src/components/ui/tooltip.tsx"))}`).then(response => response.ok, () => false));
const skip = !ownGallery && "set OAK_GALLERY_URL to this checkout's dev server";
const WIDTHS = [1280, 390];

const each = async (fn) => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    for (const width of WIDTHS) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const open = async (id) => {
        await page.goto(`${gallery}/__dev/oak-states?state=${id}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 60000 });
        await page.waitForTimeout(600);
      };
      await fn(page, open, width);
      await page.close();
    }
  } finally { await browser.close(); }
};

test("205 a revoked send says it once: no Retry, no repeated plain line, and nothing touches the session-ended panel", { skip }, () => each(async (page, open, width) => {
  await open("flow-revoked-real-2");
  const seen = await page.evaluate(() => {
    const visible = node => { const box = node.getBoundingClientRect(); return box.width > 1 && box.height > 1; };
    const panel = document.querySelector(".oak-account-intake");
    const shown = [...document.querySelectorAll(".oak-workspace__status")].filter(visible).map(node => node.textContent.trim());
    const above = panel?.previousElementSibling;
    const gap = panel && above && visible(above) ? panel.getBoundingClientRect().top - above.getBoundingClientRect().bottom : null;
    return { card: document.querySelector(".oak-turn__stopped-title")?.textContent, retry: [...document.querySelectorAll(".oak-turn__stopped button")].map(b => b.textContent.trim()),
      shown, panel: panel?.querySelector("h2")?.textContent, signIn: [...(panel?.querySelectorAll("button") ?? [])].map(b => b.textContent.trim()), gap,
      heard: document.querySelector(".oak-workspace__live")?.textContent.trim() };
  });
  assert.match(seen.card ?? "", /stopped before it finished/, `${width}: the failed card is drawn`);
  assert.deepEqual(seen.retry.filter(text => /Retry/.test(text)), [], `${width}: the failed card offers no Retry while only signing in again can succeed`);
  assert.deepEqual(seen.shown, [], `${width}: no plain line repeats the panel (${seen.shown.join(" | ")})`);
  assert.equal(seen.panel, "Your session ended", `${width}: the session-ended panel is the one notice`);
  assert.ok(seen.signIn.includes("Sign in again"), `${width}: Sign in again is offered`);
  assert.ok(seen.gap === null || seen.gap >= 8, `${width}: nothing touches the panel's top edge (gap ${seen.gap})`);
  assert.match(seen.heard ?? "", /Sign in again/, `${width}: the polite region still announces the notice`);
}));

test("205 another error is still drawn while the session is ended: only the repeated sign-in line goes unseen", { skip }, () => each(async (page, open, width) => {
  await open("flow-revoked-real-2");
  const other = "Finish or stop document preparation before sending a question.";
  await page.evaluate(async error => { (await import("/src/lib/oakWorkspace.ts")).setOakWorkspaceFixture({ error }); }, other);
  await page.waitForFunction(text => document.querySelector(".oak-workspace__live")?.textContent.trim() === text, other, { timeout: 10000 });
  const shown = await page.evaluate(() => [...document.querySelectorAll(".oak-workspace__status")]
    .filter(node => { const box = node.getBoundingClientRect(); return box.width > 1 && box.height > 1; }).map(node => node.textContent.trim()));
  assert.deepEqual(shown, [other], `${width}: an error the session-ended panel does not say is drawn`);
}));

test("205 the signed-in account menu shows the whole email, wrapped and never cut at its end", { skip }, () => each(async (page, open, width) => {
  await open("account-menu-signed-in");
  const email = await page.evaluate(() => {
    const node = document.querySelector(".oak-account-menu__meta");
    return node && { text: node.textContent.trim(), scroll: node.scrollWidth, client: node.clientWidth, height: node.getBoundingClientRect().height,
      overflow: getComputedStyle(node).textOverflow };
  });
  assert.ok(email, `${width}: the identity line is drawn`);
  assert.equal(email.text, "maya.chen.recruiting-team@example.com", `${width}: the full address is the line's text`);
  assert.ok(email.scroll <= email.client + 1, `${width}: nothing is clipped (${email.scroll} in ${email.client})`);
  assert.notEqual(email.overflow, "ellipsis", `${width}: no end ellipsis`);
}));

test("205 a one-claim Project card shows its Sources chip like a multi-claim answer", { skip }, () => each(async (page, open, width) => {
  await open("answer-openui-project-one-claim");
  const chips = await page.evaluate(() => [...document.querySelectorAll(".oak-turn__answer .oak-source-chip__trigger")]
    .map(node => node.getBoundingClientRect()).filter(box => box.width > 1 && box.height > 1).length);
  assert.ok(chips >= 1, `${width}: the card's one claim opens its source from a visible chip`);
}));

test("205 every Sources chip owns a 44px tall touch area at 390 and keeps its 22px drawing at 1280", { skip }, () => each(async (page, open, width) => {
  for (const id of ["answer-openui-projects"]) {
    await open(id);
    const rows = await page.evaluate(() => [...document.querySelectorAll(".oak-turn__answer .oak-source-chip__trigger")].filter(node => node.getBoundingClientRect().width > 1).map(node => {
      node.scrollIntoView({ block: "center" });
      const box = node.getBoundingClientRect(), x = box.left + box.width / 2, y = box.top + box.height / 2;
      return { height: Math.round(box.height), up: node.contains(document.elementFromPoint(x, y - 21)), down: node.contains(document.elementFromPoint(x, y + 21)) };
    }));
    assert.ok(rows.length > 0, `${id} ${width}: a chip is drawn`);
    for (const row of rows) {
      assert.equal(row.height, 22, `${id} ${width}: the chip's drawn height stays 22`);
      if (width === 390) assert.ok(row.up && row.down, `${id} 390: the chip owns 21px above and below its centre (${JSON.stringify(row)})`);
    }
  }
}));

// 233: after 216 a gap note refused twice for an uncited title ends in the title line, so no gap-note state shows the generic line.
test("233 no gap-note gallery state carries the generic absence line", async () => {
  const { readFile } = await import("node:fs/promises");
  const states = JSON.parse(await readFile(path.join(root, "src/data/dev/oak-states.json"), "utf8"));
  const generic = states.filter(state => state.id.startsWith("answer-gap-note") && JSON.stringify(state).includes("The sources I read don't say.")).map(state => state.id);
  assert.deepEqual(generic, []);
});

test("205 a twice-refused gap note shows the title line over its cited claim, never the failed card", { skip }, () => each(async (page, open, width) => {
  await open("answer-gap-note-title-line");
  const seen = await page.evaluate(() => {
    const answer = document.querySelector(".oak-turn__answer");
    return { lines: [...(answer?.querySelectorAll("p") ?? [])].map(p => p.textContent.trim()), points: answer?.querySelectorAll(".oak-answer__point").length,
      chips: answer?.querySelectorAll(".oak-source-chip__trigger").length, stopped: !!document.querySelector(".oak-turn__stopped") };
  });
  assert.ok(seen.lines.includes("The sources I read don't state that title."), `${width}: the note is the title line (${JSON.stringify(seen.lines)})`);
  assert.equal(seen.points, 1, `${width}: the cited claim stays`);
  assert.ok(seen.chips >= 1, `${width}: the claim keeps its source chip`);
  assert.equal(seen.stopped, false, `${width}: no failed card`);
}));
