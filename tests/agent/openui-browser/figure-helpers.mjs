// Shared checks for every figure and status element (ticket 06). A figure ticket bundles a small entry with
// figureHarness, opens it with openHarness at 1280 and 390, forced colors or reduced motion, then calls the asserts.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import postcss from "postcss";

export const repo = path.resolve(import.meta.dirname, "../../..");
const origin = "http://figure.test";

/** Bundles `entry` (TSX source; `@/` and repo packages resolve) with code splitting, so lazy views land in their own chunks. */
export async function figureHarness(entry, files = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "oak-figure-"));
  for (const [name, source] of Object.entries({ "entry.tsx": entry, ...files })) writeFileSync(path.join(dir, name), source);
  await build({
    entryPoints: [path.join(dir, "entry.tsx")], outdir: path.join(dir, "out"), bundle: true, splitting: true, format: "esm",
    jsx: "automatic", tsconfig: path.join(repo, "tsconfig.json"), nodePaths: [path.join(repo, "node_modules")], logLevel: "silent",
    loader: { ".png": "dataurl", ".jpg": "dataurl", ".webp": "dataurl", ".svg": "dataurl", ".css": "empty" },
    define: { "import.meta.env": JSON.stringify({ DEV: false, PROD: true, SSR: false, MODE: "production", BASE_URL: "/" }), "process.env.NODE_ENV": "\"production\"" },
  });
  const out = path.join(dir, "out");
  return { dir: out, entry: "entry.js", chunks: readdirSync(out).filter(file => file.endsWith(".js")).map(file => ({ file, text: readFileSync(path.join(out, file), "utf8") })) };
}

const read = file => readFileSync(path.join(repo, file), "utf8");

/** The stylesheets a figure reads: the site tokens, the agent's tokens (declared on .oak-workspace) on <main>, and the figure rules. */
export function figureCss() {
  const tokens = [];
  postcss.parse(read("src/styles/oakAgent.css")).walkRules(".oak-workspace", rule => rule.walkDecls(/^--/, decl => { tokens.push(`${decl.prop}: ${decl.value};`); }));
  return [read("src/styles/global.css"), `main { ${tokens.join(" ")} padding: 16px; }`, read("src/styles/openui/figure.css")].join("\n");
}

