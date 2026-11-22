import { oakRecordFactsState, useOakRecordFacts, type OakWorkFacts } from "@/lib/oakRecordFacts";
import { usePending } from "../cards";
import { Claim, useScope } from "../scope";
import { DiagramFigure } from "./diagram/DiagramFigure";
import { DiagramMindmap } from "./diagram/mindmap";
import { DiagramQuadrant } from "./diagram/quadrant";
import { DiagramRadar, type OakDiagramRecord } from "./diagram/radar";
import { DiagramTreeview } from "./diagram/treeview";
import { DiagramGhost, DiagramOff, oakDiagramDrawn, oakDiagramRecordPreset, type DiagramProps } from "./Diagram";

/**
 * The cited record's systemMap as a figure, led by the claim; no record facts or fewer than two steps is the Steps list.
 * Radar and quadrant compare every work record the claim cites, and draw the first record's flow when it cites only one.
 */
export default function DiagramView({ claim: id, preset, from }: DiagramProps) {
  const { claims, cardOf, knowledgeRevision = "" } = useScope();
  const claim = claims.get(id);
  const document = claim?.citations[0]?.documentId ?? "";
  const facts = useOakRecordFacts(document, knowledgeRevision);
  const waiting = usePending([id]);
  if (waiting || facts.status === "pending") return <DiagramGhost />;
  const steps = facts.status === "loaded" && facts.facts.kind === "work" ? facts.facts.systemMap : [];
  if (!claim || steps.length < 2) return <DiagramOff claim={id} from={from} />;
  const nameOf = (at: number) => cardOf?.({ ...claim, citations: claim.citations.slice(at, at + 1) })?.title.split(":")[0]!.trim()
    || claim.citations[at]!.documentId.replace(/^[^:]*:/, "");
  const name = nameOf(0);
  const records: OakDiagramRecord[] = [...new Map(claim.citations.map((citation, at) => {
    const state = oakRecordFactsState(citation.documentId, knowledgeRevision);
    return [citation.documentId, state.status === "loaded" && state.facts.kind === "work" ? { name: nameOf(at), facts: state.facts as OakWorkFacts } : null] as const;
  })).values()].filter(record => record !== null);
  const record = oakDiagramRecordPreset(preset);
  const compares = record === "radar" || record === "quadrant";
  const first = records[0]!;
  return <div className="oak-diagram__block">
    <p className="oak-diagram__lead"><Claim id={id} /></p>
    {record === "mindmap" ? <DiagramMindmap name={first.name} cover={first.facts.cover} steps={steps} />
      : record === "treeview" ? <DiagramTreeview name={first.name} steps={steps} />
      : record === "radar" && records.length > 1 ? <DiagramRadar records={records} />
      : record === "quadrant" && records.length > 1 ? <DiagramQuadrant records={records} />
      : <DiagramFigure name={name} steps={steps} preset={compares ? "flow" : oakDiagramDrawn(preset)} />}
  </div>;
}
