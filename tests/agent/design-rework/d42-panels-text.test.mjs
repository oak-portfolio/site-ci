import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const states = ["role-fit", "advice-intake", "question-draft", "funding", "saved-list", "saved-empty", "contact-brief",
  "document-upload", "document-selected", "voice-recording", "voice-review", "ocr-consent"];

// Helper copy is any visible paragraph in a workflow panel that is not a field label or description, a control's own text,
// a list or result row, an icon status chip, a callout, or the scanned-PDF consent card (its consent copy is a disclosure).
const exempt = [
  "label", "legend", "summary", "li", ".sr-only", "[data-slot='field-label']", "[data-slot='field-description']", "[data-slot='field-error']",
  ".ui-radio-card", ".ui-attachment", ".ui-attachment-dropzone", ".ui-callout", "[role='alert']", "[class*='__title']",
  ".oak-documents__status", ".oak-ocr", "#oak-saved-conversations",
  // Q06 (intentional update): each panel now has one fixed line saying what it returns; the saved row's and the documents
  // footer's live save status ("Not saved yet", "Sign in ... before saving") report state and are not helper copy.
  ".oak-saved__meta", ".oak-documents__note",
].join(", ");

test("D42-G1 every workflow panel keeps at most one short helper line, and Compare gets an action bar instead of an empty composer", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    for (const id of states) {
      await page.goto(`${galleryUrl}/__dev/oak-states?state=${id}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
      const panels = await page.evaluate(selector => [...document.querySelectorAll(".oak-workflow")].map(panel => ({
        title: panel.querySelector("h2")?.textContent ?? "",
        lines: [...panel.querySelectorAll("p")].filter(p => p.checkVisibility() && !p.closest(selector) && p.textContent.trim())
          .map(p => p.textContent.trim()),
      })), exempt);
      assert.ok(panels.length >= 1, `${id} opens a workflow panel`);
      for (const { title, lines } of panels) {
        assert.ok(lines.length <= 1, `${id} / ${title}: ${lines.length} helper lines: ${JSON.stringify(lines)}`);
        for (const line of lines) assert.ok(line.length < 90, `${id} / ${title}: "${line}" is ${line.length} characters`);
      }
      if (id === "role-fit") {
        assert.equal(await page.locator(".oak-composer textarea").count(), 0, "role-fit renders no composer textarea");
        const bar = page.locator(".oak-composer__surface[data-action-bar]");
        assert.equal(await bar.count(), 1, "role-fit footer is an action bar");
        assert.equal(await bar.getByRole("button", { name: "Compare" }).count(), 1, "the action bar carries Compare");
        // Counters ride in the well as inline counts (D120: characters, not bytes); every role field keeps its label.
        assert.match(await page.locator("[data-slot='field-count']#oak-role-limit").innerText(), /characters$/);
        for (const label of ["Role description", "What would you like to compare?"]) assert.equal(await page.getByLabel(label).count(), 1, label);
      }
      // Safety, privacy and cost facts stay visible in their panels.
      const text = await page.locator(".oak-workflow").first().innerText();
      const facts = { "role-fit": /Nothing sends until Compare/, "question-draft": /Nothing is sent until you choose Send/,
        funding: /capped allowance\. Switching never resets it/, "contact-brief": /Nothing is sent or booked here/,
        "voice-recording": /Oak turns your clip into text; the audio is not kept\. Using the text never sends it/ };
      if (facts[id]) assert.match(text, facts[id], `${id} keeps its fact`);
    }
  } finally {
    await browser.close();
  }
});