/** A page at `width` showing the bundle; `forcedColors` and `reducedMotion` emulate those settings. The entry sets data-ready. */
export async function openHarness(browser, harness, { width = 1280, forcedColors = false, reducedMotion = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: reducedMotion ? "reduce" : "no-preference",
    forcedColors: forcedColors ? "active" : "none" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route(`${origin}/**`, route => {
    const file = new URL(route.request().url()).pathname.slice(1);
    if (!file) return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${figureCss()}</style></head><body><main id="root"></main><script type="module" src="/${harness.entry}"></script></body></html>` });
    if (!file.endsWith(".js")) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ contentType: "text/javascript", body: readFileSync(path.join(harness.dir, file)) });
  });
  await page.goto(`${origin}/`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
  return { page, errors, close: () => context.close() };
}

/** Every label and value the drawing shows is in the equivalent, the drawing is hidden from assistive tech only when the equivalent is in the tree, and the caption names the figure. */
export async function assertEquivalent(page, figure = "figure.oak-figure") {
  const found = await page.locator(figure).evaluateAll(nodes => nodes.map(node => {
    const drawing = node.querySelector(".oak-figure__drawing"), list = node.querySelector(".oak-figure__list");
    const caption = node.querySelector("figcaption");
    const was = drawing.hidden;
    drawing.hidden = false;
    const shown = drawing.innerText.split("\n").map(line => line.trim()).filter(Boolean);
    drawing.hidden = was;
    return { shown, list: list?.textContent.toLowerCase() ?? null, hidden: drawing.getAttribute("aria-hidden"),
      named: !!caption?.id && node.getAttribute("aria-labelledby") === caption.id && !!caption.textContent.trim() };
  }));
  assert.ok(found.length, `no ${figure} on the page`);
  for (const one of found) {
    assert.ok(one.named, "the figcaption names the figure");
    assert.equal(one.hidden === "true", one.list !== null, "the drawing is aria-hidden exactly when the equivalent is present");
    if (one.list === null) continue;
    assert.ok(one.shown.length, "the drawing shows its labels and values as text");
    for (const text of one.shown) assert.ok(one.list.includes(text.toLowerCase()), `the equivalent holds "${text}"`);
  }
}

/** Nothing scrolls sideways: the page fits the viewport and no element inside `root` overflows the viewport or scrolls inside. */
export async function assertNoSidewaysScroll(page, root = "body") {
  const over = await page.locator(root).first().evaluate(scope => {
    const width = document.documentElement.clientWidth, out = [];
    if (document.documentElement.scrollWidth > width) out.push(`page scrolls: ${document.documentElement.scrollWidth} > ${width}`);
    for (const node of [scope, ...scope.querySelectorAll("*")]) {
      const box = node.getBoundingClientRect();
      if (!box.width || node.closest(".sr-only")) continue;
      if (box.right > width + 0.5) out.push(`${node.getAttribute("class") || node.tagName} ends at ${Math.round(box.right)}`);
      if (node.scrollWidth > node.clientWidth + 1 && !["visible", "clip"].includes(getComputedStyle(node).overflowX)) out.push(`${node.getAttribute("class") || node.tagName} scrolls inside`);
    }
    return out;
  });
  assert.deepEqual(over, []);
}

/** The switch is a real button with aria-pressed; pressing it shows the equivalent and hides the drawing, pressing again restores it. */
export async function assertListSwitch(page, figure = "figure.oak-figure") {
  const scope = page.locator(figure).first(), button = scope.locator(".oak-figure__head [aria-pressed]");
  assert.equal(await button.evaluate(node => node.tagName), "BUTTON");
  assert.equal(await button.getAttribute("type"), "button");
  assert.equal(await button.getAttribute("aria-pressed"), "false");
  await button.click();
  assert.equal(await button.getAttribute("aria-pressed"), "true");
  assert.ok(await scope.locator(".oak-figure__list").isVisible(), "the list shows");
  assert.ok(!(await scope.locator(".oak-figure__drawing").isVisible()), "the drawing hides");
  await button.click();
  assert.equal(await button.getAttribute("aria-pressed"), "false");
}

/** No element inside `root` animates or transitions (call on a page opened with reducedMotion). The site's reduce rule leaves 0.01ms, which counts as none. */
export async function assertNoMotion(page, root = "body") {
  const moving = await page.locator(root).first().evaluate(scope => [scope, ...scope.querySelectorAll("*")].filter(node => {
    const style = getComputedStyle(node);
    const any = value => value.split(",").some(part => parseFloat(part) > 0.001);
    return any(style.transitionDuration) || (style.animationName !== "none" && any(style.animationDuration));
  }).map(node => node.getAttribute("class") || node.tagName));
  assert.deepEqual(moving, []);
}

/**
 * Not color alone (A23): elements matching `selector` that stand for different things (grouped by `attribute`) must differ by
 * something other than color: a pattern fill or background image, border or stroke style, shape, or their text. Call with forced colors on.
 */
export async function assertNotColorAlone(page, selector, attribute = "data-series") {
  const marks = await page.locator(selector).evaluateAll((nodes, name) => nodes.map(node => {
    const style = getComputedStyle(node);
    const colorless = value => value.replace(/(rgba?|color|oklch|lab|lch|hsla?)\([^()]*(\([^()]*\)[^()]*)*\)|#[0-9a-f]{3,8}\b/gi, "c");
    const pattern = /url\(/.test(style.fill) ? style.fill.replace(/.*#[^-]*-?/, "#").replace(/["')]/g, "") : style.fill === "none" ? "none" : "paint";
    return { group: node.getAttribute(name), look: [pattern, colorless(style.backgroundImage), style.backgroundSize, style.borderTopStyle, style.strokeDasharray,
      node.tagName, node.getAttribute("aria-label") ?? "", node.textContent.trim()].join("|") };
  }), attribute);
  const looks = new Map();
  for (const mark of marks) looks.set(mark.group, mark.look);
  assert.ok(looks.size > 1, `at least two kinds of ${selector}`);
  assert.equal(new Set(looks.values()).size, looks.size, `each ${attribute} looks different without color: ${JSON.stringify([...looks])}`);
}

/** Live regions in `scope` (a page or locator, or an HTML string): aria-live other than off, and the status, alert and log roles. */
export async function liveRegions(scope) {
  if (typeof scope === "string") return scope.match(/aria-live="(polite|assertive)"|role="(status|alert|log)"/g)?.length ?? 0;
  return scope.locator("[aria-live=polite], [aria-live=assertive], [role=status], [role=alert], [role=log]").count();
}
