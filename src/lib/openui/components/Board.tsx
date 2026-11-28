import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { oakBoardBlockOn } from "@/lib/oakFlags/board";
import type { OakBoardKind } from "../../../../packages/oak-agent-contracts/src/openui/views/board";
import { ClaimList } from "../cards";
import { oakLazyView } from "../figure/oakLazyView";
import { claimId, SkelBar } from "../scope";

export type BoardProps = { claims: readonly string[]; kind?: OakBoardKind };
export const CAP = 6;

/** Two columns of card-shaped bars, one card per claim (capped), so the settled board lands in the same room. */
export function BoardGhost({ cards }: { cards: number }) {
  const per = [Math.ceil(cards / 2), Math.floor(cards / 2)].filter(Boolean);
  return <div className="oak-board oak-openui-skel" data-pending="" aria-hidden="true">
    <span className="oak-board__columns">{per.map((rows, column) =>
      <span key={column} className="oak-board__column">
        <span className="oak-board__head"><SkelBar size="short" /></span>
        <span className="oak-board__list">{Array.from({ length: rows }, (_, index) =>
          <span key={index} className="oak-board__card"><SkelBar size="short" /><SkelBar size="long" /><SkelBar />
            <span className="oak-board__foot"><SkelBar size="chip" /></span></span>)}</span>
      </span>)}</span>
  </div>;
}

const Off = ({ claims }: BoardProps) => <ClaimList ids={claims} />;
const Lazy = oakLazyView<BoardProps>(() => import("./BoardView"), ({ claims }) => <BoardGhost cards={Math.min(Math.max(claims.length, 2), CAP)} />, Off);
const BoardBlock = ({ claims, kind }: BoardProps) => oakBoardBlockOn() ? <Lazy claims={claims} kind={kind} /> : <Off claims={claims} />;

export const Board = defineComponent({
  name: "Board",
  description: "Where each one stands, for a question like \"which case studies are finished?\" or \"which of Steve's roles were contract and which full-time?\": the records the claims cite as columns by their reviewed status (stand, case studies) or engagement (sboard, career entries). Kind defaults from the first cited record. Pick it for those questions even when each claim gives a date: the visitor asks how each one stands, not the order they happened. Never for a question about one project.",
  props: z.object({ claims: z.array(claimId), kind: z.enum(["stand", "sboard"]).optional() }),
  component: ({ props }) => <BoardBlock claims={props.claims} kind={props.kind} />,
});
