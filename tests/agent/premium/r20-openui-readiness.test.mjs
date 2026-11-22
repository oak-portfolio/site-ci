import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "../design-rework/load-tsx.mjs";
import { galleryStates } from "./gallery.mjs";

// R20 OpenUI readiness. Every component in the render library (src/lib/openui.tsx) must carry five things before it ships:
// (1) a prompt line the arranger sees once it is taught, (2) a registry entry in the contracts that accepts it and guards
// its model-written props, (3) a settled gallery state in oak-states.json that renders it, (4) a pending skeleton when it
// waits on claim ids for card facts, and (5) coverage by the surface probes (r14 walks every gallery state; r16 adds
// concentric checks for cards).
// A new component fails here until each is in place. A gap that exists today is named in KNOWN_GAPS and reported as a
// `todo`; a listed gap that has been fixed fails too, so the list never goes stale. Offline: no browser, no dev server.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const { createParser } = await import("@openuidev/react-lang");
const { oakRenderLibrary, oakPromptLibrary } = loadTsx("src/lib/openui.tsx");
const { OakArrangedAnswer, oakOpenUIVerdict } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
const { primeOakRecordFacts } = loadTsx("src/lib/oakRecordFacts.ts");
const { oakOpenUISystemPrompt } = loadTsx("packages/oak-agent-contracts/src/openui/system-prompt.ts");
const { oakOpenUIProgramCovers } = loadTsx("packages/oak-agent-contracts/src/openui/verdict.ts");
const { OAK_OPENUI_BLOCKS, OAK_PENDING_CAP } = loadTsx("packages/oak-agent-contracts/src/openui/blocks.generated.ts");
const { CLAIM_BLOCKS, CLAIM_LISTS, OAK_CARD_OPENERS, SALVAGE_CONTAINERS } = loadTsx("packages/oak-agent-contracts/src/openui/program.ts");
const { STRUCTURED_COMPONENTS } = loadTsx("packages/oak-agent-contracts/src/trace-names.ts");
const read = (file) => readFileSync(file, "utf8");
const spec = JSON.parse(read("packages/oak-agent-contracts/src/openui/spec.json"));
const renderSpec = JSON.parse(read("packages/oak-agent-contracts/src/openui/render-spec.json"));
const taught = Object.keys(oakPromptLibrary.components);
const states = galleryStates;
const r14Source = read("tests/agent/premium/r14-surfaces.test.mjs");
const r16Source = read("tests/agent/premium/r16-cards.test.mjs");

/**
 * Gaps on the current tree, each named. Remove an entry when its gap is closed; the strict tests below fail on any gap
 * not listed here and on any listed gap that no longer exists.
 */
const KNOWN_GAPS = {
  "skeleton:ProjectWall": "the wall draws card facts on claim ids and its fragment names no skeleton kind; the wall ghost is checked in the browser (project-wall-streaming, tests/agent/openui-browser/project-wall.test.mjs)",
  "skeleton:Screens": "the frame draws card facts on claim ids and its fragment names no skeleton kind; the frame ghost is checked in the browser (screens-streaming, tests/agent/openui-browser/screens.test.mjs)",
  "skeleton:Board": "the board draws card facts on claim ids and its fragment names no skeleton kind; the board ghost is checked in the browser (board-streaming, tests/agent/openui-browser/board.test.mjs)",
  "skeleton:PageCards": "the cards draw card facts on claim ids and its fragment names no skeleton kind; the card ghosts are checked in the browser (page-cards-streaming, tests/agent/openui-browser/page-cards.test.mjs)",
};

const names = Object.keys(oakRenderLibrary.components);
const schema = oakRenderLibrary.toJSONSchema();
const defs = schema.$defs;
const ROOT = oakRenderLibrary.root;

const blocks = Object.values(OAK_OPENUI_BLOCKS);
const SKELETON_KINDS = new Set(blocks.map(block => block.skeleton).filter(Boolean));

/** Props the browser verdict counts as placing claims (oakPlacedClaims reads `claim`, `claims` and a CompareRow's `also`). */
const claimProp = (name) => Object.keys(defs[name].properties ?? {}).find(key => key === "claim" || key === "claims");

