import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "../design-rework/load-tsx.mjs";
import { galleryStates, stateById } from "./gallery.mjs";

// Ticket 15 (record card views): the Project, Role, Source and Stack cards and the web research rows take the explored
// brand marks, media backdrop and fetched date, keeping main's labels, years, folded claims and Escape rule. No browser.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
void galleryStates;
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
const { OakPublicResearch } = loadTsx("src/components/agent/OakPublicResearch.tsx");
const { oakToolMark } = loadTsx("src/lib/oakToolMarks.ts");
const flags = loadTsx("src/lib/oakChatFlags.ts");
const css = readFileSync(new URL("../../../src/styles/openui/source.css", import.meta.url), "utf8");

const base = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: "k", operations: ["search", "read"] };
const stateOf = (id) => stateById(id).workspace.messages.find(message => message.role === "assistant");
const answerOf = (id) => ({ ...base, ...stateOf(id).answer });
const done = (id) => ({ ...stateOf(id).ui, status: "done" });
const labels = {
  knowledgeRevision: "k",
  documents: [
    { documentId: "work:ecosmartloop", title: "EcoSmartLoop: AI Agent Platform", canonicalUrl: "https://steveoak.com/work/ecosmartloop/", cover: "/eco-480.webp",
      card: { kind: "work", title: "EcoSmartLoop", image: "/eco-900.webp", imageAlt: "EcoSmartLoop cover", role: "Product-side full-stack owner", period: "September to December 2025",
        stack: ["Next.js", "TypeScript", "Vercel AI SDK", "Capacitor", "Supabase"], metrics: [{ label: "Dataset", value: "8K+ images" }] } },
    { documentId: "work:oakminder", title: "Oakminder: Productivity AI Agent", canonicalUrl: "https://steveoak.com/work/oakminder/", cover: "/mind-480.webp",
      card: { kind: "work", title: "Oakminder", image: "/mind-900.webp", imageAlt: "Oakminder cover", role: "Solo founder-engineer", period: "January to March 2026",
        stack: ["Expo", "React Native", "SwiftUI", "Convex", "Go"] } },
    { documentId: "experience:hyperskalers", title: "HyperSkalers", canonicalUrl: "https://steveoak.com/work#hyperskalers",
      card: { kind: "role", title: "Agentic AI Engineer, Design Engineer", image: "/hs-480.webp", period: "Feb 2026 - May 2026", place: "HyperSkalers", stack: ["Python", "TypeScript"] } },
    { documentId: "credential:google-ux", title: "Google UX Design Professional Certificate",
      canonicalUrl: "https://www.coursera.org/account/accomplishments/professional-cert/UJEHHCJ3AKXK" },
  ],
};
const render = (id, citationLabels = labels) => renderToStaticMarkup(createElement(OakArrangedAnswer,
  { id: "m2", answer: answerOf(id), ui: done(id), question: "q", citationLabels, latest: true }));
const count = (html, pattern) => html.match(pattern)?.length ?? 0;

test("T15 a tool's mark is its bundled registry icon by key or label, and none when the registry has no such tool", () => {
  assert.equal(oakToolMark("Next.js"), "/assets/brand-icons/nextjs.png");
  assert.equal(oakToolMark("TypeScript"), "/assets/brand-icons/typescript.png");
  assert.equal(oakToolMark("next.js"), "/assets/brand-icons/nextjs.png", "case and punctuation fold");
  for (const missing of ["Go", "SwiftUI", "Memory", "", "Vercel AI SDK x"]) assert.equal(oakToolMark(missing), null, JSON.stringify(missing));
  assert.match(oakToolMark("Convex") ?? "", /^\/assets\/brand-icons\/[a-z0-9]+\.png$/, "a mark is a bundled path, never another site");
});

test("T15 the three switches ship on, each its own constant (M5)", () => {
  for (const name of ["oakSourceBackdrop", "oakToolMarks", "oakWebRowChecked"]) assert.equal(flags[name], true, name);
});

