import * as React from "react";
import { Icon } from "@/components/ui/Icon";
import { oakSourceDocument, type OakCitationLabels } from "@/lib/oakCitationLabels";
import { oakWebBesideWorkOn } from "@/lib/oakFlags/webBesideWork";
import { oakMeaningIcons } from "@/lib/oakMeaningIcons";
import { OakSprite, useOakSprites, type OakActivitySpritePose } from "./OakActivitySprite";
import { OakSourceFace, OakWebSourceFace } from "./OakSourceChip";
import { openWebResearchLabel, openWebResearchNote, openWebResearchTopicId, publicResearchUnavailable, type ExternalPublicSource, type PublicResearchEvent } from "../../../packages/oak-agent-contracts/src/public-research";
import type { OakAnswer } from "../../../packages/oak-agent-contracts/src/types";

/** Docs pages arrive with their page chrome: a repeated title, Markdown heading marks and "Copy page | View as Markdown" bars.
 * A line goes only when every "|"-separated part is a known toolbar label or a "Last updated <date>" stamp, so prose survives.
 * One of the first two lines also goes when it repeats the title or just the page name before " · ", " | " or " - ". */
export function oakResearchExcerpt(excerpt: string, title: string): string {
  const chromeLabel = /^(?:copy (?:as )?(?:page|markdown)|view as markdown|edit (?:this )?page|agent setup|last updated\s+\w{3,9}\.?\s+\d{1,2},?\s+\d{4})$/i;
  const heading = title.trim().toLowerCase();
  const pageName = heading.split(/\s+[·|\-–—]\s+/)[0];
  const lines = excerpt.split("\n").map(line => line.replace(/^\s*#{1,6}\s+/, "").trim()).filter(Boolean);
  const kept = lines.filter((line, index) => !line.split("|").every(part => chromeLabel.test(part.trim())) &&
    !(index < 2 && [heading, pageName].includes(line.toLowerCase())));
  // Docs arrive as Markdown: a table reads as one line per row, each value named by its column (P15 sign-off, 2026-10-17).
  const cells = (line: string) => line.replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());
  const divider = (line: string) => line.includes("---") && /^[|:\-\s]+$/.test(line);
  let header: string[] | null = null;
  const readable = kept.flatMap((line, index) => {
    if (!/^\|.*\|$/.test(line)) { header = null; return [line]; }
    if (divider(line)) return [];
    const row = cells(line);
    if (divider(kept[index + 1] ?? "")) { header = row; return []; }
    // A two-column table is already "name: value"; only wider tables need their column names.
    const named = header && header.length === row.length && row.length > 2 ? row.slice(1).map((value, i) => `${header![i + 1]} ${value}`) : row.slice(1);
    return [named.length ? `${row[0]}: ${named.join(" · ")}` : row[0]];
  });
  return readable.join("\n").trim() || excerpt.trim();
}

/** URLs passed the contract's host rules, so the host is safe to show; a bad one just shows no host. */
const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };

/** R19: the combine step's sentences, each followed by its source chips. */
function OakWebSynthesis({ event }: { event: PublicResearchEvent }) {
  const index = new Map(event.sources.map((source, at) => [source.sourceId, { source, number: at + 1 }] as const));
  return event.synthesis ? <ol className="oak-research__synthesis" aria-label="What the web adds">
    {event.synthesis.sentences.map((sentence, at) => <li key={at}>
      <span>{sentence.text}</span>
      <span className="oak-research__cites">{sentence.cites.map(id => {
        const found = index.get(id);
        return found ? <a key={id} className="oak-research__cite" href={found.source.url} target="_blank" rel="noopener noreferrer">
          <OakWebSourceFace favicon={found.source.favicon} />{hostOf(found.source.url)}
          <span className="sr-only">: web source {found.number}, {found.source.title} (new tab)</span></a>
          : <span key={id} className="oak-research__cite" data-origin="steve">Relates to Steve&apos;s answer</span>;
      })}</span>
    </li>)}
  </ol> : null;
}

/**
 * R19 open web: the combine step's sentences, each followed by the sources it cites. A web source chip opens the page; a
 * claim chip points back at Steve's answer above, worded as a pointer so a web sentence never reads as Steve's own (R28 live judge). Then the sources as rows (face, title, host, date). The face is the site's
 * favicon when the Worker sent one, else the web icon (R21); the page never asks another site for a favicon.
 */