/**
 * A bounded integer (Steps `from`) cannot take the hostile number and still parse, so it takes an unusual value inside its
 * range: the maximum less 3. The check then reads the rendered text for it, so a component that writes the prop as words
 * fails as an unbounded number would. The out-of-range test below proves the bound itself holds.
 */
const sentinelFor = (prop) => Math.max(prop.minimum ?? 0, (prop.maximum ?? HOSTILE_NUMBER + 3) - 3);
const visibleText = (html) => html.replace(/<[^>]*>/g, " ");
const boundedIntegers = (name) => Object.entries(defs[name].properties ?? {}).filter(([, prop]) => prop.type === "integer" && prop.maximum !== undefined);
const refsOf = (prop) => [prop.items?.$ref, ...(prop.items?.anyOf ?? []).map(item => item.$ref)].filter(Boolean).map(ref => ref.split("/").at(-1));
const childOf = (name) => Object.entries(names.reduce((map, parent) => {
  for (const prop of Object.values(defs[parent].properties ?? {})) for (const ref of refsOf(prop)) (map[ref] ??= new Set()).add(parent);
  return map;
}, {})).find(([child]) => child === name)?.[1] ?? new Set();

// Model words that state a number and a date the claims never do: a guarded prop never lets them reach the screen.
const HOSTILE_TEXT = "Won 4321% in 8765";
const HOSTILE_NUMBER = 4321;
const CLAIM_WORDS = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliet"];
const citation = (documentId) => ({ documentId, passageId: `${documentId}:p`, sectionId: `${documentId}:s`, url: `https://steveoak.com/work/${documentId.split(":")[1]}/` });

/** One valid program placing `name` once, with every model-written prop set to hostile text. Returns null for the root. */
function programFor(name) {
  if (name === ROOT) return null;
  const lines = [], ids = [], sentinels = [];
  let n = 0;
  const nextId = () => { const id = `claim-${ids.length + 1}`; ids.push(id); return id; };
  const emit = (component) => {
    const ref = `n${n++}`;
    const args = Object.entries(defs[component].properties ?? {}).map(([key, prop]) => {
      // R27g: a CompareRow's `also` is its second item's claim id, placed like `claim`.
      if (key === "claim" || key === "also") return JSON.stringify(nextId());
      if (key === "claims") return JSON.stringify([nextId(), nextId()]);
      const refs = refsOf(prop);
      if (refs.length) return `[${refs.map(child => emit(child)).join(", ")}]`;
      if (prop.enum) return JSON.stringify(prop.enum[0]);
      if (prop.type === "number") return String(HOSTILE_NUMBER);
      // R27k: a bounded integer (Steps `from`) takes an in-range sentinel the text check looks for (sentinelFor).
      if (prop.type === "integer") { const value = sentinelFor(prop); sentinels.push(value); return String(value); }
      if (prop.type === "array") return JSON.stringify([`${HOSTILE_TEXT}?`, "What changed for users?"]);
      return JSON.stringify(HOSTILE_TEXT);
    });
    lines.push(`${ref} = ${component}(${args.join(", ")})`);
    return ref;
  };
  const top = emit(name);
  // A child-only component (CompareRow, TimelineItem) is placed through its first parent.
  const parent = defs[ROOT].properties.children && refsOf(defs[ROOT].properties.children).includes(name) ? null : [...childOf(name)][0];
  const placed = parent ? `p0 = ${parent}([${top}])` : null;
  const program = [`root = ${ROOT}([${placed ? "p0" : top}])`, ...(placed ? [placed] : []), ...lines].join("\n");
  return { program, ids, sentinels };
}

