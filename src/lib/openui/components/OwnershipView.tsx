import * as React from "react";
import { Icon } from "@/components/ui/Icon";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RadioGroup, RadioSegment } from "@/components/ui/radio-group";
import { oakRecordFactsState, useOakRecordFacts } from "@/lib/oakRecordFacts";
import { oakOwnershipBlockOn } from "@/lib/oakFlags/ownership";
import { announceOakBlock } from "../a11y/oakBlockAnnounce";
import { ClaimList, usePending } from "../cards";
import { OakFigure, OakFigureBars, oakFigureBarItems, type OakFigureBarsData } from "../figure/OakFigure";
import { Claim, useScope } from "../scope";
import { OwnershipGhost, type OwnershipProps } from "./Ownership";

const MODES = [
  { value: "split", label: "Split", said: "Ownership shown as two lists." },
  { value: "tree", label: "Tree", said: "Ownership shown as a tree." },
  { value: "roll", label: "Roll", said: "Ownership shown as a count of areas listed." },
] as const;
type Mode = NonNullable<OwnershipProps["mode"]>;
type Lines = Readonly<{ oak: readonly string[]; collaborators: readonly string[] }>;

const SHOWN = 3;
const lineList = (value: unknown) => Array.isArray(value) && value.every(item => typeof item === "string" && item.trim()) ? value as string[] : null;

/** The record's reviewed ownership lines, read here until the record-facts type carries them (O-05-ownership); anything malformed is no lines. */
function readLines(facts: unknown): Lines | null {
  const value = (facts as { ownership?: { oak?: unknown; collaborators?: unknown } } | undefined)?.ownership;
  const oak = lineList(value?.oak), collaborators = lineList(value?.collaborators);
  return oak?.length && collaborators ? { oak, collaborators } : null;
}

/** One side of the split: its rows even, the rest folded and still in the page (hidden until found), or the plain empty line. */
function Side({ title, items, empty }: { title: string; items: readonly string[]; empty: string }) {
  const rest = items.slice(SHOWN);
  return <section className="oak-ownership__side" aria-label={title}>
    <h4 className="oak-ownership__title">{title}</h4>
    {items.length ? <ul className="oak-ownership__rows">{items.slice(0, SHOWN).map(item => <li key={item} className="oak-ownership__row">{item}</li>)}</ul>
      : <p className="oak-ownership__empty">{empty}</p>}
    {rest.length ? <Collapsible className="oak-openui-card__more">
      <CollapsibleTrigger className="oak-openui-card__more-trigger" aria-label={`${rest.length} more for ${title}`}>
        <span>{rest.length} more</span><Icon name="arrowDown" size={14} /></CollapsibleTrigger>
      <CollapsibleContent hiddenUntilFound className="oak-openui-card__more-panel">
        <ul className="oak-ownership__rows">{rest.map(item => <li key={item} className="oak-ownership__row">{item}</li>)}</ul></CollapsibleContent>
    </Collapsible> : null}
  </section>;
}

const NONE = "No collaborators listed";

function Tree({ name, lines }: { name: string; lines: Lines }) {
  const items = [{ label: "Steve", value: lines.oak.join("; ") }, { label: "Collaborators", value: lines.collaborators.join("; ") || NONE }];
  const branch = (label: string, rows: readonly string[]) => <li><span className="oak-ownership__node">{label}</span>
    {rows.length ? <ul>{rows.map(row => <li key={row}><span className="oak-ownership__leaf">{row}</span></li>)}</ul>
      : <ul><li><span className="oak-ownership__leaf" data-empty="">{NONE}</span></li></ul>}</li>;
  return <OakFigure caption={`Who owned what: ${name}`} items={items}>
    <ul className="oak-ownership__tree"><li><span className="oak-ownership__node" data-root="">{name}</span>
      <ul>{branch("Steve", lines.oak)}{branch("Collaborators", lines.collaborators)}</ul></li></ul>
  </OakFigure>;
}

function Roll({ rows }: { rows: readonly { name: string; lines: Lines }[] }) {
  const data: OakFigureBarsData = { caption: "Areas listed per record", series: ["Steve's areas listed", "Collaborators' areas listed"],
    rows: rows.map(row => ({ label: row.name, values: [row.lines.oak.length, row.lines.collaborators.length] })) };
  // A zero collaborators bar would read as solo work, so name the gap in words.
  const none = rows.filter(row => !row.lines.collaborators.length);
  return <>
    <OakFigure caption={data.caption} items={oakFigureBarItems(data)}><OakFigureBars data={data} /></OakFigure>
    {none.map(row => <p key={row.name} className="oak-ownership__empty">{rows.length > 1 ? `${row.name}: ${NONE}` : NONE}</p>)}
  </>;
}

export default function OwnershipView({ claim: id, mode }: OwnershipProps) {
  const { claims, cardOf, knowledgeRevision = "", id: block } = useScope();
  const claim = claims.get(id);
  const documents = [...new Set(claim?.citations.map(citation => citation.documentId))];
  const first = useOakRecordFacts(documents[0] ?? "", knowledgeRevision);
  const [chosen, setChosen] = React.useState<Mode | null>(null);
  const waiting = usePending([id]);
  const on = oakOwnershipBlockOn();
  if (on && (waiting || first.status === "pending")) return <OwnershipGhost />;
  const records = !on || !claim ? [] : claim.citations.flatMap((citation, index) => {
    if (documents.indexOf(citation.documentId) !== index) return [];
    const state = oakRecordFactsState(citation.documentId, knowledgeRevision);
    const lines = state.status === "loaded" ? readLines(state.facts) : null;
    const title = cardOf?.({ ...claim, citations: [citation] })?.title.split(":")[0]!.trim();
    return lines ? [{ name: title || citation.documentId.replace(/^[^:]*:/, ""), lines }] : [];
  });
  if (!records.length) return <ClaimList ids={[id]} />;
  const current = chosen ?? mode ?? "split";
  const lead = records[0]!;
  return <div className="oak-ownership" data-mode={current}>
    <p className="oak-ownership__lead"><Claim id={id} /></p>
    <div className="oak-ownership__switch"><RadioGroup aria-label="Show ownership as" value={current}
      onValueChange={value => { const next = MODES.find(entry => entry.value === value); if (next) { setChosen(next.value); announceOakBlock(`${block}:ownership:${id}`, next.said, { repeat: true }); } }}>
      {MODES.map(entry => <RadioSegment key={entry.value} value={entry.value}>{entry.label}</RadioSegment>)}
    </RadioGroup></div>
    {current === "split" ? <div className="oak-ownership__split">
      <Side title="Steve" items={lead.lines.oak} empty="" />
      <Side title="Collaborators" items={lead.lines.collaborators} empty={NONE} />
    </div> : current === "tree" ? <Tree name={lead.name} lines={lead.lines} /> : <Roll rows={records} />}
  </div>;
}
