// Ticket 20 (Q35 A, decision O24): the wave quality bar's pure core. Recorded runs in, pass or fail per threshold out.
// A reading that was never taken fails its capsule, so a wave cannot pass on a check nobody ran.
import { readdirSync, readFileSync } from "node:fs";
import { createParser } from "@openuidev/lang-core";
import { parse as parseYaml } from "yaml";
import { OAK_OPENUI_BLOCKS } from "../../packages/oak-agent-contracts/src/openui/blocks.generated.ts";
import openuiSpec from "../../packages/oak-agent-contracts/src/openui/spec.json" with { type: "json" };
import { OAK_CARD_OPENERS, OAK_OVERVIEW_MIN_WORDS, oakOpenUIFramingLine, oakOpenUIOwnWords, oakOpenUIProgramCovers, oakOpenUIRepeats, oakOpenUIStated, oakOpenUIStatements } from "../../packages/oak-agent-contracts/src/openui/verdict.ts";
import { oakCardView, oakMetricView, oakOpenUIProposalOf } from "../../packages/oak-agent-contracts/src/openui/block-view.ts";
import { oakFramingLineCount } from "../../src/lib/oakFlags/framingLineCount.ts";
import snapshot from "../../src/data/generated/knowledgeSnapshot.json" with { type: "json" };
import { legacyFramerCaseStudies } from "../../src/data/legacyWork.ts";
import { oakCitationLabel, oakSourceShortLabel, oakSourceSite } from "../../src/lib/oakCitationLabels.ts";
import { oakCalloutKindsOn } from "../../src/lib/oakFlags/calloutKinds.ts";
import { oakDiagramBlockOn } from "../../src/lib/oakFlags/diagram.ts";

export const O24 = { preferredRate: 0.6, trustFailures: 0, firstGhostP50Ms: 1500, firstBlockP50Ms: 3000, majorDesignFindings: 0 };
// Review r208: below this many judged pairs one pair moves the rate 5 points or more, so the preference capsule fails whatever the rate.
export const MIN_JUDGED_PAIRS = 20;

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] : null;
};

// A pair holds one judged order per `first` side. The judge has a position bias, so a pick counts only when both orders agree.
const pairVerdict = (orders) => {
  const picks = new Map(orders.map((order) => [order.first, order.pick]));
  if (!picks.has("arranged") || !picks.has("plain")) return null;
  return picks.get("arranged") === picks.get("plain") ? picks.get("arranged") : "tie";
};

const squash = (text) => String(text).replace(/\s+/g, " ").trim();
/**
 * Ticket 208: a pair whose two sides are the same words gives the judge nothing to prefer. The eval marks it (`same`, from
 * pairwiseViews, which also reads the layout's blocks); rows from before that are read from their views alone.
 */
export const sameWords = (pair) => pair.same ?? (!!pair.views && squash(pair.views.arranged) === squash(pair.views.plain));

/**
 * `pairs`: [{ id, handCheck?, same?, views?, orders: [{ first: "arranged" | "plain", pick: "arranged" | "plain" | "tie" }] }]; `handChecks`: Oak's pick by pair id.
 * A same-words pair is counted under `same`, named in `skipped`, and stays out of `pairs`, `unjudged` and `rate`.
 */
export function preference(pairs, handChecks = {}) {
  const differing = pairs.filter((pair) => !sameWords(pair));
  const judged = differing.map((pair) => ({ id: pair.id, handCheck: !!pair.handCheck, verdict: pairVerdict(pair.orders ?? []) })).filter((pair) => pair.verdict);
  const count = (verdict) => judged.filter((pair) => pair.verdict === verdict).length;
  const flagged = judged.filter((pair) => pair.handCheck), checked = flagged.filter((pair) => handChecks[pair.id]);
  const agreed = checked.filter((pair) => handChecks[pair.id] === pair.verdict).length;
  const skipped = pairs.filter((pair) => sameWords(pair)).map((pair) => pair.id);
  return { pairs: judged.length, same: skipped.length, skipped, unjudged: differing.length - judged.length, arranged: count("arranged"), plain: count("plain"), ties: count("tie"),
    rate: judged.length ? count("arranged") / judged.length : null,
    handCheck: { flagged: flagged.map((pair) => pair.id), checked: checked.length, agreed, rate: checked.length ? agreed / checked.length : null } };
}