function OakWebResearch({ event }: { event: PublicResearchEvent }) {
  const date = (source: ExternalPublicSource) => source.publishedAt ? source.publishedAt.slice(0, 10) : null;
  // Ticket 15 (the explored fetched date): a row whose site gave no date says when Oak read it, so every row carries one date.
  const checked = (source: ExternalPublicSource) => {
    const read = new Date(source.retrievedAt);
    return !date(source) && Number.isFinite(read.getTime()) ? `Checked ${read.toISOString().slice(0, 10)}` : null;
  };
  return <>
    <OakWebSynthesis event={event} />
    {event.sources.length ? <ol className="oak-research__rows" aria-label={`${event.sources.length} web ${event.sources.length === 1 ? "source" : "sources"}`}>
      {event.sources.map(source => <li key={source.sourceId}>
        <a className="oak-research__row" href={source.url} target="_blank" rel="noopener noreferrer">
          <OakWebSourceFace favicon={source.favicon} />
          <span className="oak-research__row-text">
            <span className="oak-research__row-title">{source.title}<span className="sr-only"> (new tab)</span></span>
            <span className="oak-research__row-meta">{hostOf(source.url)}{date(source) ? ` · ${date(source)}` : ""}{checked(source) ? ` · ${checked(source)}` : ""}{source.contentStatus === "partial" ? " · Excerpt" : ""}</span>
          </span>
          <Icon name="arrowUpRight" size={14} />
        </a>
      </li>)}
    </ol> : null}
  </>;
}

type ResearchState = "pending" | "complete" | "interrupted" | "failed";

export function OakPublicResearch({ event, state, answer, citationLabels, question }: { event: PublicResearchEvent; state: ResearchState;
  answer?: OakAnswer | null; citationLabels?: OakCitationLabels; question?: string }) {
  return event.topicId === openWebResearchTopicId && oakWebBesideWorkOn()
    ? <OakWebBesideWork event={event} state={state} works={oakCitedWork(answer, citationLabels, question ?? "")} />
    : <OakPublicResearchCard event={event} state={state} />;
}

function researchStatus(event: PublicResearchEvent, state: ResearchState) {
  const web = event.topicId === openWebResearchTopicId;
  const count = event.sources.length;
  // One status row per phase, tone tells the tile colour: working, done, or unverified.
  return event.phase === "started" ? state === "pending" ? ["working", "webBrowsing", web ? "Searching the web for what Steve’s pages don’t cover." : "Checking current public sources."] as const
    : ["warn", state === "interrupted" ? "stop" : "alert", "The public research did not finish. Current details remain unverified."] as const
    : event.phase === "blocked" || event.phase === "failed" ? ["warn", "alert", event.reason === "consent" ?
      "That public query was not approved. No private information was sent." : publicResearchUnavailable] as const
    : event.phase === "zero-results" ? ["warn", "search", "The public search returned no sources. Current details remain unverified."] as const
    // R28 live judge: "some results" read as untrue when every row shown was fine; name how many of the returned failed.
    : event.phase === "partial" ? ["warn", "alert", event.returnedSources > count
      ? `${event.returnedSources - count} of ${event.returnedSources} results could not be read. The ${count === 1 ? "one" : count} below ${count === 1 ? "was" : "were"} read.`
      : "Some results could not be read. The available excerpts are below."] as const
    : web ? ["done", "checkmark", `I read ${count} web ${count === 1 ? "source" : "sources"}. Check them before relying on a detail.`] as const
    : ["done", "checkmark", `I read ${count} current public ${count === 1 ? "source" : "sources"}. Check them before relying on a detail.`] as const;
}

