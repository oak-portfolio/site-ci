import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { judgeStates } from "../../../scripts/design-policy/design-judge.mjs";
import { galleryUrl, stateById } from "./gallery.mjs";

// Ticket 290 (f287 parity): the Role card's artwork sits on the card's own surface, so the judge finds no framed box
// nested in the card (R6-C22) and no work image outside a media frame (QJ10) at either width.
const states = ["role-entry-unlinked", "profile-recruiter-after"];

test("290 the Role art reads as part of its card: no card-in-card or case-image-frame on oak-openui-art", async () => {
  const browser = await chromium.launch();
  try {
    const { findings } = await judgeStates(browser, galleryUrl, states.map(stateById), { widths: [390, 1440], debt: [] });
    const art = findings.filter(({ rule, detail }) => ["card-in-card", "case-image-frame"].includes(rule) && detail.includes("oak-openui-art"));
    assert.deepEqual(art.map(({ state, rule, width }) => `${state} ${rule} ${width}`), []);
  } finally { await browser.close(); }
});
