import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { openState } from "../premium/gallery.mjs";
import { judgeCue, judgeFocus } from "./forced-colors-oracle.mjs";

// Ticket 196 (A23, gallery on OAK_GALLERY_URL): under forced colors every state cue in the goal's blocks keeps a carrier
// other than color (outline, border, ring or stroke width, weight, solid or hollow fill, or text), its marks stay painted,
// and text stays readable. A row without `on` has no off state to compare; its name says why.
const CUES = [
  { block: "Board", state: "board-stand-5", on: ".oak-board__card[data-newest]", off: ".oak-board__card:not([data-newest])" },
  { block: "Ownership", state: "ownership-split", on: ".oak-ownership__switch .ui-radio-segment[data-checked]", off: ".oak-ownership__switch .ui-radio-segment:not([data-checked])" },
  { block: "Profile carrier, no on or off state: fact rows keep a divider the lead lacks", state: "profile-full", on: ".oak-profile__fact", off: ".oak-profile__lead" },
  { block: "Quote", state: "quote-carousel", on: ".oak-quote__dot[aria-current=true]", off: ".oak-quote__dot:not([aria-current=true])", marks: ".oak-quote__dot" },
  { block: "Screens", state: "screens-three", on: ".oak-screens__thumb[aria-current=true]", off: ".oak-screens__thumb:not([aria-current=true])" },
  { block: "PageCards", state: "page-cards-look-second", on: ".oak-page-card[data-open]", off: ".oak-page-card:not([data-open])" },
  { block: "ContactCard availability, no off state: the dot stays painted beside its words", state: "contact-card-availability", marks: ".oak-contact-card__dot", text: ".oak-contact-card__availability" },
  { block: "ContactCard reasons", state: "contact-card-focus", open: ".oak-contact-focus__reason", on: ".oak-contact-focus__reason[aria-pressed=true]", off: ".oak-contact-focus__reason[aria-pressed=false]" },
  { block: "Explainer steps", state: "explainer-concept-rag", on: ".oak-explainer__step[data-current]", off: ".oak-explainer__step:not([data-current])" },
  { block: "Explainer topics", state: "explainer-xmap-agent-memory", on: ".oak-explainer__topics [aria-pressed=true]", off: ".oak-explainer__topics [aria-pressed=false]" },
  { block: "Explainer wires", state: "explainer-xmap-agent-memory", on: ".oak-explainer__wires path[data-selected]", off: ".oak-explainer__wires path:not([data-selected])" },
  { block: "Explainer states", state: "explainer-statediag", on: ".oak-explainer__state[data-current] rect", off: ".oak-explainer__state:not([data-current]) rect" },
  { block: "ShowMeAs", state: "show-me-as-recruiter", open: ".oak-show-me-as__capsule", on: ".oak-show-me-as__switch .ui-radio-segment[data-checked]", off: ".oak-show-me-as__switch .ui-radio-segment:not([data-checked])" },
  { block: "StackMap pips", state: "stack-map-tools-4", on: ".oak-stack-map__pips > span[data-on]", off: ".oak-stack-map__pips > span:not([data-on])", marks: ".oak-stack-map__pips > span" },
  { block: "ProjectWall chips", state: "project-wall-filter", open: ".oak-wall__chip", on: ".oak-wall__chip[data-pressed]", off: ".oak-wall__chip:not([data-pressed])" },
  { block: "ProjectWall sort", state: "project-wall-three", on: ".oak-wall__controls .ui-radio-segment[data-checked]", off: ".oak-wall__controls .ui-radio-segment:not([data-checked])" },
  { block: "Status chips met vs partial", state: "role-fit-answer", on: ".oak-role-review__mark[data-status=demonstrated]", off: ".oak-role-review__mark[data-status=transferable]", marks: ".oak-role-review__mark" },
  { block: "Status chips partial vs gap", state: "role-fit-answer", on: ".oak-role-review__mark[data-status=transferable]", off: ".oak-role-review__mark[data-status=missing-evidence]", marks: ".oak-role-review__mark" },
  { block: "Status chips partial half-disc, no off state: the ::after fill stays painted", state: "role-fit-answer", marks: ".oak-role-review__mark[data-status=transferable]", parts: ["::after"] },
];

// Controls under forced-color-adjust: none keep author colors, so their focus outline can match the canvas it sits on.
const FOCUS = [
  { block: "ProjectWall chips", state: "project-wall-filter", open: ".oak-wall__chip", target: ".oak-wall__chip[data-pressed]" },
  { block: "ProjectWall sort", state: "project-wall-three", target: ".oak-wall__controls .ui-radio-segment[data-checked]" },
];

let browser;
before(async () => { browser = await chromium.launch(); });
after(() => browser?.close());

for (const width of [1280, 390]) {
  for (const cue of FOCUS) {
    test(`forced colors ${width}: ${cue.block} (${cue.state}) focus ring shows on the canvas`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 900 }, forcedColors: "active" });
      try {
        const page = await context.newPage();
        await openState(page, cue.state, { settle: 500 });
        if (cue.open) { await page.locator(cue.open).first().click(); await page.waitForTimeout(200); }
        assert.deepEqual(await judgeFocus(page, cue), []);
      } finally { await context.close(); }
    });
  }
  for (const cue of CUES) {
    test(`forced colors ${width}: ${cue.block} (${cue.state}) keeps its cue without color`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 900 }, forcedColors: "active" });
      try {
        const page = await context.newPage();
        await openState(page, cue.state, { settle: 500 });
        if (cue.open) { await page.locator(cue.open).first().click(); await page.waitForTimeout(200); }
        assert.deepEqual(await judgeCue(page, cue), []);
      } finally { await context.close(); }
    });
  }
}
