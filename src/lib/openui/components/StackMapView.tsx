import { Icon } from "@/components/ui/Icon";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { oakToolMark } from "@/lib/oakToolMarks";
import { oakStackMapView, type OakStackMapTool } from "../../../../packages/oak-agent-contracts/src/openui/views/stack-map";
import { CardLink, ClaimList, oakOpenUINames, ToolChip, usePending } from "../cards";
import { OakFigure } from "../figure/OakFigure";
import { useScope } from "../scope";
import { StackMapPending, type StackMapProps } from "./StackMap";

type Page = Readonly<{ name: string; page: string; verified: boolean }>;

function Mark({ item }: { item: string }) {
  const mark = oakToolMark(item);
  return <span className="oak-stack-map__mark" aria-hidden="true" data-glyph={mark ? undefined : ""}>
    {mark ? <img src={mark} alt="" width={20} height={20} loading="lazy" decoding="async" /> : <Icon name="code" size={16} />}</span>;
}

/** One tile: the mark, the name and its count, one pip per cited record; a tap discloses the records, linked. */
function Tool({ tool, pages }: { tool: OakStackMapTool; pages: readonly Page[] }) {
  const used = tool.records.length;
  return <li className="oak-stack-map__tool" data-shared={used > 1 ? "" : undefined}>
    <Collapsible>
      <CollapsibleTrigger className="oak-stack-map__trigger">
        <Mark item={tool.name} />
        <span className="oak-stack-map__label"><span className="oak-stack-map__name">{tool.name}</span>
          <span className="oak-stack-map__count">used in {used}
            <span className="oak-stack-map__pips" aria-hidden="true">{pages.map(page =>
              <span key={page.name} data-on={tool.records.includes(page.name) ? "" : undefined} />)}</span></span></span>
        <Icon name="arrowDown" size={14} className="oak-stack-map__chevron" />
      </CollapsibleTrigger>
      <CollapsibleContent hiddenUntilFound className="oak-stack-map__panel">
        <ul className="oak-stack-map__records">{pages.filter(page => tool.records.includes(page.name)).map(page =>
          <li key={page.name}><CardLink to={page.page} verified={page.verified}>{page.name}</CardLink>
            {page.verified ? <Icon name="arrowRight" size={14} className="oak-stack-map__go" /> : null}</li>)}</ul>
      </CollapsibleContent>
    </Collapsible>
  </li>;
}

function Zone({ zone, title, items }: { zone: string; title: string; items: readonly string[] }) {
  return <section className="oak-stack-map__zone" data-zone={zone} aria-label={title}>
    <div className="oak-stack-map__zone-head"><h5 className="oak-stack-map__zone-title">{title}</h5>
      <span className="oak-stack-map__zone-count" aria-hidden="true">{items.length}</span></div>
    {items.length ? <ul className="oak-openui-chips">{items.map(item => <ToolChip key={item} item={item} />)}</ul>
      : <p className="oak-stack-map__none">None named</p>}
  </section>;
}

export default function StackMapView({ claims: ids, mode }: StackMapProps) {
  const { claims, cardOf } = useScope();
  const waiting = usePending(ids);
  const all = [...claims.values()];
  const placed = ids.filter(id => claims.has(id));
  if (waiting) return <StackMapPending claims={ids} />;
  const pages: Page[] = [];
  const records: { name: string; stack: readonly string[] }[] = [];
  const seen = new Set<string>();
  for (const id of placed) for (const citation of claims.get(id)!.citations) {
    if (seen.has(citation.documentId)) continue;
    seen.add(citation.documentId);
    const source = cardOf?.({ ...claims.get(id)!, citations: [citation] });
    if (!source?.card?.stack?.length) continue;
    const name = source.card.title || source.title.split(":")[0]!.trim();
    pages.push({ name, page: source.page, verified: source.verified });
    records.push({ name, stack: source.card.stack });
  }
  const view = oakStackMapView(records, item => all.some(claim => oakOpenUINames(claim.text, item)));
  if (!view) return <ClaimList ids={placed} />;
  const venn = mode === "venn" ? view.venn : null;
  return <div className="oak-stack-map" data-mode={venn ? "venn" : "tools"}>
    {venn ? <OakFigure caption={`Tools in ${venn.a} and ${venn.b}`} items={[
      { label: `Only ${venn.a}`, value: venn.onlyA.join(", ") || "None named" },
      { label: "Both", value: venn.both.join(", ") || "None named" },
      { label: `Only ${venn.b}`, value: venn.onlyB.join(", ") || "None named" }]}>
      <div className="oak-stack-map__venn">
        <Zone zone="a" title={`Only ${venn.a}`} items={venn.onlyA} />
        <Zone zone="both" title="Both" items={venn.both} />
        <Zone zone="b" title={`Only ${venn.b}`} items={venn.onlyB} />
      </div>
    </OakFigure> : <ul className="oak-stack-map__tools" aria-label="Tools across the cited pages">
      {view.tools.map(tool => <Tool key={tool.name} tool={tool} pages={pages} />)}</ul>}
    <ClaimList ids={placed} />
  </div>;
}
