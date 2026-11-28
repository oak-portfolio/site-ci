import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { chromium } from "playwright";
import { arrangedView, printerTurn } from "../../../scripts/quality/quality-bar-core.mjs";
import { forceOakDiagramPresets } from "../../../src/lib/oakFlags/diagram.ts";
import { galleryStates, openState } from "../premium/gallery.mjs";

// Ticket 305: the pairwise printer and the renderer read the same functions, so on every gallery state with a done `ui` the
// record rows, Callout words, page-card titles and Compare column names the printer prints are the words the visitor sees at 1280.
// Ticket 310: Stack chips, Diagram drawn words and Stats tiles are compared too, as ordered word lists.
// Ticket 327: the printer gets the state's whole `ui`, as the renderer does, so its `dated` word reaches both sides
// (ticket 344: printerTurn, the one gallery turn card-order prints too).
const TAGS = { "[role card] ": "Role", "[project card] ": "Project", "[source card] ": "Source", "[page card] ": "PageCards", "[compare columns] ": "Compare" };
const PAGE_URL = /: https?:\/\/\S+$/;
const bag = text => [...new Set(String(text).toLowerCase().match(/[a-z0-9]+/g) ?? [])].sort().join(" ");
const sorted = list => [...list].sort();
const ordered = list => list.flatMap(text => String(text).toLowerCase().match(/[a-z0-9]+/g) ?? []).join(" ");
const ORDERED = new Set(["Stack", "Diagram", "Stats"]);
// metricKind (off as shipped) sorts a Stats' tiles by the record's metric kind and adds its chip; the printer reads no metric
// kinds, so a state pinning it on leaves Stats out (qa/310/moved-rows.md).
const unread = state => state.metricKind ? new Set(["Stats"]) : new Set();
// Ticket 307: beside a Stack a card whose claim names its record draws an empty record row and the printer prints no line,
// so an empty record entry is no word on either side and leaves the comparison.
const RECORDS = new Set(["Role", "Project", "Source"]);

// Screens and StackMap are in the renderer's library but not in the taught spec, so the printer never reads their programs
// (arrangedView is null); StackMap off still draws Stack chips (ticket 310).
const UNTAUGHT = new Set(["screens-off", "stack-map-off"]);
const doneMessages = state => (state.workspace?.messages ?? []).filter(message => message.ui?.status === "done" && message.answer);
const states = galleryStates.filter(state => doneMessages(state).length && !UNTAUGHT.has(state.id));

// As the gallery's forceSwitches does: each switch file's force follows the state's key for it; the Diagram presets by their own key.
const FLAGS = new URL("../../../src/lib/oakFlags/", import.meta.url);
const switchFiles = await Promise.all(readdirSync(FLAGS).filter(name => name.endsWith(".ts")).map(name => import(new URL(name, FLAGS).href)));
const forceSwitches = state => {
  for (const file of switchFiles)
    for (const [name, force] of Object.entries(file))
      if (name.startsWith("force") && file.oakGalleryKey && force !== forceOakDiagramPresets) force(state?.[file.oakGalleryKey] ?? null);
  forceOakDiagramPresets(state?.diagramPresets ?? null);
};

/** The printer's words per kind for one state: each record line, page-card title and Callout word as a word bag; the Stack
 * chips, Diagram words and Stats tiles in the order they print. */
function printed(state) {
  const out = { Role: [], Project: [], Source: [], PageCards: [], Callout: [], Compare: [], Stack: [], Diagram: [], Stats: [] };
  forceSwitches(state);
  const records = state.recordFacts === "pending" ? {} : state.recordFacts ?? undefined;
  for (const message of doneMessages(state)) {
    const shown = arrangedView(printerTurn(message), message.answer.claims ?? [], { shared: false, records });
    if (!shown) continue;
    for (const line of shown.view.split("\n")) {
      const tag = Object.keys(TAGS).find(prefix => line.startsWith(prefix));
      if (tag) out[TAGS[tag]].push(bag(line.slice(tag.length).replace(PAGE_URL, "")));
    }
    for (const word of shown.calloutWords ?? []) out.Callout.push(bag(word));
    out.Stack.push(...shown.stackChips);
    out.Diagram.push(...shown.diagramWords);
    out.Stats.push(...shown.statsTiles);
  }
  forceSwitches(null);
  return out;
}