test("T15 Stack chips lead with a mark where the registry has one, keep one chip per tool and the same words", () => {
  const html = render("answer-openui-projects");
  const stack = html.slice(html.indexOf('class="oak-openui-chips oak-openui-stack"'));
  const items = [...stack.slice(0, stack.indexOf("</ul>")).matchAll(/<li class="oak-openui-chip"([^>]*)>(.*?)<\/li>/g)];
  assert.deepEqual(items.map(item => item[2].replace(/<[^>]+>/g, "")), ["Next.js", "Vercel AI SDK", "Capacitor", "Convex"], "once each, the same words");
  const marked = items.filter(item => item[1].includes("data-mark"));
  assert.ok(marked.length >= 2, "registry tools carry a mark");
  for (const item of marked) assert.match(item[2], /^<img class="oak-openui-chip__mark" src="\/assets\/brand-icons\/[a-z0-9]+\.png" alt="" width="16" height="16"/, "decoration: empty alt, bundled path");
  // Ticket 23: Vercel AI SDK wears the AI SDK mark, and a tool the registry lacks leads with a neutral glyph (t23b).
  for (const item of items.filter(item => !item[1].includes("data-mark"))) assert.match(item[0], /data-glyph=""><svg data-icon="code"/, "an unmarked tool keeps a glyph");
  assert.match(stack, /aria-label="Tools named in this answer"/);
});

test("T15 a Project's stack chips take the same marks; Role title chips stay text", () => {
  const projects = render("answer-openui-projects");
  assert.match(projects, /<ul class="oak-openui-chips" aria-label="Stack"><li class="oak-openui-chip" data-mark=""><img class="oak-openui-chip__mark"/);
  const roles = render("answer-openui-roles");
  const titles = roles.slice(roles.indexOf('aria-label="Role"'));
  assert.doesNotMatch(titles.slice(0, titles.indexOf("</ul>")), /oak-openui-chip__mark|data-mark/, "a job title is not a tool");
});

test("T15 Role keeps years, one title per chip and extra claims folded where find-in-page reaches", () => {
  const html = render("answer-openui-roles");
  assert.match(html, /aria-label="HyperSkalers, 2026 · 4 mos">2026 · 4 mos<\/a>/, "214: the years stay visible after a sentence that names the employer");
  assert.match(html, /<li class="oak-openui-chip">Agentic AI Engineer<\/li><li class="oak-openui-chip">Design Engineer<\/li>/, "each comma part is its own chip");
  // The closed panel mounts only in the browser (r21-text-budget reads hidden="until-found" there); here the trigger and the source stay.
  assert.match(html, /<span>\d+ more<\/span>/);
  assert.match(readFileSync(new URL("../../../src/lib/openui/cards.tsx", import.meta.url), "utf8"), /<CollapsibleContent hiddenUntilFound className="oak-openui-card__more-panel">/);
});

test("T15 a Source with a picture shows it whole over a blurred copy; a tile card and the External page label are unchanged", () => {
  const html = render("answer-openui-source");
  const [own, other] = html.split('<article class="oak-openui-source"').slice(1);
  assert.match(own, /<div class="oak-openui-source__page oak-media-tile" data-backdrop=""><img class="oak-openui-source__backdrop" src="\/mind-900\.webp" alt="" aria-hidden="true"/);
  assert.match(own, /<img class="oak-openui-source__cover" src="\/mind-900\.webp" alt=""/, "the whole picture, still decoration");
  assert.doesNotMatch(own, /External page/, "Steve's own page carries no label");
  assert.doesNotMatch(other, /data-backdrop|--oak-backdrop/, "another site shows no picture, so no backdrop");
  assert.equal(count(other, /External page/g), 1, "only the outside page says so");
  assert.match(css, /\.oak-openui-source__backdrop \{[^}]*filter: blur\(/);
  assert.match(css, /\.oak-openui-source__page\[data-backdrop\] \.oak-openui-source__cover \{\s*object-fit: contain;/);
});

test("T15 a web research row with no site date says when it was checked; a dated row keeps its date", () => {
  const event = stateById("research-web").workspace.messages[0].research;
  const html = renderToStaticMarkup(createElement(OakPublicResearch, { event, state: "complete" }));
  const rows = html.slice(html.indexOf("oak-research__rows"));
  const metas = [...rows.matchAll(/<span class="oak-research__row-meta">(.*?)<\/span>/g)].map(match => match[1]);
  assert.equal(metas.length, 3);
  const checked = new Date(event.sources[0].retrievedAt).toISOString().slice(0, 10);
  for (const [at, source] of event.sources.entries()) {
    if (source.publishedAt) assert.ok(metas[at].includes(source.publishedAt.slice(0, 10)) && !metas[at].includes("Checked"), metas[at]);
    else assert.ok(metas[at].includes(`Checked ${checked}`), metas[at]);
  }
  assert.ok(event.sources.some(source => !source.publishedAt), "the fixture has an undated row");
});
