import { Icon } from "@/components/ui/Icon";
import { oakRecordFactsState, useOakRecordFacts } from "@/lib/oakRecordFacts";
import { ClaimList } from "../../cards";
import { useScope } from "../../scope";
import "@/styles/agent/request-kinds.css";

const TRADEOFFS = /trade-?offs?/i;

/** Steve's own lines from the record, read untyped until the record-facts asset carries ownership (O-05-ownership); malformed is none. */
function decisionsOf(facts: unknown) {
  const oak = (facts as { ownership?: { oak?: unknown } } | undefined)?.ownership?.oak;
  return Array.isArray(oak) && oak.length && oak.every(line => typeof line === "string" && line.trim()) ? oak as string[] : null;
}

/** Ticket 60 (ktrade): the decisions on the record the first claim cites, then the claims; no lines on the record is today's Points list. */
export function PointsDecisions({ ids }: { ids: readonly string[] }) {
  const { claims, cardOf, renderLink, knowledgeRevision = "" } = useScope();
  const lead = claims.get(ids[0] ?? "");
  const documentId = lead?.citations[0]?.documentId ?? "";
  useOakRecordFacts(documentId, knowledgeRevision);
  const state = oakRecordFactsState(documentId, knowledgeRevision);
  const decisions = lead && state.status === "loaded" ? decisionsOf(state.facts) : null;
  if (!lead || !decisions) return <ClaimList ids={ids} />;
  const source = cardOf?.({ ...lead, citations: [lead.citations[0]!] });
  const name = source?.card?.title ?? source?.title.split(":")[0]!.trim();
  if (!name) return <ClaimList ids={ids} />;
  const section = state.status === "loaded" && state.facts.kind === "work" ? state.facts.sections.find(entry => TRADEOFFS.test(entry.title)) : undefined;
  const link = section && source?.verified && renderLink ? renderLink(`${source.page}#${section.anchor}`, "See the tradeoffs") : null;
  return <div className="oak-kind-decisions" data-unit="">
    <p className="oak-kind-decisions__head"><span className="oak-answer-tile" aria-hidden="true"><span className="oak-starter-glyph" data-tone="gold">
      <Icon name="balanceScale" size={16} /></span></span><span>What Steve owned on {name}</span></p>
    <ul className="oak-kind-decisions__rows">{decisions.map(line => <li key={line}><span className="oak-openui__point-mark" aria-hidden="true"><Icon name="tick" size={12} /></span>
      <span>{line}</span></li>)}</ul>
    {link ? <p className="oak-kind-decisions__link" data-unit="">{link}</p> : null}
    <ClaimList ids={ids} />
  </div>;
}
