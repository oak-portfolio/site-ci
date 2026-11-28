import { careerContextMetadata, careerTimelineItems } from "@/data/careerTimeline";
import { oakSiteInventory, oakSitePublicPath } from "@/data/oakSiteInventory";
import { oakRecordFactsState, useOakRecordFacts, type OakWorkFacts } from "@/lib/oakRecordFacts";
import type { AnswerClaim } from "../../../../packages/oak-agent-contracts/src/types";
import { oakOpenUITableView } from "../../../../packages/oak-agent-contracts/src/openui/views/table";
import { ClaimList, usePending } from "../cards";
import { oakVerbatim, useScope } from "../scope";
import { TableGhost, type Kind, type TableProps } from "./Table";

type Citation = AnswerClaim["citations"][number];
type Cite = Readonly<{ documentId: string; url?: string }>;
type Row = Readonly<{ key: string; name: string; cells: Readonly<Record<string, string>> }>;
type Layout = Readonly<{ caption: string; head: string; columns: readonly string[]; rows: readonly Row[] }>;

const SHOWN = 3;
// A value longer than this spans the whole stacked card at narrow widths instead of a half-width strip.
const WIDE = 40;
// A value this short (a type, a period, a name) stays on one line in the wide table, so "Part-time" never splits at its hyphen.
const FIT = 20;
const fit = (text: string | undefined) => (text?.length ?? 0) <= FIT ? "" : undefined;
const list = (items: readonly string[]) => items.slice(0, SHOWN).join(", ");
const pathOf = (url: string | undefined) => { try { return new URL(url ?? "", "https://steveoak.com").pathname.replace(/(.)\/+$/, "$1"); } catch { return ""; } };
const ownLines = (facts: unknown) => {
  const oak = (facts as { ownership?: { oak?: unknown } } | undefined)?.ownership?.oak;
  return Array.isArray(oak) ? oak.filter((line): line is string => typeof line === "string" && Boolean(line.trim())) : [];
};

/** The first reviewed line short enough for a cell (25 words, DESIGN PT11), else the first line. */
const cellLine = (lines: readonly string[]) => lines.find(line => line.trim().split(/\s+/).length <= 25) ?? lines[0] ?? "";

function layout(kind: Kind, claims: readonly AnswerClaim[], revision: string, nameOf: (claim: AnswerClaim, citation: Citation) => string): Layout | null {
  const firstClaim = (key: string, keyOf: (citation: Cite) => string) => {
    for (const claim of claims) for (const citation of claim.citations) if (keyOf(citation) === key) return { claim, citation };
    return null;
  };
  const stated = (key: string, keyOf: (citation: Cite) => string, text: string) =>
    claims.some(claim => claim.citations.some(citation => keyOf(citation) === key) && oakVerbatim(claim, text)) ? text : "";
  const build = (keyOf: (citation: Cite) => string, row: (key: string) => Row | null) =>
    (oakOpenUITableView(claims, keyOf).rows ?? []).flatMap(key => row(key) ?? []);

  if (kind === "sctable") {
    const keyOf = (citation: Cite) => /^experience:/.test(citation.documentId) ? citation.documentId.slice(11) : "";
    const rows = build(keyOf, key => {
      const item = careerTimelineItems.find(entry => entry.id === key);
      return item ? { key, name: item.place, cells: {
        Role: item.contexts.map(context => context.title).join("; "),
        Type: [...new Set(item.contexts.map(careerContextMetadata))].join(", "),
        Period: stated(key, keyOf, item.date) } } : null;
    });
    return rows.length >= 2 ? { caption: "Career contexts by type", head: "Organization", columns: ["Role", "Type", "Period"], rows } : null;
  }
  if (kind === "smap") {
    const keyOf = (citation: Cite) => { const path = pathOf(citation.url); return oakSitePublicPath(path) ? path : ""; };
    const rows = build(keyOf, key => {
      const page = oakSiteInventory.find(entry => entry.path === key);
      if (page) return { key, name: page.title, cells: { Sections: page.sections.map(section => section.title).join(", ") } };
      const hit = firstClaim(key, keyOf);
      const state = hit ? oakRecordFactsState(hit.citation.documentId, revision) : null;
      const facts = state?.status === "loaded" && state.facts.kind === "work" ? state.facts : null;
      return hit && facts ? { key, name: nameOf(hit.claim, hit.citation), cells: { Sections: list(facts.sections.map(section => section.title)) } } : null;
    });
    return rows.length >= 2 ? { caption: "Site pages and their sections", head: "Page", columns: ["Sections"], rows } : null;
  }
  const keyOf = (citation: Cite) => /^work:/.test(citation.documentId) ? citation.documentId : "";
  const rows = build(keyOf, key => {
    const hit = firstClaim(key, keyOf);
    const state = oakRecordFactsState(key, revision);
    const facts: OakWorkFacts | null = state.status === "loaded" && state.facts.kind === "work" ? state.facts : null;
    return hit && facts ? { key, name: nameOf(hit.claim, hit.citation), cells: {
      // One ownership line: the reviewed lines are full sentences, and three in a cell stuff the column.
      Stack: list(facts.systemMap.map(entry => entry.label)), "Steve's part": cellLine(ownLines(state.status === "loaded" ? state.facts : null)),
      Published: stated(key, keyOf, facts.datePublished.slice(0, 4)) } } : null;
  });
  return rows.length >= 2 ? { caption: "Projects side by side", head: "Project", columns: ["Stack", "Steve's part", "Published"], rows } : null;
}

export default function TableView({ claims: ids, kind }: TableProps) {
  const { claims, cardOf, knowledgeRevision = "" } = useScope();
  const cited = ids.flatMap(id => claims.get(id) ?? []);
  const first = cited.flatMap(claim => claim.citations).find(citation => /^work:/.test(citation.documentId));
  const facts = useOakRecordFacts(first?.documentId ?? "", knowledgeRevision);
  const waiting = usePending(ids);
  const current = kind ?? "matrix";
  if (waiting || (current !== "sctable" && first && facts.status === "pending")) return <TableGhost rows={ids.length} kind={current} />;
  const nameOf = (claim: AnswerClaim, citation: Citation) =>
    cardOf?.({ ...claim, citations: [citation] })?.title.split(":")[0]!.trim() || citation.documentId.replace(/^[^:]*:/, "");
  const table = layout(current, cited, knowledgeRevision, nameOf);
  if (!table) return <ClaimList ids={ids} />;
  // An empty column (a date no claim states) is dropped, so no row carries a blank cell for it.
  const columns = table.columns.filter(column => table.rows.some(row => row.cells[column]));
  return <div className="oak-table" data-kind={current} data-columns={columns.length + 1}>
    <ClaimList ids={ids} />
    <div className="oak-table__frame"><table className="oak-table__grid">
      <caption className="oak-table__caption">{table.caption}</caption>
      <thead><tr><th scope="col">{table.head}</th>{columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
      <tbody>{table.rows.map(row => <tr data-record={row.key} key={row.key}>
        <th scope="row" data-label={table.head} data-fit={fit(row.name)}>{row.name}</th>
        {columns.map(column => <td key={column} data-label={column} data-empty={row.cells[column] ? undefined : ""}
          data-wide={(row.cells[column]?.length ?? 0) > WIDE ? "" : undefined} data-fit={fit(row.cells[column])}>{row.cells[column] || "Not listed"}</td>)}
      </tr>)}</tbody>
    </table></div>
  </div>;
}
