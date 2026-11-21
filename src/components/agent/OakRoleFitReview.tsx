import * as React from "react";
import type { OakRoleFitAnswer } from "../../../packages/oak-agent-contracts/src/types";
import { roleRequirementLabel } from "../../../packages/oak-agent-contracts/src/transport";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Icon } from "@/components/ui/Icon";
import { oakMeaningIcons } from "@/lib/oakMeaningIcons";
import type { OakCitationLabels } from "@/lib/oakCitationLabels";
import { plainQuote, requirementClause } from "@/lib/oakQuote";
import { OakSourceChip } from "./OakSourceChip";
import { documentCoverageText, privateDocumentCitationLabel } from "../../../packages/oak-agent-contracts/src/document-answer";

const statusOrder = { demonstrated: 0, transferable: 1, "missing-evidence": 2 } as const;

/**
 * R15 (Oak, review v12: role fit "still feels like AI slop"): a row reads as a checklist item, so its proof leads with one
 * sentence (at most `max` characters, cut on a word) and the whole quote opens from an inline More. R15 live: the lead is
 * the sentence that shares the most words with the requirement, not always the first ("Also call me Oak or Okkar Kyaw."
 * led an evaluation-loops row whose proof was the next sentence); with no overlap it is the first.
 */
export function oakLeadSentence(text: string, max = 160, requirement = "") {
  const clean = text.replace(/\s+/g, " ").trim();
  const sentences = clean.match(/[^.!?]+(?:[.!?]+(?=\s+[A-Z\u201c"(]|\s*$)|$)/g)?.map(s => s.trim()).filter(Boolean) ?? [clean];
  const words = (value: string) => new Set(value.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? []);
  const wanted = words(requirement);
  const score = (sentence: string) => [...words(sentence)].filter(word => wanted.has(word)).length;
  const best = sentences.reduce((top, sentence) => score(sentence) > score(top) ? sentence : top, sentences[0]!);
  const end = sentences.length === 1 ? clean : best;
  if (end.length <= max) return end;
  const cut = end.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.\u2013-]+$/, "")}\u2026`;
}

/**
 * Q07 (LinkedIn a5106481): one honest verdict, then the count. A row has evidence unless it is missing evidence.
 */
export function oakRoleFitVerdict(rows: OakRoleFitAnswer["rows"]) {
  const met = rows.filter(row => row.status !== "missing-evidence").length;
  const total = rows.length;
  const verdict = met === total ? (rows.every(row => row.status === "demonstrated") ? "Strong match" : "Good match") : met * 2 >= total ? "Partial match" : "Low match";
  // R18 review (interrogate L3): the one headline sentence is built here, once.
  return { met, total, verdict, sentence: `${verdict}: ${met} of ${total} requirement${total === 1 ? "" : "s"} ${total === 1 ? "has" : "have"} evidence.` };
}

/**
 * Q07: a scannable row title. Drops a section label the role description puts before the requirement ("What you will do -
 * Prototype...") and keeps at most `max` characters, cut at the last clause break (comma, semicolon, colon, dash) that
 * leaves at least half, else on a word (Q16-D7). The full requirement stays one tap away.
 */
export function oakShortRequirement(text: string, max = 80) {
  const clean = text.replace(/\s+/g, " ").trim();
  const lead = /^[^.:\u2013-]{2,40}?\s[-\u2013:]\s(.{12,})$/.exec(clean);
  const body = lead ? lead[1].charAt(0).toUpperCase() + lead[1].slice(1) : clean;
  if (body.length <= max) return body;
  const cut = body.slice(0, max - 1);
  const clause = Math.max(...[", ", "; ", ": ", " - ", " \u2013 ", " ("].map(mark => cut.lastIndexOf(mark)));
  if (clause > max / 2) return `${cut.slice(0, clause).replace(/[\s,;:.\u2013-]+$/, "")}\u2026`;
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.\u2013-]+$/, "")}\u2026`;
}

/**
 * R19 (Oak, review v16, third flag: "still too amateur. make it more spacious, modern, intuitive and visual. revise the whole
 * thing again"; Wrangle, Juicebox, Stripe overview). A scorecard: a 120px ring of the three counts with "covered" at its
 * centre, a 24px verdict and one count sentence, a legend (dot, word, count), then a row per requirement on a
 * `32px | 1fr | chevron` grid. A row shows its requirement and the lead of Steve's proof in two lines each with the source
 * chip; the chevron opens the whole requirement and quote in place, the partial gap, and an Ask Oak action that opens the
 * questions to clarify. A gap row is one short line under "Not found in what Oak read". The ring is decoration (aria-hidden);
 * the legend and the row glyphs carry every status in words for assistive technology and in shape for sight. Every part
 * carries its `data-part` order, so a live answer builds row by row. The visitor label stays for assistive technology so
 * pasted requirements never read as Steve's evidence.
 */
const markWords = { demonstrated: "Met", transferable: "Partial", "missing-evidence": "Gap" } as const;

/** The ring is a conic gradient: each arc is its status colour minus a 4px gap (about 4 degrees at the ring's radius) at both ends. */
const ringColors = { demonstrated: "var(--oak-leaf)", transferable: "var(--oak-gold)", "missing-evidence": "color-mix(in srgb, var(--text) 24%, transparent)" } as const;

function OakRoleFitRing({ counts, covered, total }: { counts: readonly { status: OakRoleFitAnswer["rows"][number]["status"]; n: number }[]; covered: number; total: number }) {
  const arcs = counts.filter(entry => entry.n);
  const half = arcs.length > 1 ? 2.1 : 0;
  let at = 0;
  const stops = arcs.map(entry => {
    const from = at, to = at + 360 * entry.n / total;
    at = to;
    return `transparent ${from}deg ${from + half}deg, ${ringColors[entry.status]} ${from + half}deg ${to - half}deg, transparent ${to - half}deg ${to}deg`;
  });
  return <div className="oak-role-review__gauge" aria-hidden="true">
    <span className="oak-role-review__ring" style={{ "--oak-role-arcs": stops.join(", ") } as React.CSSProperties} />
    <span className="oak-role-review__gauge-count">{covered}/{total}</span>
    <span className="oak-role-review__gauge-label">covered</span>
  </div>;
}

function OakRoleFitRow({ row, answer, citationLabels, roleDescription, titleId, part }: {
  row: OakRoleFitAnswer["rows"][number]; answer: OakRoleFitAnswer; citationLabels?: OakCitationLabels; roleDescription?: string; titleId: string; part: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [asking, setAsking] = React.useState(false);
  const full = requirementClause(row.requirement.text, row.requirement.start, row.requirement.end, roleDescription);
  const short = oakShortRequirement(full);
  const missing = row.status === "missing-evidence";
  const Title = missing ? "h5" : "h4";
  const quotes = row.evidence.map(claim => ({ claim, quote: plainQuote(claim.text) }));
  const longer = short !== full || quotes.some(({ quote }) => oakLeadSentence(quote, 160, full) !== quote);
  const gapText = row.gap || missing ? row.gap ?? "Oak found no page that covers this." : null;
  const expandable = longer || (!missing && Boolean(gapText)) || row.questions.length > 0;
  return <section className="oak-role-review__row" data-status={row.status} aria-labelledby={titleId} data-part={part}>
    <Collapsible className="oak-role-review__item" open={open} onOpenChange={setOpen} data-open={open ? "" : undefined}>
      <div className="oak-role-review__line">
        <span className="oak-role-review__mark" data-status={row.status}>
          {row.status === "demonstrated" ? <Icon name={oakMeaningIcons["evidence.demonstrated"]} size={16} /> : null}
          <span className="sr-only">{markWords[row.status]}</span>
        </span>
        <div className="oak-role-review__body">
          <Title className="oak-role-review__requirement" id={titleId}>
            <span className="sr-only">{roleRequirementLabel}: </span>{open ? full : short}
          </Title>
          {row.requirement.source ? <p className="oak-role-review__source">{privateDocumentCitationLabel(row.requirement.source)}</p> : null}
          {quotes.map(({ claim, quote }) => <div key={claim.id} className="oak-role-review__evidence">
            <blockquote className="oak-quote">{open ? quote : oakLeadSentence(quote, 160, full)}</blockquote>
            <OakSourceChip citations={claim.citations} knowledgeRevision={answer.knowledgeRevision} citationLabels={citationLabels} />
          </div>)}
          {missing ? <p className="oak-role-review__gap">{gapText}</p> : null}
        </div>
        {expandable ? <CollapsibleTrigger className="oak-role-review__toggle" aria-label={open ? "Show less about this requirement" : "Show more about this requirement"}>
          <Icon name="arrowDown" size={16} />
        </CollapsibleTrigger> : null}
      </div>
      {expandable ? <CollapsibleContent keepMounted className="oak-role-review__panel">
        <div className="oak-role-review__panel-body">
          {!missing && gapText ? <p className="oak-role-review__gap"><strong>Gap: </strong>{gapText}</p> : null}
          {row.questions.length ? <>
            <button type="button" className="oak-role-review__ask-button" aria-expanded={asking} onClick={() => setAsking(value => !value)}>
              <Icon name="sparkles" size={16} />Ask Oak about this
            </button>
            {asking ? <div className="oak-role-review__questions">
              <h5>Questions to clarify</h5>
              <ul>{row.questions.map((question, questionIndex) => <li key={questionIndex}>{question}</li>)}</ul>
            </div> : null}
          </> : null}
        </div>
      </CollapsibleContent> : null}
    </Collapsible>
  </section>;
}

export function OakRoleFitReview({ answer, onContact, citationLabels, roleDescription }: { answer: OakRoleFitAnswer; citationLabels?: OakCitationLabels; onContact: () => void; roleDescription?: string }) {
  const id = React.useId();
  const { met, total, verdict } = oakRoleFitVerdict(answer.rows);
  const rows = [...answer.rows].sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
  const tally = (["demonstrated", "transferable", "missing-evidence"] as const)
    .map(status => ({ status, n: answer.rows.filter(row => row.status === status).length }));
  let part = 0;
  const next = () => Math.min(part++, 7);
  const present = rows.filter(row => row.status !== "missing-evidence");
  const absent = rows.filter(row => row.status === "missing-evidence");
  const strongest = rows.find(row => row.status === "demonstrated") ?? null;
  const gap = absent[0] ?? null;
  const renderRow = (row: OakRoleFitAnswer["rows"][number]) => {
    const index = answer.rows.indexOf(row);
    return <OakRoleFitRow key={row.id} row={row} answer={answer} citationLabels={citationLabels} roleDescription={roleDescription}
      titleId={`${id}-requirement-${index}`} part={next()} />;
  };
  return <section className="oak-role-review oak-answer-card" aria-label="Role fit review">
    <header className="oak-role-review__verdict" data-part={next()}>
      <OakRoleFitRing counts={tally} covered={met} total={total} />
      <div className="oak-role-review__headline">
        <h3 className="oak-role-review__verdict-title">{verdict}</h3>
        <p className="oak-role-review__verdict-sentence">{met} of {total} requirement{total === 1 ? "" : "s"} {total === 1 ? "has" : "have"} evidence.</p>
        {/* R19 visual review: the header names the strongest match and the biggest gap, in the visitor's own requirement words. */}
        {strongest || gap ? <dl className="oak-role-review__highlights">
          {/* R22 live: a model's span can start on a label's colon (": React, CSS, ..."), so the header reads the same whole
              clause its row does. */}
          {strongest ? <div data-status="demonstrated"><dt>Strongest</dt><dd>{oakShortRequirement(requirementClause(strongest.requirement.text, strongest.requirement.start, strongest.requirement.end, roleDescription), 72)}</dd></div> : null}
          {gap ? <div data-status="missing-evidence"><dt>Biggest gap</dt><dd>{oakShortRequirement(requirementClause(gap.requirement.text, gap.requirement.start, gap.requirement.end, roleDescription), 72)}</dd></div> : null}
        </dl> : null}
        <ul className="oak-role-review__tally" aria-label="Requirements by evidence">
          {tally.filter(entry => entry.n).map(entry => <li key={entry.status} data-status={entry.status}>
            <span className="oak-role-review__dot" data-status={entry.status} aria-hidden="true" />
            <span className="oak-role-review__tally-label">{markWords[entry.status]}</span>
            <strong>{entry.n}</strong>
          </li>)}
        </ul>
      </div>
    </header>
    {present.map(renderRow)}
    {absent.length ? <section className="oak-role-review__absent" aria-labelledby={`${id}-absent`}>
      <h4 className="oak-role-review__absent-title" id={`${id}-absent`}>Not found in what Oak read</h4>
      {absent.map(renderRow)}
    </section> : null}
    {answer.coverage ? <p className="oak-role-review__coverage" data-part={next()}>{documentCoverageText(answer.coverage)}</p> : null}
    {answer.contactTopics.length ? <div className="oak-role-review__contact" data-part={next()}>
      <p>Pay, rates or timing are for Steve.</p>
      <Button type="button" variant="secondary" size="sm" onClick={onContact}>Contact Steve</Button>
    </div> : null}
  </section>;
}

/**
 * R19: the reading state, drawn on the settled grid so nothing shifts when the answer lands. The visitor's requirement count
 * is known before any evidence is, so it sets the row count (at most six). The ring turns once per 1.6s in Oak's ring
 * gradient and holds still under reduced motion.
 */
export function OakRoleFitSkeleton({ rows = 3 }: { rows?: number }) {
  const count = Math.min(Math.max(Math.round(rows), 1), 6);
  return <section className="oak-role-review oak-role-review--loading oak-answer-card" aria-label="Role fit review" aria-busy="true">
    <header className="oak-role-review__verdict">
      <div className="oak-role-review__gauge" aria-hidden="true"><span className="oak-role-review__spinner" /></div>
      <div className="oak-role-review__headline" aria-hidden="true">
        <span className="oak-role-review__shimmer" data-size="title" />
        <span className="oak-role-review__shimmer" data-size="line" />
        <span className="oak-role-review__shimmer" data-size="line-short" />
      </div>
    </header>
    {Array.from({ length: count }, (_, index) => <div key={index} className="oak-role-review__row oak-role-review__line" aria-hidden="true">
      <span className="oak-role-review__shimmer" data-size="glyph" />
      <div className="oak-role-review__body">
        <span className="oak-role-review__shimmer" data-size="line" />
        <span className="oak-role-review__shimmer" data-size="line-short" />
      </div>
    </div>)}
  </section>;
}
