import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// Ticket 39: Screens(claim) shows the cited record's mapped artifact images in one frame with a filmstrip, behind oakScreensBlock.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const flag = loadTsx("src/lib/oakFlags/screens.ts");
const { primeOakRecordFacts } = loadTsx("src/lib/oakRecordFacts.ts");
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
const { ScreensViewer } = loadTsx("src/lib/openui/components/ScreensViewer.tsx");

const REVISION = "k";
const cite = id => ({ documentId: id, passageId: `${id}:passage-001`, sectionId: id, url: `https://steveoak.com/work/${id.split(":")[1]}/` });
const shot = (label, ratio = 16 / 10) => ({ label, status: "verified", image: { src: `/s/${label.replace(/\W/g, "-")}.webp`, alt: `${label} reviewed alt`, ratio } });
const work = artifacts => ({ kind: "work", dek: "", category: "AI", articleStatus: "full", datePublished: "2025-01-01",
  cover: { src: "/c/eco.webp", alt: "EcoSmartLoop cover", ratio: 16 / 9 }, coverTint: "#6fd39a", systemMap: [], artifacts, metrics: [], sections: [] });
const THREE = [shot("Orbi guidance UI"), shot("Organization analytics"), shot("Tall phone screen", 9 / 19.5)];
const CLAIM = { id: "claim-1", text: "EcoSmartLoop guided each sort with Orbi.", citations: [cite("work:ecosmartloop")] };
const LABELS = { knowledgeRevision: REVISION, documents: [{ documentId: "work:ecosmartloop", title: "EcoSmartLoop: case study", canonicalUrl: "https://steveoak.com/work/ecosmartloop/",
  card: { kind: "work", title: "EcoSmartLoop", image: "/c/eco.webp" } }] };
const answerOf = claims => ({ schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: REVISION, operations: [],
  kind: "sourced", acknowledgment: null, claims });
const seed = artifacts => primeOakRecordFacts(REVISION, { version: 1, knowledgeRevision: REVISION, records: artifacts ? { "work:ecosmartloop": work(artifacts) } : {} });
const render = () => renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m1", answer: answerOf([CLAIM]), question: "Show me EcoSmartLoop", latest: true, citationLabels: LABELS,
  ui: { requestId: "00000000-0000-4000-8000-0000000000e9", status: "done", program: `root = Answer([shots])\nshots = Screens("claim-1")` } }));
const on = fn => { flag.forceOakScreensBlock(true); try { return fn(); } finally { flag.forceOakScreensBlock(null); } };
const off = fn => { flag.forceOakScreensBlock(false); try { return fn(); } finally { flag.forceOakScreensBlock(null); } };
const count = (html, text) => html.split(text).length - 1;
const css = readFileSync("src/styles/openui/screens.css", "utf8");
const source = file => readFileSync(`src/lib/openui/components/${file}`, "utf8");

seed(THREE);
on(render);
await new Promise(resolve => setTimeout(resolve, 50));

test("Screens constant ships on, and off draws the Source card main draws", () => {
  assert.equal(flag.oakScreensBlock, true);
  seed(THREE);
  const html = off(render);
  assert.ok(html.includes("oak-openui-source"), html);
  assert.ok(!html.includes("oak-screens"), html);
});

test("on with three mapped images: one frame, every image with its reviewed alt, a named filmstrip with one current thumbnail", () => {
  seed(THREE);
  const html = on(render);
  assert.ok(html.includes('class="oak-screens"'), html);
  for (const item of THREE) assert.ok(html.includes(`alt="${item.image.alt}"`), `${item.label} alt`);
  assert.equal(count(html, 'class="oak-screens__thumb"'), 3);
  for (const item of THREE) assert.ok(html.includes(`aria-label="Show ${item.label}"`), `${item.label} thumb name`);
  assert.equal(count(html, 'aria-current="true"'), 1);
  assert.ok(html.includes("1 of 3"));
  assert.ok(html.includes('aria-label="Previous screen"') && html.includes('aria-label="Next screen"'));
  assert.ok(!/up next/i.test(html), "no Up next strip");
  assert.ok(html.includes("EcoSmartLoop guided each sort with Orbi."), "the claim is placed");
});

test("one image draws no filmstrip, arrows or counter", () => {
  seed([shot("Orbi guidance UI")]);
  const html = on(render);
  assert.ok(html.includes('class="oak-screens"'));
  assert.equal(count(html, "oak-screens__thumb"), 0);
  assert.ok(!html.includes("Next screen") && !html.includes("1 of 1"));
});