const words = (text) => new Set(String(text).toLowerCase().match(/[a-z0-9][a-z0-9'%-]{3,}/g) ?? []);
// shortcut: word containment, not meaning, so a reworded restatement passes; upgrade to a judge when a hand check finds one.
const restates = (lead, block) => {
  const said = words(lead), mine = [...words(block)];
  return mine.length >= 4 && mine.filter((word) => said.has(word)).length / mine.length >= 0.8;
};

/**
 * `turns`: [{ id, claims: [{ id, text, citations: [{ documentId }] }], program, drawn: [{ block, labeled }] }]; `records`: the
 * public record ids, or null to skip that half. `drawn` lists blocks the model drew outside the records (ADR 0006).
 */
export function trust(turns, records = null) {
  const failures = [];
  for (const turn of turns) {
    const fail = (check, detail) => failures.push({ id: turn.id, check, detail });
    if (turn.failed) { fail("turn-failed", "the turn returned no answer"); continue; }
    const claims = turn.claims ?? [];
    for (const claim of claims) {
      const cited = claim.citations ?? [];
      if (!cited.length) fail("fact-outside-records", `${claim.id} cites no record`);
      for (const { documentId } of cited) if (records && !records.has(documentId)) fail("fact-outside-records", `${claim.id} cites ${documentId}, which is not a public record`);
    }
    for (const drawn of turn.drawn ?? []) if (!drawn.labeled) fail("label-missing", `${drawn.block} is drawn outside the records with no "Drawn by Oak AI" label`);
    const statements = turn.program ? oakOpenUIStatements(turn.program) : null;
    if (!statements) continue;
    const text = new Map(claims.map((claim) => [claim.id, claim.text]));
    const held = (statement) => [...statement.body.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]).filter((id) => text.has(id));
    const byName = new Map(statements.map((statement) => [statement.name, statement]));
    const first = (byName.get("root")?.body.match(/[A-Za-z_]\w*/g) ?? []).map((name) => byName.get(name)).find((statement) => statement && held(statement).length);
    if (first?.component !== "Prose") continue;
    const lead = text.get(held(first)[0]);
    for (const block of statements) {
      if (block.component === "Prose") continue;
      for (const id of held(block)) if (restates(lead, text.get(id))) fail("lead-restates-block", `the lead repeats ${id} (${block.component})`);
    }
  }
  return { turns: turns.length, failures };
}

/** `rows`: the pairwise eval's rows, `{ id, turn, error }`; `turn` is null when the answer failed, which fails trust. */
export const trustTurns = (rows) => rows.map((row) => row.turn ?? { id: row.id, failed: true });

/**
 * `traces`: the Worker's trace metadata rows, `{ plan: { sentMs, recordBlockMs, firstChunkMs } }` (tickets 18 and 169), all from the turn start. Nothing else is read.
 * First block is arrange's first chunk. With `recordCardsAtPlan` (the site's oakRecordCardsAtPlan for the run) it is the earlier
 * of that and `recordBlockMs`: the Worker writes `recordBlockMs` whenever a plan names records, but cards paint only with the flag on.
 * A plan that was sent but never filled a block counts as over any limit, so ghosts that never fill make the reading worse.
 */
export function latency(traces, { recordCardsAtPlan = false } = {}) {
  const plans = traces.map((trace) => ({ sentMs: trace.plan?.sentMs, firstChunkMs: trace.plan?.firstChunkMs, recordBlockMs: trace.plan?.recordBlockMs }));
  const ghosts = plans.map((plan) => plan.sentMs).filter(Number.isFinite);
  const blocks = plans.flatMap((plan) => {
    const filled = [recordCardsAtPlan ? plan.recordBlockMs : null, plan.firstChunkMs].filter(Number.isFinite);
    return filled.length ? [Math.min(...filled)] : Number.isFinite(plan.sentMs) ? [Infinity] : [];
  });
  const stats = (values) => ({ n: values.length, p50: percentile(values, 0.5), p90: percentile(values, 0.9) });
  return { firstGhost: { source: "plan.sentMs", ...stats(ghosts) },
    firstBlock: { source: recordCardsAtPlan ? "plan.recordBlockMs or arrange.firstChunkMs" : "arrange.firstChunkMs", recordCardsAtPlan,
      n: blocks.length, unfilled: blocks.filter((ms) => ms === Infinity).length, p50: percentile(blocks, 0.5), p90: percentile(blocks, 0.9) } };
}

/**
 * `design`: [{ source: "design-judge" | "capture-judge", state, width, major, detail }], or null when design QA did not run.
 * `recordCardsAtPlan`: oakRecordCardsAtPlan for the run, read at `recordCardsHead` (a commit) unless the run forced it.
 * `preferenceOnly`: the rows came from an OAK_EVAL_PREFERENCE_ONLY=1 run, which took no latency repeats, so the wave never passes on them.
 */
export function qualityBar({ wave, pairs = [], handChecks = {}, turns = [], records = null, traces = [], design = null, recordCardsAtPlan = false, recordCardsHead = null, minPairs = MIN_JUDGED_PAIRS, preferenceOnly = false }, bar = O24) {
  const preferred = preference(pairs, handChecks), trusted = trust(turns, records), timed = latency(traces, { recordCardsAtPlan });
  const majors = design?.filter((finding) => finding.major) ?? null;
  const under = (reading, limit) => reading !== null && reading < limit;
  const capsules = {
    preference: { pass: preferred.pairs >= minPairs && preferred.rate !== null && preferred.rate >= bar.preferredRate, threshold: bar.preferredRate, minPairs, ...preferred },
    trust: { pass: trusted.turns > 0 && trusted.failures.length <= bar.trustFailures, threshold: bar.trustFailures, ...trusted },
    latency: { pass: under(timed.firstGhost.p50, bar.firstGhostP50Ms) && under(timed.firstBlock.p50, bar.firstBlockP50Ms) && timed.firstBlock.n >= timed.firstGhost.n,
      threshold: { firstGhostP50Ms: bar.firstGhostP50Ms, firstBlockP50Ms: bar.firstBlockP50Ms }, recordCardsHead, ...timed },
    design: { pass: majors !== null && majors.length <= bar.majorDesignFindings, threshold: bar.majorDesignFindings, ran: design !== null, findings: design?.length ?? 0, majors: majors ?? [] },
  };
  return { wave, ...(preferenceOnly ? { preferenceOnly } : {}), pass: !preferenceOnly && Object.values(capsules).every((capsule) => capsule.pass), capsules };
}

const mark = (ok) => (ok ? "pass" : "fail");
const percent = (rate) => (rate === null ? "no reading" : `${Math.round(rate * 100)}%`);
const seconds = (ms) => (ms === null ? "no reading" : ms === Infinity ? "never filled" : `${(ms / 1000).toFixed(1)} s`);

/**
 * The wave report's Markdown: the four capsules first (concept-v12-q35-quality-after), then the counts behind them.
 * A preference-only run gets its own first line and the preference counts alone, never the four capsules.
 */
export function qualityBarMarkdown({ wave, pass, preferenceOnly = false, capsules: { preference: p, trust: t, latency: l, design: d } }) {
  const timing = (label, reading, limit) => `${label} ${seconds(reading.p50)} p50, ${seconds(reading.p90)} p90 (bar ${seconds(limit)})`;
  const head = preferenceOnly ? [`# Preference only, wave ${wave}: ${mark(p.pass)}. Not a quality bar wave (OAK_EVAL_PREFERENCE_ONLY=1): trust, latency and design are not read.`, "",
    `Arranged preferred in ${percent(p.rate)} of ${p.pairs} pairs (bar ${percent(p.threshold)}).`, ""] : [`# Quality bar, wave ${wave}: ${mark(pass)}`, "",
    "| Preference | Trust checks | Latency | Phone and desktop QA |", "| --- | --- | --- | --- |",
    `| ${mark(p.pass)}: arranged preferred in ${percent(p.rate)} of ${p.pairs} pairs (bar ${percent(p.threshold)}) | ${mark(t.pass)}: ${t.failures.length} failures in ${t.turns} answers (bar ${t.threshold}) | ` +
      `${mark(l.pass)}: ${timing("first ghost", l.firstGhost, l.threshold.firstGhostP50Ms)}; ${timing("first block", l.firstBlock, l.threshold.firstBlockP50Ms)} | ` +
      `${mark(d.pass)}: ${d.ran ? `${d.majors.length} major findings (bar ${d.threshold})` : "not run"} |`, ""];
  return [...head,
    `Pairs: ${p.arranged} arranged, ${p.plain} plain, ${p.ties} ties (the two orders disagreed, or both said tie), ${p.unjudged} not judged in both orders, ${p.same} same words on both sides (no judge call, not in the rate).`,
    ...(p.skipped.length ? [`Same words, skipped: ${p.skipped.join(", ")}.`] : []),
    ...(p.pairs < p.minPairs ? [`Preference fails its floor: ${p.pairs} judged pairs, the capsule needs ${p.minPairs}.`] : []),
    `Hand check: ${p.handCheck.flagged.length} pairs flagged, ${p.handCheck.checked} checked by Oak, ${p.handCheck.rate === null ? "no agreement rate yet" : `the judge agreed on ${percent(p.handCheck.rate)}`}.`,
    ...(preferenceOnly ? [] : [`Latency samples: ${l.firstGhost.n} first ghosts (${l.firstGhost.source}), ${l.firstBlock.n} first blocks (${l.firstBlock.source}, ${l.firstBlock.unfilled} never filled, counted as over the limit; record cards at plan ${l.firstBlock.recordCardsAtPlan ? "on" : "off"}${l.recordCardsHead ? ` at ${l.recordCardsHead}` : ""}), both from the turn start.`,
    ...t.failures.map((failure) => `- Trust: ${failure.id} ${failure.check}: ${failure.detail}`),
    ...d.majors.map((finding) => `- Design: ${finding.state} at ${finding.width}px (${finding.source}): ${finding.detail}`)]), ""].join("\n");
}

// The next step is a separate button under the answer with a title and a hint (src/lib/oakNextStep.ts). Q14 run 6: given the
// bare title, the judge read "Draft a contact brief" as the answer cut off mid-sentence, so it is shown as the button it is.
export const NEXT_STEP_SHOWN = {
  role: '\n[Next-step button] Compare a role: See how Steve fits the job you have in mind',
  advice: '\n[Next-step button] Get project advice: Talk through your product or AI decision',
  brief: '\n[Next-step button] Draft a contact brief: Write a short note you send to Steve yourself',
};

// Q17: an arranged answer is judged as the visitor sees it. The browser renders a settled program only when it parses with no
// error and places every claim (src/components/agent/OakOpenUIAnswer.tsx); otherwise the visitor reads the plain answer.
const openuiParser = createParser(openuiSpec.schema, openuiSpec.root);
// Ticket 249: the word a backed Callout kind shows beside its icon (Callout.tsx KINDS).
const CALLOUT_WORDS = { held: 'Not published yet', now: 'In progress', off: 'Off the record', guard: 'Outside what I answer' };
// The spec teaches Callout's kind once oakCalloutKinds flips; forced on, the program is read as that spec reads it.
const kindsSchema = structuredClone(openuiSpec.schema);
kindsSchema.$defs.Callout.properties.kind ??= { type: 'string', enum: Object.keys(CALLOUT_WORDS) };
const kindsParser = createParser(kindsSchema, openuiSpec.root);
// Ticket 249: a work page's record facts (systemMap, articleStatus) as oakRecordFacts.server.ts reads them from its front matter.
const WORK_DIR = new URL('../../src/content/work/', import.meta.url);
const WORK = new Map(readdirSync(WORK_DIR).filter(file => file.endsWith('.mdx')).map(file => [`work:${file.replace(/\.mdx$/, '')}`,
  parseYaml(readFileSync(new URL(file, WORK_DIR), 'utf8').match(/^---\n([\s\S]*?)\n---/)[1])]));
const WORDLESS = Symbol('wordless');
// R16: the cards (Project, Role, Source) and their companions (Stack, Stats) count as structure too: each fragment's `structure`.
const STRUCTURE = new Set(Object.values(OAK_OPENUI_BLOCKS).filter(block => block.structure).map(block => block.name));
// A card's claims, whichever prop shape the library gives it (a list, or one claim).
const cardClaims = p => Array.isArray(p.claims) ? p.claims : typeof p.claim === 'string' ? [p.claim, ...(typeof p.also === 'string' ? [p.also] : [])] : [];
// Ticket 172: a card's record fields as the page's citation labels project them from the snapshot (oakCitationCovers.server.ts),
// shown only for the answer's own knowledge revision, as oakOpenUICardOf does. Record fields only, never claim text.
const LABELS = { knowledgeRevision: snapshot.revision, documents: snapshot.documents.map(({ id, title, canonicalUrl }) => ({ documentId: id, title, canonicalUrl })) };
const RECORDS = new Map(snapshot.documents.map(document => [document.id, document]));
const fields = (...values) => values.filter(Boolean).join('; ');
// Ticket 214: a record line drops each field a sentence about its page states; the name field stays when nothing else is left.
const unsaid = (said, name, ...values) => {
  const kept = values.filter(value => value && !said(value));
  return fields(...(kept.length ? kept : [name]));
};
// Review r214 M1: the short title a Project card shows and tests, read where oakSourceCards (oakCitationCovers.server.ts) reads
// it: a Work page's frontmatter card.title, a legacy case study's listed title. Keyed by canonical URL without its last slash.
const urlKey = url => url.replace(/\/$/, '');
const CARD_TITLES = new Map([
  ...readdirSync(WORK_DIR).filter(name => /\.mdx?$/.test(name)).map(name => {
    const front = readFileSync(new URL(name, WORK_DIR), 'utf8').match(/^---\n([\s\S]*?)\n---/)?.[1];
    return [urlKey(`https://steveoak.com/work/${name.replace(/\.mdx?$/, '')}/`), front ? parseYaml(front)?.card?.title : undefined];
  }),
  ...legacyFramerCaseStudies.map(study => [urlKey(study.href), study.title]),
]);
const RECORD_TAG = { Source: '[source card] ', Project: '[project card] ', Role: '[role card] ' };
const RECORD_LINE = {
  Source: (citation) => {
    const { host } = oakSourceSite(citation.url), title = oakCitationLabel(citation, snapshot.revision, LABELS, host);
    return title === host ? host : `${host}: ${title}`;
  },
  Project: (citation, record, said) => {
    const title = CARD_TITLES.get(urlKey(record.canonicalUrl)) ?? record.title;
    return ['work', 'legacy'].includes(record.kind) && unsaid(said, title, title, record.attribution?.role, record.dates?.period);
  },
  // Review r214 L1: the Role card always shows its period, so only the job title and employer drop.
  Role: (citation, record, said) => record.kind === 'experience' && unsaid(field => field !== record.dates?.period && said(field), record.title, record.attribution?.role, record.title, record.dates?.period),
};
// Ticket 182: the browser's plain answer ends with the same Sources button, a follow-up row and the next-step button, so a
// side-by-side judge prints the arranged side without them (`shared: false`).
const SHARED_CHROME = new Set(['Sources', 'Pills']);
// Review r208 M2: the blocks the plain answer also shows. Any other block is content only the arranged side has, words or not.
const PLAIN_BLOCKS = new Set([openuiSpec.root, 'Prose', ...SHARED_CHROME]);
/**
 * `result`: one turn's `{ ui, answer }`; `claims`: its `[{ id, text }]`. Null when the browser would show the plain answer instead.
 * `tags: false` (ticket 208, used with `shared: false`) prints only the words on each block, no bracketed tag, with a blank
 * line between the root's blocks and between the items of a Stats or Timeline, as the plain side is joined.
 * `counted` (ticket 227) is the `oakFramingLineCount` switch the Framing line reads, off by default as in the browser.
 */
export function arrangedView(result, claims, { shared = true, tags = true, counted = oakFramingLineCount } = {}) {
  const ui = result.ui;
  if (!ui || ui.status !== 'done') return null;
  const parsed = (oakCalloutKindsOn() ? kindsParser : openuiParser).parse(ui.program);
  if (!parsed.root || parsed.meta.errors.length || parsed.meta.unresolved.length) return null;
  if (parsed.meta.orphaned.length || !oakOpenUIProgramCovers(ui.program, claims.map(c => c.id))) return null;
  const claimOf = id => claims.find(c => c.id === id);
  const text = id => claimOf(id)?.text ?? '';
  const tag = label => tags || !label.startsWith('[') ? label : '';
  const facts = id => result.answer.knowledgeRevision === snapshot.revision && RECORDS.has(id) ? RECORDS.get(id) : null;
  // Ticket 249: the browser draws a Diagram from the cited work record's steps, and the Steps list under two of them.
  // shortcut: radar and quadrant are untaught and draw as flow; print their comparison once a fragment teaches them.
  const diagramSteps = (p) => {
    const page = claims.find(c => c.id === p.claim)?.citations?.[0]?.documentId;
    const steps = oakDiagramBlockOn() && facts(page)?.kind === 'work' ? WORK.get(page)?.systemMap ?? [] : [];
    if (steps.length < 2) return [];
    return p.preset === 'blockdiag' && OAK_OPENUI_BLOCKS.Diagram.taughtPresets.includes('blockdiag')
      ? steps.map(step => `${step.label}: ${step.description}`) : [steps.map(step => step.label).join(' -> ')];
  };
  // shortcut: a current role reads its period's "Present" from the snapshot, not careerTimeline; switch if the two drift.
  const backed = (kind, claim) => kind === 'guard' || (kind === 'off' ? claim.citations?.length === 0 : (claim.citations ?? []).some(c => {
    const record = facts(c.documentId);
    return record?.kind === 'work' ? WORK.get(c.documentId)?.articleStatus === 'in-progress-stub' : kind === 'now' && record?.kind === 'experience' && /Present$/.test(record.dates?.period ?? '');
  }));
  const calloutWord = p => {
    const claim = claims.find(c => c.id === p.claim);
    return oakCalloutKindsOn() && CALLOUT_WORDS[p.kind] && claim && backed(p.kind, claim) ? `${CALLOUT_WORDS[p.kind]}: ` : '';
  };
  // A card's record line, only for the answer's own revision: another revision's labels give the browser no card.
  // Ticket 214: the line drops a field a claim citing only that page already states.
  const recordOf = (type, claim) => {
    const citation = claim?.citations?.[0];
    const record = RECORD_LINE[type] && result.answer.knowledgeRevision === snapshot.revision && citation && RECORDS.get(citation.documentId);
    const about = record ? claims.filter(c => c.citations?.length && c.citations.every(d => d.documentId === citation.documentId)) : [];
    const line = record && RECORD_LINE[type](citation, record, field => about.some(c => oakOpenUIRepeats(c.text, field)));
    return typeof line === 'string' ? `${tag(RECORD_TAG[type])}${line}` : null;
  };
  const kinds = new Set(), lines = [], top = new Set(parsed.root.props?.children ?? []), starts = [];
  const adds = new Set();
  let recordLines = 0;
  // Review r208 M1: a Stats or Timeline item carries no bullet, so it reads as a paragraph and takes the plain side's blank line.
  const paragraphs = new Set(), item = line => { paragraphs.add(lines.length); lines.push(line); };
  const views = {
    walk: (p, view) => walk(p[view.prop]), 'walk-values': p => Object.values(p).forEach(walk),
    heading: p => { const t = oakOpenUIOwnWords(p.text, 48); if (t) lines.push(`## ${t}`); },
    // Ticket 214: a card prints its first claim, then its record line as where it comes from, then its other claims.
    claims: (p, view, type) => {
      const ids = cardClaims(p);
      // Ticket 251 (ruling 40): one page card is drawn as its page's title and Open page link over the claim, never a one-item list.
      const page = type === 'PageCards' && ids.length === 1 && claimOf(ids[0])?.citations?.[0];
      if (page?.url) {
        const { host } = oakSourceSite(page.url);
        lines.push(`${tag('[page card] ')}${oakSourceShortLabel(oakCitationLabel(page, snapshot.revision, LABELS, host), Infinity)}: ${page.url.split('#')[0]}`, text(ids[0]));
        return;
      }
      // The browser's Source with no card is the claim's plain sentence, so it carries no prefix either way; its claim reads first (ticket 214).
      if (type === 'Source') {
        const record = ids.map(id => recordOf(type, claimOf(id))).find(Boolean);
        ids.forEach(id => lines.push(text(id)));
        if (record) { lines.push(record); recordLines++; }
        return;
      }
      // Ticket 227: Project and Role read the renderer's card view; with no card they are the plain list the browser draws.
      if (RECORD_LINE[type]) {
        const card = oakCardView(ids, claimOf, claim => Boolean(recordOf(type, claim)));
        if (card.lead) {
          lines.push(`${tag(view.prefix ?? '')}${text(card.shown)}`);
          lines.push(recordOf(type, card.lead)); recordLines++;
          if (card.folded.length) lines.push(tags ? `[${card.folded.length} more, folded]` : `${card.folded.length} more`);
          card.folded.forEach(id => lines.push(`${tag(view.prefix ?? '')}${text(id)}`));
        }
        card.others.forEach(id => lines.push(`- ${text(id)}`));
        return;
      }
      if (view.text && tag(view.text)) lines.push(view.text);
      const word = type === 'Callout' ? calloutWord(p) : '', steps = type === 'Diagram' ? diagramSteps(p) : [];
      ids.forEach(id => lines.push(`${tag(view.prefix ?? '')}${word}${text(id)}`));
      lines.push(...steps);
      if (!word && !steps.length && (type === 'Callout' || type === 'Diagram')) return WORDLESS;
    },
    numbered: p => p.claims.forEach((id, i) => lines.push(`${i + 1}. ${text(id)}`)),
    'compare-row': p => lines.push(`| ${oakOpenUIOwnWords(p.label, 60) ?? ''} | ${text(p.claim)} |${p.also ? ` ${text(p.also)} |` : ''}`),
    metric: p => { const shown = oakMetricView(claimOf(p.claim)?.text, String(p.label), String(p.value));
      item(shown.stated ? `${tag('[big number] ')}${shown.value}${shown.label ? ` ${shown.label}` : ''}: ${text(p.claim)}` : text(p.claim)); },
    meter: p => item(oakOpenUIOwnWords(p.label, 40) && oakOpenUIStated(text(p.claim), `${Math.round(p.percent)}%`) ? `${tag('[bar] ')}${p.label} ${Math.round(p.percent)}%: ${text(p.claim)}` : text(p.claim)),
    dated: p => item(`- ${text(p.claim)}`), // ticket 250: the sentence states its date; the printed item is the sentence
    label: (p, view) => { if (tag(view.text)) lines.push(view.text); },
    pills: p => { const shown = p.questions.map(q => oakOpenUIOwnWords(q, 80)).filter(Boolean); if (shown.length) lines.push(`${tag('[follow-up pills] ')}${shown.join(' / ')}`); },
    proposal: () => { if (tags) lines.push(`[proposal card] ${NEXT_STEP_SHOWN[result.answer.nextTool]?.replace(/^\n\[Next-step button\] /, '').split(':')[0] ?? ''} [Open it]`); },
  };
  const walk = node => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object' || node.type !== 'element') return;
    const p = node.props; kinds.add(node.typeName);
    if (top.has(node)) starts.push(lines.length);
    if (!shared && SHARED_CHROME.has(node.typeName)) return;
    const view = OAK_OPENUI_BLOCKS[node.typeName]?.judgeView;
    if (!view || !views[view.kind]) throw new Error(`arrangedView: no judge view for ${node.typeName}`);
    if (views[view.kind](p, view, node.typeName) !== WORDLESS && !PLAIN_BLOCKS.has(node.typeName)) adds.add(node.typeName);
  };
  walk(parsed.root);
  const blocks = starts.map((from, i) => lines.slice(from, starts[i + 1]).map((line, at) => line && `${paragraphs.has(from + at) ? '\n\n' : '\n'}${line}`).join('').trim());
  // R17: the browser opens a card or numbers layout with the app's Framing line (oakOpenUIFramingLine, ticket 227).
  const intro = oakOpenUIFramingLine(parsed.root.props?.children ?? [], id => claimOf(id)?.citations?.map(c => c.documentId) ?? [], counted);
  if (intro) lines.unshift(intro);
  // The browser shows a Proposal only for the app's next tool, and otherwise keeps the next-step button under the layout.
  const allowed = oakOpenUIProposalOf(result.answer.nextTool);
  const proposalIndex = lines.findIndex(line => line.startsWith('[proposal card]'));
  const proposes = allowed && ui.program.includes(`Proposal("${allowed}"`);
  if (proposalIndex >= 0 && (!proposes || !shared)) lines.splice(proposalIndex, 1);
  if (shared && result.answer.nextTool && !proposes) lines.push(NEXT_STEP_SHOWN[result.answer.nextTool].trim());
  // R17 (Oak, review v14: card answers "feel abrupt"): a layout whose first block after any Heading is a card or numbers
  // (or a Prose just before one) must open on a sentence. ARCH@30 and R18 review: both the "opens on cards" test and the
  // lead are judged from the root's blocks, not the printed lines, and the lead is the first Prose claim's own text with
  // R18's 20-word floor (the app's framing line never counts).
  const rootNodes = (parsed.root.props?.children ?? []).filter(child => child?.typeName && child.typeName !== 'Heading');
  const [firstNode, secondNode] = rootNodes;
  const cards = OAK_CARD_OPENERS.has(firstNode?.typeName) || (firstNode?.typeName === 'Prose' && OAK_CARD_OPENERS.has(secondNode?.typeName));
  const leadText = firstNode?.typeName === 'Prose' ? text(firstNode.props.claim) : '';
  const words = leadText ? leadText.trim().split(/\s+/).length : 0;
  const view = tags ? [result.answer.acknowledgment, ...lines].filter(Boolean).join('\n') : [result.answer.acknowledgment, intro, ...blocks].filter(Boolean).join('\n\n');
  return { view, structured: [...kinds].some(kind => STRUCTURE.has(kind)), cards, leads: words >= OAK_OVERVIEW_MIN_WORDS, leadWords: words, recordLines, kinds: [...kinds], adds: [...adds] };
}

/**
 * Ticket 208: the two sides the pairwise judge is shown, built here so the unit tests and the eval print them the same way.
 * `recordLines` counts the cards that print a record line (title, role, dates) after their first claim (ticket 214). Null when there is no pair.
 * `same` (the pair is skipped) needs the same words and a layout that adds no block: a chip row is content the plain side
 * lacks even when it prints no new word, so that pair is judged. Ticket 249: a Callout or Diagram that frames its claims
 * and shows no other word (no kind, no drawn steps) adds nothing.
 */
export function pairwiseViews(result, claims) {
  const shown = arrangedView(result, claims, { shared: false, tags: false });
  if (!shown) return null;
  const views = { arranged: shown.view, plain: [result.answer.acknowledgment, ...claims.map(claim => claim.text)].filter(Boolean).join('\n\n') };
  return { ...views, same: sameWords({ views }) && shown.adds.length === 0, recordLines: shown.recordLines };
}
