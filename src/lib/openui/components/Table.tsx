import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { oakTableBlockOn } from "@/lib/oakFlags/table";
import { ClaimList } from "../cards";
import { oakLazyView } from "../figure/oakLazyView";
import { claimId, SkelBar } from "../scope";

const KINDS = ["matrix", "sctable", "smap"] as const;
export type Kind = (typeof KINDS)[number];
export type TableProps = { claims: readonly string[]; kind?: Kind };

const COLUMNS: Readonly<Record<Kind, number>> = { matrix: 3, sctable: 3, smap: 1 };

/** The settled shape in bars: a lead line per claim, then the frame with a head row and one row per cited record. */
export function TableGhost({ rows, kind }: { rows: number; kind: Kind }) {
  const count = Math.min(Math.max(rows, 2), 6);
  const cells = (index: number) => Array.from({ length: COLUMNS[kind] }, (_, cell) =>
    <span key={cell} className="oak-table__ghost-cell"><SkelBar />{index >= 0 && <><SkelBar size="long" /><SkelBar size="short" /></>}</span>);
  const row = (index: number) => <li key={index} className="oak-table__ghost-row" data-head={index < 0 ? "" : undefined}><SkelBar size="short" />{cells(index)}</li>;
  return <div className="oak-table oak-openui-skel" data-pending="" data-kind={kind} aria-hidden="true">
    <span className="oak-table__ghost-lead">{Array.from({ length: count }, (_, index) => <span key={index}><SkelBar size="long" /><SkelBar /></span>)}</span>
    <ul className="oak-table__ghost-frame"><li className="oak-table__ghost-caption"><SkelBar size="short" /></li>{[-1, ...Array.from({ length: count }, (_, index) => index)].map(row)}</ul>
  </div>;
}

const Off = ({ claims }: TableProps) => <ClaimList ids={claims} />;
const Lazy = oakLazyView<TableProps>(() => import("./TableView"), ({ claims, kind }) => <TableGhost rows={claims.length} kind={kind ?? "matrix"} />, Off);
const TableBlock = ({ claims, kind }: TableProps) => oakTableBlockOn() ? <Lazy claims={claims} kind={kind} /> : <Off claims={claims} />;

export const Table = defineComponent({
  name: "Table",
  description: "Rows and columns when the visitor wants several of Steve's records lined up: kind matrix (projects by stack, his part and year), sctable (career roles by contract, part-time or full-time), or smap (the site's pages and sections). Two or more records the claims cite; never for one project.",
  props: z.object({ claims: z.array(claimId), kind: z.enum(KINDS).optional() }),
  component: ({ props }) => <TableBlock claims={props.claims} kind={props.kind} />,
});
