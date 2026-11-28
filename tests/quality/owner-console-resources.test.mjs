// Run: node --test tests/quality/owner-console-resources.test.mjs (part of npm run test:quality).
// The dev-only Public resources tab: it reads the six public files as served and draws them. Nothing here calls the network.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "../agent/design-rework/load-tsx.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const folder = "src/components/owner/console/resources";
const { resourceSources, createResourceStore } = loadTsx(`${folder}/store.ts`);

const sixPaths = ["/llms.txt", "/llms-full.txt", "/api/md", "/profile.json", "/skill.md", "/robots.txt"];

const llms = `# SteveOak.com

> Bay Area AI/design engineer building applied agentic AI systems.

## Primary Pages

- [Steve Oak / Okkar Kyaw](https://steveoak.com/): The home page.
  - Markdown: https://steveoak.com/index.md
- [Work | Steve Oak](https://steveoak.com/work): The Work index.
  - Markdown: https://steveoak.com/work.md

## Good Questions

- What does Steve build?
`;
const section = (title, facts, sourced) => `# ${title}
## Overview
A short overview.
## Key Facts
${facts.map((fact, i) => `- ${fact}: Detail.${i < sourced ? " [source: Profile]" : ""}`).join("\n")}
## Scope
- Public portfolio.
## Steve Oak's authored source excerpts
> First passage in Steve's own words.
> still the first passage

> Second passage.
`;
const llmsFull = `${llms}\n---\n\n${section("Steve Oak / Okkar Kyaw", ["Name", "Based", "Focus", "Taste"], 3)}\n${section("Work | Steve Oak", ["One", "Two"], 2)}
## Public credentials

### Google UX Design Professional Certificate

The issuer records completion on 2021-04-14 and lists seven completed courses. A second sentence.

[Issuer source](https://www.coursera.org/account/accomplishments/professional-cert/ABC)

### High Fidelity UI Design 2

The issuer reports successful completion.

[Issuer source](https://hype4.academy/certificate/mobile-ui-2/xyz)

Scope notes:

- The certificate uses another name.
- Certificate page says the final exercise was reviewed, tested, and approved.
`;
const profile = JSON.stringify({ "@type": "Person", version: "oak-abc123def4567890", name: "Steve Oak", alternateName: ["Oak", "Okkar Kyaw"], url: "https://steveoak.com/",
  description: "Bay Area AI/design engineer.", jobTitle: "Applied AI systems and design engineer", homeLocation: { "@type": "Place", name: "Bay Area" },
  knowsAbout: ["Applied AI systems", "Design engineering"], sameAs: ["https://x.com/ForbiddenSteve", "https://github.com/Absorber97"], subjectOf: [{ name: "A" }, { name: "B" }, { name: "C" }],
  internalNote: "do not show this" }, null, 2);
const skill = `# Steve Oak

metadata:
  canonical_profile: https://steveoak.com/profile.json
  supported_actions: copy_markdown, ask_chatgpt, ask_claude, ask_perplexity

Steve Oak, also called Oak or Okkar Kyaw, builds applied AI systems.

## Good Fit

- Bay Area AI teams looking for product-minded applied AI systems work.
- Founders who need cost-aware RAG/tool workflows.

## Public Pages

- Home: https://steveoak.com/
- Work: https://steveoak.com/work

## Scope

- Treat SteveOak.com as a personal portfolio.
`;
const robots = `# Public indexing is open for search. Training-bot access follows the site owner's policy.
User-agent: *
Allow: /
Disallow: /api/oak/

User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

Sitemap: https://steveoak.com/sitemap-index.xml
`;
const md = `# Steve Oak / Okkar Kyaw
## Overview
Steve Oak is Okkar Kyaw.
## Key Facts
- Name: Steve Oak.
`;
const served = { "/llms.txt": [llms, "text/plain; charset=utf-8"], "/llms-full.txt": [llmsFull, "text/plain; charset=utf-8"], "/api/md": [md, "text/markdown; charset=utf-8"],
  "/profile.json": [profile, "application/json; charset=utf-8"], "/skill.md": [skill, "text/markdown; charset=utf-8"], "/robots.txt": [robots, "text/plain; charset=utf-8"] };

