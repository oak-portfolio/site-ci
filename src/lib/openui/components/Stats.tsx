import * as React from "react";
import { defineComponent, useIsStreaming } from "@openuidev/react-lang";
import { z } from "zod";
import { Icon } from "@/components/ui/Icon";
import { OAK_STATS_SLACK_LIMIT, oakStatsSlacks } from "@/lib/oakStatsSlack";
import type { OakOpenUINode } from "../../../../packages/oak-agent-contracts/src/openui/views/node";
import { claimOf, prop } from "../../../../packages/oak-agent-contracts/src/openui/views/node";
import { oakOpenUIStatsView } from "../../../../packages/oak-agent-contracts/src/openui/views/stats";
import { SkelBar, useFacts, useWaiting } from "../scope";
import { Meter } from "./Meter";
import { Metric, OAK_METRIC_KINDS, useOakMetricKinds } from "./Metric";

/** A Stats tile: glyph, label, number, then the sentence (a narrow tile wraps it to five or six lines) and the source chip row. */
function StatsSkeletonTile() {
  return <div className="oak-openui-stats__tile oak-openui-skel" data-pending="" aria-hidden="true">
    <span className="oak-openui-skel__stack"><span className="oak-openui-skel__mark" />
      <SkelBar size="short" /><SkelBar size="value" />
      <span className="oak-openui-stats__skel-claim"><SkelBar size="long" /><SkelBar /><SkelBar /><SkelBar /><SkelBar /><SkelBar /><SkelBar size="short" /></span>
      <SkelBar size="chip" /></span></div>;
}

export const Stats = defineComponent({
  name: "Stats",
  description: "2 to 4 Metric or Meter blocks grouped as one list of numbers.",
  props: z.object({ items: z.array(z.union([Metric.ref, Meter.ref])) }),
  component: ({ props, renderNode }) => <StatsView items={props.items ?? []} renderNode={renderNode} />,
});

function StatsView({ items: given, renderNode }: { items: unknown[]; renderNode: (value: unknown) => React.ReactNode }) {
  // ARCH@40: which tiles, whether they share one page (R19) and whether they stack (R27g, R27l, R27n) come from block-view.ts.
  const facts = useFacts();
  const streaming = useIsStreaming();
  const { kinds, noResult } = useOakMetricKinds((given as OakOpenUINode[]).map(item => ({ claim: claimOf(item), value: String(prop(item, "value") ?? "") })));
  // Ticket 43: the result first, then scope, then context, streaming or settled, so settling never moves a tile; with
  // kinds on the cited records and no result among them, one calm row says so.
  const items = kinds.some(Boolean) ? given.map((item, index) => ({ item, rank: kinds[index] ? OAK_METRIC_KINDS[kinds[index]!.kind].rank : 3 }))
    .sort((left, right) => left.rank - right.rank).map(entry => entry.item) : given;
  const waiting = useWaiting("stats", items);
  // Ticket 16: tiles still to come keep the grid open, so one tile that has arrived already sits in its row, not full width.
  const settled = oakOpenUIStatsView(items as OakOpenUINode[], facts);
  const view = settled ?? (waiting && items.length ? { tiles: items.slice(0, 4) as OakOpenUINode[], rest: [] as OakOpenUINode[], onePage: false, uneven: false } : null);
  const places = Math.min(waiting, 4 - (view?.tiles.length ?? 0));
  const grid = React.useRef<HTMLDivElement>(null);
  // The tiles this measurement belongs to: a new answer in the same instance starts unmeasured (R28b review).
  const signature = view ? `${view.onePage}:${view.tiles.map(tile => JSON.stringify(tile?.props ?? {})).join("|")}` : "";
  const [measured, setMeasured] = React.useState<string | null>(null);
  const measuredUneven = measured === signature;
  // R28 live (live-v43 numbers): the character rule guessed side by side for 189 against 114 characters (two lines apart),
  // leaving 63px empty. Once the answer settles, measure each tile with oakStatsSlacks (the gallery check runs the same one) and stack when any run passes 56px.
  // It only ever turns stacking on, so a stacked layout cannot flip back and forth on resize. Each tile is observed as well
  // as the grid (a font load rewraps a short tile inside an unchanged row), and a check waits a frame so a size passing
  // through during the panel's entrance never counts (R28b review).
  React.useLayoutEffect(() => {
    const node = grid.current;
    if (!node || streaming || view?.uneven || measuredUneven) return;
    let frame = 0, live = true;
    const measure = () => { if (live && Math.max(0, ...oakStatsSlacks(node).map(slack => slack.run)) > OAK_STATS_SLACK_LIMIT) setMeasured(signature); };
    const check = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    measure();
    const observer = new ResizeObserver(check);
    observer.observe(node);
    for (const tile of node.querySelectorAll(".oak-openui-stats__tile > *")) observer.observe(tile);
    void document.fonts?.ready.then(check);
    return () => { live = false; cancelAnimationFrame(frame); observer.disconnect(); };
  }, [streaming, view?.uneven, measuredUneven, signature]);
  if (!view && !places) return <>{renderNode(items)}</>;
  // R19 (Oak, review v16: the tiles "are not even the same height"): every tile is its own frame in one stretched row,
  // each carries its own source chip pinned to its foot, so tiles share a height and their insets match.
  // Four tiles group; any further item reads below as its own block, so every claim still shows.
  const tiles = view?.tiles ?? [];
  const uneven = Boolean(view?.uneven) || measuredUneven;
  return <>{noResult ? <p className="oak-openui-stats__no-result"><Icon name="info" size={16} /><span>Result: No measured result yet</span></p> : null}
    <div ref={grid} className="oak-openui-stats" data-count={tiles.length + places} data-one-page={view?.onePage ? "" : undefined} data-uneven={uneven ? "" : undefined}>{tiles.map((item, index) =>
    <div key={index} className="oak-openui-stats__tile">{renderNode(item)}</div>)}
    {Array.from({ length: places }, (_, index) => <StatsSkeletonTile key={`wait-${index}`} />)}</div>
    {renderNode(view?.rest ?? [])}</>;
}
