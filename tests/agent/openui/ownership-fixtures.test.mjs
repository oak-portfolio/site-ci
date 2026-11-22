import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

// Ticket 158: every Ownership fixture line and answer sentence traces to its case study's frontmatter `ownership`, on the same side.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const states = JSON.parse(readFileSync(path.join(root, "src/data/dev/oak-states/openui-ownership.json"), "utf8"));
const frontmatterOf = slug => parseYaml(readFileSync(path.join(root, `src/content/work/${slug}.mdx`), "utf8").match(/^---\n([\s\S]*?)\n---/)[1]);
const norm = text => text.toLowerCase().replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
const slugOf = documentId => documentId.replace(/^work:/, "");
const record = slug => {
  const fm = frontmatterOf(slug);
  return { name: fm.title.split(":")[0].trim(), oak: fm.ownership.oak.map(norm), collaborators: fm.ownership.collaborators.map(norm) };
};
const traces = (line, lines) => lines.some(source => source.includes(norm(line)));

// O-05-ownership: internal notes Oak has not read stay out of every fixture.
const INTERNAL_NOTES = [
  "Public collaborator and client attribution is not yet approved",
  "Platform logos in the cover identify publishing surfaces",
  "Public collaborator and tool attribution is not yet finalized",
  "Named techniques describe workflow categories",
  "No project collaborators are confirmed for this internal build",
].map(norm);

const ownershipClaims = state => (state.workspace?.messages ?? [])
  .filter(message => /Ownership\(/.test(message.ui?.program ?? ""))
  .flatMap(message => message.answer?.claims ?? []);

test("ownership fixtures: every oak and collaborators line is the same side's frontmatter line, word for word or a faithful shortening", () => {
  const misses = [];
  for (const state of states) {
    if (typeof state.recordFacts !== "object" || !state.recordFacts) continue;
    for (const [documentId, facts] of Object.entries(state.recordFacts)) {
      if (!facts.ownership) continue;
      const source = record(slugOf(documentId));
      for (const side of ["oak", "collaborators"]) {
        for (const line of facts.ownership[side]) {
          if (!traces(line, source[side])) misses.push(`${state.id} ${documentId} ${side}: ${line}`);
          if (INTERNAL_NOTES.some(note => norm(line).includes(note) || note.includes(norm(line)))) misses.push(`${state.id} internal note: ${line}`);
        }
      }
    }
  }
  assert.deepEqual(misses, []);
});

test("ownership fixtures: every answer sentence traces to a cited record, Steve's sentences to his lines and the rest to collaborators", () => {
  const misses = [];
  for (const state of states) {
    for (const claim of ownershipClaims(state)) {
      const cited = [...new Set(claim.citations.map(citation => slugOf(citation.documentId)))].map(record);
      for (let sentence of claim.text.split(/(?<=\.)\s+/)) {
        const named = cited.find(source => sentence.startsWith(`${source.name}: `));
        if (named) sentence = sentence.slice(named.name.length + 2);
        const side = sentence.startsWith("Steve ") ? "oak" : "collaborators";
        const body = side === "oak" ? sentence.slice("Steve ".length) : sentence;
        if (!(named ? [named] : cited).some(source => traces(body, source[side]))) misses.push(`${state.id} ${side}: ${sentence}`);
      }
    }
  }
  assert.deepEqual(misses, []);
});

test("ownership fixtures: the EcoSmartLoop fixture names Steve on the product backend and Frank Baah and Glenn Marvin Musoke on LEAF Engine", () => {
  const eco = states.find(state => state.id === "ownership-split").recordFacts["work:ecosmartloop"].ownership;
  assert.ok(eco.oak.some(line => /product backend/i.test(line)), "Steve's side carries the product backend");
  assert.ok(!eco.collaborators.some(line => /backend/i.test(line)), "no collaborator line claims the backend");
  assert.ok(eco.collaborators.some(line => /Frank Baah and Glenn Marvin Musoke/.test(line) && /LEAF Engine/.test(line)));
});
