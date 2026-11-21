import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
import sharp from "sharp";
import { loadTsx } from "../design-rework/load-tsx.mjs";

globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, addEventListener() {}, removeEventListener() {} };
const { OakActivitySprite, OakSpritesProvider } = loadTsx("src/components/agent/OakActivitySprite.tsx");
const { OakChainOfThought, OAK_LONG_WAIT_MS } = loadTsx("src/components/agent/OakChainOfThought.tsx");
const { oakMotion, oakMotionTokens } = loadTsx("src/lib/oakMotion.ts");

const map = JSON.parse(readFileSync("design/visual-integration/oak-agent-assets-v2.json", "utf8"));
const read = (file) => readFileSync(`src/components/agent/${file}`, "utf8");
const css = readFileSync("src/styles/oakAgent.css", "utf8");
const spriteCss = readFileSync("src/components/agent/OakActivitySprite.css", "utf8");

/** Each tool intake: the gallery state that shows it, the pose its panel asks for, and where the code says so. */
const intakes = {
  compare: { state: "role-fit", pose: "reviewing", file: "OakConversation.tsx", code: /title="Compare a role"[^>]*pose="reviewing"/ },
  advice: { state: "advice-intake", pose: "planning", file: "OakWorkflowPanels.tsx", code: /title="Project advice"[^>]*pose="planning"/ },
  brief: { state: "contact-brief", pose: "mailbox", file: "OakContactBriefEditor.tsx", code: /pose=\{draft\.text \? "brief-letter" : "mailbox"\}/ },
  documents: { state: "document-upload", pose: "doc-stack", file: "OakDocumentsPanel.tsx", code: /state\.documents\.length \? "document" : "doc-stack"/ },
  voice: { state: "voice-recording", pose: "recording", file: "OakWorkflowPanels.tsx", code: /phase === "review" \? "voice-scroll" : "recording"/ },
  funding: { state: "funding", pose: "coins", file: "OakWorkflowPanels.tsx", code: /funding\.selected === "visitor" \? "own-key" : "coins"/ },
  saved: { state: "saved-list", pose: "saved", file: "OakWorkflowPanels.tsx", code: /"empty-chest" : "saved";/ },
  "account purpose": { state: "account-purpose", pose: "purpose", file: "OakAccountContinuation.tsx", code: /status\?\.kind === "account" \? "purpose"/ },
};
const assetFor = (state) => map.assets[map.states[state].asset];
/**
 * How a picture looks where its prop sits: trimmed to the art, the lower half (the crown and cape above it are shared by every
 * crowned Oak), as a 24x12 colour thumbnail over the workspace's dark ground. Compares pictures by look, not by bytes.
 */
const thumb = async (file) => {
  const trimmed = await sharp(file).trim({ threshold: 1 }).png().toBuffer();
  const { width, height } = await sharp(trimmed).metadata();
  const top = Math.round(height / 2);
  return [...await sharp(trimmed).extract({ left: 0, top, width, height: height - top }).flatten({ background: "#1b1b1f" })
    .resize(24, 12, { fit: "fill" }).removeAlpha().raw().toBuffer()];
};
const distance = (a, b) => a.reduce((sum, value, index) => sum + Math.abs(value - b[index]), 0) / a.length;
/** Below this mean channel gap two pictures read as the same pose with a different trinket. */
const LOOK_ALIKE = 20;