const answerFor = (ids, documentId = "work:alpha") => ({
  schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: "k", operations: ["search", "read"],
  kind: "sourced", nextTool: "role", text: "",
  claims: ids.map((id, index) => ({ id, text: `${CLAIM_WORDS[index]} claim reads as checked text.`, citations: [citation(documentId)] })),
});
/** Labels shaped like oakCitationLabelsWithCovers' output for every document an answer cites (work pages and roles). */
const labelsFor = (answer, cards = true) => {
  const documents = new Map();
  for (const claim of answer.claims) for (const cite of claim.citations) documents.set(cite.documentId, {
    documentId: cite.documentId, title: cite.documentId, canonicalUrl: cite.url.split("#")[0],
    ...cards ? { card: cite.documentId.startsWith("experience:")
      ? { kind: "role", title: "Design Engineer", period: "Jan 2024 - Jan 2025", place: "Employer" }
      : { kind: "work", title: "Case study", image: "/cover.webp", role: "Owner", period: "Fall", stack: ["React", "TypeScript"] } } : {},
  });
  return { knowledgeRevision: answer.knowledgeRevision, documents: [...documents.values()] };
};
const render = (answer, ui, cards = true) => renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m2", answer, ui, question: "q", citationLabels: labelsFor(answer, cards), latest: true }));
const parse = (program) => createParser(schema, ROOT).parse(program);
const typesOf = (result) => {
  const found = new Set();
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    if (value.type === "element") { found.add(value.typeName); Object.values(value.props ?? {}).forEach(visit); }
  };
  visit(result?.root ?? null);
  return found;
};

// A block whose constant is on draws from record facts through a lazy view: the cited record is in hand and every view
// is loaded before a column renders, as in the browser once the facts file has answered.
primeOakRecordFacts("k", { version: 1, knowledgeRevision: "k", records: { "work:alpha": {
  kind: "work", dek: "Alpha in one line.", category: "Applied AI", badge: "Case study", articleStatus: "full", datePublished: "2025-01-01",
  cover: { src: "/cover.webp", alt: "Alpha cover", ratio: 16 / 9 }, coverTint: "#7fb4ff", artifacts: [], metrics: [], sections: [],
  systemMap: [{ label: "Capture", description: "Capture" }, { label: "Sort", description: "Sort" }], ownership: { oak: "Everything", collaborators: [] },
} } });
for (const name of names) if (name !== ROOT) { const built = programFor(name); render(answerFor(built.ids), { requestId: "r", status: "done", program: built.program }); }
await new Promise(resolve => setTimeout(resolve, 50));

// ---- Column 1: the prompt line the arranger sees ----------------------------------------------------------------------
const promptLine = (name) => {
  if (!taught.includes(name)) return { ok: true, cell: "not taught" };
  const description = oakPromptLibrary.components[name].description?.trim();
  const signature = oakPromptLibrary.toSpec().components[name]?.signature;
  const line = signature && description ? `${signature} \u2014 ${description}` : null;
  const inPrompt = Boolean(line && oakOpenUISystemPrompt.split("\n").includes(line));
  const inSpec = spec.components?.[name]?.description === oakPromptLibrary.components[name].description;
  return { ok: inPrompt && inSpec, cell: inPrompt && inSpec ? "yes" : !description ? "no description" : !inSpec ? "spec.json stale" : "system-prompt.ts stale" };
};

