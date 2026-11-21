import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { checkBuiltTwins } from "../../scripts/quality/md-twins-built.mjs";

function htmlPage({ title, h1, h2 = [], h3 = [], links = [], graph = [] }) {
  const ld = JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
  return `<!doctype html><html><head><title>${title}</title><script type="application/ld+json">${ld}</script></head><body>
<nav><a href="https://nav.example/skip">nav</a></nav>
<main id="main-content"><h1>${h1}</h1>${h2.map((text) => `<h2>${text}</h2>`).join("")}${h3.map((text) => `<h3>${text}</h3>`).join("")}${links.map((href) => `<a href="${href}">x</a>`).join("")}</main>
<footer><a href="https://footer.example/x">footer</a></footer></body></html>`;
}

const crumbs = (...names) => ({ "@type": "BreadcrumbList", itemListElement: names.map((name, index) => ({ "@type": "ListItem", position: index + 1, name })) });

const frontmatter = `---
projectName: "Alpha"
machineQuestions:
  - heading: "What is Alpha?"
    answer: "An answer."
  - heading: "Why does Alpha exist?"
    answer: "Another answer."
metrics:
  - label: "Surface"
    value: "Verified Alpha Value"
    status: "verified"
  - label: "Held"
    value: "Secret Held Value"
    status: "do-not-publish"
  - label: "Open"
    value: "TBD"
    status: "needs-oak"
---
`;

const files = {
  "dist/index.html": htmlPage({ title: "Steve Oak | Applied AI", h1: "Hi, I am Steve", h3: ["Alpha"], graph: [crumbs("Home")] }),
  "dist/index.md": "# Steve Oak / Okkar Kyaw\n\n## Overview\n\n### Alpha\n",
  "dist/work/index.html": htmlPage({
    title: "Case Studies | Steve Oak",
    h1: "Work that shaped me",
    h2: ["Case studies"],
    h3: ["Alpha"],
    links: ["https://legacy.example/one"],
    graph: [{ "@type": "ItemList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Alpha" }] }, crumbs("Home", "Work")],
  }),
  "dist/work.md": "# Work | Steve Oak\n\n## Case studies\n\n### Alpha\n\nhttps://legacy.example/one\n",
  "dist/work/alpha/index.html": htmlPage({
    title: "Alpha Agent | Steve Oak",
    h1: "Alpha: A Longer Title",
    h2: ["Why it matters"],
    links: ["https://source.example/alpha", "/work/beta"],
    graph: [{ "@type": ["TechArticle"], headline: "Alpha: A Longer Title", datePublished: "2026-01-02T00:00:00.000Z", dateModified: "2026-02-03T00:00:00.000Z" }, crumbs("Work", "Alpha")],
  }),
  "dist/work/alpha.md": [
    "# Alpha | Steve Oak case study",
    "### What is Alpha?",
    "### Why does Alpha exist?",
    "- Published: 2026-01-02",
    "- Updated: 2026-02-03",
    "- Surface: Verified Alpha Value",
    "- Source: https://source.example/alpha",
    "",
  ].join("\n"),
  "dist/404.html": htmlPage({ title: "Page not found | Steve Oak", h1: "This page is not here." }),
  "dist/404.md": "# Page not found | Steve Oak\n\n## Overview\n",
  "dist/skill.md": "# Steve Oak\n\n- Alpha: https://steveoak.com/work/alpha.md\n",
  "content/work/alpha.mdx": frontmatter,
};