test("Q10-G1 each tool intake shows its own Oak pose, no two intakes share one, and the greeting stays on the empty state", async () => {
  for (const [name, intake] of Object.entries(intakes)) {
    assert.match(read(intake.file), intake.code, `${name}: the panel asks for ${intake.pose}`);
    const entry = map.states[intake.state];
    assert.ok(entry?.asset, `${name}: ${intake.state} has its own art`);
    assert.equal(assetFor(intake.state).pose, intake.pose, `${name}: ${intake.state} shows ${intake.pose}`);
    assert.notEqual(intake.pose, "greeting", `${name}: no intake borrows the greeting`);
  }
  const poses = Object.values(intakes).map(intake => intake.pose);
  assert.equal(new Set(poses).size, poses.length, "eight intakes, eight poses");
  const files = Object.values(intakes).map(intake => assetFor(intake.state).source);
  assert.equal(new Set(files).size, files.length, "eight intakes, eight source files");
  const hashes = files.map(file => createHash("sha1").update(readFileSync(file)).digest("hex"));
  assert.equal(new Set(hashes).size, hashes.length, "no two intake pictures are the same bytes");

  // The audit's complaint was pictures that read the same (the clipboard Oak in role and account purpose): compare how they look.
  const stills = await Promise.all(Object.values(intakes).map(intake => {
    const asset = assetFor(intake.state);
    return thumb(asset.reducedMotionFrame?.source ?? asset.source);
  }));
  const names = Object.keys(intakes);
  for (let a = 0; a < names.length; a++) for (let b = a + 1; b < names.length; b++) {
    const gap = distance(stills[a], stills[b]);
    assert.ok(gap >= LOOK_ALIKE, `${names[a]} and ${names[b]} look different (mean gap ${gap.toFixed(1)})`);
  }
  // Control: the clipboard intake that account purpose used to show reads as the Compare a role reader, so the check can tell.
  const retired = await thumb(map.assets.intake.source);
  assert.ok(distance(retired, stills[names.indexOf("compare")]) < LOOK_ALIKE, "the retired clipboard intake would fail this check");

  // The crowned greeting loop belongs to the empty state alone.
  assert.equal(map.states.empty.asset, "greeting-loop");
  assert.deepEqual(Object.entries(map.states).filter(([, entry]) => entry.asset === "greeting-loop").map(([id]) => id), ["empty"]);
  const users = readdirSync("src/components/agent").filter(file => file.endsWith(".tsx") && file !== "OakActivitySprite.tsx")
    .filter(file => /"greeting"/.test(read(file)));
  assert.deepEqual(users, ["OakEmptyState.tsx"], "only the empty state shows the greeting");
});

test("Q10-G2 every animated pose ships a static still, and reduced motion shows it", () => {
  const animated = Object.entries(map.assets).filter(([, asset]) => asset.animated);
  assert.ok(animated.length >= 15, `animated poses found (${animated.length})`);
  const stillSources = new Set();
  for (const [id, asset] of animated) {
    const still = asset.reducedMotionFrame;
    assert.ok(still, `${id} names its still`);
    assert.ok(existsSync(still.source), `${id}: ${still.source} exists`);
    assert.match(still.publicSrc, /-still\.png$/, `${id}: the still is published`);
    assert.notEqual(still.source, asset.source, `${id}: the still is its own file`);
    stillSources.add(still.source);
  }
  assert.equal(stillSources.size, animated.length, "no two animated poses share a still");

  // The sprite picks the still through a reduced-motion source ahead of the moving sheet.
  const image = { src: "/sheet.png", width: 1254, height: 1254, avifSrcSet: "/sheet.avif 1x", webpSrcSet: "/sheet.webp 1x" };
  const reducedMotion = { src: "/still.png", width: 627, height: 627, avifSrcSet: "/still.avif 1x", webpSrcSet: "/still.webp 1x" };
  const html = renderToStaticMarkup(createElement(OakActivitySprite, { pose: "thinking", asset: { ...image, animation: { frames: 4, columns: 2, rows: 2, reducedMotion } } }));
  assert.match(html, /data-layout="animated"/);
  for (const type of ["image/avif", "image/webp", "image/png"]) {
    const source = html.match(new RegExp(`<source media="\\(prefers-reduced-motion: reduce\\)" type="${type}"[^>]*>`))?.[0];
    assert.ok(source, `reduced motion has a ${type} still`);
    assert.match(source, /still/, `${type}: the reduced source is the still`);
  }
  assert.ok(html.indexOf("prefers-reduced-motion") < html.indexOf('srcSet="/sheet.avif 1x"') || html.indexOf("prefers-reduced-motion") < html.indexOf('srcset="/sheet.avif 1x"'),
    "the still is listed before the sheet, so the browser picks it first");

  // And the sheet stops stepping: frames only animate when motion is allowed, and reduced motion shows the whole still.
  const sprite = postcss.parse(spriteCss);
  let stepping = null, resting = null;
  sprite.walkAtRules("media", rule => {
    if (/no-preference/.test(rule.params)) rule.walkDecls("animation", decl => { if (/oak-activity-sprite-frames/.test(decl.value)) stepping = decl; });
    if (/prefers-reduced-motion: reduce/.test(rule.params)) rule.walkRules(inner => { if (inner.selector.includes('[data-layout="animated"]')) resting = inner.toString(); });
  });
  assert.ok(stepping, "the frame animation lives under prefers-reduced-motion: no-preference");
  assert.match(resting ?? "", /width: 100%[\s\S]*height: 100%[\s\S]*transform: none/, "reduced motion shows the still at full size");

  // Motion around the art keeps fades only under reduced motion: nothing slides, scales or grows.
  for (const name of ["panel", "reveal", "settle", "pop", "turn"]) {
    const calm = oakMotion(name, true);
    assert.equal(calm.initial.opacity, 0, `${name} still fades`);
    assert.deepEqual({ ...calm.initial, opacity: 1 }, calm.animate, `${name} does not move under reduced motion`);
    assert.equal(calm.transition.duration, oakMotionTokens.quick);
  }
});

