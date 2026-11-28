import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { loadTsx } from "../design-rework/load-tsx.mjs";
import { galleryStates, openState, stateById } from "./gallery.mjs";

// R16: answer cards (Project, Role, Source, Stack, Stats). The model names claims by id; every cover, title, role, date,
// stack chip and metric on a card comes from the cited page's own labels, and with no labels for the answer's revision a
// card reads as the plain block it stands for.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const { createParser } = await import("@openuidev/react-lang");
const { oakRenderLibrary, oakOpenUINames, oakOpenUIStack } = loadTsx("src/lib/openui.tsx");
const { OakArrangedAnswer, oakOpenUIVerdict, oakOpenUICardOf } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
const { forceOakCompareMatrix } = loadTsx("src/lib/oakFlags/compareMatrix.ts");
const { forceOakGapNoteBelow } = loadTsx("src/lib/oakFlags/gapNoteBelow.ts");
const states = galleryStates;

const base = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: "k", operations: ["search", "read"] };
const stateOf = (id) => stateById(id).workspace.messages.find(message => message.role === "assistant");
const answerOf = (id) => ({ ...base, ...stateOf(id).answer });
const parse = (program) => createParser(oakRenderLibrary.toJSONSchema(), "Answer").parse(program);

/** Labels shaped like oakCitationLabelsWithCovers' output, for the documents the fixtures cite. */
const labels = {
  knowledgeRevision: "k",
  documents: [
    { documentId: "work:ecosmartloop", title: "EcoSmartLoop: AI Agent Platform", canonicalUrl: "https://steveoak.com/work/ecosmartloop/", cover: "/eco-480.webp",
      card: { kind: "work", title: "EcoSmartLoop", image: "/eco-900.webp", imageAlt: "EcoSmartLoop cover", role: "Product-side full-stack owner", period: "September to December 2025",
        stack: ["Next.js", "TypeScript", "Vercel AI SDK", "Capacitor", "Supabase"], metrics: [{ label: "Dataset", value: "8K+ images" }, { label: "Model output", value: "4 classes" }] } },
    { documentId: "work:oakminder", title: "Oakminder: Productivity AI Agent", canonicalUrl: "https://steveoak.com/work/oakminder/", cover: "/mind-480.webp",
      card: { kind: "work", title: "Oakminder", image: "/mind-900.webp", imageAlt: "Oakminder cover", role: "Solo founder-engineer", period: "January to March 2026",
        stack: ["Expo", "React Native", "SwiftUI", "Convex", "Go"] } },
    { documentId: "experience:hyperskalers", title: "HyperSkalers", canonicalUrl: "https://steveoak.com/work#hyperskalers",
      card: { kind: "role", title: "Agentic AI Engineer", image: "/hs-480.webp", period: "Feb 2026 - May 2026", place: "HyperSkalers", stack: ["Python", "TypeScript"] } },
    { documentId: "experience:uhttention", title: "Uhttention", canonicalUrl: "https://steveoak.com/work#uhttention",
      card: { kind: "role", title: "AI Automation Engineer", image: "/uh-480.webp", period: "Jan 2024 - Jan 2025", place: "Uhttention" } },
    { documentId: "credential:google-ux", title: "Google UX Design Professional Certificate",
      canonicalUrl: "https://www.coursera.org/account/accomplishments/professional-cert/UJEHHCJ3AKXK" },
  ],
};
const render = (value, ui, citationLabels = labels) => renderToStaticMarkup(createElement(OakArrangedAnswer,
  { id: "m2", answer: value, ui, question: "q", citationLabels, latest: true }));
const done = (id) => ({ ...stateOf(id).ui, status: "done" });
const count = (html, pattern) => html.match(pattern)?.length ?? 0;

