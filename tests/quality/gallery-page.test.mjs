import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadTsx } from "../agent/design-rework/load-tsx.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const at = (file) => path.join(root, file);
const read = (file) => readFileSync(at(file), "utf8");
const load = (file) => existsSync(at(file)) ? loadTsx(file) : assert.fail(`${file} is missing`);
const verdict = () => loadTsx("packages/oak-agent-contracts/src/openui/verdict.ts");

test("gallery: every replay is a stored program that covers each of its claims, one tile per kind, one gap tile", () => {
  const { galleryReplays } = load("src/data/galleryReplays.ts");
  const { oakOpenUIProgramCovers } = verdict();
  assert.ok(galleryReplays.length >= 6, "enough tiles for the home's six cards");
  assert.equal(new Set(galleryReplays.map(replay => replay.id)).size, galleryReplays.length, "ids are unique");
  assert.equal(new Set(galleryReplays.map(replay => replay.kind)).size, galleryReplays.length, "one tile per kind");
  for (const replay of galleryReplays) {
    assert.ok(replay.question.trim().endsWith("?"), `${replay.id}: the title is the visitor's question`);
    assert.ok(replay.answer.claims.length > 0, `${replay.id}: claims`);
    if (replay.program) assert.ok(oakOpenUIProgramCovers(replay.program, replay.answer.claims.map(claim => claim.id)), `${replay.id}: its program covers every claim`);
    for (const claim of replay.answer.claims) assert.ok(claim.citations.length > 0, `${replay.id}/${claim.id}: cited`);
  }
  const gap = galleryReplays.filter(replay => replay.answer.kind === "gap");
  assert.equal(gap.length, 1, "one refusal tile shows how Oak says the record has no answer");
});

test("gallery: each tile's preview is read from its own stored program", () => {
  const { galleryReplays, galleryPreviewOf } = load("src/data/galleryReplays.ts");
  const stats = galleryReplays.find(replay => replay.kind === "numbers");
  assert.deepEqual(galleryPreviewOf(stats), { shape: "numbers", items: ["8K+", "4"] });
  const timeline = galleryReplays.find(replay => replay.kind === "timeline");
  assert.equal(galleryPreviewOf(timeline).shape, "timeline");
  assert.ok(galleryPreviewOf(timeline).items.length >= 2);
  assert.equal(galleryPreviewOf(galleryReplays.find(replay => replay.answer.kind === "gap")).shape, "gap");
});

test("gallery: a replay plays its program in steps and settles on the whole program", () => {
  const { galleryReplays, galleryReplayFrames } = load("src/data/galleryReplays.ts");
  const stats = galleryReplays.find(replay => replay.kind === "numbers");
  const frames = galleryReplayFrames(stats.program);
  assert.ok(frames.length > 2, "more than one streamed frame");
  assert.ok(frames.slice(0, -1).every(frame => frame.status === "streaming"));
  assert.deepEqual(frames.at(-1), { status: "done", program: stats.program });
  for (let index = 1; index < frames.length; index += 1) assert.ok(frames[index].program.startsWith(frames[index - 1].program), "each frame extends the last");
});

