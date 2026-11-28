import * as React from "react";
import { oakRecordFactsState, useOakRecordFacts } from "@/lib/oakRecordFacts";
import { oakEvidenceRing, oakEvidenceSankey, oakEvidenceTotals, type OakEvidenceRow, type OakEvidenceStatus, type OakEvidenceTotals }
  from "../../../../packages/oak-agent-contracts/src/openui/views/evidence-chart";
import { ClaimList, usePending } from "../cards";
import { OakFigure, OakFigureBars, oakFigureBarItems, type OakFigureBarsData, type OakFigureItem } from "../figure/OakFigure";
import { useScope } from "../scope";
import { EvidenceChartGhost, type EvidenceChartProps } from "./EvidenceChart";

const WORD: Record<OakEvidenceStatus, string> = { published: "Published", held: "Held" };
const share = (totals: OakEvidenceTotals, status: OakEvidenceStatus) => `${totals[status]} of ${totals.total}`;
const counts = (row: OakEvidenceRow) => typeof row.held === "number" ? `${row.published.length} published, ${row.held} held` : `${row.published.length} published`;

/** The hatch that marks held, defined once per drawing so two figures on a page never share an id. */
function Hatch({ id }: { id: string }) {
  return <defs><pattern id={id} patternUnits="userSpaceOnUse" width="3" height="3" patternTransform="rotate(45)">
    <rect className="oak-evidence__hatch-ground" width="3" height="3" /><rect className="oak-evidence__hatch-line" width="1.2" height="3" />
  </pattern></defs>;
}

function Legend({ totals }: { totals: OakEvidenceTotals }) {
  const statuses: OakEvidenceStatus[] = totals.counted ? ["published", "held"] : ["published"];
  return <ul className="oak-evidence__legend">{statuses.map(status => <li key={status} data-status={status}>
    <span className="oak-evidence__key" data-status={status} /><span>{WORD[status]}</span><span className="oak-evidence__value">{share(totals, status)}</span></li>)}</ul>;
}

function Donut({ totals, hatch }: { totals: OakEvidenceTotals; hatch: string }) {
  return <div className="oak-evidence__donut">
    <div className="oak-evidence__ring">
      <svg viewBox="0 0 42 42" role="presentation" focusable="false"><Hatch id={hatch} />
        {oakEvidenceRing(totals).map((part, index) => <path key={index} d={part.d} data-status={part.status} fill={part.status === "held" ? `url(#${hatch})` : undefined} />)}
      </svg>
      <p className="oak-evidence__center"><span className="oak-evidence__center-value">{share(totals, "published")}</span><span>published</span></p>
    </div>
    <Legend totals={totals} />
  </div>;
}

function Sankey({ rows, hatch }: { rows: readonly OakEvidenceRow[]; hatch: string }) {
  const { height, targets, links, totals } = oakEvidenceSankey(rows);
  return <div className="oak-evidence__sankey" data-rows={rows.length}>
    <ul className="oak-evidence__sources">{rows.map((row, index) => <li key={row.document} className="oak-evidence__node" data-lead={index === 0 ? "" : undefined}>
      <span className="oak-evidence__name">{row.name}</span><span className="oak-evidence__value">{counts(row)}</span></li>)}</ul>
    <svg className="oak-evidence__ribbons" viewBox={`0 0 100 ${height}`} height={height} preserveAspectRatio="none" role="presentation" focusable="false">
      <Hatch id={hatch} />
      {links.map(link => <path key={`${link.row}-${link.status}`} d={link.d} data-status={link.status} data-lead={link.lead ? "" : undefined}
        fill={link.status === "held" ? `url(#${hatch})` : undefined} />)}
    </svg>
    <ul className="oak-evidence__targets" data-count={targets.length}>{targets.map(target => <li key={target.status} className="oak-evidence__target" data-status={target.status}>
      <span className="oak-evidence__name">{WORD[target.status]}</span><span className="oak-evidence__value">{share(totals, target.status)}</span></li>)}</ul>
  </div>;
}

export default function EvidenceChartView({ claims: ids, mode = "proof" }: EvidenceChartProps) {
  const { claims, cardOf, knowledgeRevision = "" } = useScope();
  const hatch = `oak-evidence-hatch-${React.useId().replace(/[^\w-]/g, "")}`;
  const firsts = ids.flatMap(id => { const claim = claims.get(id), citation = claim?.citations[0]; return claim && citation ? [{ claim, citation }] : []; });
  const first = useOakRecordFacts(firsts[0]?.citation.documentId ?? "", knowledgeRevision);
  const waiting = usePending(ids);
  if (waiting || first.status === "pending") return <EvidenceChartGhost claims={ids} />;
  const rows: OakEvidenceRow[] = firsts.flatMap(({ claim, citation }, index) => {
    const document = citation.documentId;
    if (firsts.findIndex(item => item.citation.documentId === document) !== index) return [];
    const state = oakRecordFactsState(document, knowledgeRevision);
    if (state.status !== "loaded" || state.facts.kind !== "work") return [];
    const source = cardOf?.({ ...claim, citations: [citation] });
    const name = source?.card?.title || source?.title.split(":")[0]!.trim() || document.replace(/^[^:]*:/, "");
    const held = state.facts.heldArtifacts;
    return [{ document, name, published: state.facts.artifacts.map(artifact => artifact.label), ...(typeof held === "number" ? { held } : {}) }];
  });
  if (!rows.length) return <ClaimList ids={ids} />;
  const totals = oakEvidenceTotals(rows);
  const statuses: OakEvidenceStatus[] = totals.counted ? ["published", "held"] : ["published"];
  const labels: OakFigureItem[] = rows.map(row => ({ label: `${row.name} published`, value: row.published.join("; ") || "None yet" }));
  const shares: OakFigureItem[] = statuses.map(status => ({ label: WORD[status], value: share(totals, status) }));
  const bars: OakFigureBarsData = { caption: "Published artifacts per record", series: statuses.map(status => WORD[status]),
    rows: rows.map(row => ({ label: row.name, values: totals.counted ? [row.published.length, row.held ?? 0] : [row.published.length] })) };
  const figure = mode === "donut"
    ? <OakFigure caption="Published share of all artifacts" items={[...shares, ...labels]}><Donut totals={totals} hatch={hatch} /></OakFigure>
    : mode === "sankey"
      ? <OakFigure caption="Artifacts by record, published or held" items={[...rows.map(row => ({ label: row.name, value: counts(row) })), ...shares, ...labels]}>
        <Sankey rows={rows} hatch={hatch} /></OakFigure>
      : <OakFigure caption={bars.caption} items={[...oakFigureBarItems(bars), ...shares, ...labels]}><OakFigureBars data={bars} /></OakFigure>;
  return <div className="oak-evidence" data-mode={mode} data-picture-ok="the chart of published proof is the content">
    {figure}
    <ClaimList ids={ids} />
  </div>;
}