/** The same words as the browser draws them, read from settled blocks with screen-reader-only text removed. */
const drawn = page => page.evaluate(() => {
  const visible = node => {
    if (!node) return "";
    const copy = node.cloneNode(true);
    copy.querySelectorAll(".sr-only, [hidden], .oak-source-chip").forEach(hidden => hidden.remove());
    document.body.append(copy);
    const text = copy.innerText;
    copy.remove();
    return text;
  };
  const all = selector => [...document.querySelectorAll(selector)];
  const pending = [".oak-openui-role", ".oak-openui-project", ".oak-openui-source", ".oak-page-card", ".oak-openui-stats__tile", ".oak-diagram"].filter(selector => document.querySelector(`${selector}[data-pending]`));
  const words = ".oak-diagram__canvas .oak-diagram__label, .oak-diagram__canvas .oak-diagram__text, .oak-diagram-tree__root, .oak-diagram-tree__label, .oak-diagram-tree__text, .oak-diagram-map__label, .oak-figure__legend li, .oak-diagram-chart__name";
  return { pending: { Role: pending.includes(".oak-openui-role"), Project: pending.includes(".oak-openui-project"), Source: pending.includes(".oak-openui-source"), PageCards: pending.includes(".oak-page-card"),
    Stats: pending.includes(".oak-openui-stats__tile"), Diagram: pending.includes(".oak-diagram") },
    Stack: all(".oak-openui-stack").map(list => [...list.querySelectorAll("li")].map(chip => chip.textContent).join(", ")),
    // An SVG label wraps its words over tspans with no space between them.
    Diagram: all(".oak-diagram__block").map(block => [...block.querySelectorAll(words)].map(node => [...node.childNodes].map(part => part.textContent).join(" ")).join("\n")).filter(Boolean),
    Stats: all(".oak-openui-stats__tile:not([data-pending])").map(visible),
    Role: all(".oak-openui-role:not([data-pending])").map(card => [card.querySelector(".oak-openui-role__head"), card.querySelector(".oak-openui-role__titles")].map(visible).join(" ")),
    Project: all(".oak-openui-project:not([data-pending])").map(card => visible(card.querySelector(".oak-openui-card__name"))),
    Source: all(".oak-openui-source:not([data-pending])").map(card => `${visible(card.querySelector(".oak-openui-source__kicker > span:not(.oak-openui-source__tile):not(.oak-openui-source__kind)"))} ${visible(card.querySelector(".oak-openui-source__title"))}`),
    PageCards: all(".oak-page-card:not([data-pending])").map(card => visible(card.querySelector(".oak-page-card__title"))),
    Compare: all(".oak-openui__compare-head").map(visible),
    Callout: all(".oak-openui__callout-kind").map(visible),
  };
});

test("T305-1 on every gallery state with a done ui, the printer prints the record rows, Callout words, page-card titles, Compare columns, Stack chips, Diagram words and Stats tiles the browser draws at 1280", { timeout: 1_800_000 }, async () => {
  const browser = await chromium.launch();
  const mismatched = [], held = [];
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" })).newPage();
    for (const state of states) {
      await openState(page, state.id, { settle: 300 });
      const want = printed(state), got = await drawn(page);
      if (Object.values(got.pending).some(Boolean)) held.push(state.id);
      const words = (kind, bags) => RECORDS.has(kind) ? bags.filter(Boolean) : bags;
      const seen = kind => words(kind, got[kind].map(bag));
      const same = kind => ORDERED.has(kind) ? ordered(want[kind]) === ordered(got[kind]) : JSON.stringify(sorted(words(kind, want[kind]))) === JSON.stringify(sorted(seen(kind)));
      const shown = kind => ORDERED.has(kind) ? `printed [${ordered(want[kind])}] drawn [${ordered(got[kind])}]` : `printed [${sorted(want[kind]).join(" | ")}] drawn [${sorted(seen(kind)).join(" | ")}]`;
      const kinds = Object.keys(want).filter(kind => !got.pending[kind] && !unread(state).has(kind) && !same(kind));
      if (kinds.length) mismatched.push(`${state.id}: ${kinds.map(kind => `${kind} ${shown(kind)}`).join("; ")}`);
    }
  } finally { await browser.close(); }
  console.log(`printer parity: ${mismatched.length} of ${states.length} states mismatched`);
  console.log(`still drawing a ghost, that kind not compared: ${held.join(", ") || "none"}`);
  assert.equal(mismatched.length, 0, `${mismatched.length} of ${states.length} states print words the browser does not draw:\n${mismatched.join("\n")}`);
});
