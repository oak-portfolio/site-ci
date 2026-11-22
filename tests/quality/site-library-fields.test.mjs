import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { parse as parseYaml } from "yaml";
import { runLifecycle, validateSiteLibraryFields } from "../../scripts/knowledge/lifecycle.mjs";
import { createPublicSnapshot } from "../../scripts/knowledge/snapshot.mjs";
import { createSiteLibrary, publicSiteLibrary, siteLibraryChannels, siteLibraryStatuses } from "../../src/data/siteLibrary.ts";

const root = new URL("../../", import.meta.url).pathname;
const registry = JSON.parse(readFileSync(join(root, "knowledge/owners.json"), "utf8"));

const workDirectory = join(root, "src/content/work");
const caseStudies = readdirSync(workDirectory).filter((name) => name.endsWith(".mdx")).map((name) => {
  const data = parseYaml(readFileSync(join(workDirectory, name), "utf8").split(/^---$/m)[1]);
  return { ...data, slug: name.replace(/\.mdx$/, ""), draft: data.draft ?? true };
});

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(astro|tsx)$/.test(entry.name) ? [readFileSync(path, "utf8")] : [];
  });
}
const sources = sourceFiles(join(root, "src")).join("\n");
const staticAnchors = new Set([...sources.matchAll(/data-oak-section=["']([^"']+)["']|dataOakSection = "([^"]+)"/g)].map((match) => match[1] ?? match[2]));
const hasAnchor = (anchor) => staticAnchors.has(anchor) ||
  (anchor.endsWith(".system") && sources.includes("data-oak-section={`${caseStudy.slug}.system`}"));

const fixtureCaseStudy = (overrides = {}) => ({
  slug: "fixture", draft: false, projectName: "Fixture", role: "Builder", timeline: "2026", stack: ["Astro"],
  card: { image: "/card.webp", imageAlt: "Card view" }, hero: { image: "/hero.webp", imageAlt: "Hero view" },
  metrics: [{ label: "Shown", value: "1", status: "verified" }, { label: "PRIVATE_METRIC_CANARY", value: "9", status: "do-not-publish" }],
  ...overrides,
});
const fixtureOwners = (overrides = {}) => registry.owners.map((owner) => ({ ...owner, ...(overrides[owner.id] ?? {}) }));

test("every Site library item has a valid status and channels", async () => {
  for (const owner of registry.owners) {
    assert.ok(siteLibraryStatuses.includes(owner.status), `${owner.id} status`);
    assert.ok(Array.isArray(owner.channels), `${owner.id} channels`);
    for (const channel of owner.channels) assert.ok(siteLibraryChannels.includes(channel), `${owner.id} ${channel}`);
    if (owner.status !== "approved") assert.deepEqual(owner.channels, [], `${owner.id} is in no channel`);
  }
  assert.equal(validateSiteLibraryFields(registry), registry);
  assert.deepEqual(await runLifecycle(root, ["owners"]), registry);
});

test("the validator rejects unknown values and unapproved items in a channel", () => {
  const one = (owner) => () => validateSiteLibraryFields({ owners: [{ id: "x", ...owner }] });
  assert.throws(one({ status: "live", channels: [] }), /status/);
  assert.throws(one({ channels: [] }), /status/);
  assert.throws(one({ status: "approved" }), /channels/);
  assert.throws(one({ status: "approved", channels: ["seo"] }), /channels/);
  assert.throws(one({ status: "approved", channels: ["page", "page"] }), /channels/);
  for (const status of ["draft", "held", "planned"]) assert.throws(one({ status, channels: ["answer"] }), /no channel/);
  assert.doesNotThrow(one({ status: "planned", channels: [] }));
});

test("draft, held and do-not-publish entries reach no channel and no public projection", () => {
  const library = createSiteLibrary(fixtureOwners({ kusala: { status: "held", channels: [] } }),
    [fixtureCaseStudy(), fixtureCaseStudy({ slug: "unfinished", draft: true, projectName: "DRAFT_CANARY" })]);
  const draft = library.caseStudies.find((entry) => entry.id === "work:unfinished");
  assert.deepEqual(draft, { id: "work:unfinished", owner: "work", status: "draft", channels: [] });
  assert.deepEqual(library.items.find((item) => item.id === "kusala"), { id: "kusala", status: "held", channels: [] });
  assert.deepEqual(library.apps, []);
  const shown = library.caseStudies.find((entry) => entry.id === "work:fixture");
  assert.deepEqual(shown.fields.metrics, [{ label: "Shown", value: "1" }]);

  const published = publicSiteLibrary(library);
  const text = JSON.stringify(published);
  for (const canary of ["DRAFT_CANARY", "PRIVATE_METRIC_CANARY", "do-not-publish", "unfinished", "held", "kusala"]) assert.ok(!text.includes(canary), canary);
  for (const entry of [...published.items, ...published.caseStudies]) assert.equal(entry.status, "approved");

  const withHeldWork = createSiteLibrary(fixtureOwners({ work: { status: "held", channels: [] } }), [fixtureCaseStudy()]);
  assert.deepEqual(withHeldWork.caseStudies, [{ id: "work:fixture", owner: "work", status: "held", channels: [] }]);
  assert.ok(!withHeldWork.sections.some((section) => section.owner === "work"));
});

test("the snapshot carries only the public library, and only when a release passes one", () => {
  const inventory = { eligibleDocuments: [], policyFingerprint: "policy", policyVersion: "v1" };
  const plain = createPublicSnapshot(inventory, "source");
  assert.ok(!("library" in plain));
  const library = createSiteLibrary(fixtureOwners({ kusala: { status: "held", channels: [] } }),
    [fixtureCaseStudy(), fixtureCaseStudy({ slug: "unfinished", draft: true })]);
  const withLibrary = createPublicSnapshot({ ...inventory, library }, "source");
  assert.deepEqual(withLibrary.library, publicSiteLibrary(library));
  assert.notEqual(withLibrary.revision, plain.revision);
  assert.ok(!JSON.stringify(withLibrary).includes("unfinished"));
});

test("every section entry resolves to an existing data-oak-section anchor", () => {
  const library = createSiteLibrary(registry.owners, caseStudies);
  assert.ok(library.sections.length > caseStudies.length);
  for (const section of library.sections) assert.ok(hasAnchor(section.anchor), section.anchor);
});

test("every media entry has alt text for its use", () => {
  const library = createSiteLibrary(registry.owners, caseStudies);
  const media = library.caseStudies.flatMap((entry) => entry.media ?? []);
  assert.ok(media.length >= caseStudies.length * 2);
  for (const item of media) {
    assert.ok(["card", "hero", "social"].includes(item.use), item.src);
    assert.ok(item.alt.trim().length > 0, item.src);
  }
  assert.throws(() => createSiteLibrary(registry.owners, [fixtureCaseStudy({ hero: { image: "/hero.webp", imageAlt: " " } })]), /alt text/);
});

test("a draft case study with empty alt text does not break the library", () => {
  const library = createSiteLibrary(registry.owners, [fixtureCaseStudy({ slug: "wip", draft: true, card: { image: "/card.webp", imageAlt: "" } })]);
  assert.deepEqual(library.caseStudies, [{ id: "work:wip", owner: "work", status: "draft", channels: [] }]);
});

test("the public library keeps only items in the answer channel", () => {
  const published = publicSiteLibrary(createSiteLibrary(registry.owners, [fixtureCaseStudy()]));
  const answerless = registry.owners.filter((owner) => !owner.channels.includes("answer")).map((owner) => owner.id);
  assert.ok(answerless.length > 0);
  for (const entry of [...published.items, ...published.caseStudies]) assert.ok(entry.channels.includes("answer"), entry.id);
  for (const id of answerless) assert.ok(!JSON.stringify(published).includes(`"${id}"`), id);
});

test("the active snapshot is unchanged until a reviewed release adds the library", () => {
  const snapshot = JSON.parse(readFileSync(join(root, "src/data/generated/knowledgeSnapshot.json"), "utf8"));
  assert.ok(!("library" in snapshot));
});
