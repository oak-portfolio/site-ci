import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// Ticket 33: Table(claims, kind) lays cited records out as a table, behind oakTableBlock.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const flag = loadTsx("src/lib/oakFlags/table.ts");
const { primeOakRecordFacts } = loadTsx("src/lib/oakRecordFacts.ts");
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
const { oakSiteInventory, oakSitePublicPath } = loadTsx("src/data/oakSiteInventory.ts");

const REVISION = "k";
const cite = (documentId, url) => ({ documentId, passageId: `${documentId}:passage-001`, sectionId: documentId, url });
const work = slug => cite(`work:${slug}`, `https://steveoak.com/work/${slug}/`);
const facts = (category, datePublished, stack, oak) => ({ kind: "work", category, datePublished, systemMap: stack.map(label => ({ label, description: label })), ownership: { oak, collaborators: [] } });
const RECORDS = {
  "work:ecosmartloop": facts("Mobile app", "2025-04-01", ["Next.js", "Supabase"], ["Product direction", "Dataset and labeling pipeline"]),
  "work:oakminder": facts("Productivity app", "2025-09-01", ["Convex", "Expo"], ["Everything end to end"]),
};
const seed = (records = RECORDS) => primeOakRecordFacts(REVISION, { version: 1, knowledgeRevision: REVISION, records });
const render = (claims, kind, question = "Compare EcoSmartLoop and Oakminder") => renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m1", question, latest: true,
  answer: { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: REVISION, operations: [], kind: "sourced", acknowledgment: null, claims },
  ui: { requestId: "00000000-0000-4000-8000-0000000000c3", status: "done", program: `root = Answer([t])\nt = Table([${claims.map(claim => `"${claim.id}"`).join(", ")}], "${kind}")` } }));
const on = fn => { flag.forceOakTableBlock(true); try { return fn(); } finally { flag.forceOakTableBlock(null); } };
const count = (html, text) => html.split(text).length - 1;
const PAIR = [{ id: "claim-1", text: "EcoSmartLoop is a recycling app Steve led.", citations: [work("ecosmartloop")] },
  { id: "claim-2", text: "Oakminder is a reminders app Steve built alone.", citations: [work("oakminder")] }];

// The block's view loads in its own chunk; one render starts that import, and later renders get the settled view.
on(() => render(PAIR, "matrix"));
await new Promise(setImmediate);

test("constant: oakTableBlock ships true and a force flips it", () => {
  assert.equal(flag.oakTableBlock, true);
  assert.equal(flag.oakTableBlockOn(), true);
  flag.forceOakTableBlock(false);
  assert.equal(flag.oakTableBlockOn(), false);
  flag.forceOakTableBlock(null);
  assert.equal(flag.oakTableBlockOn(), true);
});

test("matrix: a caption, scope=col heads, one row per record, every claim once", () => {
  seed();
  const html = on(() => render(PAIR, "matrix"));
  assert.match(html, /<table[^>]*>\s*<caption/);
  assert.ok(count(html, '<th scope="col"') >= 3, "column heads carry scope=col");
  assert.equal(count(html, '<tr data-record'), 2, "one row per cited record");
  assert.match(html, /Next\.js/);
  assert.match(html, /Everything end to end/);
  assert.doesNotMatch(html, /Dataset and labeling pipeline/, "Steve's part is the record's first ownership line, never a stuffed cell");
  for (const claim of PAIR) assert.equal(count(html, claim.text), 1, `${claim.id} placed once`);
  assert.ok(count(html, "data-label=") >= 6, "every cell names its column for the stacked reflow");
});

test("sctable: career contexts by type and engagement, from the career timeline", () => {
  seed();
  const claims = [{ id: "claim-1", text: "Steve worked at HyperSkalers on contract.", citations: [cite("experience:hyperskalers", "https://steveoak.com/work#hyperskalers")] },
    { id: "claim-2", text: "Steve was full time at PNPP Solutions.", citations: [cite("experience:pnppsolutions", "https://steveoak.com/work#pnppsolutions")] }];
  const html = on(() => render(claims, "sctable", "Which roles were contract and which were full time?"));
  assert.match(html, /<caption/);
  assert.match(html, />Contract</);
  assert.match(html, />Full-time</);
  assert.match(html, /HyperSkalers/);
  assert.equal(count(html, '<tr data-record'), 2);
});

