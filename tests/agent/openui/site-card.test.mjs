import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { createLoader, loadTsx } from "../design-rework/load-tsx.mjs";

// Ticket 59: SiteCard(claims, kind) answers a public Site library item in its own look, behind oakSiteCard.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const flag = loadTsx("src/lib/oakFlags/siteCard.ts");
const { oakSiteItem } = loadTsx("src/lib/openui/components/site/items.ts");
const { OakArrangedAnswer, oakSiteLink } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
const { primeOakRecordFacts } = loadTsx("src/lib/oakRecordFacts.ts");
const server = createLoader({ stubs: { "@/lib/workContent": { getWorkEntries: async () => [], getWorkSlug: () => "" } }, interop: true });
const { oakAppFacts, oakAppPages } = server("src/lib/oakRecordFacts.server.ts");
const kusalaDailyPageConfigs = oakAppPages();
const owners = JSON.parse(readFileSync("knowledge/owners.json", "utf8")).owners;

const REVISION = "k";
const APP = oakAppFacts(oakSiteItem("app", owners), kusalaDailyPageConfigs);
const seed = records => primeOakRecordFacts(REVISION, { version: 1, knowledgeRevision: REVISION, records });
seed({ "resource:kusala-daily": APP });
const cite = (id, url) => ({ documentId: id, passageId: `${id}:passage-001`, sectionId: id, url });
const CLAIMS = [
  { id: "claim-1", text: "Kusala Daily is a calm daily practice app.", citations: [cite("resource:kusala-daily", "https://steveoak.com/apps/kusala-daily/")] },
  { id: "claim-2", text: "The site publishes llms.txt and profile.json for AI assistants.", citations: [cite("profile:steve-oak", "https://steveoak.com/")] },
  { id: "claim-3", text: "Steve leads OakLabs.", citations: [cite("experience:oaklabs", "https://steveoak.com/work#oaklabs")] },
];
const LABELS = { knowledgeRevision: REVISION, documents: [
  { documentId: "resource:kusala-daily", title: "Kusala Daily", canonicalUrl: "https://steveoak.com/apps/kusala-daily/" },
  { documentId: "profile:steve-oak", title: "Steve Oak", canonicalUrl: "https://steveoak.com/" },
  { documentId: "experience:oaklabs", title: "OakLabs", canonicalUrl: "https://steveoak.com/work#oaklabs" }] };
const answerOf = claims => ({ schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: REVISION, operations: [],
  kind: "sourced", acknowledgment: null, claims });
const render = (ids, kind, status = "done") => renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m1", answer: answerOf(CLAIMS.filter(claim => ids.includes(claim.id))),
  question: "Q", latest: true, citationLabels: LABELS,
  ui: { requestId: "00000000-0000-4000-8000-0000000000e1", status, program: `root = Answer([site])\nsite = SiteCard(${JSON.stringify(ids)}, "${kind}")` } }));
const on = fn => { flag.forceOakSiteCard(true); try { return fn(); } finally { flag.forceOakSiteCard(null); } };
const off = fn => { flag.forceOakSiteCard(false); try { return fn(); } finally { flag.forceOakSiteCard(null); } };
const count = (html, text) => html.split(text).length - 1;
const placed = (html, ids) => ids.every(id => count(html, CLAIMS.find(claim => claim.id === id).text) === 1);

// The kind views load in their own chunk; one render starts that import, and later renders get the settled view.
on(() => render(["claim-1"], "app"));
await new Promise(setImmediate);

test("constant: oakSiteCard is pinned in flag-pins, and a force flips it both ways", () => {
  flag.forceOakSiteCard(true);
  assert.equal(flag.oakSiteCardOn(), true);
  flag.forceOakSiteCard(null);
  assert.equal(flag.oakSiteCardOn(), flag.oakSiteCard);
  flag.forceOakSiteCard(false);
  assert.equal(flag.oakSiteCardOn(), false);
  flag.forceOakSiteCard(null);
  assert.equal(flag.oakSiteCardOn(), flag.oakSiteCard);
});