test("R16 every card fixture's settled program passes the verdict and places each claim once", () => {
  for (const id of ["answer-openui-projects", "answer-openui-roles", "answer-openui-source", "answer-openui-stats"]) {
    const { program } = stateOf(id).ui;
    const claims = stateOf(id).answer.claims.map(claim => claim.id);
    assert.equal(oakOpenUIVerdict(program, parse(program), claims), null, id);
  }
  const projects = stateOf("answer-openui-projects").answer.claims.map(claim => claim.id);
  assert.equal(oakOpenUIVerdict(stateOf("answer-openui-projects-streaming").ui.program, parse(stateOf("answer-openui-projects-streaming").ui.program), projects), "parse",
    "the mid-stream program is not a settled layout");
});

test("R17 a Project row shows its page's thumbnail, title link, role and period, named tools first, metrics, then its claims", () => {
  const value = answerOf("answer-openui-projects");
  // Ruling 92: a Project card beside a Stack shows its title only, so the row is read from the state's program without it.
  const settled = done("answer-openui-projects");
  const program = settled.program.replace(", tools", "").replace("\ntools = Stack()", "");
  assert.doesNotMatch(program, /Stack\(/);
  const html = render(value, { ...settled, program });
  assert.equal(count(html, /class="oak-openui-card oak-openui-project"/g), 2);
  assert.match(html, /class="oak-openui-art oak-openui-card__thumb" style="--oak-art-ratio:[\d.]+"><img src="\/eco-480.webp" alt="" loading="lazy"/, "R18: the 480px cover for an 80px tile; the card image's alt describes another picture; R20: drawn at its own ratio");
  assert.match(html, /<article class="oak-openui-card oak-openui-project"><p class="oak-openui-card__lead" data-own-page="">In EcoSmartLoop[\s\S]*?<\/p><div class="oak-openui-card__head">/, "214: the claim first, its record row after");
  assert.match(html, /<h4 class="oak-openui-card__title" data-said=""><a href="https:\/\/steveoak.com\/work\/ecosmartloop\/" aria-label="EcoSmartLoop, Product-side full-stack owner · September to December 2025">Product-side full-stack owner · September to December 2025<\/a>/, "the card title links to the page, in place, by name; the name the overview states is not printed again");
  assert.match(html, /Product-side full-stack owner · September to December 2025/);
  // Named tools first (Next.js, Vercel AI SDK, Capacitor are in the claims; TypeScript is not), at most three.
  const chips = [...html.matchAll(/<ul class="oak-openui-chips" aria-label="Stack">(.*?)<\/ul>/g)].map(match => [...match[1].matchAll(/>([^<]+)<\/li>/g)].map(chip => chip[1]));
  assert.deepEqual(chips[0], ["Next.js", "Vercel AI SDK", "Capacitor"]);
  assert.equal(chips[1][0], "Convex", "Oakminder's named tool leads its chips");
  // R18 (review v15: "the reply text is too short before generative UI"): the written overview leads both cards.
  assert.match(html, /<div class="oak-openui"><p class="oak-openui__prose">Steve has built two AI products end to end[\s\S]*?<\/p><article class="oak-openui-card oak-openui-project">/);
  assert.doesNotMatch(html, /oak-openui__intro/, "no templated framing line under a written overview");
  // R18: each card's first claim is its lead line, the rest quieter points; numbers are label-over-value cells.
  assert.match(html, /<p class="oak-openui-card__lead" data-own-page="">In EcoSmartLoop, Steve built Orbi AI/);
  assert.match(html, /<dt>Dataset<\/dt><dd>8K\+ images<\/dd>/);
  assert.doesNotMatch(html, /oak-openui-card__cover/, "no full-width cover art");
  for (const claim of value.claims) assert.equal(html.split(claim.text.slice(0, 40)).length - 1, 1, `${claim.id} renders once`);
});

test("R16 labels from another knowledge revision give no card facts, so cards read as their plain blocks", () => {
  const value = answerOf("answer-openui-projects");
  const stale = { ...labels, knowledgeRevision: "other" };
  for (const id of ["answer-openui-projects", "answer-openui-roles"]) {
    const html = render(answerOf(id), done(id), stale);
    assert.doesNotMatch(html, /oak-openui-card|<img src="\/(eco|mind|hs|uh)/, id);
    assert.match(html, /class="oak-openui__points"/, id);
  }
  assert.equal(oakOpenUICardOf(value.claims[0], "k", stale), null);
  assert.equal(render(value, done("answer-openui-projects"), null).includes("oak-openui-card"), false, "no labels at all");
});

test("R20 a Role leads with its employer's own artwork, the employer as headline with dates and length, titles as chips", () => {
  const value = answerOf("answer-openui-roles");
  const html = render(value, done("answer-openui-roles"));
  assert.equal(count(html, /class="oak-openui-card oak-openui-role"/g), 2);
  // R20 (Oak, review v17): each role shows its own timeline artwork, decorative (the employer is the headline), never a monogram.
  assert.match(html, /<article class="oak-openui-card oak-openui-role"[^>]*data-art=""><span class="oak-openui-art oak-openui-role__art" style="--oak-art-ratio:[\d.]+"><img src="\/hs-480.webp" alt=""/);
  assert.match(html, /<img src="\/uh-480.webp" alt=""/);
  assert.doesNotMatch(html, /oak-openui-role__tile/, "no monogram when the page has artwork");
  assert.match(html, /<p class="oak-openui-card__lead" data-own-page="">At HyperSkalers, Steve owned[\s\S]*?<\/p><div class="oak-openui-role__head"><h4 class="oak-openui-card__title oak-openui-role__employer" data-said=""><a href="https:\/\/steveoak.com\/work#hyperskalers" aria-label="HyperSkalers, 2026 · 4 mos">2026 · 4 mos<\/a><\/h4>/, "214: the claim first; the employer the sentence states names the link, the dates and length stay visible");
  assert.match(html, /<ul class="oak-openui-chips oak-openui-role__titles" aria-label="Role"><li class="oak-openui-chip">Agentic AI Engineer<\/li><\/ul>/);
  assert.match(html, /<p class="oak-openui-card__lead" data-own-page="">At HyperSkalers, Steve owned/);
  for (const claim of value.claims) assert.equal(html.split(claim.text.slice(0, 40)).length - 1, 1, `${claim.id} renders once`);
});

test("R19 a role's length is arithmetic on the page's own dates, or nothing", async () => {
  const { oakRoleDuration } = loadTsx("src/lib/openui.tsx");
  assert.equal(oakRoleDuration("Feb 2026 - May 2026"), "4 mos");
  assert.equal(oakRoleDuration("Jan 2024 - Jan 2025"), "1 yr 1 mo");
  assert.equal(oakRoleDuration("May 2024 - Dec 2025"), "1 yr 8 mos");
  for (const period of ["May 2026 - Present", "2024", undefined, "Dec 2025 - Jan 2024"]) assert.equal(oakRoleDuration(period), null, String(period));
});

test("R19 a Source is a citation card: site kicker, the claim as a pull quote, the page as a picture or a quiet panel", () => {
  const html = render(answerOf("answer-openui-source"), done("answer-openui-source"));
  const [own, other] = html.split('<article class="oak-openui-source"').slice(1);
  assert.ok(own && other, "two source cards");
  assert.ok(own.indexOf("oak-openui-source__excerpt") < own.indexOf("oak-openui-source__kicker") && own.indexOf("oak-openui-source__kicker") < own.indexOf("oak-openui-source__page"), "214: claim, site, page");
  assert.match(own, /^ data-face="image">/);
  assert.match(own, /<img class="oak-openui-source__cover" src="\/mind-900.webp" alt=""/, "Steve's page shows its card picture");
  assert.match(own, /<a href="https:\/\/steveoak.com\/work\/oakminder\/#after-the-app-store-distribution-started">Oakminder: Productivity AI Agent<\/a>/, "the link goes to the cited section");
  // R21 (Oak, review v18: too much text): Steve's own page carries no kind label; only an outside page says so.
  assert.match(own, /<span>steveoak.com<\/span><\/p>/);
  assert.match(other, /^ data-face="tile">/);
  assert.doesNotMatch(other, /oak-openui-source__cover/, "another site shows no picture");
  assert.match(other, /class="oak-openui-source__tile" aria-hidden="true"><img src="\/assets\/brand-icons\/coursera.png"/);
  assert.match(other, /target="_blank" rel="noopener noreferrer">Google UX Design Professional Certificate<span class="sr-only"> \(new tab\)<\/span>/);
  assert.match(other, /<span>coursera.org<\/span><span class="oak-openui-source__kind">External page<\/span>/);
});

test("R16 Stack shows the cited pages' tools that some claim names as a whole word, and nothing under two", () => {
  const value = answerOf("answer-openui-projects");
  const cardOf = claim => oakOpenUICardOf(claim, "k", labels);
  assert.deepEqual(oakOpenUIStack(value.claims, cardOf), ["Next.js", "Vercel AI SDK", "Capacitor", "Convex"]);
  assert.equal(oakOpenUINames("He wrote good docs", "Go"), false, "Go is not inside good");
  assert.equal(oakOpenUINames("built with next.js and Go.", "Next.js"), true, "any case");
  const html = render(value, done("answer-openui-projects"));
  assert.match(html, /<ul class="oak-openui-chips oak-openui-stack" aria-label="Tools named in this answer">/);
  const one = { ...value, claims: value.claims.map(claim => ({ ...claim, text: claim.text.replace(/Vercel AI SDK|Capacitor|Next\.js/g, "it") })) };
  assert.doesNotMatch(render(one, done("answer-openui-projects")), /oak-openui-stack/, "one match (Convex) renders nothing");
});

test("R16 Stats lays out its Metric blocks as tiles, and a single item renders as that item", () => {
  const value = answerOf("answer-openui-stats");
  const html = render(value, done("answer-openui-stats"));
  assert.equal(count(html, /class="oak-openui-stats__tile"/g), 2);
  // R19 visual review: no generic glyph row; tiles citing one page drop their chips (the answer already shows it).
  assert.doesNotMatch(html, /oak-openui-stats__glyph/);
  assert.match(html, /class="oak-openui-stats" data-count="2" data-one-page=""/);
  assert.match(html, /oak-openui__metric-value" aria-hidden="true"><span>8K<span class="oak-openui__metric-suffix">\+<\/span><\/span>/);
  const single = 'root = Answer([lead, nums, c, src])\nlead = Prose("claim-1")\nnums = Stats([a])\na = Metric("Training images", "8K+", "claim-2")\nc = Prose("claim-3")\nsrc = Sources()';
  assert.equal(oakOpenUIVerdict(single, parse(single), value.claims.map(claim => claim.id)), null);
  const one = render(value, { ...done("answer-openui-stats"), program: single });
  assert.doesNotMatch(one, /oak-openui-stats/);
  assert.match(one, /oak-openui__metric-value" aria-hidden="true"><span>8K<span class="oak-openui__metric-suffix">\+<\/span><\/span>/);
});

test("R27n live: a Metric beside a Meter counts its big number, so a 40-character longer Metric sentence stacks the tiles", () => {
  const cite = [{ documentId: "experience:hyperskalers", passageId: "experience:hyperskalers:passage-002", sectionId: "experience:hyperskalers", url: "https://steveoak.com/work#hyperskalers" }];
  const views = "At Global EdTech Organization, he built hook-generation and repurposing workflows that helped scale team content to 50-100M organic views per month, showing how generative automation supports reach across social platforms.";
  const conversion = "At Global EdTech Organization, his audience-routed chatbots and newsletter automation connected user intent to funnel paths, improving conversion by about 30%.";
  const value = { ...base, kind: "sourced", acknowledgment: null, claims: [
    { id: "claim-1", text: "Steve's numbers include 50-100M monthly organic views and about 30% improved conversion.", citations: cite },
    { id: "claim-2", text: views, citations: cite }, { id: "claim-3", text: conversion, citations: cite }] };
  const program = (b) => `root = Answer([lead, nums, src])\nlead = Prose("claim-1")\nnums = Stats([a, b])\na = Metric("Monthly organic views", "50-100M", "claim-2")\n${b}\nsrc = Sources()`;
  const ui = (text) => ({ requestId: "00000000-0000-4000-8000-0000000000e7", program: text, status: "done" });
  assert.match(render(value, ui(program('b = Meter("Conversion improvement", 30, "claim-3")'))), /class="oak-openui-stats" data-count="2" data-one-page="" data-uneven=""/);
  // Two Metrics with the same sentences keep one row.
  assert.doesNotMatch(render(value, ui(program('b = Metric("Conversion improvement", "30%", "claim-3")'))), /data-uneven/);
});

test("R27h Compare names its two columns only when every paired row cites the same two card pages in the same order", () => {
  forceOakCompareMatrix(false);
  try {
    const value = answerOf("answer-openui-compare-paired");
    const program = done("answer-openui-compare-paired").program;
    const head = (text, citationLabels = labels) => render(value, { ...done("answer-openui-compare-paired"), program: text }, citationLabels)
      .match(/<div class="oak-openui__compare-head" aria-hidden="true"><span><\/span><span>([^<]*)<\/span><span>([^<]*)<\/span><\/div>/)?.slice(1) ?? null;
    assert.deepEqual(head(program), ["Oakminder", "EcoSmartLoop"]);
    // A swapped second row would sit under the wrong names: no header.
    assert.equal(head(program.replace('"claim-4", "claim-5"', '"claim-5", "claim-4"')), null);
    // A page with no card for this revision names no column.
    assert.equal(head(program, { ...labels, documents: labels.documents.filter(document => document.documentId !== "work:ecosmartloop") }), null);
  } finally {
    forceOakCompareMatrix(null);
  }
});

test("R17 while streaming, a card line whose claims have not arrived is a skeleton in its settled row's shape", () => {
  const value = answerOf("answer-openui-projects");
  const html = render(value, stateOf("answer-openui-projects-streaming").ui);
  assert.equal(count(html, /class="oak-openui-card oak-openui-project" data-pending="" aria-hidden="true"><span class="oak-openui-card__bars" data-lead="">(?:<span class="oak-openui-card__bar"[^>]*><\/span>)+<\/span><span class="oak-openui-card__head"><span class="oak-openui-card__thumb"><\/span>/g), 1, "214: the lead claim's bars first, the record row after");
  assert.equal(count(html, /<article class="oak-openui-card oak-openui-project">/g), 1, "the first card has settled");
  for (const claim of value.claims) assert.ok(html.includes(claim.text.slice(0, 40)), `${claim.id} stays readable while streaming`);
  const css = readFileSync("src/styles/openui/skeleton.css", "utf8");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*:is\(\.oak-openui-card, \.oak-openui-source(?:, \.oak-openui-skel)?\)\[data-pending\][^{]+\{\s*animation: none;/, "no shimmer under reduced motion");
});

const open = async (page, state) => {
  await openState(page, state);
  await page.waitForTimeout(400);
};

test("R17 gallery: items are full-width rows at every width, thumbnails concentric, skeletons the settled row's size", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await open(page, "answer-openui-projects");
    const rows = await page.$$eval(".oak-openui-project", cards => cards.map(card => {
      const box = card.getBoundingClientRect(), column = card.closest(".oak-openui").getBoundingClientRect();
      const thumb = card.querySelector(".oak-openui-card__thumb"), style = getComputedStyle(card);
      const tb = thumb.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, column: column.width, radius: parseFloat(style.borderTopLeftRadius),
        inset: tb.x - box.x, thumbRadius: parseFloat(getComputedStyle(thumb).borderTopLeftRadius),
        src: thumb.querySelector("img").getAttribute("src") };
    }));
    assert.equal(rows.length, 2);
    assert.ok(rows[1].y > rows[0].y + 1, "stacked, never side by side");
    assert.ok(rows.every(row => Math.abs(row.width - row.column) < 1), JSON.stringify(rows));
    // Concentric: the thumbnail's corner is the row's corner less the inset it sits at (WWDC25 356), within 1px.
    assert.ok(rows.every(row => row.radius === 48 && Math.abs(row.thumbRadius - (row.radius - row.inset)) <= 1), JSON.stringify(rows));
    assert.ok(rows.every(row => /^\/assets\/generated\/work\/.+-(480|900)\.webp$/.test(row.src)), "a generated WebP");

    await open(page, "answer-openui-projects-streaming");
    const head = sel => page.$$eval(sel, heads => heads.map(item => item.getBoundingClientRect().height));
    const pending = await head(".oak-openui-card[data-pending] .oak-openui-card__head");
    const settled = await head(".oak-openui-card:not([data-pending]) .oak-openui-card__head");
    assert.equal(pending.length, 1);
    assert.ok(Math.abs(pending[0] - settled[0]) < 1, `the skeleton's head is the settled head's height (${pending[0]} vs ${settled[0]})`);

    await open(page, "answer-openui-source");
    const faces = await page.$$eval(".oak-openui-source", cards => cards.map(card => {
      const box = card.getBoundingClientRect(), pic = card.querySelector(".oak-openui-source__page"), pb = pic.getBoundingClientRect();
      return { face: card.dataset.face, inset: pb.x - box.x, radius: parseFloat(getComputedStyle(card).borderTopLeftRadius), picRadius: parseFloat(getComputedStyle(pic).borderTopLeftRadius),
        broken: [...card.querySelectorAll("img")].some(img => img.complete && img.naturalWidth === 0) };
    }));
    assert.deepEqual(faces.map(card => card.face), ["image", "tile"]);
    assert.ok(faces.every(card => !card.broken), "no broken image");
    // Concentric: the page picture's corner is the card's corner less the inset it sits at.
    assert.ok(faces.every(card => Math.abs(card.picRadius - (card.radius - card.inset)) <= 2), JSON.stringify(faces));

    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, "answer-openui-roles");
    const narrow = await page.$$eval(".oak-openui-role", cards => cards.map(card => card.scrollWidth <= card.clientWidth + 1));
    assert.ok(narrow.length === 2 && narrow.every(Boolean), "role rows do not overflow at 390");
  } finally {
    await browser.close();
  }
});

// Ticket 34 (DoD 24): a Board card sits straight in the answer, so its corner is the frame step and its pad the frame pad; the
// column header shares that pad so its words line up with the card's; the ghost card keeps the same corner.
test("Board gallery: cards take the frame corner and pad, headers line up with card text, the ghost card matches", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const probe = () => page.$$eval(".oak-board__column", columns => columns.map(column => {
      const card = column.querySelector(".oak-board__card"), style = getComputedStyle(card), head = column.querySelector(".oak-board__head");
      // Resolve the tokens where the card sits, so the browser does the var() and calc() math.
      const tester = column.appendChild(document.createElement("i"));
      tester.style.cssText = "position:absolute;border-radius:var(--oak-r-frame);padding-left:var(--oak-pad-frame)";
      const frame = parseFloat(getComputedStyle(tester).borderTopLeftRadius), framePad = parseFloat(getComputedStyle(tester).paddingLeft);
      tester.remove();
      return { radius: parseFloat(style.borderTopLeftRadius), frame, pad: parseFloat(style.paddingLeft), framePad,
        headPad: parseFloat(getComputedStyle(head).paddingLeft), aligned: Math.abs((head.getBoundingClientRect().x + parseFloat(getComputedStyle(head).paddingLeft)) - (card.getBoundingClientRect().x + parseFloat(style.paddingLeft))) <= 1 };
    }));
    for (const state of ["board-stand-5", "board-streaming"]) {
      await open(page, state);
      const columns = await probe();
      assert.ok(columns.length >= 2, `${state}: columns drawn`);
      assert.ok(columns.every(c => c.radius === c.frame && c.frame > 0 && c.pad === c.framePad && c.pad === 32 && c.aligned), `${state}: ${JSON.stringify(columns)}`);
    }
  } finally {
    await browser.close();
  }
});

