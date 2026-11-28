import * as React from "react";
import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { oakTimelineLanesOn } from "@/lib/oakFlags/timelineLanes";
import { oakRecordFactsState, useOakRecordFacts } from "@/lib/oakRecordFacts";
import type { AnswerClaim } from "../../../../packages/oak-agent-contracts/src/types";
import { OakFigure } from "../figure/OakFigure";
import { Claim, oakVerbatim, SkelBar, useScope, useWaiting } from "../scope";
import { TimelineItem } from "./TimelineItem";

/** A Timeline item: its node on the rail, then the sentence. */
function TimelineSkeletonItem() {
  return <li className="oak-openui__timeline-item oak-openui-skel" data-pending="" aria-hidden="true">
    <span className="oak-openui-skel__mark" data-node="" />
    <span className="oak-openui-skel__claim oak-openui-card__bars"><SkelBar size="long" /><SkelBar /></span></li>;
}

export const Timeline = defineComponent({
  name: "Timeline",
  description: "2 to 6 dated claims, oldest first. Only when every item's claim states its date.",
  props: z.object({ items: z.array(TimelineItem.ref) }),
  component: ({ props, renderNode }) => oakTimelineLanesOn() ? <TimelineLanes items={props.items as unknown[]} renderNode={renderNode} />
    : <TimelineView items={props.items as unknown[]} renderNode={renderNode} />,
});

function TimelineView({ items, renderNode }: { items: unknown[]; renderNode: (value: unknown) => React.ReactNode }) {
  const waiting = useWaiting("timeline", items);
  return <ol className="oak-openui__timeline" aria-hidden={items.length === 0 && waiting > 0 ? true : undefined}>{renderNode(items)}
    {Array.from({ length: waiting }, (_, index) => <TimelineSkeletonItem key={index} />)}</ol>;
}

type Entry = { date: string; claim: string };
type Lane = { id: string; name: string; cover?: string; from: number; to: number; open: boolean };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthOf = (value: string) => {
  const match = /^(\d{4})-(\d{2})/.exec(value);
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : null;
};
const monthName = (month: number) => `${MONTHS[month % 12]} ${Math.floor(month / 12)}`;
/** What the bar shows, as words: the axis and bars are hidden from screen readers (m5 M1). */
const spanOf = (lane: Lane) => lane.open ? `${monthName(lane.from)} to now, ongoing`
  : lane.to === lane.from ? monthName(lane.from) : `${monthName(lane.from)} to ${monthName(lane.to)}`;

type AxisKey = "first" | "last" | "now";
type AxisTier = "all" | "narrow" | "wide";
/**
 * Ticket 351: the desktop axis in px at the axis font. `label` holds a three-letter month or a year in semibold tabular
 * figures, `short` a two-figure year ("\u201919"), `pad` is the month's start padding, and the two widths are the axis in a
 * 700px answer column (the 720px reading column with room to spare) and in a 520px one, where the desktop layout starts.
 */
export const LANES_AXIS = { wide: 458, narrow: 278, label: 32, short: 22, gap: 4, pad: 4 } as const;
/** Where a month's label sits: from its column start, centred on its column (Today), or ending at the axis end (last). */
export const lanesAxisBox = (index: number, count: number, axis: number, key?: string, short = false): [number, number] => {
  const column = axis / count, { pad } = LANES_AXIS, label = short ? LANES_AXIS.short : LANES_AXIS.label;
  const left = key === "last" ? axis - label : key === "now" ? (index + 0.5) * column - label / 2 : index * column + pad;
  return [left, left + label];
};
const shortYear = (month: number) => `\u2019${String(Math.floor(month / 12)).slice(2)}`;
/**
 * The months that keep a label at desktop widths: the key months always, then one label for each year no key label
 * names (its January, or else the first month of that year with room, which then prints the year: r351 M1), then every
 * Nth month of the year (N the smallest of 1, 2, 3, 4, 6 whose spacing holds a label), each only while it clears every
 * label already kept, Januaries before the rest. When a year is narrower than a four-figure label, the year labels read
 * "\u201919" instead (data-short), and a year carried to a later month shows its year at that width (data-carry). Each
 * width is laid out on its own so each keeps one steady step: "all" shows at both, "narrow" from 520px to 699px, and
 * "wide" from 700px.
 */
