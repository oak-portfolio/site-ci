import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import postcss from "postcss";
import { colorExceptions } from "../../../scripts/design-policy/policy.mjs";

const read = path => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const agentCss = postcss.parse(read("src/styles/oakAgent.css"));
const uiCss = postcss.parse(read("src/styles/ui.css"));
const globalCss = postcss.parse(read("src/styles/global.css"));
const palette = { "--oak-blue": "#4b6fff", "--oak-violet": "#8b5cf6", "--oak-pink": "#ec4899", "--oak-gold": "#f5b942", "--oak-leaf": "#6fd394" };
const tints = ["--oak-tint-blue", "--oak-tint-violet", "--oak-tint-leaf", "--oak-tint-gold"];
const paletteScope = ".oak-workspace, .home-chat__thread";
const selectorOf = node => node.selector?.split(",").map(part => part.trim()).join(", ");

/** Every declaration of `prop` across the stylesheets, with its rule selector. */
const declarations = (prop, roots = [agentCss, uiCss, globalCss]) => roots.flatMap(root => {
  const found = [];
  root.walkDecls(prop, decl => found.push({ selector: selectorOf(decl.parent), value: decl.value }));
  return found;
});
/** Declarations of the rule with exactly this selector in oakAgent.css (or ui.css). */
const rule = (selector, root = agentCss) => {
  const found = [];
  root.walkRules(node => { if (node.selector.replace(/\s+/g, " ") === selector) node.walkDecls(decl => found.push(`${decl.prop}: ${decl.value}`)); });
  return found.join("; ");
};

// WCAG relative luminance and contrast, for the colours the CSS actually declares.
const rgb = hex => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
const channel = value => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (a, b, share) => a.map((value, index) => value * share + b[index] * (1 - share));

/** Ruling 89: the palette, the gray steps and the tints live in one block shared by the workspace and the chat-first home thread. */
const assertPaletteOnce = roots => {
  for (const [name, value] of Object.entries(palette)) {
    assert.deepEqual(declarations(name, roots), [{ selector: paletteScope, value }], `${name} defined once in the ${paletteScope} block`);
  }
  for (const name of ["--oak-ring", "--oak-glow", "--oak-focus", "--oak-well", "--oak-raised", "--oak-bubble", "--oak-primary", "--oak-primary-hover", "--oak-primary-ink"]) {
    assert.deepEqual(declarations(name, roots).map(found => found.selector), [paletteScope], `${name} defined once`);
  }
  for (const name of tints) {
    const found = declarations(name, roots);
    assert.equal(found.length, 1, `${name} defined once`);
    assert.equal(found[0].selector, paletteScope);
    assert.match(found[0].value, /^color-mix\(in srgb, var\(--oak-\w+\) \d+%, var\(--panel\)\)$/, `${name} is a soft color-mix tint`);
  }
  const blocks = [];
  for (const root of roots) root.walkRules(node => { if (node.nodes.some(decl => decl.prop === "--oak-blue")) blocks.push(node); });
  assert.equal(blocks.length, 1, "one palette block");
  assert.equal(selectorOf(blocks[0]), paletteScope, "its selectors are exactly the workspace and the home thread");
};