test("smap: lists only sitemap pages and no private route", () => {
  seed();
  const claims = [{ id: "claim-1", text: "The site has a home page and a work page.", citations: [cite("profile:steve-oak", "https://steveoak.com/"), cite("experience:oaklabs", "https://steveoak.com/work#oaklabs")] },
    { id: "claim-2", text: "There is a privacy page.", citations: [cite("page:privacy", "https://steveoak.com/privacy")] }];
  const html = on(() => render(claims, "smap", "What pages does the site have?"));
  assert.equal(count(html, '<tr data-record'), 2, "home and work, not privacy");
  assert.doesNotMatch(html.replace(/There is a privacy page\./, ""), /privacy/i);
  for (const page of oakSiteInventory) assert.ok(oakSitePublicPath(page.path), `${page.path} is a sitemap page`);
  for (const path of ["/privacy", "/owner/services", "/oak/gallery", "/dev/oak-states", "/api/md"]) assert.equal(oakSitePublicPath(path), false, path);
});

test("the inventory matches the pages and data-oak-section tags in src", () => {
  const tags = new Set();
  const walk = dir => { for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(path); else if (/\.(astro|tsx)$/.test(entry.name)) for (const match of readFileSync(path, "utf8").matchAll(/data-oak-section="([a-z0-9.-]+)"/g)) tags.add(match[1]);
  } };
  walk("src/components"); walk("src/pages");
  for (const page of oakSiteInventory) for (const section of page.sections) assert.ok(tags.has(section.tag), `${section.tag} is tagged in src`);
  // Every static public HTML route in src/pages is listed, so a new page fails here; Kusala Daily is its own app with no agent sections.
  const routes = [];
  const pages = dir => { for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) pages(path); else if (entry.name.endsWith(".astro") && !entry.name.includes("[")) routes.push(path.slice("src/pages".length).replace(/\.astro$/, "").replace(/\/index$/, "") || "/");
  } };
  pages("src/pages");
  const listed = routes.filter(oakSitePublicPath).filter(path => !path.startsWith("/apps/kusala-daily")).sort();
  assert.deepEqual(oakSiteInventory.map(page => page.path).sort(), listed);
});

test("the stylesheet reflows before columns squeeze, and column tints fade instead of cutting", () => {
  const css = readFileSync("src/styles/openui/table.css", "utf8");
  assert.match(css, /@container[^{]*\(max-width:/, "a container query stacks rows into cards");
  assert.match(css, /grid-template-columns:\s*repeat\(2,/, "a long row reflows to 2 columns and more rows");
  assert.doesNotMatch(css, /word-break:\s*break-all|overflow-x:\s*(auto|scroll)/, "no broken words and no sideways scroll");
  assert.match(css, /linear-gradient\([^)]*transparent/, "a column tint fades in from transparent");
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("the prompt description names no other component", () => {
  const { Table } = loadTsx("src/lib/openui/components/Table.tsx");
  const description = Table.description ?? Table.spec?.description ?? "";
  assert.ok(description.length > 0);
  assert.doesNotMatch(description, /\b(Compare|Stack|Prose|Points|Project|Role|Profile|Quote|Steps|Sources|Ownership|Timeline)\b/);
});

test("constant off, one record, or missing facts degrade to the plain list with every claim once", () => {
  seed();
  flag.forceOakTableBlock(false);
  const off = render(PAIR, "matrix");
  flag.forceOakTableBlock(null);
  const single = on(() => render([PAIR[0]], "matrix", "Tell me about EcoSmartLoop"));
  seed({});
  const missing = on(() => render(PAIR, "matrix"));
  for (const [name, html, claims] of [["constant off", off, PAIR], ["one record", single, [PAIR[0]]], ["no record facts", missing, PAIR]]) {
    assert.match(html, /<ul class="oak-openui__points"/, `${name}: the plain list`);
    assert.doesNotMatch(html, /<table|oak-table/, `${name}: no table`);
    for (const claim of claims) assert.equal(count(html, claim.text), 1, `${name}: ${claim.id} placed once`);
  }
});