function lanesAxisTicks(first: number, last: number, keyOf: (month: number) => AxisKey | undefined) {
  const count = last - first + 1, months = Array.from({ length: count }, (_, index) => first + index);
  const place = (axis: number) => {
    const short = 12 * axis / count < LANES_AXIS.label + LANES_AXIS.gap;
    const kept = months.filter(month => keyOf(month)), carry: number[] = [];
    const boxOf = (month: number) => lanesAxisBox(month - first, count, axis, keyOf(month), short && !keyOf(month));
    const fits = (month: number) => {
      const [left, right] = boxOf(month);
      return !kept.includes(month) && left >= 0 && right <= axis && kept.every(other => {
        const [from, to] = boxOf(other);
        return left >= to + LANES_AXIS.gap || right <= from - LANES_AXIS.gap;
      });
    };
    const named = new Set(kept.map(month => Math.floor(month / 12)));
    for (const year of new Set(months.map(month => Math.floor(month / 12)))) {
      if (named.has(year)) continue;
      const month = months.find(month => Math.floor(month / 12) === year && fits(month));
      if (month === undefined) continue;
      kept.push(month);
      if (month % 12) carry.push(month);
    }
    const step = [1, 2, 3, 4, 6].find(n => n * axis / count >= LANES_AXIS.label + LANES_AXIS.gap) ?? 12;
    for (const month of [...months.filter(month => month % 12 === 0), ...months.filter(month => month % 12 % step === 0)]) if (fits(month)) kept.push(month);
    return { kept, carry, short: short ? kept.filter(month => !keyOf(month)) : [] };
  };
  const narrow = place(LANES_AXIS.narrow), wide = place(LANES_AXIS.wide);
  const tier = (month: number, pick: (layout: ReturnType<typeof place>) => number[]): AxisTier | undefined =>
    pick(narrow).includes(month) ? pick(wide).includes(month) ? "all" : "narrow" : pick(wide).includes(month) ? "wide" : undefined;
  return (month: number) => ({ tick: tier(month, layout => layout.kept), carry: tier(month, layout => layout.carry), short: tier(month, layout => layout.short) });
}

/** A lane for the first cited record with dates: a case study's publish to update months, or a career entry's start to end. */
function laneOf(claim: AnswerClaim, revision: string, now: number, cardOf: ReturnType<typeof useScope>["cardOf"]): Lane | null {
  for (const citation of claim.citations) {
    const state = oakRecordFactsState(citation.documentId, revision);
    if (state.status !== "loaded" || (state.facts.kind !== "work" && state.facts.kind !== "experience")) continue;
    const source = cardOf?.({ ...claim, citations: [citation] }) ?? null;
    const name = source?.card?.title ?? source?.title.split(":")[0]!.trim();
    const facts = state.facts;
    const from = monthOf(facts.kind === "work" ? facts.datePublished : facts.dateStart);
    if (!name || from === null) continue;
    const open = facts.kind === "work" ? facts.articleStatus === "in-progress-stub" : !facts.dateEnd;
    const end = facts.kind === "work" ? facts.dateUpdated : facts.dateEnd;
    const to = open ? Math.max(from, now) : Math.max(from, monthOf(end ?? "") ?? from);
    return { id: citation.documentId, name, from, to, open, cover: facts.kind === "work" ? facts.cover?.src : undefined };
  }
  return null;
}

/**
 * Ticket 57 (Jira's timeline, `concept-timeline-compare.webp`; Oak P6 "dislikes disconnected column lines"): each record a
 * lane with its cover on one month axis, and one grid of month columns drawn once behind every lane. Bars are geometry from
 * the record's dates; a date reads in text only when the claim states it. Until every item has its record, today's rail.
 */