test("gallery: the player and the page make no model call, and Ask it live stages the question and sends nothing", () => {
  const player = read("src/components/gallery/GalleryReplay.tsx");
  const page = read("src/components/gallery/GalleryPage.tsx");
  for (const source of [player, page]) {
    assert.doesNotMatch(source, /\bfetch\(|askOakSuggestion|submitOakTurn|sendOak\w*\(/, "no network and no send");
  }
  assert.match(page, /requestOakWorkspace\(/, "Ask it live opens the workspace");
  assert.match(page, /setOakDraft\(replay\.question\)/, "and stages the tile's question in the message box");
  assert.match(player, /<OakArrangedAnswer\b/, "the replay renders with the shipped answer component");
  assert.match(player, /live=\{false\}/, "a replay never reports a fallback as a live turn");
});

test("gallery: reduced motion settles the replay at once and drops tile motion", () => {
  assert.match(read("src/components/gallery/GalleryReplay.tsx"), /prefers-reduced-motion: reduce/);
  assert.match(read("src/components/gallery/gallery.css"), /@media \(prefers-reduced-motion: reduce\)/);
});

const hex = (value) => value.match(/^#([0-9a-f]{6})$/i)?.[1].match(/../g).map(part => parseInt(part, 16) / 255);
const luminance = (rgb) => rgb.map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => { const [x, y] = [luminance(hex(a)), luminance(hex(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test("gallery: every candy fill keeps its ink at 4.5:1 or better, and forced colors draw each tile's edge", () => {
  const css = read("src/components/gallery/gallery.css");
  const { galleryReplays } = load("src/data/galleryReplays.ts");
  const ink = css.match(/--gallery-ink:\s*(#[0-9a-f]{6})/i)?.[1];
  assert.ok(ink, "one ink for every tile");
  const tones = new Set(galleryReplays.map(replay => replay.tone));
  assert.equal(tones.size, galleryReplays.length, "a distinct candy color per tile");
  for (const tone of tones) {
    const fill = css.match(new RegExp(`\\[data-tone="${tone}"\\]\\s*\\{[^}]*--gallery-fill:\\s*(#[0-9a-f]{6})`, "i"))?.[1];
    assert.ok(fill, `${tone} has a fill`);
    assert.ok(contrast(ink, fill) >= 4.5, `${tone}: ${contrast(ink, fill).toFixed(2)}:1`);
  }
  const forced = css.match(/@media \(forced-colors: active\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(forced, /border:[^;]*CanvasText/, "tiles keep an edge in forced colors");
});

test("gallery: tiles share one row height and hold no card inside", () => {
  const css = read("src/components/gallery/gallery.css");
  assert.match(css, /\.gallery-grid\s*\{[^}]*grid-auto-rows:\s*1fr/);
  const page = read("src/components/gallery/GalleryPage.tsx");
  assert.doesNotMatch(page, /oak-openui|Card\b|className="[^"]*card/, "a tile draws its preview on its own surface");
});

test("gallery: the route ships off and noindex, and the search audit treats it as a private route", () => {
  const flag = load("src/lib/oakFlags/galleryPage.ts");
  assert.equal(flag.oakGalleryPage, false, "merged off until ticket 36 flips it");
  const page = read("src/pages/gallery/[...page].astro");
  assert.match(page, /oakGalleryPageOn\(\)/);
  assert.match(page, /return on \? \[\{ params: \{ page: undefined \} \}\] : \[\];/, "off, the route has no path: a real 404 with no page written");
  assert.match(page, /noindex=\{true\}|noindex\b(?!=)/, "the page is noindex until Oak reviews the replays");
  assert.match(read("scripts/quality/search-audit.mjs"), /"\/gallery"/);
});

test("gallery: the Ask home shows the six best tiles as cards only with the page on, each opening its replay", () => {
  const { galleryReplays, galleryHomeCards } = load("src/data/galleryReplays.ts");
  assert.equal(galleryHomeCards.length, 6);
  for (const id of galleryHomeCards) assert.ok(galleryReplays.some(replay => replay.id === id), `${id} is a replay`);
  const empty = read("src/components/agent/OakEmptyState.tsx");
  assert.match(empty, /oakGalleryPageOn\(\) \? (?:<React\.Suspense[^>]*>)?<GalleryHomeCards/, "behind the switch");
  const cards = read("src/components/gallery/GalleryHomeCards.tsx");
  assert.match(cards, /href=\{`\/gallery#\$\{replay\.id\}`\}/, "each card opens its replay on the gallery");
  assert.match(read("src/components/gallery/GalleryPage.tsx"), /location\.hash/, "the gallery opens the replay its hash names");
});

// Ticket 341: the blocks a visitor sees as a whole answer. Answer, Heading, Prose, Sources, Pills, CompareRow, TimelineItem and
// Meter are parts other blocks hold. Proposal, Project, Role, Source and Stack are plan and record cards other answers carry, named
// so a new kind cannot slip by; ticket 348 gave the live Profile and PageCards blocks their tiles.
const PARTS = new Set(["Answer", "Heading", "Prose", "Sources", "Pills", "CompareRow", "TimelineItem", "Meter"]);
const NO_TILE_YET = new Set(["Proposal", "Project", "Role", "Source", "Stack"]);
const LIVE_UNTAUGHT = ["Board", "StackMap", "Screens"];
const NEW_TILES = ["diagram", "table", "board", "project-wall", "stack-map", "screens", "profile", "page-cards"];
const blocksOf = (program) => new Set([...String(program ?? "").matchAll(/=\s*([A-Z]\w*)\(/g)].map(match => match[1]));

test("gallery: every live block kind has a tile whose stored program draws it", () => {
  const { galleryReplays } = load("src/data/galleryReplays.ts");
  const taught = JSON.parse(read("packages/oak-agent-contracts/src/openui/taught.json"));
  const kinds = [...taught.filter(name => !PARTS.has(name) && !NO_TILE_YET.has(name)), ...LIVE_UNTAUGHT];
  for (const kind of ["Diagram", "Table", "Board", "ProjectWall", "StackMap", "Screens", "Stats", "Timeline", "Compare", "Steps", "Points", "Callout", "Metric", "Profile", "PageCards"])
    assert.ok(kinds.includes(kind), `${kind} is a live block kind`);
  for (const kind of kinds) assert.ok(galleryReplays.some(replay => blocksOf(replay.program).has(kind)), `${kind}: a tile's stored program draws it`);
  for (const id of NEW_TILES) assert.ok(galleryReplays.some(replay => replay.id === id), `${id} has a tile`);
  assert.equal(galleryReplays.length, 16, "sixteen tiles");
  const previews = load("src/data/galleryReplays.ts");
  const shapes = galleryReplays.map(replay => previews.galleryPreviewOf(replay).shape);
  assert.equal(new Set(shapes).size, galleryReplays.length, "each tile draws its own kind of preview");
});

// Ticket 348: a claim is backed by the passage it cites, read from the snapshot the page ships. Every number the claim writes
// is in that passage (a digit may be spelled out there), and at least 85% of its content words are, matched on their first four
// letters; the cited page's title counts, so a project's own name is never missing from its own page.
const SPELLED = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const FILLER = new Set(("about after also and are been before both does each every from have into its just made make more most much " +
  "only other over same some still such than that the their them then there these they this those through very were what when where " +
  "which while with would steve").split(" "));
const tokensOf = (text) => String(text).toLowerCase().replace(/[\u2019']s\b/g, "").match(/[a-z0-9][a-z0-9.,+%-]*[a-z0-9+%]|[a-z0-9]/g) ?? [];

const MONTH_DATE = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+\d{4})?\b/g;

test("gallery: every claim on every tile cites a passage that states its numbers, its dates and its key words", () => {
  const { galleryReplays } = load("src/data/galleryReplays.ts");
  const snapshot = JSON.parse(read("src/data/generated/knowledgeSnapshot.json"));
  const passages = new Map(snapshot.documents.flatMap(document => document.passages.map(passage => [passage.id, { document, passage }])));
  const misses = [];
  for (const replay of galleryReplays) for (const claim of replay.answer.claims) {
    const cited = claim.citations.map(citation => {
      const found = passages.get(citation.passageId);
      if (!found) return misses.push(`${replay.id}/${claim.id}: ${citation.passageId} is not in the snapshot`) && "";
      if (found.document.id !== citation.documentId) misses.push(`${replay.id}/${claim.id}: ${citation.passageId} is not on ${citation.documentId}`);
      if (citation.url !== found.passage.citationUrl) misses.push(`${replay.id}/${claim.id}: the link is not ${found.passage.citationUrl}`);
      return `${found.document.title} ${found.passage.text}`.toLowerCase();
    }).join(" ");
    const citedWords = new Set(tokensOf(cited));
    const stems = new Set([...citedWords].map(word => word.slice(0, 4)));
    const numbers = tokensOf(claim.text).filter(word => /\d/.test(word))
      .filter(number => !citedWords.has(number) && !citedWords.has(SPELLED[Number(number)]));
    const keys = tokensOf(claim.text).filter(word => !/\d/.test(word) && word.length >= 4 && !FILLER.has(word));
    const missing = keys.filter(word => !stems.has(word.slice(0, 4)));
    const dates = (claim.text.match(MONTH_DATE) ?? []).filter(date => !cited.includes(date.toLowerCase()));
    if (numbers.length || dates.length || missing.length > keys.length * 0.15) {
      misses.push(`${replay.id}/${claim.id}: ${[...numbers, ...dates, ...missing].join(", ")}`);
    }
  }
  assert.deepEqual(misses, [], "each claim's words are in the passage it cites");
});

test("gallery: the page says the tiles are hand-built reference answers, not recordings", () => {
  const { galleryReplays } = load("src/data/galleryReplays.ts");
  assert.ok(galleryReplays.every(replay => !("recording" in replay)), "no stored program carries a recording source");
  const page = read("src/pages/gallery/[...page].astro");
  const copy = [...page.matchAll(/description="([^"]*)"|<p>([^<]*)<\/p>/g)].map(match => match[1] ?? match[2]);
  assert.equal(copy.length, 2, "the meta description and the replay line");
  for (const line of copy) {
    assert.doesNotMatch(line, /record/i, `${line}: names no recording`);
    assert.match(line, /reference/i, `${line}: says the tiles are reference answers`);
  }
  assert.match(copy[1], /hand-built/i, "the visible line says who built them");
  assert.doesNotMatch(read("src/components/gallery/GalleryPage.tsx"), /aria-label="Recorded/, "the grid's name says no recording either");
});

test("gallery: the constant off still shows only ticket 50's six home cards", () => {
  const { galleryHomeCards } = load("src/data/galleryReplays.ts");
  assert.deepEqual([...galleryHomeCards], ["numbers", "timeline", "compare", "steps", "points", "gap"]);
  assert.equal(load("src/lib/oakFlags/galleryPage.ts").oakGalleryPage, false);
});

const BLOCK_ROOT = { Diagram: "oak-diagram", Table: "oak-table", Board: "oak-board", ProjectWall: "oak-wall", StackMap: "oak-stack-map", Screens: "oak-screens",
  Profile: "oak-profile", PageCards: "oak-page-cards" };

test("gallery: each new tile's replay draws its block in the island, and the printer prints the claims the island shows", async () => {
  globalThis.window ??= { innerWidth: 1280, innerHeight: 900, outerWidth: 1280, outerHeight: 980, screen: {}, location: { search: "" },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), addEventListener() {}, removeEventListener() {} };
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { arrangedView } = await import("../../scripts/quality/quality-bar-core.mjs");
  const snapshot = JSON.parse(read("src/data/generated/knowledgeSnapshot.json"));
  const records = JSON.parse(read("src/data/generated/record-facts.json"));
  // record-facts.json holds the text facts only; the page's facts also carry each record's mapped artifact images, its card
  // cover from the Work page's frontmatter and its cited sections, as src/lib/oakRecordFacts.server.ts sends them.
  const { oakArtifactImages } = loadTsx("src/data/oakArtifactImages.ts");
  for (const [id, record] of Object.entries(records)) if (record.kind === "work") {
    const slug = id.replace(/^work:/, "");
    record.artifacts ??= Object.entries(oakArtifactImages[slug] ?? {}).map(([label, { src, alt }]) => ({ label, status: "verified", image: { src, alt } }));
    const [, src, alt] = read(`src/content/work/${slug}.mdx`).match(/^card:\n(?: {2}.*\n)*? {2}image: "([^"]+)"\n {2}imageAlt: "([^"]+)"/m) ?? [];
    record.cover ??= { src, alt };
    const sections = new Map();
    for (const passage of snapshot.documents.find(document => document.id === id)?.passages ?? []) {
      const anchor = new URL(passage.citationUrl).hash.slice(1);
      if (anchor && !sections.has(anchor)) sections.set(anchor, passage.headingPath[0] ?? "");
    }
    record.sections ??= [...sections].map(([anchor, title]) => ({ anchor, title }));
  }
  // The profile record is built from the home page's own copy, as src/lib/oakRecordFacts.server.ts builds it.
  const { heroCopy, profileSummary } = loadTsx("src/data/homePage.ts");
  records["profile:steve-oak"] ??= { kind: "profile", hero: { title: heroCopy.title, description: heroCopy.description },
    summary: { heading: profileSummary.heading, description: profileSummary.description, facts: profileSummary.facts.map(({ label, value }) => ({ label, value })) },
    knowsAbout: loadTsx("src/data/machineContent.ts").siteProfile.focus };
  const { galleryReplays, galleryAnswerOf } = load("src/data/galleryReplays.ts");
  loadTsx("src/lib/oakRecordFacts.ts").primeOakRecordFacts(snapshot.revision, { version: 1, knowledgeRevision: snapshot.revision, records });
  const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
  const cards = JSON.parse(read("src/data/generated/card-facts.json"));
  const labels = { knowledgeRevision: snapshot.revision, documents: snapshot.documents.map(({ id, title, canonicalUrl }) => {
    const card = cards[canonicalUrl.replace(/\/$/, "")];
    return { documentId: id, title, canonicalUrl, ...(card ? { card } : {}) };
  }) };
  const tiles = NEW_TILES.map(id => galleryReplays.find(replay => replay.id === id)).filter(Boolean);
  assert.equal(tiles.length, NEW_TILES.length, "every new tile exists");
  const draw = (replay) => renderToStaticMarkup(createElement(OakArrangedAnswer, { id: `gallery-${replay.id}`, answer: galleryAnswerOf(replay, snapshot.revision),
    ui: { requestId: "00000000-0000-4000-8000-000000000341", status: "done", program: replay.program }, question: replay.question, citationLabels: labels, latest: false, live: false }));
  const ghosted = (replay) => / oak-openui-skel"/.test(draw(replay).match(/<div class="oak-openui">(<[^>]*>)/)?.[1] ?? "");
  for (let tries = 0; tries < 20 && tiles.some(ghosted); tries++) await new Promise(resolve => setTimeout(resolve, 150));
  const words = text => String(text).toLowerCase().replace(/&#x27;/g, "'").match(/[a-z0-9]+/g) ?? [];
  for (const replay of tiles) {
    const block = Object.keys(BLOCK_ROOT).find(name => blocksOf(replay.program).has(name));
    const html = draw(replay);
    assert.match(html, new RegExp(`class="${BLOCK_ROOT[block]}[ "]`), `${replay.id}: the island draws the ${block}`);
    assert.doesNotMatch(html, new RegExp(`class="${BLOCK_ROOT[block]} oak-openui-skel"`), `${replay.id}: the ${block} settled past its ghost`);
    const answer = galleryAnswerOf(replay, snapshot.revision);
    const shown = arrangedView({ ui: { status: "done", program: replay.program }, answer }, answer.claims, { shared: false, records });
    if (LIVE_UNTAUGHT.includes(block)) { assert.equal(shown, null, `${replay.id}: the printer reads no untaught block, as printer-parity skips it`); continue; }
    assert.ok(shown, `${replay.id}: the printer reads the program`);
    const island = new Set(words(html.replace(/<[^>]+>/g, " ")));
    // Page cards open the first card only: a closed card draws its page title and keeps its quote out of the reading order.
    const closed = block === "PageCards" ? answer.claims.slice(1) : [];
    for (const claim of closed) {
      const title = snapshot.documents.find(document => document.id === claim.citations[0].documentId).title.split(":")[0];
      assert.ok(words(title).every(word => island.has(word)), `${replay.id}: the closed card for ${title} is drawn`);
    }
    for (const word of [...(shown.diagramWords ?? []).flatMap(words), ...answer.claims.filter(claim => !closed.includes(claim)).flatMap(claim => words(claim.text))])
      assert.ok(island.has(word), `${replay.id}: "${word}" printed and drawn`);
  }
});

test("gallery: one dev-gallery state per new tile replays its stored program, each with its icon row", () => {
  const { galleryReplays } = load("src/data/galleryReplays.ts");
  const states = JSON.parse(read("src/data/dev/oak-states/gallery-replays.json"));
  const icons = JSON.parse(read("design/visual-integration/oak-agent-assets/gallery-replays.json"));
  assert.deepEqual(states.map(state => state.id), NEW_TILES.map(id => `gallery-replay-${id}`));
  for (const state of states) {
    const replay = galleryReplays.find(item => `gallery-replay-${item.id}` === state.id);
    assert.ok(!("recordFacts" in state), `${state.id}: reads the site's own record facts`);
    const [user, assistant] = state.workspace.messages;
    assert.equal(user.text, replay.question);
    assert.deepEqual(assistant.answer, replay.answer, `${state.id}: the tile's answer`);
    assert.deepEqual({ status: assistant.ui.status, program: assistant.ui.program }, { status: "done", program: replay.program }, `${state.id}: the tile's program`);
    assert.equal(icons[state.id]?.iconOnly, true, `${state.id}: icon row`);
  }
});