// ---- Column 2: the verdict entry in the contracts ---------------------------------------------------------------------
const contractOf = (name) => {
  if (name === ROOT) return { ok: oakOpenUIProgramCovers(`root = ${ROOT}([p])\np = Prose("claim-1")`, ["claim-1"]) && Boolean(OAK_OPENUI_BLOCKS[ROOT]), cell: "root" };
  const prop = claimProp(name);
  const problems = [];
  const block = OAK_OPENUI_BLOCKS[name];
  if (!block) problems.push("no fragment in the block registry");
  if (prop && !CLAIM_BLOCKS.has(name)) problems.push("takes claims but is not in CLAIM_BLOCKS");
  if (!prop && CLAIM_BLOCKS.has(name)) problems.push("in CLAIM_BLOCKS without a claim prop");
  if ((prop === "claims") !== CLAIM_LISTS.has(name)) problems.push(prop === "claims" ? "a claims list missing from CLAIM_LISTS" : "in CLAIM_LISTS without a claims list");
  if (("also" in (defs[name].properties ?? {})) !== (block?.claims === "pair")) problems.push("an also prop and claims: pair go together");
  for (const held of block?.holds ?? []) if (!Object.values(defs[name].properties ?? {}).some(value => refsOf(value).includes(held))) problems.push(`holds ${held} but no prop takes it`);
  const built = programFor(name);
  const answer = answerFor(built.ids);
  const ids = built.ids;
  if (!oakOpenUIProgramCovers(built.program, ids)) problems.push("Worker check rejects a valid program");
  const verdict = oakOpenUIVerdict(built.program, parse(built.program), ids);
  if (verdict !== null) problems.push(`browser verdict ${verdict}`);
  const html = render(answer, { requestId: "r", status: "done", program: built.program });
  if (/4321|8765/.test(html)) problems.push("a model-written prop shows an unstated number");
  for (const value of built.sentinels) if (new RegExp(`\\b${value}\\b`).test(visibleText(html))) problems.push(`a model-written integer shows as text (${value})`);
  if (!html.includes('class="oak-openui"')) problems.push("falls back to the plain answer");
  for (const id of ids) if (!html.includes(`${CLAIM_WORDS[ids.indexOf(id)]} claim reads`)) problems.push(`${id} is not shown`);
  const words = Object.keys(defs[name].properties ?? {}).filter(key => key !== "claim" && key !== "claims" && key !== "also" && !refsOf(defs[name].properties[key]).length);
  const kind = prop === "claims" ? "claim list" : prop ? "claim block" : refsOf(Object.values(defs[name].properties ?? {})[0] ?? {}).length ? "container" : words.length ? "model words" : "app-owned";
  return { ok: !problems.length, cell: problems.length ? problems.join("; ") : `${kind}${words.length ? ` (guarded: ${words.join(", ")})` : ""}` };
};

// ---- Column 3: settled gallery states that render it -----------------------------------------------------------------
const assistantOf = (state) => state.workspace?.messages?.find(message => message.role === "assistant" && message.ui);
const gallery = new Map(names.map(name => [name, []]));
const streamingGallery = new Map();
for (const state of states) {
  const message = assistantOf(state);
  if (!message) continue;
  const answer = { ...answerFor([]), ...message.answer, knowledgeRevision: "k", nextTool: message.answer.nextTool };
  const ids = answer.claims.map(claim => claim.id);
  if (message.ui.status === "streaming") {
    const html = render(answer, message.ui);
    for (const kind of SKELETON_KINDS) if (html.includes('data-pending=""') && new RegExp(`oak-openui-${kind}"[^>]*data-pending|oak-openui-${kind}" data-pending|oak-openui-card oak-openui-${kind}" data-pending`).test(html))
      (streamingGallery.get(kind) ?? streamingGallery.set(kind, []).get(kind)).push(state.id);
    continue;
  }
  if (message.ui.status !== "done") continue;
  const result = parse(message.ui.program);
  if (oakOpenUIVerdict(message.ui.program, result, ids) !== null) continue;
  const html = render(answer, message.ui);
  if (!html.includes('class="oak-openui"')) continue;
  for (const type of typesOf(result)) gallery.get(type)?.push(state.id);
}

// ---- Column 4: the pending skeleton ----------------------------------------------------------------------------------
const skeletonOf = (name) => {
  if (name === ROOT) return { ok: true, cell: "n/a (root)" };
  const kind = OAK_OPENUI_BLOCKS[name]?.skeleton;
  const built = programFor(name);
  if (kind) {
    // While streaming, a card whose claim ids are not yet known is its skeleton.
    const pendingProgram = built.program.replace(/"claim-\d+"/g, '"claim-pending"');
    const html = render(answerFor(built.ids), { requestId: "r", status: "streaming", program: pendingProgram });
    const ok = new RegExp(`class="[^"]*\\boak-openui-${kind}\\b[^"]*"[^>]*data-pending=""`).test(html);
    return { ok, kind, cell: ok ? kind : `${kind} declared but not drawn while streaming` };
  }
  const settled = { requestId: "r", status: "done", program: built.program };
  const cardFacts = render(answerFor(built.ids), settled) !== render(answerFor(built.ids), settled, false);
  if (cardFacts && claimProp(name)) return { ok: false, cell: "card facts on claim ids, but no skeleton in its fragment" };
  return { ok: true, cell: cardFacts ? "n/a (no ids to wait for)" : "n/a (claim text in hand)" };
};