const recorder = (overrides = {}) => {
  const calls = [];
  const fetchStub = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const [body, type] = overrides[String(url)] ?? served[String(url)] ?? ["", "text/html"];
    const status = overrides[String(url)]?.[2] ?? (served[String(url)] ? 200 : 404);
    return { ok: status < 300, status, headers: { get: name => name.toLowerCase() === "content-type" ? type : null }, text: async () => body, body: null };
  };
  return { calls, fetchStub };
};
const settled = async store => { store.load(); await new Promise(resolve => setTimeout(resolve, 0)); await new Promise(resolve => setTimeout(resolve, 0)); return store.getSnapshot(); };

test("the tab reads only the six public files, each once, with a plain GET and no body", async () => {
  assert.deepEqual(resourceSources.map(source => source.path), sixPaths);
  const { calls, fetchStub } = recorder();
  const store = createResourceStore(fetchStub);
  const snapshot = await settled(store);
  assert.deepEqual(calls.map(call => call.url).sort(), [...sixPaths].sort());
  for (const { init } of calls) {
    assert.ok(!init.method || init.method === "GET", "GET only");
    assert.equal(init.body, undefined);
    assert.equal(init.redirect, "error");
    assert.equal(init.cache, "no-store");
  }
  for (const path of sixPaths) assert.equal(snapshot[path].state, "ready", path);
  store.load();
  assert.equal(calls.length, 6, "a second load while a read is held does not fetch again");
});

test("a wrong status or content type is a failed read, and a retry keeps the last good text", async () => {
  const { fetchStub } = recorder({ "/profile.json": ["<html>", "text/html", 404] });
  const store = createResourceStore(fetchStub);
  const snapshot = await settled(store);
  assert.equal(snapshot["/profile.json"].state, "failed");
  assert.equal(snapshot["/profile.json"].last, null);
  assert.equal(snapshot["/llms.txt"].state, "ready");
  const html = recorder({ "/robots.txt": [robots, "text/html"] });
  assert.equal((await settled(createResourceStore(html.fetchStub)))["/robots.txt"].state, "failed", "HTML where text was promised");
  let healthy = true;
  const flaky = createResourceStore(async (url, init) => {
    if (!healthy) throw new TypeError("offline");
    return recorder().fetchStub(url, init);
  });
  await settled(flaky);
  healthy = false;
  flaky.reload();
  await new Promise(resolve => setTimeout(resolve, 0));
  const failed = flaky.getSnapshot()["/llms.txt"];
  assert.equal(failed.state, "failed");
  assert.equal(failed.last.text, llms, "the last good read stays on screen");
});

const { buildModel } = loadTsx(`${folder}/model.ts`);
const ready = (text, at = Date.UTC(2026, 10, 5, 12, 0)) => ({ state: "ready", text, bytes: Buffer.byteLength(text), at });
const readAll = (overrides = {}) => Object.fromEntries(sixPaths.map(p => [p, overrides[p] ?? ready(served[p][0])]));
const idleAll = () => Object.fromEntries(sixPaths.map(p => [p, { state: "idle" }]));
const model = (overrides) => buildModel(readAll(overrides));

test("every file row carries its size, line and heading counts and the first lines as served", () => {
  const { files } = model();
  assert.deepEqual(files.map(file => file.path), sixPaths);
  const home = files.find(file => file.path === "/llms.txt");
  assert.equal(home.state, "ready");
  assert.equal(home.lines, 14);
  assert.equal(home.headings, 3);
  assert.deepEqual(home.topics, ["SteveOak.com", "Primary Pages", "Good Questions"]);
  assert.equal(home.preview[0], "# SteveOak.com");
  assert.ok(home.preview.length <= 12, "the viewer stays short");
  assert.match(home.size, /^\d+(\.\d)? (B|KB)$/);
  const json = files.find(file => file.path === "/profile.json");
  assert.deepEqual(json.topics.slice(0, 3), ["@type", "version", "name"], "JSON lists its top-level keys");
  assert.equal(files.find(file => file.path === "/robots.txt").headings, 0);
});