test("items: each kind draws only from an approved item whose channels include answer", () => {
  for (const kind of ["app", "resource", "section", "career-rail", "proof", "social"]) assert.ok(oakSiteItem(kind, owners), `${kind} has an answer item`);
  for (const kind of ["mascot", "tour", "now", "digest"]) assert.equal(oakSiteItem(kind, owners), null, `${kind} has no answer item on the site`);
  const swap = (id, change) => owners.map(owner => owner.id === id ? { ...owner, ...change } : owner);
  for (const status of ["draft", "held", "planned"]) assert.equal(oakSiteItem("app", swap("kusala", { status, channels: [] })), null, `${status} never renders`);
  assert.equal(oakSiteItem("app", swap("kusala", { channels: ["page", "ai-files"] })), null, "no answer channel, no card");
  assert.equal(oakSiteItem("app", owners.filter(owner => owner.id !== "kusala")), null, "a missing owner never renders");
});

test("app: the app card links to its own page with the claim placed once", () => {
  const html = on(() => render(["claim-1"], "app"));
  assert.match(html, /class="oak-site oak-openui-card" data-kind="app"/);
  assert.match(html, /href="\/apps\/kusala-daily"/);
  assert.ok(placed(html, ["claim-1"]));
});

test("app: the card draws its name, pages, three App facts and the privacy line from the record facts, and no status line", () => {
  const html = on(() => render(["claim-1"], "app"));
  assert.equal(count(html, "oak-site__fact\""), 3, "three fact chips");
  for (const fact of ["iPhone and iPad", "iOS and iPadOS 16.0", "Free"]) assert.ok(html.includes(fact), fact);
  assert.match(html, /class="oak-site__privacy">No data collected or tracked/, "the privacy line is plain text: a shield beside it reads as a verified claim and doubles the card icon");
  assert.doesNotMatch(html, /oak-site__status|Live on the site|In release preparation/, "no status line until a reviewed knowledge revision carries one");
  for (const href of ["/apps/kusala-daily/support", "/apps/kusala-daily/privacy"]) assert.match(html, new RegExp(`href="${href}"`));
  const swapped = { ...APP, name: "Other App", facts: ["Alpha"], privacy: undefined, pages: [{ label: "Help", href: "/apps/kusala-daily/support" }] };
  seed({ "resource:kusala-daily": swapped });
  try {
    const other = on(() => render(["claim-1"], "app"));
    assert.ok(other.includes("Other App") && other.includes("Alpha") && other.includes(">Help<"), "the card reads the projection, not authored copy");
    assert.doesNotMatch(other, /oak-site__privacy|iPhone and iPad/, "a missing field draws nothing");
    seed({});
    const none = on(() => render(["claim-1"], "app"));
    assert.doesNotMatch(none, /data-kind="app"/, "no app record, no card");
    assert.ok(placed(none, ["claim-1"]), "the claim still shows once");
  } finally { seed({ "resource:kusala-daily": APP }); }
});

test("app projection: built from the owner's outputs and the reviewed page configs; a changed output reaches it, a missing one draws nothing", () => {
  const kusala = owners.find(owner => owner.id === "kusala");
  const app = outputs => oakAppFacts(oakSiteItem("app", owners.map(owner => owner === kusala ? { ...kusala, outputs } : owner)), kusalaDailyPageConfigs);
  assert.deepEqual(APP, { kind: "app", name: "Kusala Daily", path: "/apps/kusala-daily", facts: ["iPhone and iPad", "iOS and iPadOS 16.0", "Free"],
    privacy: "No data collected or tracked", pages: [{ label: "Support", href: "/apps/kusala-daily/support" }, { label: "Privacy", href: "/apps/kusala-daily/privacy" }] });
  assert.deepEqual(app(kusala.outputs).pages.map(page => page.label), ["Support", "Privacy"]);
  assert.deepEqual(app(["/apps/kusala-daily", "/apps/kusala-daily/privacy"]).pages.map(page => page.href), ["/apps/kusala-daily/privacy"]);
  assert.equal(app(["/apps/kusala-daily/support"]), undefined, "no overview output, no record");
  assert.equal(app(["/apps/some-other-app"]), undefined, "an output with no reviewed page draws nothing");
  assert.equal(oakAppFacts(null, kusalaDailyPageConfigs), undefined);
  const bare = kusalaDailyPageConfigs.map(page => ({ ...page, facts: page.facts.filter(fact => fact.source !== "Policy") }));
  assert.ok(!("privacy" in oakAppFacts(oakSiteItem("app", owners), bare)), "no reviewed privacy fact, no privacy field");
});