function OakPublicResearchCard({ event, state }: { event: PublicResearchEvent; state: ResearchState }) {
  const sprites = useOakSprites();
  const web = event.topicId === openWebResearchTopicId;
  // A check that could not run rests its globe under a cloud; one that ran (or is running) keeps its magnifier up.
  const globe = event.phase === "blocked" || event.phase === "failed" ? "web-globe-off" : "web-globe";
  const checked = (at: number) => {
    const date = new Date(at);
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "an unverified date";
  };
  // URLs passed the topic's host allowlist in the contract, so the host is safe to show; a bad one just shows no host.
  const host = (url: string) => { try { return new URL(url).hostname; } catch { return ""; } };
  const count = event.sources.length;
  const [tone, icon, status] = researchStatus(event, state);
  return <section className="oak-research" aria-label={web ? openWebResearchLabel : "Current public research"} data-phase={event.phase} data-topic={web ? "web" : undefined}>
    <div className="oak-research__head">
      {/* D91: public research leads with its own picture, the web's globe under a magnifier; the glyph stands in without art. */}
      {sprites[globe] ? <span className="oak-research__art oak-art-tile" data-tone="research" aria-hidden="true"><OakSprite pose={globe} size="medium" /></span>
        : <span className="oak-research__tile" aria-hidden="true"><Icon name="webBrowsing" /></span>}
      <div className="oak-research__heading">
        <h3 className="oak-research__title">{web ? "From the web" : "Current public research"}</h3>
        <p className="oak-research__note">{web ? openWebResearchNote : "External sources are separate from Steve's approved portfolio evidence."}</p>
      </div>
    </div>
    {/* R19: with a synthesis the sentences lead; the done status would only repeat the count the rows already show. */}
    {web && event.synthesis && event.phase === "completed" ? null : <p className="oak-research-status oak-research__status" data-tone={tone}><Icon name={icon} />{status}</p>}
    {web ? <OakWebResearch event={event} /> : null}
    {/* v3 review: sources are a sideways row of cards (Perplexity's source cards): face and site, the title, a short excerpt
        and when it was checked. Each card opens the page; the excerpt is clamped so the answer stays the focus. */}
    {count && !web ? <ul className="oak-research__cards" aria-label={`${count} public ${count === 1 ? "source" : "sources"}`}>
      {event.sources.map((source, index) => <li key={source.sourceId}><a className="oak-research__card" href={source.url} target="_blank" rel="noopener noreferrer">
        <span className="oak-research__host"><OakSourceFace url={source.url} /><span>{host(source.url)}</span><Icon name="arrowUpRight" size={14} /></span>
        <span className="oak-research__source-title"><span className="sr-only">External source {index + 1}: </span>{source.title}</span>
        <span className="oak-research__excerpt">{oakResearchExcerpt(source.excerpt, source.title)}</span>
        <span className="oak-research__meta">
          <span><Icon name="clock" size={12} />Checked {checked(source.retrievedAt)}</span>
          {/* The provider reports the date; it is labelled as theirs, and its absence is said plainly. */}
          <span>{source.publishedAt ? `Site date ${source.publishedAt.slice(0, 10)}` : "No date given"}</span>
          {/* R27j (R27g judge, live-v36 web): every source capped at its 1,500-character excerpt read as a warning "Partial";
              the page was read, so it says what the row holds, in the quiet meta tone. */}
          {source.contentStatus === "partial" ? <span>Excerpt</span> : null}
        </span>
      </a></li>)}
    </ul> : null}
  </section>;
}

type OakCitedWork = Readonly<{ id: string; title: string; url: string; matches: boolean }>;
type OakBesideWork = Readonly<{ topic: string | null; rows: readonly OakCitedWork[] }>;

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The stack entry the visitor's question names as a whole word, longest first, so "React Native" wins over "React". */
const namedTopic = (question: string, stack: readonly string[]) => [...new Set(stack)].sort((a, b) => b.length - a.length)
  .find(term => new RegExp(`(?<![\\p{L}\\p{N}])${escaped(term)}(?![\\p{L}\\p{N}])`, "iu").test(question)) ?? null;

/**
 * Ticket 55: the case studies the answer cites, once each, from the labels of the answer's own knowledge revision. A case
 * study is paired only when its stack names the topic the question asks about (Bridge line); every other one reads Related.
 */
export function oakCitedWork(answer: OakAnswer | null | undefined, labels: OakCitationLabels | undefined, question: string): OakBesideWork {
  const claims = answer?.kind === "sourced" || answer?.kind === "gap" ? answer.claims : [];
  const seen = new Map<string, { title: string; url: string; stack: readonly string[] }>();
  for (const citation of claims.flatMap(claim => claim.citations)) {
    const document = seen.has(citation.documentId) ? undefined : oakSourceDocument(citation, answer?.knowledgeRevision, labels);
    if (document?.card?.kind === "work") seen.set(citation.documentId, { title: document.card.title ?? document.title, url: document.canonicalUrl, stack: document.card.stack ?? [] });
  }
  // Before the answer lands nothing is cited yet, so the lookup line may name a topic any of Steve's case studies lists.
  const topic = namedTopic(question, seen.size ? [...seen.values()].flatMap(work => work.stack)
    : (labels?.documents ?? []).flatMap(document => document.card?.kind === "work" ? document.card.stack ?? [] : []));
  const lower = topic?.toLowerCase();
  return { topic, rows: [...seen].map(([id, { stack, ...work }]) => ({ id, ...work, matches: Boolean(lower && stack.some(term => term.toLowerCase() === lower)) })) };
}

const day = (at: number) => { const date = new Date(at); return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null; };

function BesideHead({ art, title, label, fallback }: { art: OakActivitySpritePose; title: string; label: string; fallback: "webBrowsing" | "briefcase" }) {
  const sprites = useOakSprites();
  return <div className="oak-beside__head">
    {sprites[art] ? <span className="oak-research__art oak-art-tile" data-tone="research" aria-hidden="true"><OakSprite pose={art} size="medium" /></span>
      : <span className="oak-research__tile" aria-hidden="true"><Icon name={fallback} /></span>}
    <span className="oak-beside__heading"><h3 className="oak-beside__title">{title}</h3><span className="oak-beside__label">{label}</span></span>
  </div>;
}