test("profile.json reads as a record and drops every field it does not name", () => {
  const { profile } = model();
  assert.equal(profile.state, "ready");
  assert.deepEqual(profile.data, { name: "Steve Oak", alternateNames: ["Oak", "Okkar Kyaw"], jobTitle: "Applied AI systems and design engineer", home: "Bay Area",
    url: "https://steveoak.com/", description: "Bay Area AI/design engineer.", knowsAbout: ["Applied AI systems", "Design engineering"],
    profiles: ["x.com", "github.com"], articles: 3, revision: "oak-abc123def456" });
  assert.ok(!JSON.stringify(model()).includes("do not show this"));
  assert.equal(model({ "/profile.json": ready("{ not json") }).profile.state, "failed");
});

test("skill.md shows its metadata, its good fit and an outline of its sections", () => {
  const { skill } = model();
  assert.equal(skill.state, "ready");
  assert.equal(skill.data.intro, "Steve Oak, also called Oak or Okkar Kyaw, builds applied AI systems.");
  assert.deepEqual(skill.data.actions, ["copy_markdown", "ask_chatgpt", "ask_claude", "ask_perplexity"]);
  assert.equal(skill.data.canonical, "https://steveoak.com/profile.json");
  assert.deepEqual(skill.data.fit, ["Bay Area AI teams looking for product-minded applied AI systems work.", "Founders who need cost-aware RAG/tool workflows."]);
  assert.deepEqual(skill.data.outline, [{ title: "Good Fit", items: 2 }, { title: "Public Pages", items: 2 }, { title: "Scope", items: 1 }]);
});

test("robots.txt reads as who may read the site: open, open with an exception, or blocked", () => {
  const { robots } = model();
  assert.equal(robots.state, "ready");
  assert.equal(robots.data.lead, "Public indexing is open for search. Training-bot access follows the site owner's policy.");
  assert.deepEqual(robots.data.groups, [
    { agent: "*", verdict: "open", rules: ["Allow /", "Disallow /api/oak/"] },
    { agent: "GPTBot", verdict: "blocked", rules: ["Disallow /"] },
    { agent: "ClaudeBot", verdict: "blocked", rules: ["Disallow /"] }]);
  assert.deepEqual(robots.data.sitemaps, ["https://steveoak.com/sitemap-index.xml"]);
});

test("pages count what the public files hold and stop at the credentials section", () => {
  const { pages } = model();
  assert.equal(pages.state, "ready");
  assert.deepEqual(pages.data, [
    { title: "Steve Oak / Okkar Kyaw", route: "/", sections: 4, facts: 4, sourced: 3, passages: 2 },
    { title: "Work | Steve Oak", route: "/work", sections: 4, facts: 2, sourced: 2, passages: 2 }]);
});

test("certificates show the issuer, one sentence and a link only when the link is https", () => {
  const { credentials } = model();
  assert.deepEqual(credentials.data, [
    { title: "Google UX Design Professional Certificate", issuer: "coursera.org", summary: "The issuer records completion on 2021-04-14 and lists seven completed courses.",
      href: "https://www.coursera.org/account/accomplishments/professional-cert/ABC", scopeNotes: 0 },
    { title: "High Fidelity UI Design 2", issuer: "hype4.academy", summary: "The issuer reports successful completion.",
      href: "https://hype4.academy/certificate/mobile-ui-2/xyz", scopeNotes: 2 }]);
  const hostile = model({ "/llms-full.txt": ready(llmsFull.replace("https://hype4.academy/certificate/mobile-ui-2/xyz", "javascript:alert(1)")) });
  assert.equal(hostile.credentials.data[1].href, null);
  assert.equal(hostile.credentials.data[1].issuer, null);
});