test("app: the SiteCard view chunk imports neither machineContent nor the knowledge snapshot", async () => {
  const { metafile } = await build({ entryPoints: ["src/lib/openui/components/site/SiteView.tsx"], bundle: true, write: false, metafile: true,
    format: "esm", platform: "browser", packages: "external", logLevel: "silent", loader: { ".css": "empty", ".svg": "empty", ".png": "empty", ".webp": "empty" } });
  const inputs = Object.keys(metafile.inputs).map(file => path.normalize(file));
  assert.ok(inputs.some(file => file.endsWith(path.normalize("site/App.tsx"))), "the walk reaches the app view");
  for (const banned of ["src/data/machineContent.ts", "src/lib/knowledge/snapshot.ts", "src/data/generated/knowledgeSnapshot.json", "src/lib/oakRecordFacts.server.ts"])
    assert.ok(!inputs.includes(path.normalize(banned)), `${banned} stays out of the client chunk`);
});

test("resource: compact cards link to the served AI files and print no internal note, path or key name", () => {
  const html = on(() => render(["claim-2"], "resource"));
  for (const path of ["/llms.txt", "/profile.json", "/skill.md"]) assert.match(html, new RegExp(`href="${path.replace(".", "\\.")}"`));
  assert.doesNotMatch(html, /src\/|knowledge\/|\.ts\b|_KEY|TOKEN|SECRET|localhost|\/Users\//);
  assert.ok(placed(html, ["claim-2"]));
});

test("section: the home value cards keep their own icon and art, one visual anchor, and link to the section", () => {
  const html = on(() => render(["claim-2"], "section"));
  assert.equal(count(html, 'data-anchor=""'), 1, "exactly one visual anchor");
  assert.match(html, /href="\/#/);
  assert.ok(count(html, "oak-site__icon") >= 3, "each value card keeps its icon");
  assert.ok(placed(html, ["claim-2"]));
});

test("career-rail: roles on one rail, newest first, each linking to its /work anchor", () => {
  const html = on(() => render(["claim-3"], "career-rail"));
  assert.match(html, /href="\/work#oaklabs"/);
  assert.match(html, /data-current=""/);
  assert.ok(placed(html, ["claim-3"]));
});

test("notOnSite: a quiet line only, never the held item's title, link or preview", () => {
  const html = on(() => render(["claim-2"], "notOnSite"));
  assert.match(html, /class="oak-site-quiet"/);
  assert.doesNotMatch(html, /oak-openui-card|<a /);
  assert.ok(placed(html, ["claim-2"]));
});

test("a kind with no answer item, a claim from another page, and the constant off all degrade to Points with every claim placed", () => {
  for (const html of [on(() => render(["claim-2"], "now")), on(() => render(["claim-3"], "app")), off(() => render(["claim-1"], "app")), off(() => render(["claim-2"], "section"))]) {
    assert.doesNotMatch(html, /class="oak-site /);
    assert.match(html, /oak-openui__points/);
    assert.equal(count(html, "<li"), 1);
  }
});

test("streaming: the card draws its ghost while the claims wait", () => {
  const html = on(() => render(["claim-1"], "app", "streaming"));
  assert.ok(/oak-openui-skel|oak-site/.test(html));
});

test("Q17-G4: the island links only a site path or an approved item's own URL; any other href renders no anchor", () => {
  const link = href => renderToStaticMarkup(oakSiteLink({ href, className: "oak-site__row", children: "Row" }));
  assert.equal(link("/llms.txt"), '<a class="oak-site__row" href="/llms.txt">Row</a>');
  assert.match(link("https://github.com/Absorber97"), /^<a class="oak-site__row" href="https:\/\/github\.com\/Absorber97" target="_blank" rel="noopener noreferrer">Row<span class="sr-only"> \(opens in a new tab\)<\/span><\/a>$/);
  for (const href of ["https://example.com/", "https://github.com/someone-else", "//evil.example/x", "/\\evil.example", "javascript:alert(1)", "mailto:a@b.c", ""]) {
    assert.equal(link(href), '<span class="oak-site__row">Row</span>', href);
  }
  const social = on(() => render(["claim-2"], "social"));
  assert.ok(count(social, 'target="_blank"') >= 5, "the social chips still link out");
  assert.equal(count(social, 'target="_blank"'), count(social, "(opens in a new tab)"), "each new-tab chip says so to a screen reader");
});

test("142: forced colors draws a CanvasText rule between site rows, since it drops the inset-shadow divider", () => {
  const css = readFileSync("src/styles/openui/site-card.css", "utf8");
  const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
  assert.match(forced, /\.oak-site__row\s*\{[^}]*border-top:\s*1px solid CanvasText/, "each site row keeps a system-color hairline");
});
