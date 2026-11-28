import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createLoader } from "../agent/design-rework/load-tsx.mjs";
import { captureContent, contentAtoms } from "../../scripts/knowledge/content-owners.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const load = createLoader();
const registryModule = load("src/data/homeRegistry.ts");
const { homeRegistry, homeSectionIds, homeContexts } = registryModule;
const { featureCards, proofSections, workspaceRows } = load("src/data/homePage.ts");

const sectionDir = "src/components/home/sections";
const sectionFiles = readdirSync(path.join(root, sectionDir)).filter((name) => name.endsWith(".astro")).sort();
const sectionSources = Object.fromEntries(sectionFiles.map((name) => [name, read(`${sectionDir}/${name}`)]));
const blockDir = "src/components/home/blocks";
const blockFiles = readdirSync(path.join(root, blockDir)).filter((name) => name.endsWith(".astro")).sort();
const viewSources = { ...sectionSources, ...Object.fromEntries(blockFiles.map((name) => [name, read(`${blockDir}/${name}`)])) };
const pageSource = read("src/pages/index.astro");
const taggedIn = (source) => [...source.matchAll(/data-oak-section="([^"]+)"/g)].map((match) => match[1]);

test("the registry lists every data-oak-section the home renders, once each", () => {
  const tagged = [...taggedIn(pageSource), ...Object.values(sectionSources).flatMap(taggedIn)].sort();
  assert.deepEqual(tagged, ["home.hero", "home.proof", "home.workspace"]);
  assert.deepEqual([...homeSectionIds].sort(), tagged);
  assert.deepEqual(homeRegistry.sections.map((section) => section.id).sort(), tagged);
});

test("the registry is a page of sections, blocks and elements with unique ids and real assets", () => {
  assert.equal(homeRegistry.page.path, "/");
  const ids = [];
  for (const section of homeRegistry.sections) {
    assert.ok(section.blocks.length > 0, `${section.id} has blocks`);
    ids.push(`section:${section.id}`);
    for (const block of section.blocks) {
      assert.ok(block.elements.length > 0, `${block.id} has elements`);
      ids.push(block.id);
      for (const element of block.elements) {
        ids.push(`${block.id}/${element.id}`);
        if (element.asset) assert.match(element.asset, /^\/assets\//, `${block.id}/${element.id} keeps its asset`);
      }
    }
  }
  assert.equal(new Set(ids).size, ids.length, "no id repeats");
});

test("the registry blocks are the data-oak-context values the home already carries", () => {
  const feature = homeRegistry.sections.find((section) => section.id === "home.hero").blocks.map((block) => block.id);
  assert.deepEqual(feature, ["home.hero", "home.feature.technology", "home.feature.design", "home.feature.bay-area"]);
  const proof = homeRegistry.sections.find((section) => section.id === "home.proof").blocks.map((block) => block.id);
  assert.deepEqual(proof, ["home.proof.agentic", "home.proof.design"]);
  const workspace = homeRegistry.sections.find((section) => section.id === "home.workspace").blocks;
  assert.deepEqual(workspace.map((block) => block.id), ["home.workspace"]);
  assert.equal(workspace[0].elements.length, workspaceRows.flat().length, "one element per interest");
  assert.equal(featureCards.length + proofSections.length + 2, homeContexts.length);
  for (const source of Object.values(viewSources)) {
    for (const [, context] of source.matchAll(/data-oak-context="([^"]+)"/g)) {
      assert.ok(homeContexts.includes(context), `${context} is in the registry`);
    }
  }
});

test("each view still carries the data-oak-context values of the blocks it renders", () => {
  const emitted = (source) => [...source.matchAll(/data-oak-context=(?:"([^"]+)"|\{(\w+)\[\w+\.title\]\})/g)]
    .flatMap(([, literal, map]) => (literal ? [literal] : Object.values(registryModule[map] ?? {})));
  const expected = {
    "FeatureCards.astro": ["home.feature.technology", "home.feature.design", "home.feature.bay-area"],
    "WorkspaceTable.astro": ["home.workspace"],
    "HomeHero.astro": ["home.hero"],
    "HomeProof.astro": ["home.proof.agentic", "home.proof.design"],
    "HomeWorkspace.astro": ["home.workspace"],
  };
  for (const [name, contexts] of Object.entries(expected)) assert.deepEqual(emitted(viewSources[name]), contexts, name);
  assert.deepEqual([...new Set(Object.values(viewSources).flatMap(emitted))].sort(), [...homeContexts].sort());
});

// The home copy owner in knowledge/owners.json is src/pages/index.astro. A view that writes copy itself moves it out of the
// approved owner, so the public build gate rejects it, or a new owner changes the knowledge revision the Worker pins.
test("the section and block views take their copy as props and hard-code none", () => {
  for (const [name, source] of Object.entries(viewSources)) {
    const atoms = contentAtoms({ format: "astro", path: name }, source).map(({ id, value }) => `${id} ${JSON.stringify(value)}`);
    assert.deepEqual(atoms, [], `${name} holds authored copy; pass it from src/pages/index.astro`);
  }
});

test("the home copy owner still yields the approved knowledge content identity", async () => {
  const active = JSON.parse(read("knowledge/active.json"));
  const owners = JSON.parse(read("knowledge/owners.json")).owners;
  const homeCopy = owners.find((owner) => owner.id === "home-authored-copy");
  assert.equal(homeCopy.path, "src/pages/index.astro", "home copy keeps its single approved owner");
  const { contentIdentity } = await captureContent(root);
  assert.equal(contentIdentity, active.lifecycle.contentIdentity, "authored home copy differs from the approved release");
});

test("each section is one view and the page only composes them", () => {
  assert.deepEqual(sectionFiles, ["HomeHero.astro", "HomeProof.astro", "HomeWorkspace.astro"]);
  for (const [name, source] of Object.entries(sectionSources)) {
    assert.equal(taggedIn(source).length, 1, `${name} carries exactly one data-oak-section`);
    assert.match(pageSource, new RegExp(`import ${name.replace(".astro", "")} from "@/components/home/sections/${name}"`));
  }
  assert.equal(taggedIn(pageSource).length, 0, "the page holds no section markup of its own");
  assert.doesNotMatch(pageSource, /data-oak-context=/);
});

test("no section ships a hidden or display none copy of its text", () => {
  const hiding = /(?<![-\w])hidden(?![-\w])|display\s*:\s*none|sr-only|visually-hidden|visuallyhidden|clip:\s*rect/i;
  for (const [name, source] of Object.entries(viewSources)) assert.doesNotMatch(source, hiding, name);
  assert.doesNotMatch(read("src/data/homeRegistry.ts"), hiding);
});