test("D32-G1 a duplicated palette block fails", () => {
  const duplicates = [
    `${agentCss.toString()}\n.home-chat__thread { --oak-blue: #4b6fff; }`,
    `${agentCss.toString()}\n.oak-workspace { --oak-raised: color-mix(in srgb, var(--text) 7%, var(--panel)); }`,
    agentCss.toString().replace(/\.oak-workspace,\s*\.home-chat__thread \{\n  \/\* One Oak palette/, ".oak-workspace {\n  /* One Oak palette"),
    agentCss.toString().replace(/\.oak-workspace,\s*\.home-chat__thread \{\n  \/\* One Oak palette/, ".oak-workspace,\n.home-chat__thread,\n.home-chat__top {\n  /* One Oak palette"),
  ];
  for (const css of duplicates) assert.throws(() => assertPaletteOnce([postcss.parse(css), uiCss, globalCss]), assert.AssertionError);
});

test("D32-G1 one Oak palette block for the workspace and the home thread, registered once, used by proportion with 4.5:1 text", () => {
  assertPaletteOnce([agentCss, uiCss, globalCss]);
  // D69 (revising D52): the ring is the one gradient token; the rest is a white and gray scale, each defined once.
  assert.deepEqual(declarations("--oak-spectrum"), [], "no spectrum gradient");
  assert.deepEqual(declarations("--oak-accent"), [], "no flat accent");
  for (const name of ["--oak-blue-deep", "--oak-violet-deep", "--oak-pink-deep", "--oak-spectrum-deep", "--oak-wash", "--oak-title"]) {
    assert.deepEqual(declarations(name), [], `${name} is retired`);
  }

  // Registered once in the lint, and the literals live nowhere else in the workspace stylesheet.
  const registered = colorExceptions.filter(([file, selectors, values]) => file === "src/styles/oakAgent.css" && selectors.join(", ") === paletteScope && values.includes("#6fd394"));
  assert.equal(registered.length, 1, "one colorExceptions entry for the palette");
  assert.deepEqual([...registered[0][2]].sort(), Object.values(palette).sort());
  agentCss.walkDecls(decl => {
    if (selectorOf(decl.parent) === paletteScope || decl.parent.selector?.startsWith(".oak-workspace-launcher")) return;
    for (const literal of Object.values(palette)) assert.ok(!decl.value.toLowerCase().includes(literal), `${decl.parent.selector} ${decl.prop} uses var() instead of ${literal}`);
  });

  // The ring as the composer's fading edge, a gray visitor bubble, plain starter wells.
  assert.match(rule(".oak-composer__surface::before"), /background: var\(--oak-ring\);[\s\S]*opacity: 0;[\s\S]*transition: opacity/, "composer ring layer fades");
  assert.match(rule('.oak-workspace .ui-message[data-align="end"] .ui-bubble--default'), /background: var\(--oak-bubble\)/, "visitor message bubble");
  assert.match(rule(":is(.oak-conversation__starters, .oak-examples) .ui-suggestion"), /background: var\(--panel-soft\)/, "starter wells");

  // Send and primary buttons are white with near-black ink; colour elsewhere is semantic.
  assert.match(rule(".oak-composer__actions .ui-button--primary"), /background: var\(--oak-primary\); color: var\(--oak-primary-ink\)/, "Send is a white disc with a dark arrow");
  assert.match(rule(".oak-workspace .ui-button--primary"), /background: var\(--oak-primary\); color: var\(--oak-primary-ink\); box-shadow: none/, "workspace primary buttons");
  // D122: source faces in chips, popovers and the Sources panel share the kind colours.
  const typeAccent = { "case-study": "blue", profile: "violet", article: "pink", resource: "gold", experience: "leaf" };
  for (const [type, accent] of Object.entries(typeAccent)) {
    assert.match(rule(`:is(.oak-message__source, .oak-answer__stack-icon, .oak-source-face)[data-source-type="${type}"]`), new RegExp(`--oak-kind: var\\(--oak-${accent}\\)`), `${type} kind colour`);
  }
  // Q02 (intentional update): the numbered gray disc is retired for favicons (brief O6).
  assert.equal(rule(".oak-message__source[data-source-type]::before"), "", "no numbered disc on a source pill");
  assert.match(rule(".oak-message__source svg"), /color: var\(--oak-kind, var\(--quiet\)\)/, "the kind icon carries the colour");
  assert.match(read("src/components/agent/OakCitations.tsx"), /data-source-type=\{meaning\.replace\("source\.", ""\)\}/, "citation chips expose their source type");
  assert.match(rule('.oak-workspace .ui-tool__state[data-state="done"]'), /color: var\(--oak-leaf\)/, "done checks");
  // R17 (intentional update): the one meter is the quiet white when normal and turns gold only when low.
  assert.match(rule(".oak-composer__meter .ui-meter-ring"), /--ui-meter-fill: var\(--text\)/, "the meter ring at rest");
  assert.match(rule(`.oak-composer__meter[data-tone="low"] .ui-meter-ring, .oak-usage-card__section[data-tone="low"] .ui-meter-bar`), /--ui-meter-fill: var\(--oak-gold\)/, "low turns gold");
  assert.match(rule(".ui-meter-ring__track", uiCss), /conic-gradient\(var\(--ui-meter-fill\)/, "the ring reads its fill variable");

  // Text pairs at 4.5:1 or better: dark ink on every accent, white on the gray bubble, white and muted on every tint;
  // kind icons at 3:1 or better on the bubble they sit on.
  const ink = rgb("#050505"), white = rgb("#ffffff"), muted = rgb("#b1b1b1"), panel = rgb("#0c0c0c");
  for (const [name, value] of Object.entries(palette)) assert.ok(contrast(ink, rgb(value)) >= 4.5, `ink on ${name}`);
  const [, bubbleShare] = declarations("--oak-bubble")[0].value.match(/var\(--text\) (\d+)%, var\(--panel\)/);
  const bubble = mix(white, panel, Number(bubbleShare) / 100);
  assert.ok(contrast(white, bubble) >= 4.5, "white ink on the visitor bubble");
  for (const [name, value] of Object.entries(palette)) assert.ok(contrast(rgb(value), bubble) >= 3, `${name} icon on the bubble`);
  for (const name of tints) {
    const [, accent, share] = declarations(name)[0].value.match(/var\((--oak-\w+)\) (\d+)%/);
    const tint = mix(rgb(palette[accent]), panel, Number(share) / 100);
    assert.ok(contrast(white, tint) >= 4.5 && contrast(muted, tint) >= 4.5, `text on ${name}`);
  }
});