function TimelineLanes({ items, renderNode }: { items: unknown[]; renderNode: (value: unknown) => React.ReactNode }) {
  const { claims, cardOf, knowledgeRevision = "" } = useScope();
  const entries = items.map(item => (item as { props?: Partial<Entry> } | null)?.props).filter((entry): entry is Entry =>
    typeof entry?.claim === "string" && typeof entry.date === "string");
  const list = entries.map(entry => claims.get(entry.claim));
  const state = useOakRecordFacts(list[0]?.citations[0]?.documentId ?? "", knowledgeRevision);
  const waiting = useWaiting("timeline", items);
  const today = new Date();
  const now = today.getFullYear() * 12 + today.getMonth();
  const lanes: Lane[] = [];
  for (const claim of list) {
    const lane = claim ? laneOf(claim, knowledgeRevision, now, cardOf) : null;
    if (!lane) { lanes.length = 0; break; }
    if (!lanes.some(item => item.id === lane.id)) lanes.push(lane);
  }
  if (waiting || state.status === "pending" || lanes.length < 2) return <TimelineView items={items} renderNode={renderNode} />;
  lanes.sort((a, b) => a.from - b.from);
  const first = Math.min(...lanes.map(lane => lane.from)), last = Math.max(...lanes.map(lane => lane.to));
  const months = Array.from({ length: last - first + 1 }, (_, index) => first + index);
  const day = today.getDate() / 31;
  const at = now >= first && now <= last ? (now - first + day) / months.length : null;
  const away = (month: number) => Math.min(month - first, last - month) / Math.max(1, last - first);
  // At phone widths only these labels show: the axis ends, and Today when it sits clear of both ends.
  const keyOf = (month: number): AxisKey | undefined => month === first ? "first" : month === last ? "last" : month === now && away(month) >= 0.3 ? "now" : undefined;
  const tickOf = lanesAxisTicks(first, last, keyOf);
  return <>
    <OakFigure caption="By date" items={[]}>
      <div className="oak-lanes" style={{ "--oak-lanes-months": months.length } as React.CSSProperties}>
        <div className="oak-lanes__axis" aria-hidden="true">{months.map(month => {
          const year = month === first || month % 12 === 0, key = keyOf(month), { tick, carry, short } = tickOf(month);
          return <span key={month} className="oak-lanes__month" data-year={year ? "" : undefined} data-key={key} data-tick={tick} data-carry={carry} data-short={short}>
            {MONTHS[month % 12]}{year || key || carry ? <span className="oak-lanes__year">{Math.floor(month / 12)}</span> : null}
            {short ? <span className="oak-lanes__short">{shortYear(month)}</span> : null}</span>;
        })}</div>
        <div className="oak-lanes__grid" aria-hidden="true">{months.map(month => <span key={month} className="oak-lanes__col" />)}
          {at === null ? null : <span className="oak-lanes__today" style={{ "--oak-lanes-at": at } as React.CSSProperties} />}</div>
        <ol className="oak-lanes__lanes">{lanes.map(lane => <li key={lane.id} className="oak-lanes__lane">
          <span className="oak-lanes__name">{lane.cover ? <img className="oak-lanes__cover" src={lane.cover} alt="" loading="lazy" decoding="async" /> : null}{lane.name}
            <span className="sr-only">, {spanOf(lane)}</span></span>
          <span className="oak-lanes__track" aria-hidden="true"><span className="oak-lanes__bar" data-open={lane.open ? "" : undefined}
            style={{ "--oak-lanes-from": lane.from - first + 1, "--oak-lanes-span": lane.to - lane.from + 1,
              "--oak-lanes-cut": lane.open && lane.to === now ? 1 - day : undefined } as React.CSSProperties} /></span>
        </li>)}</ol>
      </div>
      <ul className="oak-figure__legend oak-lanes__legend" aria-hidden="true">
        {lanes.some(lane => !lane.open) ? <li><span className="oak-lanes__key" data-mark="shipped" />Shipped</li> : null}
        {lanes.some(lane => lane.open) ? <li><span className="oak-lanes__key" data-mark="ongoing" />Ongoing</li> : null}
        {at === null ? null : <li><span className="oak-lanes__key" data-mark="today" />Today</li>}
      </ul>
    </OakFigure>
    <ol className="oak-lanes__claims">{entries.map((entry, index) => <li key={index}>
      {oakVerbatim(list[index], entry.date) ? <span className="oak-lanes__date">{entry.date.trim()}</span> : null}<Claim id={entry.claim} /></li>)}</ol>
  </>;
}
