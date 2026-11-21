import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { CardClaims, CardSkeleton, CardTitle, ClaimList, OakArt, oakOpenUINames, ToolChip, useCard, usePending } from "../cards";
import { claimId, useScope } from "../scope";

/**
 * R17 (Oak, review v14: the R16 cover cards read as "slop", always two columns, abrupt): a case study is a row, the way
 * Perplexity and Pin list items and Apple's HIG prefers text rows with a small leading image. Its cover is a thumbnail
 * beside the title, role and dates. R18 (review v15, Mobbin: Kajabi, Perplexity finance): its lead claim comes next, then
 * the page's verified numbers as label-over-value cells and the stack on a line of its own, never mixed into one line.
 */
function ProjectView({ claims: ids }: { claims: string[] }) {
  const pending = usePending(ids);
  const { tools } = useScope();
  const { list, source, card, page, own, others } = useCard(ids, "work");
  if (pending) return <CardSkeleton kind="project" />;
  if (!ids.length) return null;
  if (!source || !card) return <ClaimList ids={ids} />;
  const named = (item: string) => list.some(claim => oakOpenUINames(claim.text, item));
  // Stable sort: the tools these claims name first, then the page's own order.
  const chips = tools?.listed ? [] : [...card.stack ?? []].sort((a, b) => Number(named(b)) - Number(named(a))).slice(0, 3);
  const meta = [card.role, card.period].filter(Boolean).join(" \u00b7 ");
  const metrics = tools ? [] : card.metrics?.slice(0, 2) ?? [];
  // The 480px cover is plenty for an 80px tile; the card image (up to 960px) is the fallback.
  const thumb = source.cover ?? card.image;
  return <><article className="oak-openui-card oak-openui-project">
    <div className="oak-openui-card__head">
      {/* R20: the cover keeps its own shape (about 1.9:1), no longer a square crop that cut its title artwork. */}
      {thumb ? <OakArt className="oak-openui-card__thumb" src={thumb} alt={source.cover ? "" : card.imageAlt ?? ""} ratio={card.imageRatio} /> : null}
      <div className="oak-openui-card__name">
        <CardTitle source={source} title={card.title ?? source.title} />
        {meta ? <p className="oak-openui-card__meta">{meta}</p> : null}
      </div>
    </div>
    <CardClaims ids={own} page={page} about={card.title ?? source.title} />
    {metrics.length ? <dl className="oak-openui-card__metrics">{metrics.map(metric => <div key={metric.label} className="oak-openui-card__metric">
      <dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}</dl> : null}
    {chips.length ? <ul className="oak-openui-chips" aria-label="Stack">{chips.map(item => <ToolChip key={item} item={item} />)}</ul> : null}
  </article><ClaimList ids={others} /></>;
}

export const Project = defineComponent({
  name: "Project",
  description: "One case study as a card: the claims that cite it, under its cover, role, period and stack from Steve's page.",
  props: z.object({ claims: z.array(claimId) }),
  component: ({ props }) => <ProjectView claims={props.claims} />,
});
