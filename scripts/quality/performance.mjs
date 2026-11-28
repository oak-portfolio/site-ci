#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import { absoluteUrl, classifyPageErrors, loadPlaywright, parseArgs, printHelp, saveJson } from "./browser-proof.mjs";

const viewports = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
  mobile: { width: 390, height: 844, deviceScaleFactor: 1 },
};
const defaultRoutes = ["/", "/work/", "/work/ecosmartloop/", "/work/oakminder/", "/work/agentic-brain/"];
const networkProfile = { latency: 40, downloadThroughput: 200_000, uploadThroughput: 93_750, connectionType: "cellular3g" };

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function isGoodSample(result) {
  return result.observations.httpStatus != null && result.observations.httpStatus < 400 &&
    result.observations.firstPartyPageErrors.length === 0 && result.observations.consoleErrors.length === 0 &&
    result.observations.loading.scriptsSettled &&
    result.observations.loading.clientLoadHydratedCount === result.observations.loading.clientLoadIslandCount &&
    result.observations.failedScriptRequests.length === 0;
}

async function runSample(browser, baseUrl, build, route, viewportName, sampleIndex) {
  const context = await browser.newContext({ viewport: viewports[viewportName], reducedMotion: "reduce", serviceWorkers: "block" });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, ...networkProfile });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(() => {
    window.__qualityLab = { lcp: null, clsEntries: [], clientLoadHydration: null };
    performance.setResourceTimingBufferSize(10000);
    performance.addEventListener("resourcetimingbufferfull", () => performance.setResourceTimingBufferSize(20000));
    const initialIslandObserver = new MutationObserver((records) => {
      const state = window.__qualityLab.clientLoadHydration;
      if (!state) return;
      for (const record of records) {
        if (record.type !== "attributes" || record.attributeName !== "ssr") continue;
        if (record.target.matches('astro-island[client="load"]') && !record.target.hasAttribute("ssr")) state.hydratedCount += 1;
      }
      if (state.hydratedCount >= state.targetCount && state.hydrationMs === null) state.hydrationMs = performance.now();
    });
    initialIslandObserver.observe(document, { attributes: true, subtree: true, attributeFilter: ["ssr"] });
    document.addEventListener("DOMContentLoaded", () => {
      const islands = [...document.querySelectorAll('astro-island[client="load"]')];
      const targetCount = islands.length;
      const hydratedCount = islands.filter((island) => !island.hasAttribute("ssr")).length;
      const start = performance.now();
      window.__qualityLab.clientLoadHydration = {
        targetCount,
        hydratedCount,
        hydrationMs: hydratedCount >= targetCount ? start : null,
      };
    }, { once: true });
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) window.__qualityLab.clsEntries.push({ startTime: entry.startTime, value: entry.value });
        }
      }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length) {
          const entry = entries[entries.length - 1];
          window.__qualityLab.lcp = entry.renderTime || entry.loadTime || entry.startTime;
        }
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {}
  });
  const beforeMetrics = await cdp.send("Performance.getMetrics");
  const errors = [];
  const errorDetails = [];
  const consoleErrors = [];
  const pendingScripts = new Set();
  const failedScriptRequests = [];
  let lastScriptActivityAt = Date.now();
  const isSameOriginScript = (request) => request.resourceType() === "script" && new URL(request.url()).origin === new URL(baseUrl).origin;
  page.on("request", (request) => {
    if (!isSameOriginScript(request)) return;
    pendingScripts.add(request);
    lastScriptActivityAt = Date.now();
  });
  const finishScript = (request) => {
    if (!pendingScripts.delete(request)) return;
    lastScriptActivityAt = Date.now();
  };
  page.on("requestfinished", finishScript);
  page.on("requestfailed", (request) => {
    if (isSameOriginScript(request)) failedScriptRequests.push({ url: request.url(), error: request.failure()?.errorText ?? null });
    finishScript(request);
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
    errorDetails.push({ name: error.name, message: error.message, stack: error.stack ?? null });
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (message.text().includes("Permissions policy violation: compute-pressure is not allowed")) return;
    consoleErrors.push(message.text());
  });
  const startedAt = Date.now();
  const response = await page.goto(absoluteUrl(baseUrl, route), { waitUntil: "load", timeout: 90000 });
  await page.waitForFunction(() => {
    const hydration = window.__qualityLab?.clientLoadHydration;
    return hydration && hydration.hydratedCount >= hydration.targetCount && hydration.hydrationMs !== null;
  }, undefined, { timeout: 90000 });
  const hydration = await page.evaluate(() => window.__qualityLab.clientLoadHydration);
  const scriptsSettledStart = Date.now();
  while (Date.now() - scriptsSettledStart < 90000) {
    if (pendingScripts.size === 0 && Date.now() - lastScriptActivityAt >= 500) break;
    await page.waitForTimeout(50);
  }
  const inflightScriptRequestCountAtSettle = pendingScripts.size;
  await page.waitForTimeout(2500);
  const wallClockMs = Date.now() - startedAt;
  const data = await page.evaluate(() => {
    const resources = performance.getEntriesByType("resource");
    const nav = performance.getEntriesByType("navigation")[0];
    const timed = resources.filter((entry) => entry.responseEnd > 0);
    const bytes = (entry) => Number.isFinite(entry.transferSize) ? entry.transferSize : 0;
    const scriptResources = timed.filter((entry) => entry.initiatorType === "script" || /\.m?js(?:\?|$)/i.test(entry.name));
    return {
      navigation: nav ? {
        domContentLoadedMs: nav.domContentLoadedEventEnd,
        loadEventMs: nav.loadEventEnd,
        responseMs: nav.responseEnd,
        transferBytes: nav.transferSize,
      } : null,
      resources: {
        count: timed.length,
        transferBytes: timed.reduce((sum, entry) => sum + bytes(entry), 0),
        scriptCount: scriptResources.length,
        scriptTransferBytes: scriptResources.reduce((sum, entry) => sum + bytes(entry), 0),
        decodedBytes: timed.reduce((sum, entry) => sum + (entry.decodedBodySize || 0), 0),
      },
      paint: {
        fcpMs: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null,
        lcpMs: window.__qualityLab.lcp,
        cls: (() => {
          const entries = window.__qualityLab.clsEntries;
          let sessionValue = 0;
          let sessionStart = null;
          let previousEntry = null;
          let maximum = 0;
          for (const entry of entries) {
            if (sessionStart === null || entry.startTime - previousEntry > 1000 || entry.startTime - sessionStart > 5000) {
              sessionStart = entry.startTime;
              sessionValue = entry.value;
            } else {
              sessionValue += entry.value;
            }
            previousEntry = entry.startTime;
            maximum = Math.max(maximum, sessionValue);
          }
          return maximum;
        })(),
      },
    };
  });
  const afterMetrics = await cdp.send("Performance.getMetrics");
  const { knownThirdPartyErrors, firstPartyErrors } = classifyPageErrors(errorDetails);
  const metricMap = (response) => Object.fromEntries(response.metrics.map((metric) => [metric.name, metric.value]));
  const before = metricMap(beforeMetrics);
  const after = metricMap(afterMetrics);
  const delta = (name) => before[name] != null && after[name] != null ? Math.max(0, (after[name] - before[name]) * 1000) : null;
  const result = {
    route,
    viewport: { name: viewportName, ...viewports[viewportName] },
    build,
    state: "cold-cache-4x-cpu-3g-lab-load",
    sample: sampleIndex,
    observations: {
      httpStatus: response?.status() ?? null,
      wallClockMs,
      navigation: data.navigation,
      resources: data.resources,
      paint: data.paint,
      loading: {
        hydrationMs: hydration.hydrationMs,
        clientLoadIslandCount: hydration.targetCount,
        clientLoadHydratedCount: hydration.hydratedCount,
        inflightScriptRequestCountAtSettle,
        scriptsSettled: inflightScriptRequestCountAtSettle === 0,
      },
      execution: {
        scriptDurationMs: delta("ScriptDuration"),
        taskDurationMs: delta("TaskDuration"),
        styleRecalculationMs: delta("RecalcStyleDuration"),
        layoutMs: delta("LayoutDuration"),
      },
      pageErrors: errors,
      pageErrorDetails: errorDetails,
      firstPartyPageErrors: firstPartyErrors,
      knownThirdPartyErrors,
      knownThirdPartyErrorCount: knownThirdPartyErrors.length,
      consoleErrors,
      failedScriptRequests,
    },
  };
  await context.close();
  return result;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`Matched production-build lab samples.\n\nUsage:\n  node scripts/quality/performance.mjs --base-url URL --build LABEL --out DIR [--tool-root DIR] [--routes /,/work/] [--samples 3] [--viewports mobile,desktop]\n\n--tool-root points at a directory whose node_modules contains Playwright. QUALITY_TOOLS_ROOT is the environment equivalent. Uses new contexts, disabled cache/service workers, 40 ms latency, 1.6 Mbps down, and 4x CPU throttling. It does not start a server.\n`);
    return;
  }
  for (const required of ["base-url", "build", "out"]) if (!args[required]) throw new Error(`Missing --${required}`);
  const base = new URL(args["base-url"]);
  const selectedViewports = (args.viewports ?? "mobile,desktop").split(",");
  for (const viewport of selectedViewports) if (!viewports[viewport]) throw new Error(`Unknown viewport: ${viewport}`);
  const routes = (args.routes ?? defaultRoutes.join(",")).split(",").map((route) => route.trim()).filter(Boolean);
  const samples = Number(args.samples ?? 3);
  if (!Number.isInteger(samples) || samples < 3) throw new Error("Use at least three samples for a comparable run.");

  const playwright = await loadPlaywright(args["tool-root"] ?? process.env.QUALITY_TOOLS_ROOT);
  const browser = await playwright.chromium.launch({ headless: true });
  const results = [];
  try {
    for (const route of routes) {
      for (const viewport of selectedViewports) {
        for (let sample = 1; sample <= samples; sample += 1) {
          results.push(await runSample(browser, base.toString(), args.build, route, viewport, sample));
        }
      }
    }
  } finally {
    await browser.close();
  }

  const groups = [];
  for (const route of routes) {
    for (const viewport of selectedViewports) {
      const group = results.filter((result) => result.route === route && result.viewport.name === viewport);
      const metrics = ["paint.fcpMs", "paint.lcpMs", "paint.cls", "resources.transferBytes", "resources.scriptTransferBytes", "execution.scriptDurationMs", "navigation.domContentLoadedMs", "navigation.loadEventMs", "loading.hydrationMs", "loading.inflightScriptRequestCountAtSettle"];
      const summary = {};
      for (const metric of metrics) {
        const validGroup = group.filter(isGoodSample);
        const values = validGroup.map((result) => metric.split(".").reduce((value, part) => value?.[part], result.observations)).filter(Number.isFinite);
        summary[metric] = { median: median(values), samples: values };
      }
      const successfulSamples = group.filter(isGoodSample).length;
      groups.push({ route, viewport, build: args.build, state: "cold-cache-4x-cpu-3g-lab-summary", requestedSamples: samples, completedSamples: group.length, successfulSamples, observations: summary });
    }
  }
  const report = {
    schemaVersion: 1,
    runner: "performance",
    build: args.build,
    baseUrl: base.toString(),
    capturedAt: new Date().toISOString(),
    browser: { name: "Chromium", version: browser.version() },
    environment: {
      cachePolicy: "disabled; new browser context per sample; service workers blocked",
      cpuThrottling: "4x",
      network: { ...networkProfile, downloadMbps: 1.6, uploadMbps: 0.75, description: "controlled simulated mobile network, lab-only" },
      reducedMotion: true,
      sampleCountPerRouteViewport: samples,
    },
    definition: {
      labLcp: "Largest Contentful Paint observed from navigation until capture, which waits for initial client:load hydration, 500 ms without same-origin script activity, then a fixed 2.5-second settle window. This is a lab capture window, not a field/Core Web Vitals result.",
      cls: "Cumulative Layout Shift observed through the same settle window; entries with recent input excluded.",
      jsExecution: "Chromium Performance domain ScriptDuration delta over navigation and the fixed settle window.",
      hydration: "Elapsed milliseconds from navigation start until all initial client:load Astro islands remove their SSR marker.",
      knownThirdPartyErrors: "The exact YouTube embed TypeError is reported with its stack and excluded from first-party error gating only when its stack points to youtube-nocookie.com.",
      limitations: "These are repeatable local lab samples, not field/Core Web Vitals data. Resource Timing transfer sizes can omit cross-origin resources without Timing-Allow-Origin.",
    },
    results,
    summaries: groups,
  };
  const outputPath = path.join(path.resolve(args.out), "performance-report.json");
  await saveJson(outputPath, report);
  const invalidSamples = results.filter((result) => !isGoodSample(result));
  const insufficientGroups = groups.filter((group) => group.successfulSamples < 3);
  process.stdout.write(`${JSON.stringify({ status: invalidSamples.length || insufficientGroups.length ? "fail" : "captured", report: outputPath, samples: results.length, invalidSamples: invalidSamples.length, groups: groups.length, groupsBelowThreeGoodSamples: insufficientGroups.length }, null, 2)}\n`);
  if (invalidSamples.length || insufficientGroups.length) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  run().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
