#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { absoluteUrl, loadPlaywright, parseArgs, saveJson } from "./browser-proof.mjs";
import { lockFileForUrl, lockOrExit } from "./validate-lock.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(scriptDir, "../..");
const fixturePath = path.join(repo, "src/data/dev/oak-states.json");
const defaultViewports = ["1440x900", "1280x800", "1024x768"];
const usage = `Usage:\n  node scripts/quality/oak-states-capture.mjs --base-url URL --label LABEL [--viewports 1440x900,1280x800,1024x768] [--states a,b] [--axe] [--check scroller,minwindow]\n`;

function help() {
  process.stdout.write(`${usage}\nCaptures dev gallery states into artifacts/design-rework/<label>/.\n`);
}

function parseViewports(value) {
  const values = (value ?? defaultViewports.join(",")).split(",");
  const parsed = values.map((size) => {
    const match = /^(\d+)x(\d+)$/.exec(size);
    if (!match || Number(match[1]) < 1 || Number(match[2]) < 1) {
      throw new Error(`Invalid viewport "${size}". Expected WIDTHxHEIGHT.`);
    }
    return { name: size, width: Number(match[1]), height: Number(match[2]) };
  });
  return [...new Map(parsed.map((viewport) => [viewport.name, viewport])).values()];
}

function parseList(value, label) {
  const values = value.split(",").map((entry) => entry.trim());
  if (!values.length || values.some((entry) => !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(entry))) {
    throw new Error(`Invalid ${label}. Use comma-separated ids made of letters, numbers, hyphens, or underscores.`);
  }
  return [...new Set(values)];
}

function readFixtureStates() {
  if (!existsSync(fixturePath)) {
    throw new Error(`Gallery state fixture is missing: ${path.relative(repo, fixturePath)}. Add it or pass --states a,b.`);
  }
  let fixture;
  try {
    fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${path.relative(repo, fixturePath)}: ${error.message}`);
  }
  if (!Array.isArray(fixture) || fixture.some((entry) => !entry || typeof entry.id !== "string" || !entry.id)) {
    throw new Error(`${path.relative(repo, fixturePath)} must be a JSON array of objects with non-empty id fields.`);
  }
  const ids = fixture.map((entry) => entry.id);
  if (ids.some((id) => !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id))) {
    throw new Error(`${path.relative(repo, fixturePath)} contains an invalid state id.`);
  }
  return [...new Set(ids)];
}

function requestIsCounted(requestUrl, baseHost) {
  if (requestUrl.startsWith("data:") || requestUrl.startsWith("blob:")) return false;
  try {
    const url = new URL(requestUrl);
    return url.pathname.startsWith("/api/") || url.host !== baseHost;
  } catch {
    return false;
  }
}

async function readyGalleryState(page, baseUrl, state) {
  const url = absoluteUrl(baseUrl, `/__dev/oak-states?state=${encodeURIComponent(state)}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForFunction(() => ["ready", "missing", "error"].includes(document.documentElement.dataset.oakGallery), null, { timeout: 20000 });
  const result = await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return document.documentElement.dataset.oakGallery;
  });
  if (result === "missing") throw new Error(`Gallery state "${state}" is unknown.`);
  if (result === "error") throw new Error(`Gallery state "${state}" failed to apply; see the browser console.`);
  // A replayed reasoning trail grows its rows open; shooting mid-grow clips a row's own text under the next one, which reads
  // as an overlap on the review page. Wait for the rows to land (Motion clears the inline overflow), up to 3s.
  await page.waitForFunction(() => ![...document.querySelectorAll(".oak-cot__step")].some((row) => row.style.overflow === "hidden"), null, { timeout: 3000 }).catch(() => {});
  // A panel that opens scrolled frosts its nav bar a moment later (IntersectionObserver, then a short fade); shooting before
  // that shows crisp content under the title, which reads as an overlap. Wait for the frost, then its fade.
  const frosting = await page.waitForFunction(() => [...document.querySelectorAll(".oak-panel-nav")].every((nav) => {
    const sentinel = nav.parentElement?.querySelector(".oak-panel-nav__sentinel");
    return !sentinel || sentinel.getBoundingClientRect().top >= nav.getBoundingClientRect().top - 1 || nav.hasAttribute("data-scrolled");
  }), null, { timeout: 3000 }).then(() => page.evaluate(() => Boolean(document.querySelector(".oak-panel-nav[data-scrolled]")))).catch(() => false);
  if (frosting) await page.waitForTimeout(300);
}

