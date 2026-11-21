import type * as React from "react";
import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { oakCompareMatrixOn } from "@/lib/oakFlags/compareMatrix";
import { oakOpenUICompareView } from "../../../../packages/oak-agent-contracts/src/openui/views/compare";
import type { OakOpenUINode } from "../../../../packages/oak-agent-contracts/src/openui/views/node";
import { SkelBar, useFacts, useScope, useWaiting } from "../scope";
import { CompareColumns, CompareRow } from "./CompareRow";

/** A Compare row: the label in its short column, then one claim per compared item. */
function CompareSkeletonRow({ pair }: { pair: boolean }) {
  return <div className="oak-openui__compare-row oak-openui-skel" data-pending="" data-pair={pair ? "" : undefined} aria-hidden="true">
    <dt><SkelBar size="short" /></dt>
    {Array.from({ length: pair ? 2 : 1 }, (_, index) => <dd key={index}><span className="oak-openui-card__bars">
      <SkelBar size="long" /><SkelBar />{pair ? <SkelBar /> : null}<SkelBar size="short" /></span></dd>)}
  </div>;
}

type Props = { props?: { claim?: unknown; also?: unknown } } | null;

/** Ticket 57: the matrix header leads each named column with its page's cover, read from the first paired row. */
function useColumnCovers(rows: unknown[], on: boolean) {
  const { claims, cardOf } = useScope();
  if (!on) return [];
  const pair = (rows as Props[]).find(row => row?.props?.also)?.props;
  return [pair?.claim, pair?.also].map(id => {
    const claim = typeof id === "string" ? claims.get(id) : undefined;
    const source = claim ? cardOf?.(claim) : null;
    return source?.card?.image ?? source?.cover;
  });
}

/** R27g live (live-v36 compare, judge): side by side, a reader had to work out the columns from each cell's chip. Paired rows
 * get a header naming the two items, each the page its first paired claim cites. */
function CompareView({ rows, renderNode }: { rows: unknown[]; renderNode: (value: unknown) => React.ReactNode }) {
  const named = oakOpenUICompareView(rows as OakOpenUINode[], useFacts()).columns;
  const waiting = useWaiting("compare", rows);
  const matrix = oakCompareMatrixOn();
  const covers = useColumnCovers(rows, matrix && Boolean(named));
  const flag = matrix ? "" : undefined;
  // Rows already in decide the columns; with none yet, a compare is two items side by side.
  const pair = !rows.length || rows.some(row => Boolean((row as { props?: { also?: unknown } } | null)?.props?.also));
  return <>
    {named ? <div className="oak-openui__compare-head" data-matrix={flag} aria-hidden="true"><span />
      {named.map((name, index) => <span key={index}>{covers[index] ? <img className="oak-openui__compare-cover" src={covers[index]} alt="" loading="lazy" decoding="async" /> : null}{name}</span>)}</div> : null}
    <CompareColumns.Provider value={named}>
      <dl className="oak-openui__compare" data-matrix={flag}>{renderNode(rows)}
        {Array.from({ length: waiting }, (_, index) => <CompareSkeletonRow key={index} pair={pair} />)}</dl>
    </CompareColumns.Provider>
  </>;
}

export const Compare = defineComponent({
  name: "Compare",
  description: "2 to 5 rows when the visitor compares things they named: two of Steve's projects or roles side by side (each row one shared point with both items' claims), or requirements, options or skills against his work.",
  props: z.object({ rows: z.array(CompareRow.ref) }),
  component: ({ props, renderNode }) => <CompareView rows={props.rows as unknown[]} renderNode={renderNode} />,
});