function fixture(patch = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "md-twins-built-"));
  const merged = { ...files, ...patch };
  for (const [relative, text] of Object.entries(merged)) {
    if (text === undefined) continue;
    const file = path.join(dir, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return dir;
}

function violations(patch) {
  const dir = fixture(patch);
  try {
    return checkBuiltTwins({ dist: path.join(dir, "dist"), contentDir: path.join(dir, "content/work") });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const edited = (name, change) => change(files[name]);

test("a twin that matches its built page has no violations", () => {
  assert.deepEqual(violations(), []);
});

test("a case-study twin missing a question heading fails", () => {
  const found = violations({ "dist/work/alpha.md": edited("dist/work/alpha.md", (md) => md.replace("### What is Alpha?\n", "")) });
  assert.deepEqual(found, ["work/alpha: heading missing: What is Alpha?"]);
});

test("a twin that drops a heading its page shows fails", () => {
  const found = violations({ "dist/work.md": edited("dist/work.md", (md) => md.replace("## Case studies\n\n", "")) });
  assert.deepEqual(found, ["work: heading missing: Case studies"]);
});

test("a home twin that drops a work entry heading its page shows fails", () => {
  const found = violations({ "dist/index.md": edited("dist/index.md", (md) => md.replace("### Alpha\n", "")) });
  assert.deepEqual(found, ["index: heading missing: Alpha"]);
});

test("a twin carrying a held metric value fails", () => {
  const found = violations({ "dist/work/alpha.md": `${files["dist/work/alpha.md"]}- Reliability: Secret Held Value\n` });
  assert.deepEqual(found, ["work/alpha: held metric: Secret Held Value"]);
});

test("a held metric in any twin fails, not only the case study", () => {
  const found = violations({ "dist/skill.md": `${files["dist/skill.md"]}Secret Held Value\n` });
  assert.deepEqual(found, ["skill: held metric: Secret Held Value"]);
});

test("a twin carrying a local path fails", () => {
  const found = violations({ "dist/work/alpha.md": `${files["dist/work/alpha.md"]}Source: /Users/oak/Downloads/notes.md\n` });
  assert.deepEqual(found, ["work/alpha: internal text: /Users/"]);
});

test("a twin carrying an internal note fails", () => {
  const found = violations({ "dist/404.md": `${files["dist/404.md"]}\nClaim safety notes live in the workpad.\n` });
  assert.deepEqual(found, ["404: internal text: Claim safety", "404: internal text: workpad"]);
});

test("a twin missing an outbound link from its page main content fails", () => {
  const found = violations({ "dist/work/alpha.md": edited("dist/work/alpha.md", (md) => md.replace("- Source: https://source.example/alpha\n", "")) });
  assert.deepEqual(found, ["work/alpha: link missing: https://source.example/alpha"]);
});

test("links outside main content and on-site links are not required", () => {
  const twin = files["dist/work/alpha.md"];
  assert.ok(!twin.includes("nav.example") && !twin.includes("footer.example") && !twin.includes("/work/beta"));
  assert.deepEqual(violations(), []);
});

test("a case-study twin missing the published or updated date fails", () => {
  const noPublished = violations({ "dist/work/alpha.md": edited("dist/work/alpha.md", (md) => md.replace("2026-01-02", "")) });
  const noUpdated = violations({ "dist/work/alpha.md": edited("dist/work/alpha.md", (md) => md.replace("2026-02-03", "")) });
  assert.deepEqual(noPublished, ["work/alpha: date missing: 2026-01-02"]);
  assert.deepEqual(noUpdated, ["work/alpha: date missing: 2026-02-03"]);
});

test("a case-study twin missing a verified metric value fails", () => {
  const found = violations({ "dist/work/alpha.md": edited("dist/work/alpha.md", (md) => md.replace("Verified Alpha Value", "something else")) });
  assert.deepEqual(found, ["work/alpha: metric missing: Verified Alpha Value"]);
});

test("a twin whose H1 no longer names its page fails", () => {
  const found = violations({ "dist/work/alpha.md": edited("dist/work/alpha.md", (md) => md.replace("# Alpha | Steve Oak case study", "# Gamma | Steve Oak case study")) });
  assert.deepEqual(found, ["work/alpha: h1 does not name its page: Gamma | Steve Oak case study"]);
});

test("a page without a twin and a twin without a page both fail", () => {
  const noTwin = violations({ "dist/work/alpha.md": undefined });
  const noPage = violations({ "dist/work/ghost.md": "# Ghost | Steve Oak case study\n" });
  assert.deepEqual(noTwin, ["work/alpha: built page has no twin"]);
  assert.deepEqual(noPage, ["work/ghost: twin has no built page"]);
});

test("the skill twin must name every case study the work page lists", () => {
  const found = violations({ "dist/skill.md": "# Steve Oak\n" });
  assert.deepEqual(found, ["skill: case study missing: Alpha"]);
});

test("a missing dist fails instead of passing quietly", () => {
  assert.throws(() => checkBuiltTwins({ dist: path.join(tmpdir(), "md-twins-built-absent"), contentDir: tmpdir() }), /not a built site/);
});
