#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (key === "help" || key === "navigation-only") {
      values[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Expected a value after ${token}`);
    values[key] = value;
    index += 1;
  }
  return values;
}

export function printHelp() {
  process.stdout.write(`Browser proof for production-build UI parity.\n\nUsage:\n  node scripts/quality/browser-proof.mjs --base-url URL --build LABEL --out DIR [--tool-root DIR] [--viewports mobile,desktop]\n  node scripts/quality/browser-proof.mjs --base-url URL --build LABEL --out DIR --navigation-only [--tool-root DIR] [--viewports mobile,desktop]\n\n--tool-root points at a directory whose node_modules contains Playwright. QUALITY_TOOLS_ROOT is the environment equivalent. The runner captures screenshots and reports separately. It does not start a server.\n`);
}

export async function loadPlaywright(toolRoot) {
  try {
    if (toolRoot) {
      const require = createRequire(path.join(path.resolve(toolRoot), "package.json"));
      const loaded = await import(pathToFileURL(require.resolve("playwright")).href);
      return loaded.chromium ? loaded : loaded.default;
    }
    return await import("playwright");
  } catch (error) {
    throw new Error(`Playwright is unavailable. Install playwright as a root dev dependency, or pass --tool-root DIR / QUALITY_TOOLS_ROOT with Playwright in node_modules. ${error.message}`);
  }
}

export function classifyPageErrors(details) {
  const knownThirdPartyErrors = [];
  const firstPartyErrors = [];
  for (const detail of details) {
    const isKnownYouTubeError = detail.message === "this.api.isExternalMethodAvailable is not a function" &&
      typeof detail.stack === "string" &&
      detail.stack.includes("https://www.youtube-nocookie.com/");
    (isKnownYouTubeError ? knownThirdPartyErrors : firstPartyErrors).push(detail);
  }
  return { knownThirdPartyErrors, firstPartyErrors };
}

export function absoluteUrl(baseUrl, route) {
  return new URL(route, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

export async function saveJson(outputPath, report) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

const viewports = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
  mobile: { width: 390, height: 844, deviceScaleFactor: 1 },
};

const routes = [
  { name: "home", route: "/", assertion: "home", noJs: true },
  { name: "work-timeline", route: "/work/", assertion: "timeline", noJs: true },
  { name: "career-hash-pnppsolutions", route: "/work#pnppsolutions", assertion: "hash" },
  { name: "ecosmartloop", route: "/work/ecosmartloop/", assertion: "charts" },
  { name: "oakminder", route: "/work/oakminder/", assertion: "oakminder" },
  { name: "agentic-brain-stub", route: "/work/agentic-brain/", assertion: "stub", noJs: true },
  { name: "kusala-support", route: "/apps/kusala-daily/support/", assertion: "kusala" },
];

function record(checks, name, pass, detail) {
  checks.push({ name, status: pass ? "pass" : "fail", detail });
}

async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = Math.max(500, Math.floor(window.innerHeight * 0.72));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      const visibleImages = [...document.images].filter((image) => {
        const rect = image.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
      });
      await Promise.all(visibleImages.map((image) => image.decode().catch(() => undefined)));
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.waitForFunction(() => window.scrollY === 0);
  await page.waitForTimeout(500);
}

async function inspectPage(page, viewportName) {
  const geometry = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    documentHeight: document.documentElement.scrollHeight,
    title: document.title,
    h1: document.querySelector("h1")?.textContent?.trim() ?? null,
    images: [...document.images].map((image) => ({
      src: image.currentSrc || image.src,
      alt: image.alt,
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      visible: image.getBoundingClientRect().width > 0 && image.getBoundingClientRect().height > 0,
    })),
  }));
  const overflow = geometry.documentWidth > geometry.viewportWidth + 1 || geometry.bodyWidth > geometry.viewportWidth + 1;
  record(page.__checks, `${viewportName}:no-horizontal-overflow`, !overflow, JSON.stringify(geometry));
  const brokenVisible = geometry.images.filter((image) => image.visible && image.complete && image.naturalWidth === 0);
  const visibleNotLoaded = geometry.images.filter((image) => image.visible && !image.complete);
  record(page.__checks, `${viewportName}:visible-images-load`, brokenVisible.length === 0, JSON.stringify(brokenVisible));
  page.__checks.push({ name: `${viewportName}:visible-lazy-images-settled`, status: "observation", detail: JSON.stringify(visibleNotLoaded) });
  return geometry;
}

async function testHash(page, checks) {
  const item = page.locator("#pnppsolutions");
  await item.waitFor({ state: "visible" });
  const isExpanded = await page.locator(".career-timeline-section").evaluate((element) => element.classList.contains("career-timeline-section--expanded"));
  record(checks, "compact-hash-expands-timeline", isExpanded, "CareerTimeline source maps #pnppsolutions to its item and expands the section.");
  const details = item.locator(".career-timeline-card__trigger");
  const expanded = await details.getAttribute("aria-expanded");
  record(checks, "compact-hash-opens-item-details", expanded === "true", `aria-expanded=${expanded}`);
  const rect = await item.evaluate((element) => ({ top: element.getBoundingClientRect().top, height: element.getBoundingClientRect().height }));
  record(checks, "compact-hash-target-visible", rect.top < 220 && rect.top + rect.height > 0, JSON.stringify(rect));
}

async function testAgentEntry(page, checks) {
  const launcher = page.locator("[data-oak-workspace-launcher]");
  await launcher.waitFor({ state: "visible" });
  record(checks, "one-centered-full-label-launcher", await launcher.count() === 1 &&
    (await launcher.textContent()).trim() === "Oak AI Agent", "One persistent Oak launcher.");
  record(checks, "no-alternate-reading-control", await page.getByRole("tab", { name: /Show (human|machine)/ }).count() === 0 &&
    await page.locator(".audience-mode__machine-panel").count() === 0, "Canonical reader page only.");
  const geometry = await launcher.evaluate(element => {
    const rect = element.getBoundingClientRect(), viewport = window.visualViewport;
    return { center: rect.left + rect.width / 2, expected: (viewport?.offsetLeft ?? 0) + (viewport?.width ?? innerWidth) / 2,
      left: rect.left, right: rect.right, width: innerWidth };
  });
  record(checks, "launcher-centers-and-fits", Math.abs(geometry.center - geometry.expected) <= 1 &&
    geometry.left >= 0 && geometry.right <= geometry.width + 1, JSON.stringify(geometry));
  await launcher.click();
  const dialog = page.getByRole("dialog", { name: "Oak AI Agent", exact: true });
  await dialog.waitFor({ state: "visible" });
  record(checks, "agent-isolates-page-and-pauses-mascot", await page.locator(".route-surface").evaluate(element => element.inert) &&
    await page.locator(".oak-mascot:not([hidden])").count() === 0 && !await launcher.isVisible(), "Dialog owns interaction.");
  const input = dialog.locator("#oak-composer-input");
  await input.fill("Unsent local UI proof draft");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  record(checks, "close-restores-launcher-focus", await launcher.evaluate(element => document.activeElement === element), "Native Escape returns focus.");
  await launcher.click();
  await dialog.waitFor({ state: "visible" });
  record(checks, "reopen-preserves-unsent-draft", await input.inputValue() === "Unsent local UI proof draft", "No prompt submitted.");
  await input.fill("");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
}

async function testTimeline(page, checks) {
  const collapse = page.getByRole("button", { name: "View Latest" });
  await collapse.waitFor({ state: "visible" });
  await collapse.click();
  await page.getByRole("button", { name: "View All" }).waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelectorAll(".career-timeline__item").length === 1);
  const collapsedCount = await page.locator(".career-timeline__item").count();
  record(checks, "timeline-view-latest-collapses", collapsedCount === 1, `Visible timeline items: ${collapsedCount}`);
  await page.getByRole("button", { name: "View All" }).click();
  await page.getByRole("button", { name: "View Latest" }).waitFor({ state: "visible" });
  const expandedCount = await page.locator(".career-timeline__item").count();
  record(checks, "timeline-view-all-expands", expandedCount > 1, `Visible timeline items: ${expandedCount}`);
}

async function testCharts(page, checks) {
  const figures = page.locator("figure.work-mdx-chart");
  const count = await figures.count();
  for (let index = 0; index < count; index += 1) {
    await figures.nth(index).scrollIntoViewIfNeeded();
    await page.waitForFunction((figureIndex) => {
      const figure = document.querySelectorAll("figure.work-mdx-chart")[figureIndex];
      return Boolean(figure?.querySelector("svg.recharts-surface"));
    }, index, { timeout: 15000 });
  }
  await scrollThrough(page);
  const svgs = await figures.locator("svg.recharts-surface").count();
  record(checks, "ecosmartloop-charts-hydrate", count > 0 && svgs === count, `${svgs}/${count} chart figures rendered Recharts SVG.`);
}

async function testOakminder(page, checks) {
  const carousel = page.locator(".work-image-carousel");
  await carousel.scrollIntoViewIfNeeded();
  await carousel.locator('[role="tab"]').first().waitFor({ state: "visible" });
  const pause = carousel.getByRole("button", { name: "Pause automatic screenshot rotation" });
  if (await pause.count()) await pause.click();
  const selected = carousel.locator('[role="tab"][aria-selected="true"]');
  const before = await selected.getAttribute("aria-label");
  await carousel.getByRole("button", { name: "Show next screenshot" }).click();
  await page.waitForFunction((beforeLabel) => document.querySelector('.work-image-carousel [role="tab"][aria-selected="true"]')?.getAttribute("aria-label") !== beforeLabel, before);
  const after = await carousel.locator('[role="tab"][aria-selected="true"]').getAttribute("aria-label");
  record(checks, "oakminder-carousel-next", Boolean(after && after !== before), `${before} -> ${after}`);

  const opener = page.getByRole("button", { name: /^Open image 1 of \d+ in fullscreen$/ }).first();
  await opener.scrollIntoViewIfNeeded();
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Oakminder onboarding proof screenshots" });
  await dialog.waitFor({ state: "visible" });
  const beforeCounter = await dialog.locator(".work-grid-lightbox__counter").textContent();
  record(checks, "oakminder-lightbox-opens-from-keyboard", Boolean(beforeCounter), `Fullscreen screenshot dialog opened at ${beforeCounter}.`);
  await page.keyboard.press("ArrowRight");
  const counter = await dialog.locator(".work-grid-lightbox__counter").textContent();
  record(checks, "oakminder-lightbox-arrow-navigation", counter !== beforeCounter, `Counter ${beforeCounter} -> ${counter}`);
  await page.screenshot({ path: page.__lightboxShot, fullPage: false });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.activeElement?.classList.contains("work-grid-lightbox-trigger"));
  record(checks, "oakminder-lightbox-escape-restores-focus", true, "Escape closes dialog and restores focus to the opener.");
}

async function testStub(page, checks) {
  const draft = page.getByRole("heading", { name: "Case study in progress" });
  await draft.waitFor({ state: "visible" });
  record(checks, "public-stub-keeps-draft-without-mascot", await page.locator(".oak-mascot").count() === 0, "Stub mascot remains absent.");
  await testAgentEntry(page, checks);
}

async function testKusala(page, checks) {
  const trigger = page.locator(".kusala-support-contact .contact-trigger:not(.contact-trigger--placeholder)");
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Let's Connect" });
  await dialog.waitFor({ state: "visible" });
  record(checks, "kusala-contact-card-opens", true, "Support page contact card opened.");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.activeElement?.classList.contains("contact-trigger"));
  record(checks, "kusala-contact-card-escape-restores-focus", true, "Escape closes card and restores trigger focus.");
}

async function runNavigationProof(browser, baseUrl, build, viewportName, outputDir) {
  const context = await browser.newContext({ viewport: viewports[viewportName], reducedMotion: "reduce" });
  const page = await context.newPage();
  const checks = [];
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const response = await page.goto(absoluteUrl(baseUrl, "/"), { waitUntil: "networkidle" });
  if (!response || response.status() >= 400) throw new Error(`Homepage navigation setup returned ${response?.status() ?? "no response"}`);
  if (viewportName === "mobile") {
    await page.getByRole("button", { name: "Open menu" }).click();
    const menu = page.getByRole("navigation", { name: "Mobile navigation" });
    await menu.waitFor({ state: "visible" });
    const menuScreenshot = path.join(outputDir, `mobile-navigation-open-${build}.png`);
    await page.screenshot({ path: menuScreenshot, fullPage: false, animations: "disabled" });
    record(checks, "mobile-menu-opens", await menu.isVisible(), "Mobile navigation opened from the header button.");
    await menu.getByRole("link", { name: "Work" }).click();
  } else {
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Work" }).click();
  }
  await page.waitForURL((url) => url.pathname === "/work/");
  await page.getByRole("heading", { name: "Work that shaped my direction" }).waitFor({ state: "visible" });
  record(checks, `${viewportName}-work-navigation`, new URL(page.url()).pathname === "/work/", `Navigated to ${page.url()}`);
  record(checks, `${viewportName}-navigation-page-errors`, pageErrors.length === 0, JSON.stringify(pageErrors));
  const screenshot = path.join(outputDir, `navigation-work-${viewportName}.png`);
  await page.screenshot({ path: screenshot, fullPage: false, animations: "disabled" });
  const result = {
    route: "/ -> /work/",
    viewport: { name: viewportName, ...viewports[viewportName] },
    build,
    state: "primary-navigation",
    observations: { status: checks.some((check) => check.status === "fail") ? "fail" : "pass", checks, pageErrors, finalUrl: page.url() },
    artifact: screenshot,
  };
  await context.close();
  return result;
}

async function testNoJs(browser, baseUrl, route, viewportName, build, outputDir) {
  const context = await browser.newContext({ viewport: viewports[viewportName], javaScriptEnabled: false, reducedMotion: "reduce" });
  const page = await context.newPage();
  const checks = [];
  const routeUrl = absoluteUrl(baseUrl, route.route);
  const response = await page.goto(routeUrl, { waitUntil: "domcontentloaded" });
  const visibleText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  if (route.assertion === "home") record(checks, "no-js-home-content", /Steve Oak|AI|design/i.test(visibleText), visibleText.slice(0, 180));
  else if (route.assertion === "timeline") record(checks, "no-js-work-content", /Work that shaped my direction|Career timeline/i.test(visibleText), visibleText.slice(0, 180));
  else record(checks, "no-js-stub-content", /Case study in progress/i.test(visibleText), visibleText.slice(0, 180));
  const screenshot = path.join(outputDir, `${route.name}-${viewportName}-no-js.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  const result = { route: route.route, viewport: { name: viewportName, ...viewports[viewportName] }, build, state: "no-js-initial-content", observations: { status: response?.status(), checks }, artifact: screenshot };
  await context.close();
  return result;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();
  for (const required of ["base-url", "build", "out"]) if (!args[required]) throw new Error(`Missing --${required}`);
  const base = new URL(args["base-url"]);
  if (!["http:", "https:"].includes(base.protocol)) throw new Error("--base-url must use http or https");
  const selected = (args.viewports ?? "mobile,desktop").split(",");
  for (const viewport of selected) if (!viewports[viewport]) throw new Error(`Unknown viewport: ${viewport}`);

  const playwright = await loadPlaywright(args["tool-root"] ?? process.env.QUALITY_TOOLS_ROOT);
  const browser = await playwright.chromium.launch({ headless: true });
  const outputDir = path.resolve(args.out);
  await mkdir(outputDir, { recursive: true });
  const report = {
    schemaVersion: 1,
    runner: "browser-proof",
    build: args.build,
    baseUrl: base.toString(),
    capturedAt: new Date().toISOString(),
    browser: { name: "Chromium", version: browser.version() },
    sourceContracts: [
      "CareerTimeline ids, detail triggers, and Show all/latest controls in src/components/work/CareerTimeline.tsx",
      "WorkImageCarousel buttons and selected tabs in src/components/work/WorkImageCarousel.tsx",
      "WorkGridLightbox keyboard, dialog, counter, and focus restoration in src/components/work/WorkGridLightbox.tsx",
      "Centered Oak launcher and browsing mascot owner in src/components/HumanMachineMode.tsx",
      "ContactMorph trigger/dialog in src/components/ContactMorph.tsx",
      "ChartFigure client:visible Recharts island in src/components/work/ChartFigure.astro",
    ],
    results: [],
  };

  try {
    if (args["navigation-only"]) {
      for (const viewportName of selected) report.results.push(await runNavigationProof(browser, base.toString(), args.build, viewportName, outputDir));
      const reportPath = path.join(outputDir, "navigation-report.json");
      await saveJson(reportPath, report);
      const failed = report.results.flatMap((result) => result.observations.checks).filter((check) => check.status === "fail");
      process.stdout.write(`${JSON.stringify({ status: failed.length ? "fail" : "pass", report: reportPath, captures: report.results.length, failedChecks: failed.length }, null, 2)}\n`);
      if (failed.length) process.exitCode = 1;
      return;
    }
    for (const viewportName of selected) {
      for (const route of routes) {
        const checks = [];
        const url = absoluteUrl(base.toString(), route.route);
        const context = await browser.newContext({ viewport: viewports[viewportName], reducedMotion: "no-preference" });
        const page = await context.newPage();
        page.__checks = checks;
        page.__lightboxShot = path.join(outputDir, `${route.name}-${viewportName}-lightbox.png`);
        const consoleErrors = [];
        const browserEnvironmentWarnings = [];
        const failedRequests = [];
        const pageErrors = [];
        const pageErrorDetails = [];
        const badResponses = [];
        page.on("console", (message) => {
          if (message.type() !== "error") return;
          if (message.text().includes("Permissions policy violation: compute-pressure is not allowed")) browserEnvironmentWarnings.push(message.text());
          else consoleErrors.push(message.text());
        });
        page.on("pageerror", (error) => {
          pageErrors.push(error.message);
          pageErrorDetails.push({ name: error.name, message: error.message, stack: error.stack ?? null });
        });
        page.on("requestfailed", (request) => { if (new URL(request.url()).origin === base.origin) failedRequests.push({ url: request.url(), error: request.failure()?.errorText }); });
        page.on("response", (response) => { if (new URL(response.url()).origin === base.origin && response.status() >= 400) badResponses.push({ url: response.url(), status: response.status() }); });
        const response = await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
        if (!response || response.status() >= 400) throw new Error(`${url} returned ${response?.status() ?? "no response"}`);
        await page.waitForTimeout(300);
        let specific = {};
        if (route.assertion === "home") {
          await page.locator('[data-oak-section="home.hero"] h1').waitFor({ state: "visible" });
          specific.hero = await page.locator('[data-oak-section="home.hero"] h1').innerText();
          await testAgentEntry(page, checks);
        } else if (route.assertion === "timeline") {
          await page.locator(".career-timeline").waitFor({ state: "visible" });
          await testTimeline(page, checks);
        } else if (route.assertion === "hash") {
          await page.locator(".career-timeline").waitFor({ state: "visible" });
          await testHash(page, checks);
        } else if (route.assertion === "charts") {
          await testCharts(page, checks);
          specific.chartFigures = await page.locator("figure.work-mdx-chart").count();
          specific.renderedChartSvgs = await page.locator("figure.work-mdx-chart svg.recharts-surface").count();
        } else if (route.assertion === "oakminder") {
          await testOakminder(page, checks);
        } else if (route.assertion === "stub") {
          await testStub(page, checks);
        } else if (route.assertion === "kusala") {
          await testKusala(page, checks);
        }

        await scrollThrough(page);
        const geometry = await inspectPage(page, viewportName);
        const screenshot = path.join(outputDir, `${route.name}-${viewportName}.png`);
        let viewportArtifact = null;
        if (route.assertion === "home") {
          if (viewportName === "desktop") {
            await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
            await page.waitForFunction(() => {
              const hero = document.querySelector('[data-oak-section="home.hero"] h1');
              const rect = hero?.getBoundingClientRect();
              return window.scrollY === 0 && rect && rect.top >= 0 && rect.bottom <= window.innerHeight;
            });
            await page.waitForTimeout(100);
            viewportArtifact = path.join(outputDir, "home-desktop-hero.png");
            await page.screenshot({ path: viewportArtifact, fullPage: false, animations: "disabled" });
          }
        }
        await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" });
        if (route.assertion === "home") {
          await context.close();
          const reducedContext = await browser.newContext({ viewport: viewports[viewportName], reducedMotion: "reduce" });
          const reducedPage = await reducedContext.newPage();
          await reducedPage.goto(url, { waitUntil: "networkidle" });
          await reducedPage.locator('[data-oak-section="home.hero"] h1').waitFor({ state: "visible" });
          const contentVisible = await reducedPage.locator('[data-oak-section="home.hero"] h1').isVisible();
          checks.push({ name: "reduced-motion-home-content-remains-available", status: contentVisible ? "pass" : "fail", detail: `prefers-reduced-motion=${await reducedPage.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)}` });
          if (!contentVisible) throw new Error("Home hero is missing in reduced-motion mode.");
          await reducedContext.close();
        } else {
          await context.close();
        }

        const { knownThirdPartyErrors, firstPartyErrors } = classifyPageErrors(pageErrorDetails);
        for (const [key, list] of Object.entries({ consoleErrors, failedRequests, badResponses })) {
          record(checks, `${key}-empty`, list.length === 0, JSON.stringify(list));
        }
        record(checks, "first-party-page-errors-empty", firstPartyErrors.length === 0, JSON.stringify(firstPartyErrors));
        checks.push({ name: "known-third-party-page-errors", status: "observation", detail: JSON.stringify(knownThirdPartyErrors) });
        const observations = {
          httpStatus: response.status(), geometry, checks, consoleErrors, browserEnvironmentWarnings,
          pageErrors, pageErrorDetails, firstPartyPageErrors: firstPartyErrors,
          knownThirdPartyErrors, knownThirdPartyErrorCount: knownThirdPartyErrors.length,
          failedRequests, badResponses, ...specific,
        };
        report.results.push({ route: route.route, viewport: { name: viewportName, ...viewports[viewportName] }, build: args.build, state: "interactive-default", observations, artifact: screenshot, ...(viewportArtifact ? { viewportArtifact } : {}) });
        if (route.noJs) report.results.push(await testNoJs(browser, base.toString(), route, viewportName, args.build, outputDir));
      }
    }
  } finally {
    await browser.close();
  }

  const reportPath = path.join(outputDir, "browser-report.json");
  await saveJson(reportPath, report);
  const failed = report.results.flatMap((result) => result.observations?.checks ?? []).filter((check) => check.status === "fail");
  process.stdout.write(`${JSON.stringify({ status: failed.length ? "fail" : "pass", report: reportPath, captures: report.results.length, failedChecks: failed.length }, null, 2)}\n`);
  if (failed.length) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  run().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