test("facts missing or with no mapped image degrade to Source with the claim placed", () => {
  for (const artifacts of [null, [{ label: "No picture", status: "verified" }]]) {
    seed(artifacts);
    const html = on(render);
    assert.ok(!html.includes('class="oak-screens"'), html);
    assert.ok(html.includes("oak-openui-source") && html.includes("EcoSmartLoop guided each sort with Orbi."), html);
  }
});

test("no image is cropped: the media is contained, never covered", () => {
  assert.ok(!/object-fit:\s*cover/.test(css), "no object-fit cover in screens.css");
  assert.match(css, /\.oak-screens__image[^{]*\{[^}]*object-fit:\s*contain/);
});

test("a generated WebP ships AVIF first with the WebP as fallback; an original file stays one plain image", () => {
  const generated = { label: "Organization analytics", status: "verified",
    image: { src: "/assets/generated/work/ecosmartloop/organization-analytics-900.webp", alt: "Organization analytics reviewed alt", ratio: 1.6 } };
  const original = { label: "Challenge animation", status: "verified",
    image: { src: "/assets/work/ecosmartloop/challenge-resolution-loop.webp", alt: "Challenge animation reviewed alt", ratio: 1 } };
  seed([generated, original]);
  const html = on(render);
  assert.match(html, /<picture[^>]*><source type="image\/avif" srcSet="\/assets\/generated\/work\/ecosmartloop\/organization-analytics-900\.avif"\/><img[^>]*src="\/assets\/generated\/work\/ecosmartloop\/organization-analytics-900\.webp"/);
  assert.ok(!html.includes("challenge-resolution-loop.avif"), "an original never guesses an AVIF");
  assert.ok(html.includes('src="/assets/work/ecosmartloop/challenge-resolution-loop.webp"'));
});

test("every generated WebP the record facts can send for a mapped image has its AVIF beside it", () => {
  const manifest = JSON.parse(readFileSync("public/assets/generated/optimized-images-manifest.json", "utf8"));
  const map = readFileSync("src/data/oakArtifactImages.ts", "utf8");
  const srcs = [...map.matchAll(/src: "([^"]+)"/g)].map(match => match[1]);
  assert.ok(srcs.length >= 20, `found ${srcs.length} mapped images`);
  let pairs = 0;
  for (const src of srcs) {
    const webp = manifest[src]?.variants.webp.filter(variant => variant.width >= 480 && variant.width <= 960).at(-1)?.src;
    if (!webp) continue;
    const avif = webp.replace(/\.webp$/, ".avif");
    assert.ok(manifest[src].variants.avif.some(variant => variant.src === avif), `${src}: ${avif} in the manifest`);
    assert.ok(existsSync(`public${avif}`), `${src}: public${avif} on disk`);
    pairs += 1;
  }
  assert.ok(pairs >= 17, `${pairs} AVIF pairs`);
});

test("reduced motion removes slide transitions", () => {
  assert.match(source("ScreensView.tsx"), /useReducedMotion\(\)/);
  assert.match(source("ScreensView.tsx"), /transition=\{reduced \? \{ duration: 0 \} : undefined\}/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("the viewer loads through oakLazyView, returns focus through useReturnFocus and traps Tab", () => {
  assert.match(source("ScreensView.tsx"), /oakLazyView<[^>]+>\(\(\) => import\("\.\/ScreensViewer"\)/);
  const viewer = source("ScreensViewer.tsx");
  assert.match(viewer, /useReturnFocus/);
  assert.match(viewer, /event\.key !== "Tab"/);
});

test("the viewer shows the image whole with its alt and a caption the visitor can hide", () => {
  const opener = { current: null };
  const html = renderToStaticMarkup(createElement(ScreensViewer, { shots: THREE.map(item => ({ label: item.label, ...item.image })), index: 1, opener, onClose() {}, onIndex() {} }));
  assert.ok(html.includes('role="dialog"') && html.includes('aria-label="Organization analytics"'), html);
  assert.ok(html.includes(`alt="${THREE[1].image.alt}"`));
  assert.ok(html.includes('aria-pressed="false"') && html.includes("Hide caption"), html);
  assert.ok(html.includes('aria-label="Close viewer"'));
  assert.ok(!/up next/i.test(html));
});
