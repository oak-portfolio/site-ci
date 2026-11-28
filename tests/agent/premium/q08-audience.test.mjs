import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { loadTsx } from "../design-rework/load-tsx.mjs";
import { openState } from "./gallery.mjs";

const { oakStarterSet, oakStarters, oakComposerSuggestions } = loadTsx("src/lib/oakSuggestions.ts");
const { oakAudienceOf } = loadTsx("packages/oak-agent-contracts/src/transport.ts");

const labels = { knowledgeRevision: "r-q08", documents: [{ documentId: "work:ecosmartloop", title: "EcoSmartLoop: AI Agent Platform", canonicalUrl: "https://steveoak.com/work/ecosmartloop/" }] };
const audiences = ["recruiter", "collaborator", "learner"];
const texts = (route, audience) => oakStarterSet(route, labels, audience).map(starter => starter.text);
const states = { "empty": "mixed", "empty-recruiter": "recruiter", "empty-collaborator": "collaborator", "empty-learner": "learner" };

async function starters(page, state) {
  await openState(page, state);
  await page.waitForTimeout(700); // the staggered rise settles
  return page.locator(".oak-conversation__starters").evaluate(group => ({
    audience: group.dataset.audience,
    rows: [...group.querySelectorAll(".ui-suggestion")].map(row => {
      const box = row.getBoundingClientRect(), label = row.querySelector(".ui-suggestion__label"), line = parseFloat(getComputedStyle(label).lineHeight);
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return { text: label.textContent, top: box.top, bottom: box.bottom, onTop: row.contains(hit), oneLine: label.getBoundingClientRect().height <= line * 1.5,
        tone: row.querySelector(".oak-starter-glyph")?.dataset.tone };
    }),
    viewport: innerHeight,
  }));
}

test("Q08-G1 each audience gets its own three starters and a guest with no purpose gets the mixed welcome", () => {
  const home = Object.fromEntries([undefined, ...audiences].map(audience => [audience ?? "mixed", texts("/", audience)]));
  assert.deepEqual(home.mixed, [...oakStarters], "a guest keeps the mixed welcome");
  for (const set of Object.values(home)) assert.equal(set.length, 3);
  assert.equal(new Set(Object.values(home).flat()).size >= 10, true, "the four sets are distinct, sharing at most one line");
  for (const [a, b] of [["mixed", "recruiter"], ["mixed", "collaborator"], ["mixed", "learner"], ["recruiter", "collaborator"], ["recruiter", "learner"], ["collaborator", "learner"]])
    assert.notDeepEqual(home[a], home[b], `${a} and ${b} differ`);
  assert.ok(home.recruiter.some(text => /own/.test(text)) && home.recruiter.some(text => /available/.test(text)), "recruiters get ownership and availability");
  assert.ok(home.collaborator.some(text => /advice/.test(text)) && home.collaborator.some(text => /brief/.test(text)), "collaborators get advice and a brief");
  assert.ok(home.learner.some(text => /learn/.test(text)) && home.learner.some(text => /current/.test(text)), "learners get lessons and current sources");
  // The audience is the visitor's purpose; "something else" and a guest get no audience.
  assert.deepEqual(["recruiting", "consulting", "research", "exploring", "other", null].map(oakAudienceOf), ["recruiter", "collaborator", "collaborator", "learner", undefined, undefined]);
});

test("Q08-G1 the gallery's signed-in states show the starters for their account purpose", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    for (const [state, audience] of Object.entries(states)) {
      const shown = await starters(page, state);
      assert.equal(shown.audience, audience, state);
      assert.deepEqual(shown.rows.map(row => row.text), texts("/__dev/oak-states", audience === "mixed" ? undefined : audience), state);
    }
  } finally { await browser.close(); }
});

test("Q08-G2 on a Work page the first starter names that project for every audience, and the set stays three", () => {
  for (const audience of [undefined, ...audiences]) {
    const work = oakStarterSet("/work/ecosmartloop", labels, audience);
    assert.match(work[0].text, /EcoSmartLoop/, `${audience ?? "mixed"} names the project first`);
    assert.equal(work[0].intent, "page");
    assert.equal(work.length, 3, "the project takes the first slot instead of adding a row");
    assert.ok(work.slice(1).every(starter => !/EcoSmartLoop/.test(starter.text)), "only the first names it");
  }
  assert.equal(texts("/work/unknown-page", "recruiter")[0], "What did Steve own, and when?", "an unknown page keeps the audience set");
});

for (const [width, height] of [[1280, 720], [1440, 900]]) {
  test(`Q08-G3 every starter is visible, on one line and above the composer at ${width}x${height}`, async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width, height } });
      for (const state of Object.keys(states)) {
        const shown = await starters(page, state);
        assert.equal(shown.rows.length, 3, state);
        for (const row of shown.rows) {
          assert.ok(row.top >= 0 && row.bottom <= shown.viewport, `${state}: "${row.text}" is inside the viewport (${row.top}-${row.bottom})`);
          assert.ok(row.onTop, `${state}: "${row.text}" is not covered by the composer or a tip`);
          assert.ok(row.oneLine, `${state}: "${row.text}" fits one line`);
        }
      }
    } finally { await browser.close(); }
  });
}

test("Q08-G1 a sourced answer's last follow-up speaks to the visitor's audience; a guest keeps the general one", () => {
  const answer = { kind: "sourced", acknowledgment: null, claims: [{ id: "c", text: "x", citations: [] }] };
  const state = purpose => ({ pending: false, error: null, contactNotice: "", saveError: null, historyError: null, authError: null,
    authStatus: purpose ? { kind: "account", purpose } : { kind: "guest" },
    messages: [{ id: "u", role: "user", text: "What did Steve build?" }, { id: "a", role: "assistant", state: "complete", answer, cards: [] }] });
  assert.equal(oakComposerSuggestions(state("recruiting"), false).at(-1), "How can I reach Steve about a role?");
  assert.equal(oakComposerSuggestions(state("consulting"), false).at(-1), "How would Steve approach a project like mine?");
  assert.equal(oakComposerSuggestions(state("exploring"), false).at(-1), "What lesson from this can I reuse?");
  assert.equal(oakComposerSuggestions(state(null), false).at(-1), "How does this experience transfer to a new project?");
});
