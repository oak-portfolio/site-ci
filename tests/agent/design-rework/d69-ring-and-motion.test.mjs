import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { galleryStates as states } from "../premium/gallery.mjs";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const read = path => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
// Computed colours come back as rgb(0-255) or, from color-mix(), as color(srgb 0-1).
const colours = value => (value.match(/rgba?\([^)]*\)|color\(srgb[^)]*\)/g) ?? []).map(token => {
  const numbers = (token.match(/[\d.]+/g) ?? []).map(Number);
  return token.startsWith("color(") ? numbers.slice(0, 3).map(number => Math.round(number * 255)) : numbers.slice(0, 3);
});
const gray = ([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) <= 6;
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(400);
};

test("D69-G1 the ring only where it matters: the launcher, the box being typed in, focused fields, live reasoning and a panel Oak is busy for (D79); white and gray everywhere else", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const stray = [];
    const primaries = [];
    for (const { id } of states) {
      await open(page, id);
      const found = await page.evaluate(() => {
        const root = document.querySelector(".oak-workspace");
        const shown = node => { const box = node.getBoundingClientRect(); const style = getComputedStyle(node); return box.width >= 16 && box.height >= 16 && style.visibility !== "hidden" && Number(style.opacity) > 0; };
        const allowed = [".ui-input:focus-visible", ".ui-textarea--default:focus-visible", ".ui-questionnaire__input:focus-visible", ".oak-group__body:has(:focus-visible)",
          '.ui-chain-of-thought[data-state="live"] .ui-chain-of-thought__header', ".oak-panel-hero[data-busy]", ".ui-skeleton", ".ui-meter-ring__track",
          // R13 (intentional update, Oak review v10): a signed-in visitor's own avatar wears the launcher gradient as its ring.
          ".oak-avatar[data-ring]",
          // R19 (intentional update, Oak review v16 role fit): the scorecard ring is a status chart (Met, Partial, Gap arcs), not the brand sweep.
          ".oak-role-review__ring",
          // 49 (intentional update, Oak Q31 A): the Contact card is the one block in an answer allowed the ring glow, around Steve's portrait.
          ".oak-contact-card__ring"];
        const name = node => typeof node.className === "string" ? node.className.trim().split(/\s+/)[0] : node.tagName;
        // A shimmer clipped to text (the thinking label, a loading title) is lettering, not a fill.
        const stray = [...root.querySelectorAll("*")].filter(node => { const style = getComputedStyle(node);
          // D88: a panel's picture sits on a soft halo of one meaning tint (a radial glow, not the ring's multi-colour sweep).
          const halo = node.matches(".oak-panel-hero") && /^radial-gradient/.test(style.backgroundImage) && !/conic|linear/.test(style.backgroundImage);
          // R14 Liquid Glass (intentional update, Oak review v11): a glass surface's sheen is white or black light only, never the ring's colours.
          const sheen = (style.backgroundImage.match(/rgba?\([^)]*\)/g) ?? []).every(color => /^rgba?\((255, 255, 255|0, 0, 0)/.test(color)) && !/conic/.test(style.backgroundImage);
          // 06 (intentional update): a figure mark's hatch and dots are the not-color-alone cue, which forced colors keeps; the ring's conic sweep is not.
          const mark = node.matches(".oak-figure__mark") && !/conic/.test(style.backgroundImage);
          return shown(node) && /gradient/.test(style.backgroundImage) && style.backgroundClip !== "text" && !halo && !sheen && !mark && !allowed.some(selector => node.matches(selector)); }).map(name);
        const primaries = [...root.querySelectorAll(".ui-button--primary")].filter(node => node.getBoundingClientRect().width > 0).map(node => {
          const style = getComputedStyle(node), icon = node.querySelector("svg");
          return { name: node.getAttribute("aria-label") ?? node.textContent.trim(), image: style.backgroundImage, background: style.backgroundColor, color: style.color,
            glow: `${style.boxShadow} ${style.filter}`, icon: icon ? getComputedStyle(icon).color : null,
            disabled: node.disabled || node.getAttribute("aria-disabled") === "true" || node.hasAttribute("data-disabled") };
        });
        return { stray, primaries };
      });
      stray.push(...found.stray.map(name => `${id}: ${name}`));
      primaries.push(...found.primaries.map(primary => ({ ...primary, id })));
    }
    assert.deepEqual([...new Set(stray)], [], "only the ring's places paint a gradient");

    const enabled = primaries.filter(primary => !primary.disabled);
    assert.ok(enabled.length >= 5, `measured ${enabled.length} enabled primary actions`);
    for (const primary of enabled) {
      const label = `${primary.id} ${primary.name}`;
      assert.equal(primary.image, "none", `${label}: no gradient fill`);
      assert.ok(colours(primary.background)[0]?.every(channel => channel >= 220), `${label}: a white fill (${primary.background})`);
      assert.ok(colours(primary.color)[0]?.every(channel => channel <= 20), `${label}: near-black ink (${primary.color})`);
      if (primary.icon) assert.ok(colours(primary.icon)[0]?.every(channel => channel <= 20), `${label}: a dark icon (${primary.icon})`);
      assert.doesNotMatch(primary.glow, /rgba?\((?!0, 0, 0)|color\(srgb/, `${label}: no coloured glow (${primary.glow})`);
    }

    // The message box: a hairline at rest, the ring half-lit on focus, fully lit once there is something to send.
    await open(page, "answer-sourced");
    const ring = () => page.locator(".oak-composer__surface").evaluate(node => { const layer = getComputedStyle(node, "::before"); return { opacity: Number(layer.opacity), image: layer.backgroundImage }; });
    await page.locator(".oak-workspace__heading h2").click();
    await page.waitForTimeout(500);
    assert.equal((await ring()).opacity, 0, "no ring at rest");
    await page.locator("#oak-composer-input").focus();
    await page.waitForTimeout(500);
    const focused = await ring();
    assert.match(focused.image, /linear-gradient/, "the ring is the launcher's gradient");
    assert.ok(focused.opacity > 0.3 && focused.opacity < 0.8, `focus half-lights the ring (${focused.opacity})`);
    await page.keyboard.type("What did Steve ship?");
    await page.waitForTimeout(500);
    assert.equal((await ring()).opacity, 1, "typing lights the ring fully");

    // The visitor's bubble is gray with white ink and about 1:1.618 padding.
    const bubble = await page.locator('.ui-message[data-align="end"] .ui-bubble--default').first().evaluate(node => {
      const style = getComputedStyle(node);
      return { image: style.backgroundImage, background: style.backgroundColor, color: style.color, block: parseFloat(style.paddingTop), inline: parseFloat(style.paddingLeft) };
    });
    assert.equal(bubble.image, "none", "no wash on the bubble");
    assert.ok(gray(colours(bubble.background)[0]), `the bubble is gray (${bubble.background})`);
    assert.deepEqual(colours(bubble.color)[0], [255, 255, 255], "white ink");
    assert.ok(bubble.inline / bubble.block > 1.5 && bubble.inline / bubble.block < 1.8, `padding near the golden ratio (${bubble.block}/${bubble.inline})`);
    // Review v4 supersedes D69's plain white title: Oak asked for the window title as the one flourish, a text fill that
    // starts white and warms into the launcher's violet, pink and gold. Only the h2 wears it; the header controls stay solid.
    const title = await page.locator(".oak-workspace__heading h2").evaluate(node => { const style = getComputedStyle(node);
      return { image: style.backgroundImage, clip: style.backgroundClip || style.webkitBackgroundClip, color: style.color }; });
    assert.match(title.image, /^linear-gradient\(100deg, rgb\(255, 255, 255\) 0%, rgb\(255, 255, 255\) 34%/, `the title starts white (${title.image})`);
    assert.equal(title.clip, "text", "the gradient fills the letters, not a box");
    assert.equal(title.color, "rgba(0, 0, 0, 0)", "the letters show the fill");
    assert.match(read("src/styles/oakAgent.css"), /@media \(forced-colors: active\) \{\s*\.oak-workspace__heading h2 \{\s*background: none;\s*color: CanvasText;/, "forced colours drop the fill for system text");
    const controls = await page.locator(".oak-workspace__heading .ui-button").evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundImage));
    assert.ok(controls.every(image => image === "none"), `the header controls stay solid (${controls})`);

    // While Oak thinks, the ring still turns around the reasoning header.
    await open(page, "tool-running");
    // Review v5 supersedes: at full screen the ring is a masked ::after edge, so it is read from either layer.
    const live = await page.locator('.ui-chain-of-thought[data-state="live"] .ui-chain-of-thought__header').first().evaluate(node => { const style = getComputedStyle(node); return { image: `${style.backgroundImage} ${getComputedStyle(node, "::after").backgroundImage}`, animation: style.animationName }; });
    assert.match(live.image, /conic-gradient/, "live header wears the turning ring");
    assert.match(live.animation, /oak-launcher-turn/, "the ring turns");
    await page.locator(".oak-workspace").screenshot({ path: "/tmp/d69-live.png" });
  } finally {
    await browser.close();
  }
});

test("D69-G2 every change moves: popups, tooltips and disclosures on the Motion spring, the ring fades, Send pops alive, chips arrive in turn, and reduced motion holds still", async () => {
  const global = read("src/styles/global.css"), ui = read("src/styles/ui.css"), agent = read("src/styles/oakAgent.css");
  assert.match(global, /--motion-spring: linear\(0, [\d., ]+1\);/, "the Motion spring is a token");
  assert.match(global, /--motion-settle: linear\(0, [\d., ]+1\);/, "the critically damped settle is a token");
  assert.match(global, /\.ui-tooltip-content \{[^}]*transition: opacity var\(--motion-quick\)[^;]*, transform var\(--motion-spring-duration\) var\(--motion-spring\);/, "tooltips settle on the spring");
  assert.match(ui, /\.ui-popover__popup \{[^}]*transform-origin: var\(--transform-origin\);[^}]*transition: opacity[^;]*transform var\(--motion-spring-duration\) var\(--motion-spring\)/, "popups grow from their trigger");
  assert.match(ui, /:is\(\.ui-select__popup, \.ui-menu__popup, \.ui-popover__popup\):is\(\[data-starting-style\], \[data-ending-style\]\) \{\n  opacity: 0;/, "popups enter and leave");
  assert.match(ui, /\.ui-disclosure::details-content \{[^}]*transition: block-size/, "disclosures unfold");
  assert.match(agent, /\.oak-composer__surface::before \{[^}]*transition: opacity var\(--motion-page\)/, "the ring fades");
  assert.match(agent, /\.oak-workspace \.ui-button--primary \{[^}]*transform var\(--motion-spring-duration\) var\(--motion-spring\)/, "primaries settle on the spring");
  for (const css of [global, ui, agent]) assert.match(css, /@media \(prefers-reduced-motion: reduce\)/, "reduced motion is handled");
  // v3 review (intentional update): follow-ups are the Related rows under the answer.
  assert.match(read("src/components/agent/OakRelated.tsx"), /<Suggestion key=\{question\} order=\{order\}/, "follow-ups arrive in turn");
  assert.match(read("src/components/agent/OakEmptyState.tsx"), /<Suggestion key=\{text\} order=\{order \+ 1\}/, "starters arrive in turn");
  assert.match(read("src/components/ui/suggestion.tsx"), /const rise = order === undefined \|\| reduced \? null/, "a staggered chip holds still under reduced motion");
  // D122: the inline list became a Sources panel (ui/dialog panel motion); its chip popover rises 4px over 160ms.
  assert.match(read("src/components/agent/OakSourcesPanel.tsx"), /<DialogContent open=\{open\} variant="panel"/, "the Sources panel slides in and out");
  assert.match(agent, /\.ui-popover__popup\.oak-source-popover:is\(\[data-starting-style\], \[data-ending-style\]\) \{\s*transform: translateY\(4px\);/, "the source popover rises into place");
  assert.match(read("src/components/agent/OakTurn.tsx"), /<AnimatePresence initial=\{false\} mode="popLayout">\s*<motion\.span key=\{icon\} className="oak-icon-swap" initial=\{pop\.initial\} animate=\{pop\.animate\} exit=\{pop\.exit\}/, "copy turns into a check with a pop, one glyph at a time");
  const cot = read("src/components/agent/OakChainOfThought.tsx");
  assert.match(cot, /<AnimatePresence initial=\{false\} mode="popLayout">\s*\{live \? <motion\.span key=\{progress \|\| "Thinking"\}/, "each new step name rises in over the last");
  assert.match(cot, /<StreamText text=\{text\.detail\} live=\{typesIn\.current\.get\(thoughtKey\(step\)\)/, "the model's thoughts type themselves in (D87: each one that arrived live; D112 keys them by id and start)");

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "answer-sourced");
    const send = () => page.locator(".oak-composer__actions .ui-button--primary").evaluate(node => ({ transform: getComputedStyle(node).transform, background: getComputedStyle(node).backgroundColor }));
    const rest = await send();
    assert.match(rest.transform, /^matrix\(0\.9, /, `an empty Send rests small (${rest.transform})`);
    assert.ok(gray(colours(rest.background)[0]), `an empty Send is gray (${rest.background})`);
    await page.locator("#oak-composer-input").fill("What did Steve ship?");
    await page.waitForTimeout(800);
    const alive = await send();
    assert.equal(alive.transform, "none", "Send settles to full size");
    assert.ok(colours(alive.background)[0].every(channel => channel >= 220), `Send turns white (${alive.background})`);

    // A tooltip and a menu each carry their transitions when shown.
    await page.locator(".oak-composer__actions [aria-label]").first().hover();
    const tooltip = page.locator(".ui-tooltip-content").first();
    await tooltip.waitFor({ timeout: 3000 });
    assert.match(await tooltip.evaluate(node => getComputedStyle(node).transitionProperty), /opacity, transform/, "the tooltip animates");
    await open(page, "tools-menu");
    assert.match(await page.locator(".ui-menu__popup").first().evaluate(node => getComputedStyle(node).transitionProperty), /opacity, transform/, "the menu animates");

    const calm = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    await open(calm, "tools-menu");
    assert.equal(await calm.locator(".ui-menu__popup").first().evaluate(node => getComputedStyle(node).transitionProperty), "opacity", "reduced motion keeps only the fade");
  } finally {
    await browser.close();
  }
});