// ---- Column 5: the surface probes ------------------------------------------------------------------------------------
// r14 must walk every gallery state, or "in the gallery" stops meaning "probed".
const r14WalksAll = /const states = stateIds\(\);/.test(r14Source)
  && /arcProbe/.test(r14Source) && /insetProbe/.test(r14Source);
const probesOf = (name) => {
  const seen = gallery.get(name).length;
  const concentric = new RegExp(`\\$\\$eval\\("\\.oak-openui-${name.toLowerCase()}"`).test(r16Source);
  return { ok: r14WalksAll && seen > 0, cell: seen ? `r14 x${seen}${concentric ? " + r16 concentric" : ""}` : "none" };
};

const rows = names.map(name => {
  const skeleton = skeletonOf(name);
  return {
    name, prompt: promptLine(name), contract: contractOf(name),
    gallery: { ok: gallery.get(name).length > 0, cell: gallery.get(name).length ? [...new Set(gallery.get(name))].join(" ") : "none" },
    skeleton, probes: probesOf(name),
    skeletonGallery: skeleton.kind ? { ok: Boolean(streamingGallery.get(skeleton.kind)?.length), cell: streamingGallery.get(skeleton.kind)?.join(" ") ?? "none" } : null,
  };
});

// The table prints once per run, so a reader sees every component and every column at a glance.
{
  const cols = ["component", "prompt", "contract", "gallery", "skeleton", "probes"];
  const cells = rows.map(row => [row.name, row.prompt.cell, row.contract.cell, row.gallery.cell, `${row.skeleton.cell}${row.skeletonGallery ? ` [stream: ${row.skeletonGallery.cell}]` : ""}`, row.probes.cell]);
  const width = cols.map((col, index) => Math.min(60, Math.max(col.length, ...cells.map(cell => cell[index].length))));
  const line = (cell) => `| ${cell.map((value, index) => value.length > width[index] ? `${value.slice(0, width[index] - 1)}~` : value.padEnd(width[index])).join(" | ")} |`;
  process.stdout.write(`\nR20 OpenUI readiness (${names.length} components, root ${ROOT})\n${[line(cols), line(width.map(w => "-".repeat(w))), ...cells.map(line)].join("\n")}\n\n`);
}

const gapsFor = (column, pick) => rows.flatMap(row => { const cell = pick(row); return cell && !cell.ok ? [`${column}:${row.name}`] : []; });
const strict = (column, pick) => () => {
  const found = gapsFor(column, pick);
  const unlisted = found.filter(gap => !(gap in KNOWN_GAPS));
  const stale = Object.keys(KNOWN_GAPS).filter(gap => gap.startsWith(`${column}:`) && !found.includes(gap));
  assert.deepEqual(unlisted, [], `new ${column} gaps: ${unlisted.map(gap => `${gap} (${pick(rows.find(row => row.name === gap.split(":")[1])).cell})`).join(", ")}`);
  assert.deepEqual(stale, [], `fixed gaps still listed in KNOWN_GAPS (remove them): ${stale.join(", ")}`);
};

