import { oakRecordFactsState, useOakRecordFacts, type OakRecordFact } from "@/lib/oakRecordFacts";
import { oakBoardView, type OakBoardKind, type OakBoardRow } from "../../../../packages/oak-agent-contracts/src/openui/views/board";
import { CardLink, ClaimList, usePending } from "../cards";
import { Claim, useScope } from "../scope";
import { BoardGhost, CAP, type BoardProps } from "./Board";

/** A record's reviewed column value and date for this kind; a record of the other kind is no column. */
function readRow(kind: OakBoardKind, facts: OakRecordFact): { column: string; date?: string } | null {
  if (kind === "stand") return facts.kind === "work" ? { column: facts.articleStatus, date: facts.dateUpdated ?? facts.datePublished } : null;
  return facts.kind === "experience" ? { column: facts.engagement, date: facts.dateStart } : null;
}

/** One record: its title (linked to its page, as a Project title is, so a claim citing only that page drops its chip), the
 * "Most recent" words on the newest, then its claims. */
function BoardCard({ document, claims: ids, newest }: { document: string; claims: readonly string[]; newest: boolean }) {
  const { claims, cardOf } = useScope();
  const first = claims.get(ids[0]!);
  const source = first ? cardOf?.({ ...first, citations: first.citations.slice(0, 1) }) ?? null : null;
  // A role card names its employer (as Role does), a work card its short name.
  const card = source?.card;
  const name = (card?.kind === "role" ? card.place : card?.title) || source?.title.split(":")[0]!.trim() || document.replace(/^[^:]*:/, "");
  const own = (id: string) => Boolean(source?.verified && claims.get(id)?.citations.every(citation => citation.documentId === document));
  return <li className="oak-board__card" data-newest={newest ? "" : undefined}>
    <span className="oak-board__title">{source ? <CardLink to={source.page} verified={source.verified}>{name}</CardLink> : name}</span>
    {ids.map(id => <p key={id} className="oak-board__claim" data-own-page={own(id) ? "" : undefined}><Claim id={id} /></p>)}
    {newest ? <span className="oak-board__foot"><span className="oak-board__newest">Most recent</span></span> : null}
  </li>;
}

export default function BoardView({ claims: ids, kind: asked }: BoardProps) {
  const { claims, knowledgeRevision = "" } = useScope();
  const firstDocument = ids.map(id => claims.get(id)?.citations[0]?.documentId).find(Boolean) ?? "";
  const first = useOakRecordFacts(firstDocument, knowledgeRevision);
  const waiting = usePending(ids);
  if (waiting || first.status === "pending") return <BoardGhost cards={Math.min(Math.max(ids.length, 2), CAP)} />;
  const kind: OakBoardKind = asked ?? (firstDocument.startsWith("experience:") ? "sboard" : "stand");
  const rows: OakBoardRow[] = ids.flatMap(id => {
    const document = claims.get(id)?.citations[0]?.documentId;
    const state = document ? oakRecordFactsState(document, knowledgeRevision) : null;
    const row = state?.status === "loaded" ? readRow(kind, state.facts) : null;
    return document && row ? [{ claim: id, document, ...row }] : [];
  });
  const { columns, newest } = oakBoardView(kind, rows);
  if (!columns.length) return <ClaimList ids={ids} />;
  const placed = new Set(columns.flatMap(column => column.items.flatMap(item => item.claims)));
  const rest = ids.filter(id => !placed.has(id));
  return <div className="oak-board" data-kind={kind} data-picture-ok="the lanes of cited claims are the content">
    <div className="oak-board__columns">{columns.map(column =>
      <section key={column.key} className="oak-board__column" aria-label={`${column.label}, ${column.items.length}`}>
        <h4 className="oak-board__head"><span>{column.label}</span><span className="oak-board__count" aria-hidden="true">{column.items.length}</span></h4>
        <ul className="oak-board__list">{column.items.map(item =>
          <BoardCard key={item.document} document={item.document} claims={item.claims} newest={item.document === newest} />)}</ul>
      </section>)}</div>
    {rest.length ? <ClaimList ids={rest} /> : null}
  </div>;
}