test("each view has its own state: loading before any read, failed with no earlier read, stale when an earlier read exists", () => {
  const blank = buildModel(idleAll());
  for (const key of ["profile", "skill", "robots", "pages", "credentials"]) assert.equal(blank[key].state, "loading", key);
  assert.ok(blank.files.every(file => file.state === "loading"));
  const failed = { state: "failed", reason: "status", status: 404, last: null, at: 1 };
  const down = model({ "/profile.json": failed });
  assert.deepEqual([down.profile.state, down.profile.reason, down.skill.state], ["failed", "status", "ready"]);
  const stale = model({ "/profile.json": { ...failed, last: ready(profile) } });
  assert.deepEqual([stale.profile.state, stale.profile.stale, stale.profile.data.name], ["ready", true, "Steve Oak"]);
  assert.equal(stale.files.find(file => file.path === "/profile.json").stale, true);
});

const { ResourcesBody } = loadTsx(`${folder}/ResourcesBody.tsx`);
const { OwnerConsole, consoleTabs } = loadTsx("src/components/owner/console/OwnerConsole.tsx");
const { fixtureReads } = loadTsx("src/components/owner/console/fixtures.ts");
const stylesheet = () => readFileSync(path.join(root, folder, "resources.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const body = (overrides, props = {}) => renderToStaticMarkup(React.createElement(ResourcesBody, { model: model(overrides), onRetry() {}, ...props }));
const words = html => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

test("the tab is the last console tab, reads no owner endpoint, and prints the same model as JSON", () => {
  const tab = consoleTabs.at(-1);
  assert.deepEqual([tab.id, tab.label, tab.reads], ["public", "Public resources", []]);
  const reads = fixtureReads("signed-out", Date.UTC(2026, 10, 5));
  const html = renderToStaticMarkup(React.createElement(OwnerConsole, { initialTab: "public", initialReads: reads, initialView: "json" }));
  const block = html.match(/<pre[^>]*data-console-json[^>]*>([\s\S]*?)<\/pre>/);
  assert.ok(block, "a JSON block, even signed out");
  const printed = JSON.parse(block[1].replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&"));
  assert.deepEqual(Object.keys(printed), ["checked", "files", "profile", "skill", "robots", "pages", "credentials"]);
});

test("the tab renders on its own while owner reads are signed out, loading until the first read lands", () => {
  const html = renderToStaticMarkup(React.createElement(OwnerConsole, { initialTab: "public", initialReads: fixtureReads("signed-out", Date.UTC(2026, 10, 5)) }));
  assert.doesNotMatch(words(html), /Signed out/);
  assert.match(words(html), /Reading the six public files/);
  for (const title of ["What the site publishes for AI assistants", "profile.json", "skill.md", "Who may read the site", "Pages and how much is reviewed", "Certificates", "Machine files"])
    assert.match(words(html), new RegExp(title), title);
});

test("each view draws its facts once the files are read", () => {
  const html = body();
  const text = words(html);
  const surfaces = html.slice(html.indexOf("What the site publishes"), html.indexOf("Machine files"));
  for (const file of ["llms.txt", "llms-full.txt", "api/md", "profile.json", "skill.md"]) assert.match(surfaces, new RegExp(file.replace(".", "\\.")), file);
  assert.match(text, /Steve Oak/);
  assert.match(text, /Applied AI systems and design engineer/);
  assert.match(text, /x\.com/);
  assert.match(text, /copy_markdown/);
  assert.match(text, /Founders who need cost-aware RAG\/tool workflows/);
  assert.match(text, /Every other crawler/);
  assert.match(text, /GPTBot/);
  assert.match(text, /3 of 4 facts name a source/);
  assert.match(text, /Google UX Design Professional Certificate/);
  assert.match(text, /coursera\.org/);
});

test("the page review shows counts and titles only, never a note or comment from the file body", () => {
  const hostile = llmsFull.replace("A short overview.", "INTERNAL NOTE do not publish. Review comment: fix this wording.").replace("- Public portfolio.", "- Reviewer note: private draft text.");
  const html = body({ "/llms-full.txt": ready(hostile) });
  const review = html.slice(html.indexOf("Pages and how much is reviewed"), html.indexOf("Certificates"));
  assert.ok(review.length > 100, "found the review view");
  assert.doesNotMatch(review, /INTERNAL NOTE|Review comment|Reviewer note|private draft/);
  assert.match(words(review), /Steve Oak \/ Okkar Kyaw/);
  assert.match(words(review), /4 sections/);
  assert.match(words(review), /2 passages/);
});

test("a view that fails says what failed and offers Retry; a stale view says so", () => {
  const failed = { state: "failed", reason: "status", status: 404, last: null, at: 1 };
  const html = body({ "/profile.json": failed });
  assert.match(words(html), /profile\.json could not be read \(404\)/);
  assert.match(html, /<button[^>]*>[\s\S]*?Retry/);
  assert.match(words(html), /Applied AI systems|skill\.md/, "the other views still draw");
  const stale = body({ "/robots.txt": { ...failed, last: ready(robots) } });
  assert.match(words(stale), /Stale/);
  assert.match(words(stale), /GPTBot/);
});

test("the machine files view is a tablist of the six files with the first open and a short wrapped preview", () => {
  const html = body();
  assert.match(html, /role="tablist"[^>]*aria-label="Public files"/);
  const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>([\s\S]*?)<\/button>/g)];
  assert.deepEqual(tabs.map(match => words(match[1]).trim()), ["llms.txt", "llms-full.txt", "api/md", "profile.json", "skill.md", "robots.txt"]);
  assert.deepEqual(tabs.map(match => /aria-selected="true"/.test(match[0])), [true, false, false, false, false, false], "the first file is open and only it is selected");
  assert.equal([...html.matchAll(/role="tabpanel"/g)].length, 1, "only the open file is in the page");
  assert.match(html, /<pre[^>]*tabindex="0"[^>]*aria-label="llms\.txt, first lines"/);
  assert.match(words(html), /Showing the first \d+ of 14 lines/);
});

test("every link goes to one of the six files as served or to an https issuer record, and nothing writes", () => {
  const html = body();
  const hrefs = [...html.matchAll(/<a[^>]*href="([^"]+)"/g)].map(match => match[1].replace(/&amp;/g, "&"));
  assert.ok(hrefs.length >= 6);
  for (const href of hrefs) assert.ok(sixPaths.includes(href) || /^https:\/\//.test(href), href);
  assert.doesNotMatch(html, /<form|method="post"|type="submit"/i);
  for (const file of ["store.ts", "model.ts", "parse.ts", "ResourcesBody.tsx"]) assert.doesNotMatch(readFileSync(path.join(root, folder, file), "utf8"), /POST|PUT|DELETE|PATCH|method:\s*['"](?!GET)/, file);
});

test("code blocks wrap at 390, motion respects the reduced setting and forced colors keep the open tab visible", () => {
  const css = stylesheet();
  const rules = [...css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map(([, selector, rule]) => ({ selector: selector.trim(), rule }));
  const code = rules.filter(({ selector }) => /\bpre\b|__code/.test(selector) && !/:focus/.test(selector));
  assert.ok(code.length > 0, "a rule for the code block");
  for (const { selector, rule } of code) {
    assert.match(rule, /white-space:\s*pre-wrap/, selector);
    assert.match(rule, /overflow-wrap:\s*anywhere/, selector);
  }
  const outside = css.replace(/@media \(prefers-reduced-motion: no-preference\)\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  assert.doesNotMatch(outside, /transition|animation/, "motion only inside no-preference");
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*aria-selected="true"/);
  const light = /background(-color)?\s*:[^;]*(#fff\b|#ffffff|\bwhite\b|var\(--text\))/i;
  for (const { selector, rule } of rules) if (light.test(rule)) assert.match(selector, /aria-selected|data-selected/, `light fill on ${selector}`);
});