/**
 * Ticket 55 (Direction A, Side by Side): Steve's cited case studies and the web's quotes as two sibling cards of one height,
 * then the combine step as its own model-written block. Each block carries one Worker label, and no web row sits in the
 * records card. With lookup off, one quiet notice says the answer uses Steve's records only and the web card drops.
 */
function OakWebBesideWork({ event, state, works }: { event: PublicResearchEvent; state: ResearchState; works: OakBesideWork }) {
  const off = (event.phase === "blocked" || event.phase === "failed") && event.reason === "disabled";
  const [tone, icon, status] = researchStatus(event, state);
  const line = event.phase === "started" && state === "pending" && works.topic ? `Looking up ${works.topic} on the web` : status;
  const settled = event.phase === "completed" && event.synthesis;
  return <section className="oak-research oak-beside" aria-label={off ? "Steve’s records" : "Web and Steve’s work"} data-phase={event.phase} data-topic="web"
    data-lookup={off ? "off" : "on"}>
    {off ? <div className="oak-beside__off" role="status"><Icon name="info" />Web lookup is off. This answer uses Steve’s records only.</div>
      : settled ? null : <p className="oak-research-status oak-research__status" data-tone={tone}><Icon name={icon} />{line}</p>}
    {works.rows.length || (!off && event.sources.length) ? <div className="oak-beside__cards">
      {works.rows.length ? <section className="oak-beside__card" data-origin="steve" aria-label="From Steve’s work">
        <BesideHead art="bookshelf" title="From Steve’s work" label="From Steve’s records" fallback="briefcase" />
        <ul className="oak-research__rows oak-beside__rows" data-two-up={off && works.rows.length > 1 ? "true" : undefined}>
          {works.rows.map(work => <li key={work.id} className="oak-beside__work-row"><a className="oak-research__row oak-beside__row" href={work.url}>
            <span className="oak-web-face" data-face="icon" data-source-type="case-study" aria-hidden="true"><Icon name={oakMeaningIcons["source.case-study"]} size={14} /></span>
            <span className="oak-research__row-text">
              <span className="oak-research__row-title">{work.title}</span>
              <span className="oak-beside__chips"><span className="oak-beside__chip">Case study</span>
                <span className="oak-beside__chip" data-match={work.matches ? "true" : undefined}>{work.matches ? `Matches ${works.topic}` : "Related"}</span></span>
            </span>
            <Icon name="arrowRight" size={14} />
          </a></li>)}
        </ul>
        <a className="oak-beside__foot" href="/work/">All case studies<Icon name="arrowRight" size={14} /></a>
      </section> : null}
      {!off && event.sources.length ? <section className="oak-beside__card" data-origin="web" aria-label={openWebResearchLabel}>
        <BesideHead art="web-globe" title={`${event.sources.length} web ${event.sources.length === 1 ? "page" : "pages"}`} label="From the web" fallback="webBrowsing" />
        <ol className="oak-research__rows oak-beside__rows" aria-label={`${event.sources.length} web ${event.sources.length === 1 ? "source" : "sources"}`}>
          {event.sources.map(source => <li key={source.sourceId}><a className="oak-research__row oak-beside__row" href={source.url} target="_blank" rel="noopener noreferrer">
            <OakWebSourceFace favicon={source.favicon} />
            <span className="oak-research__row-text">
              <span className="oak-research__row-title">{source.title}<span className="sr-only"> (new tab)</span></span>
              <span className="oak-beside__quote">{oakResearchExcerpt(source.excerpt, source.title)}</span>
              <span className="oak-research__row-meta">{hostOf(source.url)}{day(source.retrievedAt) ? ` · Fetched ${day(source.retrievedAt)}` : ""}{source.contentStatus === "partial" ? " · Excerpt" : ""}</span>
            </span>
            <Icon name="arrowUpRight" size={14} />
          </a></li>)}
        </ol>
        <p className="oak-beside__foot">Web search by {event.provider}</p>
      </section> : null}
    </div> : null}
    {!off && event.synthesis ? <section className="oak-beside__summary" aria-label="Oak AI summary">
      <p className="oak-beside__summary-head"><span className="oak-beside__summary-title">Oak AI summary</span>
        <span className="oak-beside__label">Inferred</span><span className="oak-beside__note">Model-written</span></p>
      <OakWebSynthesis event={event} />
    </section> : null}
  </section>;
}
