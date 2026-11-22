import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse as parseYaml } from "yaml";
import sharp from "sharp";
import { createLoader, stubSets } from "../design-rework/load-tsx.mjs";
import { INTERNAL_PATTERNS } from "../../../scripts/quality/md-twins-built.mjs";

const root = path.resolve(import.meta.dirname, "../../..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const snapshot = JSON.parse(read("src/data/generated/knowledgeSnapshot.json"));

const records = readdirSync(path.join(root, "src/content/work")).filter((file) => file.endsWith(".mdx")).sort().map((file) => {
  const data = parseYaml(read(`src/content/work/${file}`).match(/^---\n([\s\S]*?)\n---/)[1]);
  return { id: file, slug: file.replace(/\.mdx$/, ""), data: { articleStatus: "full", ...data,
    datePublished: new Date(data.datePublished), ...(data.dateUpdated ? { dateUpdated: new Date(data.dateUpdated) } : {}) } };
});
const workContent = { getWorkEntries: async () => records, getWorkSlug: (entry) => entry.id.replace(/\.mdx$/, "") };
const load = createLoader({ use: [stubSets.icons], stubs: { "@/lib/workContent": workContent }, interop: true });
const { oakRecordFacts, oakCoverTint, oakExperienceFacts } = load("src/lib/oakRecordFacts.server.ts");
const { careerTimelineItems } = load("src/data/careerTimeline.ts");
const route = load("src/pages/oak/record-facts.[revision].json.ts");
const client = load("src/lib/oakRecordFacts.ts");
const { heroCopy, profileSummary } = load("src/data/homePage.ts");
const { siteProfile } = load("src/data/machineContent.ts");
const { oakArtifactImages } = load("src/data/oakArtifactImages.ts");
const asset = await oakRecordFacts();
const json = JSON.stringify(asset);
const held = (item) => item.status !== "verified";

const workFields = ["kind", "dek", "category", "badge", "articleStatus", "statusLabel", "datePublished", "dateUpdated", "period", "cover", "coverTint",
  "systemMap", "artifacts", "heldArtifacts", "metrics", "sections"];
const profileFields = ["kind", "hero", "summary", "knowsAbout"];
const experienceFields = ["kind", "engagement", "dateStart", "dateEnd", "title"];
const appFields = ["kind", "name", "path", "facts", "privacy", "pages"];
const appIds = ["resource:kusala-daily", "resource:kusala-daily:privacy", "resource:kusala-daily:support"];
const experienceIds = snapshot.documents.map((document) => document.id).filter((id) => id.startsWith("experience:"));

test("the asset is versioned, names its knowledge revision, and holds the 5 Work records, the profile, every career entry and the app's pages", () => {
  assert.equal(asset.version, 1);
  assert.equal(asset.knowledgeRevision, snapshot.revision);
  assert.equal(experienceIds.length, careerTimelineItems.length);
  assert.deepEqual(Object.keys(asset.records).toSorted(),
    [...experienceIds, ...appIds, "profile:steve-oak", "work:agentic-brain", "work:ecosmartloop", "work:linkedin-growth-loop", "work:oakminder", "work:omnisocial"].toSorted());
  for (const id of appIds) assert.deepEqual(asset.records[id], asset.records["resource:kusala-daily"], `${id} carries the one app record`);
});

test("each career entry yields an experience fact with its reviewed engagement, role title and month range", () => {
  const month = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
  const iso = (text) => { const [name, year] = text.trim().split(" "); return `${year}-${month[name]}`; };
  for (const item of careerTimelineItems) {
    const role = item.contexts.find((context) => context.type === "employment");
    const [start, end] = item.date.split(" - ");
    const expected = { kind: "experience", engagement: role.engagement, dateStart: iso(start), ...(end === "Present" ? {} : { dateEnd: iso(end) }), title: role.title };
    assert.deepEqual(asset.records[`experience:${item.id}`], expected, item.id);
    assert.ok(!Number.isNaN(Date.parse(expected.dateStart)), `${item.id} dateStart parses`);
  }
  assert.equal(asset.records["experience:oaklabs"].engagement, "self-employed");
  assert.equal(asset.records["experience:hyperskalers"].engagement, "contract");
  assert.equal(asset.records["experience:pnppsolutions"].dateEnd, "2024-01");
});

test("a career entry with no reviewed engagement or an unreadable date yields no fact", () => {
  const base = careerTimelineItems[0];
  assert.equal(oakExperienceFacts({ ...base, contexts: [{ type: "education", title: "M.S. Computer Science", status: "completed" }] }), undefined);
  assert.equal(oakExperienceFacts({ ...base, date: "Sometime" }), undefined);
});

test("each Work record yields its reviewed fields from its own frontmatter", () => {
  for (const { slug, data } of records) {
    const facts = asset.records[`work:${slug}`];
    assert.equal(facts.kind, "work", slug);
    assert.equal(facts.dek, data.dek, slug);
    assert.equal(facts.category, data.card.category, slug);
    assert.equal(facts.badge, data.card.badge, slug);
    assert.equal(facts.articleStatus, data.articleStatus, slug);
    assert.equal(facts.statusLabel, data.card.statusLabel, slug);
    assert.equal(facts.datePublished, data.datePublished.toISOString().slice(0, 10), slug);
    assert.equal(facts.dateUpdated, data.dateUpdated?.toISOString().slice(0, 10), slug);
    assert.equal(facts.period, data.timeline, slug);
    assert.deepEqual(facts.systemMap, data.systemMap, slug);
    assert.ok(!("ownership" in facts), `${slug} ships no ownership lines until Oak reads them`);
    const verified = data.metrics.filter((metric) => !held(metric)).map(({ label, value }) => ({ label, value }));
    assert.deepEqual(facts.metrics, verified.filter((metric) => facts.metrics.some((kept) => kept.label === metric.label)), slug);
    assert.deepEqual(facts.artifacts.map((artifact) => artifact.label), data.artifacts.filter((artifact) => !held(artifact)).map((artifact) => artifact.label), slug);
    assert.equal(facts.heldArtifacts, data.artifacts.filter(held).length, `${slug} counts its held artifacts`);
    for (const artifact of data.artifacts.filter(held)) {
      if (!facts.artifacts.some((kept) => kept.label === artifact.label)) assert.ok(!json.includes(JSON.stringify(artifact.label)), `${slug} held artifact "${artifact.label}" reaches the asset`);
    }
    assert.equal(facts.cover.alt, data.card.imageAlt, slug);
    assert.ok(existsSync(path.join(root, "public", facts.cover.src)), `${slug} cover ${facts.cover.src} is a public file`);
    assert.ok(facts.cover.ratio > 1, `${slug} cover ratio`);
  }
  assert.deepEqual(asset.records["work:agentic-brain"].artifacts.map((artifact) => artifact.label), ["Memory cover", "Legacy memory and hallucination case study"]);
  assert.deepEqual(asset.records["work:omnisocial"].artifacts.map((artifact) => artifact.label), ["Content Creation cover"]);
});

test("a Work record keeps only result metrics: no cover file, role or TBD value, the same rule as its source card", () => {
  const labels = (slug) => asset.records[`work:${slug}`].metrics.map((metric) => metric.label);
  assert.deepEqual(labels("agentic-brain"), ["State"]);
  assert.deepEqual(labels("omnisocial"), ["State"]);
  assert.deepEqual(labels("ecosmartloop"), ["Dataset", "Model output", "Context", "Global problem", "California scale"]);
  assert.deepEqual(labels("oakminder"), ["Launch status", "App surface", "Distribution surface", "Docs surface"]);
});

test("a record holds only the fields a registered component reads, and no review field it does not store", () => {
  for (const [id, facts] of Object.entries(asset.records)) {
    const allowed = { profile: profileFields, experience: experienceFields, app: appFields }[facts.kind] ?? workFields;
    assert.deepEqual(Object.keys(facts).filter((key) => !allowed.includes(key)), [], id);
    assert.doesNotMatch(JSON.stringify(facts), /"review(ed|er)?[A-Za-z]*":/i, `${id} stores no review metadata, so no Reviewed chip can show`);
  }
  for (const { slug, data } of records) {
    const facts = asset.records[`work:${slug}`];
    for (const artifact of facts.artifacts) assert.deepEqual(Object.keys(artifact).filter((key) => !["label", "status", "image"].includes(key)), [], slug);
    assert.ok(!("ownership" in facts), `${slug} ships no ownership lines`);
    for (const line of [...data.ownership.oak, ...data.ownership.collaborators]) assert.ok(!json.includes(line), `${slug} ownership line reaches the asset`);
  }
});

test("no do-not-publish or unverified artifact or metric reaches the asset", () => {
  for (const slug of ["agentic-brain", "omnisocial"]) {
    const { data } = records.find((record) => record.slug === slug);
    const doNotPublish = [...data.metrics, ...data.artifacts].filter((item) => item.status === "do-not-publish");
    assert.equal(doNotPublish.length, 2, `${slug} carries 2 do-not-publish items`);
  }
  for (const { slug, data } of records) {
    const facts = asset.records[`work:${slug}`];
    for (const item of data.artifacts.filter(held)) assert.ok(!facts.artifacts.some((artifact) => artifact.label === item.label), `${slug} artifact ${item.label}`);
    for (const item of data.metrics.filter(held)) assert.ok(!facts.metrics.some((metric) => metric.label === item.label), `${slug} metric ${item.label}`);
    for (const item of [...data.metrics, ...data.artifacts].filter((entry) => entry.status === "do-not-publish")) {
      assert.ok(!json.includes(item.label), `${slug} held label ${item.label}`);
      if (item.value) assert.ok(!json.includes(item.value), `${slug} held value ${item.value}`);
    }
    assert.ok(facts.artifacts.every((artifact) => artifact.status === "verified"), slug);
  }
});

test("the privacy scan's patterns find nothing internal in the asset", () => {
  for (const pattern of INTERNAL_PATTERNS) assert.doesNotMatch(json, pattern);
  assert.doesNotMatch(json, /\/Users\/|\.scratch|docs\/planning|\.local-setup/);
});

test("an artifact image is an existing public image already on that record's page", () => {
  let mapped = 0;
  for (const { slug, id, data } of records) {
    const page = read(`src/content/work/${id}`);
    for (const [label, image] of Object.entries(oakArtifactImages[slug] ?? {})) {
      mapped += 1;
      assert.ok(data.artifacts.some((artifact) => artifact.label === label && artifact.status === "verified"), `${slug} ${label} is a verified artifact`);
      assert.ok(page.includes(`"${image.src}"`), `${slug} ${label}: ${image.src} appears on its page`);
      assert.ok(page.includes(`"${image.alt}"`), `${slug} ${label}: the alt is the page's own`);
      assert.ok(existsSync(path.join(root, "public", image.src)), `${slug} ${label}: ${image.src} is public`);
      const shown = asset.records[`work:${slug}`].artifacts.find((artifact) => artifact.label === label).image;
      assert.equal(shown.alt, image.alt, `${slug} ${label}`);
      assert.ok(existsSync(path.join(root, "public", shown.src)), `${slug} ${label}: ${shown.src} is public`);
    }
  }
  assert.ok(mapped >= 10, `mapped ${mapped} artifact images`);
  const unmapped = asset.records["work:oakminder"].artifacts.find((artifact) => artifact.label === "Voice agent");
  assert.ok(unmapped && !("image" in unmapped), "an artifact with no reviewed image draws none");
});

const frames = async (src) => (await sharp(path.join(root, "public", src)).metadata()).pages ?? 1;

test("an animated artifact image or cover ships with every frame, and its map entry says preserveAnimation", async () => {
  let animated = 0;
  for (const { slug, data } of records) {
    const facts = asset.records[`work:${slug}`];
    const pairs = [[data.card.image, facts.cover.src, `${slug} cover`]];
    for (const [label, image] of Object.entries(oakArtifactImages[slug] ?? {})) {
      const shown = facts.artifacts.find((artifact) => artifact.label === label).image.src;
      const source = await frames(image.src);
      assert.equal(Boolean(image.preserveAnimation), source > 1, `${slug} ${label}: preserveAnimation matches a ${source}-frame source`);
      pairs.push([image.src, shown, `${slug} ${label}`]);
    }
    for (const [source, shown, name] of pairs) {
      const count = await frames(source);
      if (count > 1) animated += 1;
      assert.equal(await frames(shown), count, `${name}: ${shown} keeps the ${count} frames of ${source}`);
    }
  }
  assert.ok(animated >= 3, `found ${animated} animated images`);
});

test("each Work record names the stable section anchors its citations already use", () => {
  for (const { slug } of records) {
    const document = snapshot.documents.find((entry) => entry.id === `work:${slug}`);
    const cited = new Set(document.passages.map((passage) => new URL(passage.citationUrl).hash.slice(1)).filter(Boolean));
    const { sections } = asset.records[`work:${slug}`];
    assert.ok(sections.length > 0, slug);
    assert.deepEqual(sections.map((section) => section.anchor), [...cited], slug);
    for (const section of sections) assert.ok(section.title.trim(), `${slug}#${section.anchor} title`);
  }
});

test("the profile record carries the public hero copy, profile summary and knowsAbout", () => {
  const profile = asset.records["profile:steve-oak"];
  assert.equal(profile.kind, "profile");
  assert.deepEqual(profile.hero, { title: heroCopy.title, description: heroCopy.description });
  assert.equal(profile.summary.description, profileSummary.description);
  assert.deepEqual(profile.summary.facts, profileSummary.facts.map(({ label, value }) => ({ label, value })));
  assert.deepEqual(profile.knowsAbout, siteProfile.focus);
  assert.ok(profile.knowsAbout.length >= 5);
});

const hex = (value) => [1, 3, 5].map((start) => parseInt(value.slice(start, start + 2), 16));
const luminance = (rgb) => {
  const [r, g, b] = rgb.map((channel) => { const c = channel / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (left, right) => { const [a, b] = [luminance(left), luminance(right)].sort((x, y) => y - x); return (a + 0.05) / (b + 0.05); };
const token = (css, name) => css.match(new RegExp(`--${name}:\\s*([^;]+);`))[1].trim();

test("coverTint is one accent from the cover that meets AA against the card surface", () => {
  const global = read("src/styles/global.css");
  const agent = read("src/styles/oakAgent.css");
  const text = hex(token(global, "text"));
  const panel = hex(token(global, "panel"));
  const share = Number(token(agent, "oak-raised").match(/var\(--text\) (\d+)%/)[1]) / 100;
  const surface = text.map((channel, index) => Math.round(channel * share + panel[index] * (1 - share)));
  const tints = new Set();
  for (const { slug } of records) {
    const { coverTint } = asset.records[`work:${slug}`];
    assert.match(coverTint, /^#[0-9a-f]{6}$/, slug);
    assert.ok(contrast(hex(coverTint), surface) >= 4.5, `${slug} ${coverTint} contrast ${contrast(hex(coverTint), surface).toFixed(2)}`);
    tints.add(coverTint);
  }
  assert.ok(tints.size >= 3, "covers give their own accents");
  const red = new Uint8Array(Array.from({ length: 64 }, (_, index) => (index % 4 === 0 ? 3 : 1)).flatMap((weight) => weight === 3 ? [200, 30, 40] : [20, 20, 20]));
  const [r, g, b] = hex(oakCoverTint(red, 3));
  assert.ok(r > g * 1.5 && r > b * 1.5, `a mostly dark cover with red detail gives a red accent, got ${oakCoverTint(red, 3)}`);
});

test("the asset route serves one file per knowledge revision with exactly the built facts", async () => {
  assert.deepEqual(await route.getStaticPaths(), [{ params: { revision: snapshot.revision } }]);
  const response = await route.GET({ params: { revision: snapshot.revision } });
  assert.match(response.headers.get("Content-Type"), /application\/json/);
  assert.deepEqual(await response.json(), asset);
  assert.equal(client.oakRecordFactsUrl(snapshot.revision), `/oak/record-facts.${snapshot.revision}.json`);
});

function Probe({ documentId, revision }) {
  const state = client.useOakRecordFacts(documentId, revision);
  return createElement("output", { "data-status": state.status }, state.status === "loaded" ? state.facts.kind : "");
}
const probe = (documentId, revision) => renderToStaticMarkup(createElement(Probe, { documentId, revision }));

test("useOakRecordFacts returns pending until loaded, then the record, and missing for a removed record or another revision", async () => {
  const revision = snapshot.revision;
  assert.match(probe("work:ecosmartloop", revision), /data-status="pending"/);
  client.primeOakRecordFacts(revision, asset);
  assert.match(probe("work:ecosmartloop", revision), /data-status="loaded">work</);
  assert.match(probe("profile:steve-oak", revision), /data-status="loaded">profile</);
  assert.match(probe("work:removed-record", revision), /data-status="missing"/);

  const fetched = [];
  const served = { "oak-old": { status: 404 }, "oak-wrong-version": { status: 200, body: { ...asset, version: 2, knowledgeRevision: "oak-wrong-version" } },
    "oak-other": { status: 200, body: asset } };
  globalThis.fetch = async (url) => {
    fetched.push(url);
    const revisionOf = url.match(/record-facts\.(.+)\.json$/)[1];
    const reply = served[revisionOf];
    return { ok: reply.status === 200, status: reply.status, json: async () => reply.body };
  };
  for (const other of Object.keys(served)) {
    assert.match(probe("work:ecosmartloop", other), /data-status="pending"/, other);
    await client.loadOakRecordFacts(other);
    assert.match(probe("work:ecosmartloop", other), /data-status="missing"/, `${other} is not this revision's facts`);
  }
  assert.deepEqual(fetched, Object.keys(served).map((other) => `/oak/record-facts.${other}.json`));
  await client.loadOakRecordFacts("oak-old");
  assert.equal(fetched.length, 3, "a revision loads once");
  assert.match(probe("work:ecosmartloop", "../escape"), /data-status="missing"/, "a revision that is not a plain token never reaches fetch");
  assert.equal(fetched.length, 3);
});

test("a network error degrades one load, and the next load of that revision fetches again", async () => {
  const revision = "oak-blip";
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("network");
    return { ok: true, status: 200, json: async () => ({ ...asset, knowledgeRevision: revision }) };
  };
  await client.loadOakRecordFacts(revision);
  assert.match(probe("work:ecosmartloop", revision), /data-status="missing"/, "a failed load draws the degrade");
  await client.loadOakRecordFacts(revision);
  assert.equal(calls, 2, "the failure was not cached");
  assert.match(probe("work:ecosmartloop", revision), /data-status="loaded">work</);
  await client.loadOakRecordFacts(revision);
  assert.equal(calls, 2, "a success is cached");
});

const dist = path.join(root, "dist");
test("the built site ships the asset and keeps facts and held items out of every page", { skip: !existsSync(path.join(dist, "oak", `record-facts.${snapshot.revision}.json`)) && "no build" }, () => {
  const built = JSON.parse(readFileSync(path.join(dist, "oak", `record-facts.${snapshot.revision}.json`), "utf8"));
  assert.deepEqual(built, asset);
  for (const [id, facts] of Object.entries(built.records)) assert.ok(!("ownership" in facts), `${id} ships no ownership in the built asset`);
  const pages = readdirSync(dist, { recursive: true }).filter((file) => String(file).endsWith(".html")).map((file) => [file, readFileSync(path.join(dist, file), "utf8")]);
  const heldItems = records.flatMap(({ data }) => [...data.metrics, ...data.artifacts].filter((item) => item.status === "do-not-publish")
    .flatMap((item) => [item.label, item.value].filter(Boolean)));
  const systemSteps = records.flatMap(({ data }) => data.systemMap.map((step) => step.description));
  for (const [file, html] of pages) {
    for (const item of heldItems) assert.ok(!html.includes(item), `${file} holds ${item}`);
    for (const step of systemSteps) assert.ok(!html.includes(step), `${file} inlines a systemMap step`);
  }
});
