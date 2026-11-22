import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "./load-tsx.mjs";

const { oakMeaningIcons, oakAnswerKinds, oakSourceMeaning } = loadTsx("src/lib/oakMeaningIcons.ts");
const { OakCitations } = loadTsx("src/components/agent/OakCitations.tsx");
const { OakRoleFitReview } = loadTsx("src/components/agent/OakRoleFitReview.tsx");
const icons = (markup) => [...markup.matchAll(/data-icon="([^"]+)"/g)].map((match) => match[1]);

test("D17-G1 source types, answer kinds and role-fit statuses each render their mapped icon", () => {
  const cite = (documentId, url) => ({ documentId, passageId: `${documentId}:p`, sectionId: `${documentId}:s`, url });
  const citations = [cite("work:ecosmartloop", "https://steveoak.com/work/ecosmartloop/"), cite("experience:pnpp", "https://steveoak.com/work"),
    cite("profile:steve", "https://steveoak.com/"), cite("resource:kusala", "https://steveoak.com/apps/kusala-daily/"),
    cite("legacy-matcha-by-maryam:x", "https://example.com/codex/matchabymaryam")];
  const markup = renderToStaticMarkup(createElement(OakCitations, { citations, knowledgeRevision: "r", label: "Sources" }));
  assert.deepEqual(icons(markup), ["workHistory", "briefcase", "userAccount", "technology", "news"]);
  for (const citation of citations) assert.equal(oakMeaningIcons[oakSourceMeaning(citation)], icons(renderToStaticMarkup(createElement(OakCitations, { citations: [citation], knowledgeRevision: "r", label: "S" })))[0]);

  assert.deepEqual(Object.fromEntries(Object.entries(oakAnswerKinds).map(([kind, entry]) => [kind, oakMeaningIcons[entry.meaning]])),
    { advice: "ideas", "role-fit": "balanceScale", document: "fileSearch", gap: "helpCircle" });
  assert.equal(oakAnswerKinds.sourced, undefined, "a plain sourced answer needs no eyebrow");

  const row = (status) => ({ id: status, requirement: { text: "design interfaces", start: 0, end: 17 }, status, evidence: [], gap: null, questions: [] });
  const review = renderToStaticMarkup(createElement(OakRoleFitReview, { onContact() {}, answer: { kind: "role-fit", knowledgeRevision: "r", contactTopics: [],
    rows: [row("demonstrated"), row("transferable"), row("missing-evidence")] } }));
  // R19 (intentional update, Oak review v16): the legend is dots and words; a row's glyph draws its own ring or dash, so only Met uses an icon (a tick from the meaning map).
  assert.deepEqual(icons(review), ["tick", "arrowDown", "sparkles"].filter(name => name === "tick"), "Met is the only status drawn as an icon");
});

test("D17-G2 the agent icon map gives each meaning one icon and each icon one meaning", () => {
  const values = Object.values(oakMeaningIcons);
  const repeated = values.filter((icon, index) => values.indexOf(icon) !== index);
  assert.deepEqual(repeated, [], `icons used for more than one meaning: ${repeated.join(", ")}`);
});
