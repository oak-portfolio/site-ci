import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
// Each intake panel, its D42 helper, safety, privacy or cost line, and the label of its one bottom-bar primary.
const panels = {
  "role-fit": { title: "Compare a role", fact: /Nothing sends until Compare/, primary: "Compare", groups: 2 },
  "question-draft": { title: "Draft a question for Steve", fact: /Nothing is sent until you choose Send/, primary: "Send", groups: 1 },
  "advice-intake": { title: "Project advice", fact: /Oak suggests a next step from public work/, primary: "Send", groups: 1 },
};

test("D54-G1 role, question and advice panels open with an iOS navigation bar, group fields in inset sections with headers, and end in one full-width primary", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    for (const [id, expected] of Object.entries(panels)) {
      await page.goto(`${galleryUrl}/__dev/oak-states?state=${id}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
      const panel = page.locator(".oak-workflow").first();

      // Navigation bar: back icon button first, then the title, then Oak's mark.
      const nav = panel.locator(".oak-panel-nav");
      assert.equal(await nav.count(), 1, `${id}: one navigation bar`);
      const back = nav.getByRole("button", { name: "Return to chat" });
      assert.equal(await back.count(), 1, `${id}: back button named Return to chat`);
      assert.equal((await back.innerText()).trim(), "", `${id}: the back button is an icon, not a text link`);
      assert.equal(await nav.locator("h2").innerText(), expected.title);
      // D70: the panel's art leads under the nav bar as a header tile; the nav's right slot only balances the title.
      assert.equal(await panel.locator(".oak-panel-hero [class*='sprite']").count() > 0, true, `${id}: the panel's art leads`);
      const order = await nav.evaluate(bar => [bar.querySelector(":scope > .ui-button"), bar.querySelector("h2"), bar.querySelector(".oak-panel-nav__mark")]
        .map(node => node.getBoundingClientRect().left));
      assert.ok(order[0] < order[1] && order[1] < order[2], `${id}: back, title, mark read left to right ${order}`);
      await back.hover();
      const tip = page.locator(".oak-composer__tooltip").filter({ hasText: "Return to chat" });
      await tip.waitFor({ state: "visible", timeout: 5000 });
      await page.mouse.move(0, 0);

      // Inset groups: header above a raised rounded body, fields inside it, hairlines between shared rows.
      const groups = await panel.locator(".oak-group").evaluateAll(list => list.map(group => {
        // A group header is its own heading, or the label of the one field the group holds.
        const header = group.querySelector(":scope > .oak-group__header, :scope > .ui-field > .ui-field__label");
        // D116 re-tick: a single field's group body is its visible well (ui/input-group).
        const body = group.querySelector(":scope > .oak-group__body, :scope > .ui-field > .oak-group__body, :scope > .ui-field > .ui-input-group");
        const style = body && getComputedStyle(body);
        const rows = body ? [...body.querySelectorAll(":scope > .oak-group__row")] : [];
        return { header: header?.textContent.trim() ?? "", headerAbove: header && body ? header.getBoundingClientRect().bottom <= body.getBoundingClientRect().top : false,
          radius: style ? parseFloat(style.borderTopLeftRadius) : 0, raised: style ? style.backgroundColor : "", panel: getComputedStyle(group.closest(".oak-workspace")).backgroundColor,
          fields: body ? body.querySelectorAll("input, textarea, .oak-role-intake__source").length + (body.matches(".oak-group__preview") ? 1 : 0) : 0,
          // A plain row draws its hairline as a top border; an icon row (D70) draws it inset, from where the text starts.
          hairlines: rows.slice(1).map(row => getComputedStyle(row).borderTopWidth !== "0px" ? getComputedStyle(row).borderTopWidth : getComputedStyle(row, "::before").height) };
      }));
      assert.ok(groups.length >= expected.groups, `${id}: ${groups.length} inset groups`);
      for (const group of groups) {
        assert.ok(group.header, `${id}: every group has a section header`);
        assert.ok(group.headerAbove, `${id} / ${group.header}: the header sits above its group`);
        assert.ok(group.radius >= 8, `${id} / ${group.header}: rounded group (${group.radius}px)`);
        assert.notEqual(group.raised, "rgba(0, 0, 0, 0)", `${id} / ${group.header}: the group is a raised surface`);
        assert.ok(group.fields >= 1, `${id} / ${group.header}: fields sit inside the group`);
        for (const width of group.hairlines) assert.equal(width, "1px", `${id} / ${group.header}: hairline between rows`);
      }
      if (id === "question-draft") assert.equal(groups[0].hairlines.length, 1, "both question fields share one group with a hairline");
      const loose = await panel.evaluate(section => [...section.querySelectorAll("input, textarea")].filter(field => !field.closest(".oak-group__body, .ui-input-group")).length); // D116: a well is a group
      assert.equal(loose, 0, `${id}: no field outside an inset group`);

      // Bottom bar: one primary, nearly the bar's full width, below the panel; no message box.
      const bar = page.locator(".oak-composer__surface[data-action-bar]");
      assert.equal(await bar.count(), 1, `${id}: bottom bar`);
      assert.equal(await page.locator(".oak-composer textarea").count(), 0, `${id}: no composer textarea`);
      const primaries = bar.locator(".ui-button--primary");
      assert.equal(await primaries.count(), 1, `${id}: one primary`);
      assert.equal(await primaries.getAttribute("aria-label"), expected.primary);
      const [barBox, buttonBox, panelBox] = [await bar.boundingBox(), await primaries.boundingBox(), await panel.boundingBox()];
      assert.ok(buttonBox.width >= barBox.width * 0.9, `${id}: primary is ${buttonBox.width}px of a ${barBox.width}px bar`);
      // A panel taller than the window scrolls in the reading area, so "below the panel" means below what of it is visible.
      const reading = await page.locator(".oak-workspace__reading").boundingBox();
      assert.ok(buttonBox.y >= Math.min(panelBox.y + panelBox.height, reading.y + reading.height) - 1, `${id}: the primary sits below the panel`);

      // D42 lines stay.
      assert.match(await panel.innerText(), expected.fact, `${id} keeps its line`);
      // D120 (Oak): a human counter in characters.
      if (id === "role-fit") assert.match(await page.locator("#oak-role-limit").innerText(), /^[\d,]+ \/ 4,000 characters$/);
      if (id === "question-draft") {
        // Editing a field composes the message Send submits; it reads back in its own Message group.
        await page.getByLabel("Topic").fill("Agent memory design");
        await page.locator(".oak-group__preview").filter({ hasText: "Topic: Agent memory design" }).waitFor({ timeout: 5000 });
        assert.equal(await bar.getByRole("button", { name: "Send" }).isDisabled(), false, "a complete question can be sent");
      }
      await page.screenshot({ path: `/tmp/d54-${id}-1440x900.png` });
    }
  } finally {
    await browser.close();
  }
});