test("R20 spec.json is the prompt library and render-spec.json the render library: same components, same root", () => {
  assert.deepEqual(Object.keys(spec.components).sort(), [...taught].sort(), "spec.json lists exactly the taught components");
  assert.deepEqual(Object.keys(renderSpec.components).sort(), [...names].sort(), "render-spec.json lists exactly the render library's components");
  assert.deepEqual(Object.keys(OAK_OPENUI_BLOCKS).sort(), [...names].sort(), "the block registry lists exactly the render library's components");
  assert.equal(spec.root, ROOT);
  assert.equal(renderSpec.root, ROOT);
  assert.equal(names.length, new Set(names).size);
  assert.ok(r14WalksAll, "r14-surfaces still walks every gallery state with the arc and inset probes");
});
test("R20 every list derived from the registry is non-empty", () => {
  const derived = { CLAIM_BLOCKS, CLAIM_LISTS, OAK_CARD_OPENERS, SALVAGE_CONTAINERS, SKELETON_KINDS, STRUCTURED_COMPONENTS: new Set(STRUCTURED_COMPONENTS),
    OAK_PENDING_CAP: new Set(Object.keys(OAK_PENDING_CAP)), intro: new Set(blocks.filter(block => block.intro).map(block => block.name)),
    structure: new Set(blocks.filter(block => block.structure).map(block => block.name)), views: new Set(blocks.filter(block => block.view).map(block => block.name)) };
  for (const [name, set] of Object.entries(derived)) assert.ok(set.size > 0, `${name} is empty`);
  for (const name of [...CLAIM_LISTS, ...OAK_CARD_OPENERS, ...SALVAGE_CONTAINERS]) assert.ok(names.includes(name), `${name} is a library component`);
});
test("R20 every component has its prompt line in the arranger's system prompt", strict("prompt", row => row.prompt));
test("R20 every component has a verdict entry that accepts it and guards its model words", strict("contract", row => row.contract));
test("R20 every component renders in at least one settled gallery state", strict("gallery", row => row.name === ROOT ? { ok: true } : row.gallery));
test("R20 every component that waits on claim ids for card facts has a pending skeleton", strict("skeleton", row => row.skeleton));
test("R20 every skeleton has a streaming gallery state", strict("skeleton-gallery", row => row.skeletonGallery));
test("R20 every component is seen by the surface probes", strict("probes", row => row.probes));
// A judge that cannot fail is no judge (R15 review): each check here must see the failure it exists for.
test("R20 the checks can fail: a stated number shows, a fallback state is not counted, a text block draws no skeleton", () => {
  const program = 'root = Answer([m])\nm = Metric("Share", "4321%", "claim-1")';
  const stated = { ...answerFor(["claim-1"]), claims: [{ id: "claim-1", text: "It reached 4321% of plan.", citations: [citation("work:alpha")] }] };
  assert.match(render(stated, { requestId: "r", status: "done", program }), /oak-openui__metric-value[^]*4321/, "the hostile-number detector sees a number when it is shown");
  assert.ok(!gallery.get("Timeline").includes("answer-openui-fallback"), "a state whose layout falls back renders no component");
  const prose = render(answerFor(["claim-1"]), { requestId: "r", status: "streaming", program: 'root = Answer([p])\np = Prose("claim-pending")' });
  assert.doesNotMatch(prose, /data-pending/, "the skeleton check reads a real skeleton, not any streaming markup");
  const project = programFor("Project"), settled = { requestId: "r", status: "done", program: project.program };
  assert.notEqual(render(answerFor(project.ids), settled), render(answerFor(project.ids), settled, false), "the card-facts check sees a card draw from its page");
  // A bounded integer's bound is what keeps the hostile number out. The parser does not enforce it, so the component must:
  // past the maximum, the number reaches neither the text nor an attribute or style.
  const bounded = names.filter(name => boundedIntegers(name).length);
  assert.ok(bounded.length, "some component has a bounded integer prop to check");
  for (const name of bounded) {
    const built = programFor(name);
    const over = built.sentinels.reduce((program, value) => program.replace(new RegExp(`\\b${value}\\b`), String(HOSTILE_NUMBER)), built.program);
    const html = oakOpenUIVerdict(over, parse(over), built.ids) === null ? render(answerFor(built.ids), { requestId: "r", status: "done", program: over }) : "";
    assert.doesNotMatch(html, new RegExp(String(HOSTILE_NUMBER)), `${name}: an integer past its maximum never reaches the page`);
  }
});
for (const [gap, reason] of Object.entries(KNOWN_GAPS)) test(`R20 gap ${gap}`, { todo: reason });