const fakeSprites = Object.fromEntries(Object.values(map.assets).map(asset => [asset.pose, { src: asset.publicSrc, width: 100, height: 100, avifSrcSet: "", webpSrcSet: "" }]));
const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "f", hardPolicyVersion: "f", knowledgeRevision: "f", operations: [], kind: "sourced", acknowledgment: null, claims: [] };
const render = (fields, progress = "Working") => renderToStaticMarkup(createElement(OakSpritesProvider, { value: fakeSprites },
  createElement(OakChainOfThought, { question: "q", progress, message: { id: "a1", role: "assistant", text: "", answer: null, cards: [], usage: null, page: "/", ...fields } })));
/** The header's state and its one picture. */
const header = (html) => {
  const glyph = html.slice(html.indexOf("oak-cot__glyph"), html.indexOf("oak-cot__title"));
  return { state: html.match(/data-state="(live|done|stopped)"/)?.[1], pose: glyph.match(/data-pose="([^"]+)"/)?.[1] ?? null };
};

test("Q10-G3 the trail header follows the moment, and the ring turns only while Oak works", () => {
  const now = Date.now();
  const running = (operation, ago = 900) => ({ state: "pending", steps: [{ id: "u", operation: "understand", state: "done", startedAt: now - 9000, endedAt: now - 8000 },
    { id: `${operation}-1`, operation, state: "running", startedAt: now - ago }] });
  const finished = [{ id: "u", operation: "understand", state: "done", startedAt: now - 6000, endedAt: now - 5000 },
    { id: "s", operation: "search", state: "done", startedAt: now - 5000, endedAt: now - 3000 }, { id: "c", operation: "compose", state: "done", startedAt: now - 3000, endedAt: now - 1000 },
    { id: "v", operation: "verify", state: "done", startedAt: now - 1000, endedAt: now - 500 }];
  const moments = {
    reading: [running("read"), "live", "reading"],
    searching: [running("search"), "live", "searching"],
    weighing: [running("weigh"), "live", "weighing"],
    writing: [running("compose"), "live", "composing"],
    slow: [running("search", OAK_LONG_WAIT_MS + 1500), "live", "snail-patience"],
    stopped: [{ state: "interrupted", steps: finished.slice(0, 2) }, "stopped", null],
    done: [{ state: "complete", steps: finished, answer }, "done", "tool-done"],
  };
  const shown = {};
  for (const [moment, [fields, state, pose]] of Object.entries(moments)) {
    const seen = header(render(fields));
    assert.equal(seen.state, state, `${moment}: the trail is ${state}`);
    assert.equal(seen.pose, pose, `${moment}: the header shows ${pose ?? "the plain trace icon (the stopped card carries the art)"}`);
    if (pose) shown[moment] = pose;
  }
  assert.equal(new Set(Object.values(shown)).size, Object.keys(shown).length, `each moment has its own pose: ${JSON.stringify(shown)}`);
  // Every live and done pose is real art in the asset map.
  for (const pose of Object.values(shown)) assert.ok(Object.values(map.assets).some(asset => asset.pose === pose), `${pose} is registered`);

  // The ring: the turning conic border exists only on the live header and stops under reduced motion.
  const sheet = postcss.parse(css);
  const turning = [];
  sheet.walkDecls("animation", decl => { if (/oak-launcher-turn/.test(decl.value) && decl.parent.selector?.includes("ui-chain-of-thought")) turning.push(decl.parent.selector); });
  assert.ok(turning.length > 0, "the trail header has a turning ring");
  for (const selector of turning) assert.match(selector, /\[data-state="live"\]/, `the ring turns only while Oak works: ${selector}`);
  let stops = false;
  sheet.walkAtRules("media", rule => {
    if (!/prefers-reduced-motion: reduce/.test(rule.params)) return;
    rule.walkRules(inner => { if (inner.selector.includes('.ui-chain-of-thought[data-state="live"] .ui-chain-of-thought__header') && /animation: none/.test(inner.toString())) stops = true; });
  });
  assert.ok(stops, "reduced motion stops the ring");
});