async function axeCounts(AxeBuilder, page) {
  const results = await new AxeBuilder({ page }).include(".oak-workspace").analyze();
  const blocking = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  return {
    serious: blocking.filter((violation) => violation.impact === "serious").length,
    critical: blocking.filter((violation) => violation.impact === "critical").length,
    rules: blocking.map((violation) => ({ id: violation.id, nodes: violation.nodes.length, target: violation.nodes[0]?.target.join(" ") })),
  };
}

async function checkScroller(page, baseUrl) {
  await readyGalleryState(page, baseUrl, "long-conversation");
  const viewport = page.locator(".oak-conversation__viewport");
  await viewport.waitFor({ state: "visible", timeout: 5000 });
  const startsAtLiveEdge = await viewport.evaluate((element) =>
    element.scrollTop + element.clientHeight >= element.scrollHeight - 8);
  const before = await viewport.evaluate((element) => element.scrollTop);
  // A real wheel: the scroller yields only to reader input (wheel, touch, keys), not to a programmatic scrollTop.
  await viewport.hover();
  await page.mouse.wheel(0, -400);
  await page.waitForFunction(({ selector, from }) => document.querySelector(selector).scrollTop < from, { selector: ".oak-conversation__viewport", from: before }, { timeout: 5000 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const scrolledTop = await viewport.evaluate((element) => element.scrollTop);
  const hasAppend = await page.evaluate(() => typeof window.__oakGallery?.appendAssistant === "function");
  if (!hasAppend) throw new Error("window.__oakGallery.appendAssistant is unavailable.");
  await page.evaluate(async () => window.__oakGallery.appendAssistant("Additional assistant message for scroller check."));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const afterAppend = await viewport.evaluate((element) => element.scrollTop);
  const latestButtons = page.getByRole("button", { name: /latest/i });
  let latestVisible = false;
  for (let index = 0; index < await latestButtons.count(); index += 1) {
    if (await latestButtons.nth(index).isVisible()) latestVisible = true;
  }

  const beforeSend = await page.locator("[data-message-id]").count();
  const previousId = await page.locator("[data-message-id]").last().getAttribute("data-message-id");
  const hasSend = await page.evaluate(() => typeof window.__oakGallery?.sendUser === "function");
  if (!hasSend) throw new Error("window.__oakGallery.sendUser is unavailable.");
  await page.evaluate(async () => window.__oakGallery.sendUser("Reader message for scroller check."));
  await page.waitForFunction(({ count, previousId }) => {
    const messages = document.querySelectorAll("[data-message-id]");
    const last = messages[messages.length - 1];
    return messages.length > count || (last && last.getAttribute("data-message-id") !== previousId);
  }, { count: beforeSend, previousId }, { timeout: 5000 });
  const lastTop = await page.locator("[data-message-id]").last().evaluate((message) => {
    const viewportRect = document.querySelector(".oak-conversation__viewport").getBoundingClientRect();
    const messageRect = message.getBoundingClientRect();
    return { offset: messageRect.top - viewportRect.top, height: viewportRect.height };
  });
  const appendedMessageStayed = Math.abs(afterAppend - scrolledTop) <= 4;
  const newTurnAtTop = lastTop.offset >= 0 && lastTop.offset <= lastTop.height * 0.35;
  const passed = startsAtLiveEdge && before >= scrolledTop && appendedMessageStayed && latestVisible && newTurnAtTop;
  if (!passed) process.stderr.write(`scroller: ${JSON.stringify({ startsAtLiveEdge, before, scrolledTop, afterAppend, latestVisible, lastTop })}\n`);
  return passed;
}

async function checkMinWindow(page, baseUrl) {
  await readyGalleryState(page, baseUrl, "long-conversation");
  const initialCount = await page.locator("[data-message-id]").count();
  await page.setViewportSize({ width: 359, height: 599 });
  const notice = page.locator(".oak-workspace__viewport-notice");
  let noticeVisible = false;
  try {
    await notice.waitFor({ state: "visible", timeout: 5000 });
    noticeVisible = true;
  } catch {}
  await page.setViewportSize({ width: 1024, height: 768 });
  let noticeGone = false;
  try {
    await notice.waitFor({ state: "hidden", timeout: 5000 });
    noticeGone = true;
  } catch {}
  const restoredCount = await page.locator("[data-message-id]").count();
  return noticeVisible && noticeGone && initialCount === restoredCount;
}

async function main() {
  const argv = process.argv.slice(2);
  const axe = argv.includes("--axe");
  const parsed = parseArgs(argv.filter((token) => token !== "--axe"));
  if (parsed.help) {
    help();
    return 0;
  }
  const allowed = new Set(["base-url", "label", "viewports", "states", "check"]);
  const unknown = Object.keys(parsed).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`Unknown option(s): ${unknown.map((key) => `--${key}`).join(", ")}`);
  if (!parsed["base-url"] || !parsed.label) throw new Error(`--base-url and --label are required.\n${usage}`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(parsed.label)) throw new Error("--label must be a single safe directory name.");
  const base = new URL(parsed["base-url"]);
  if (!/^https?:$/.test(base.protocol)) throw new Error("--base-url must use http or https.");
  const baseUrl = base.toString();
  const viewports = parseViewports(parsed.viewports);
  const states = parsed.states ? parseList(parsed.states, "--states") : readFixtureStates();
  const checksRequested = parsed.check ? parseList(parsed.check, "--check") : [];
  const invalidChecks = checksRequested.filter((check) => !["scroller", "minwindow"].includes(check));
  if (invalidChecks.length) throw new Error(`Unknown check(s): ${invalidChecks.join(", ")}`);

  // Refuses to start while `npm run validate` holds the lock for this dev server's port (os.tmpdir()); released on exit.
  lockOrExit("oak-states-capture", lockFileForUrl(baseUrl));
  let AxeBuilder;
  if (axe) {
    try {
      const axeModule = await import("@axe-core/playwright");
      AxeBuilder = axeModule.default ?? axeModule.AxeBuilder;
    } catch (error) {
      process.stderr.write(`Axe is unavailable. install @axe-core/playwright. ${error.message}\n`);
      return 2;
    }
  }

  const outputDir = path.join(repo, "artifacts/design-rework", parsed.label);
  await mkdir(outputDir, { recursive: true });
  const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  const manifest = { label: parsed.label, commit, apiRequests: 0, shots: [] };
  if (checksRequested.length) manifest.checks = {};
  const errors = [];
  const baseHost = base.host;
  const contexts = new Map();
  let browser;
  try {
    const { chromium } = await loadPlaywright();
    browser = await chromium.launch({ headless: true });
    const getContext = async (viewport) => {
      if (!contexts.has(viewport.name)) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: 1,
          reducedMotion: "no-preference",
        });
        context.on("request", (request) => {
          if (requestIsCounted(request.url(), baseHost)) manifest.apiRequests += 1;
        });
        contexts.set(viewport.name, context);
      }
      return contexts.get(viewport.name);
    };

    // R30: states that carry their own viewport or reduced motion are shot under that condition (review A, M3).
    const conditions = new Map(existsSync(fixturePath)
      ? JSON.parse(readFileSync(fixturePath, "utf8")).map((entry) => [entry.id, { viewport: entry.viewport, reducedMotion: entry.reducedMotion === true }])
      : []);
    for (const viewport of viewports) {
      const context = await getContext(viewport);
      const page = await context.newPage();
      for (const state of states) {
        const condition = conditions.get(state) ?? {};
        if (condition.viewport && viewport !== viewports[0]) continue;
        const shotViewport = condition.viewport
          ? { name: `${condition.viewport.width}x${condition.viewport.height}`, ...condition.viewport } : viewport;
        const target = condition.viewport ? await (await getContext(shotViewport)).newPage() : page;
        const file = `${state}-${shotViewport.name}.png`;
        try {
          await target.emulateMedia({ reducedMotion: condition.reducedMotion ? "reduce" : "no-preference" });
          await readyGalleryState(target, baseUrl, state);
          // Shots show a pointer visitor's view: opening focuses Close, and with no prior pointer input that draws the keyboard ring.
          // Keyboard focus order itself is proven by the D12-G3 test.
          await target.evaluate(() => { if (document.activeElement?.getAttribute("aria-label") === "Close") document.activeElement.blur(); });
          const details = await target.evaluate(() => ({
            placeholder: Boolean(document.querySelector("[data-oak-gallery-placeholder]")),
            overflowX: (() => {
              const workspace = document.querySelector(".oak-workspace");
              return workspace ? workspace.scrollWidth > workspace.clientWidth : false;
            })(),
          }));
          const filePath = path.join(outputDir, file);
          await target.screenshot({ path: filePath, fullPage: false, animations: "disabled" });
          const shot = { state, viewport: shotViewport.name, file, ...details };
          manifest.shots.push(shot);
          if (axe) shot.axe = await axeCounts(AxeBuilder, target);
        } catch (error) {
          errors.push({ state, viewport: shotViewport.name, error: error.message });
        } finally {
          if (target !== page) await target.close();
        }
      }
      await page.close();
    }

    for (const check of checksRequested) {
      const viewport = check === "scroller"
        ? { name: "1440x900", width: 1440, height: 900 }
        : { name: "1024x768", width: 1024, height: 768 };
      try {
        const context = await getContext(viewport);
        const page = await context.newPage();
        const passed = check === "scroller"
          ? await checkScroller(page, baseUrl)
          : await checkMinWindow(page, baseUrl);
        manifest.checks[check] = passed ? "pass" : "fail";
        await page.close();
      } catch (error) {
        manifest.checks[check] = "fail";
        process.stderr.write(`${check} check failed: ${error.message}\n`);
      }
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    if (browser) await browser.close();
    return 1;
  } finally {
    for (const context of contexts.values()) await context.close().catch(() => undefined);
    if (browser) await browser.close().catch(() => undefined);
  }

  if (errors.length) manifest.errors = errors;
  await saveJson(path.join(outputDir, "manifest.json"), manifest);
  const successfulViewports = new Set(manifest.shots.map((shot) => shot.viewport));
  // A state with its own viewport is complete with its one shot at that size.
  const ownSize = (state) => manifest.shots.some((shot) => shot.state === state && !viewports.some((viewport) => viewport.name === shot.viewport));
  const complete = states.every((state) => ownSize(state) || viewports.every((viewport) =>
    manifest.shots.some((shot) => shot.state === state && shot.viewport === viewport.name)));
  const withAxe = manifest.shots.filter((shot) => shot.axe);
  const axeCount = withAxe.length
    ? withAxe.reduce((sum, shot) => sum + shot.axe.serious + shot.axe.critical, 0)
    : "na";
  process.stdout.write([
    `label=${parsed.label}`,
    `shots=${manifest.shots.length}`,
    `states=${new Set(manifest.shots.map((shot) => shot.state)).size}`,
    `viewports=${successfulViewports.size}`,
    `complete=${complete ? "yes" : "no"}`,
    `placeholders=${manifest.shots.filter((shot) => shot.placeholder).length}`,
    `api=${manifest.apiRequests}`,
    `overflow=${manifest.shots.filter((shot) => shot.overflowX).length}`,
    `axe-serious=${axeCount}`,
    `scroller=${manifest.checks?.scroller ?? "na"}`,
    `minwindow=${manifest.checks?.minwindow ?? "na"}`,
  ].join(" ") + "\n");
  return errors.length || Object.values(manifest.checks ?? {}).includes("fail") ? 1 : 0;
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