// R16 review (adversarial): a Project listing claims from two case studies put the second claim under the first page's
// title, cover and stack. A card now holds only the claims that cite its own page; the rest follow it as plain points.
test("R16 a card holds only the claims citing its page; a claim from another page follows as a plain point", () => {
  const value = answerOf("answer-openui-projects");
  // Ticket 211: claim 1 cites two case studies, so it prints once after the card; the EcoSmartLoop card holds claims 2 and 3.
  const program = 'root = Answer([mixed, src])\nmixed = Project(["claim-1", "claim-2", "claim-3", "claim-4", "claim-5"])\nsrc = Sources()';
  assert.equal(oakOpenUIVerdict(program, parse(program), value.claims.map(claim => claim.id)), null);
  const html = render(value, { ...done("answer-openui-projects"), program });
  const [card, after] = html.split("</article>");
  assert.match(card, /<a href="https:\/\/steveoak.com\/work\/ecosmartloop\/" aria-label="EcoSmartLoop, /);
  const [overview, ...rest] = value.claims;
  assert.ok(!card.includes(overview.text.slice(0, 40)), `${overview.id} cites two case studies, so it is not in the card`);
  assert.equal(after.split(overview.text.slice(0, 40)).length - 1, 1, `${overview.id} prints once, after the card`);
  for (const claim of rest.slice(0, 2)) assert.ok(card.includes(claim.text.slice(0, 40)), `${claim.id} sits in the EcoSmartLoop card`);
  for (const claim of rest.slice(2)) {
    assert.ok(!card.includes(claim.text.slice(0, 40)), `${claim.id} (Oakminder) is not under EcoSmartLoop`);
    assert.ok(after.includes(claim.text.slice(0, 40)), `${claim.id} still shows, after the card`);
  }
  const empty = 'root = Answer([lead, none, src])\nlead = Points(["claim-1", "claim-2", "claim-3", "claim-4", "claim-5"])\nnone = Project([])\nsrc = Sources()';
  assert.doesNotMatch(render(value, { ...done("answer-openui-projects"), program: empty }), /oak-openui-card|<ul class="oak-openui__points"><\/ul>/, "an empty card renders nothing");
});

// R16 review (standards): the generated prompt allows sub-components inline, so Stats([Metric(...)]) must not fail the
// structural check and drop the whole layout.
test("R16 Stats holding Metric calls written inline passes the structural check; any other inline call still fails", async () => {
  const { oakOpenUIProgramCovers } = await import("../../../packages/oak-agent-contracts/src/openui/verdict.ts");
  const ids = ["claim-1", "claim-2", "claim-3"];
  const inline = 'root = Answer([lead, nums, src])\nlead = Prose("claim-1")\nnums = Stats([Metric("Images", "8K+", "claim-2"), Meter("Share", 40, "claim-3")])\nsrc = Sources()';
  assert.equal(oakOpenUIProgramCovers(inline, ids), true);
  const sneaky = 'root = Answer([lead, nums, src])\nlead = Prose("claim-1")\nnums = Stats([Prose("claim-2"), Metric("Share", "40%", "claim-3")])\nsrc = Sources()';
  assert.equal(oakOpenUIProgramCovers(sneaky, ids), false, "a Prose inside Stats is still a nested claim block");
});

test("R16 a one-word stack item must match its case, so a common word is not a tool", () => {
  assert.equal(oakOpenUINames("with subtle motion cues", "Motion"), false);
  assert.equal(oakOpenUINames("animated with Motion", "Motion"), true);
  assert.equal(oakOpenUINames("built with next.js", "Next.js"), true, "a multi-part name still matches any case");
});

// R16 review (spec): partial and fallback must read as their own states with cards too.
test("R16 a partial answer keeps its scoped absence above the cards; a fallback shows the plain answer with no card", () => {
  const value = answerOf("answer-openui-partial-cards");
  assert.equal(value.kind, "gap");
  forceOakGapNoteBelow(false);
  const html = render(value, done("answer-openui-partial-cards"));
  forceOakGapNoteBelow(null);
  const ack = html.indexOf(value.acknowledgment.slice(0, 40)), card = html.indexOf('<article class="oak-openui-card oak-openui-project">');
  assert.ok(ack >= 0 && card > ack, "the acknowledgment sits above the first card");
  const fallback = render(value, { ...done("answer-openui-partial-cards"), program: "", status: "fallback" });
  assert.doesNotMatch(fallback, /oak-openui-card/);
  // The plain answer reveals word by word, so its text is read with the markup stripped.
  const plain = fallback.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
  for (const claim of value.claims) assert.ok(plain.includes(claim.text.slice(0, 40)), `${claim.id} still shows in the fallback`);
});

// R17 (eval: the arranger gives each case study a one-claim card, so no claim can lead): the app frames the layout, but
// only as a fallback. R18: an answer whose claim 1 is a written overview (20 or more words) leads with it instead.
test("R18 a written overview leads cards; only an answer without one falls back to the app's framing line", () => {
  const value = answerOf("answer-openui-projects");
  const cards = 'root = Answer([eco, mind, src])\neco = Project(["claim-1", "claim-2", "claim-3"])\nmind = Project(["claim-4", "claim-5"])\nsrc = Sources()';
  // While streaming the browser leads as the Worker will at settle; a settled program renders exactly as the Worker sent it.
  const led = render(value, { ...done("answer-openui-projects"), status: "streaming", program: cards });
  assert.match(led, /^[\s\S]*?<div class="oak-openui"><p class="oak-openui__prose">Steve has built two AI products/, "the overview leads, even while the arranger left it in a card");
  assert.doesNotMatch(led, /oak-openui__intro/);
  assert.equal(led.split(value.claims[0].text.slice(0, 40)).length - 1, 1, "the overview shows once");
  const short = { ...value, claims: [{ ...value.claims[0], text: "Steve built two apps." }, ...value.claims.slice(1)] };
  const framed = render(short, { ...done("answer-openui-projects"), status: "streaming", program: cards });
  assert.match(framed, /^[\s\S]*?<div class="oak-openui"><p class="oak-openui__prose oak-openui__intro">From two of Steve&#x27;s case studies:<\/p><article/);
  const prose = 'root = Answer([p, eco, more, src])\np = Prose("claim-1")\neco = Project(["claim-2"])\nmore = Points(["claim-3", "claim-4", "claim-5"])\nsrc = Sources()';
  assert.doesNotMatch(render(short, { ...done("answer-openui-projects"), program: prose }), /oak-openui__intro/, "a sentence-led layout needs no frame");
  // The only card leads with its first claim while streaming too, so that claim never jumps out of its card at done.
  const streaming = render(short, { ...done("answer-openui-projects"), status: "streaming", program: 'root = Answer([eco, more, src])\neco = Project(["claim-1", "claim-2"])\nmore = Points(["claim-3"' });
  assert.ok(streaming.indexOf("Steve built two apps.") < streaming.indexOf('<article class="oak-openui-card'), "the lead sits above the only card while streaming");
});
