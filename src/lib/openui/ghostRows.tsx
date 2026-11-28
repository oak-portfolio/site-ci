import * as React from "react";
import type { ParseResult } from "@openuidev/react-lang";
import { oakPlanGhosts, type OakPlanGhost } from "@/lib/oakOpenUISkeletons";
import { CardSkeleton } from "@/lib/openui/cards";
import { CalloutGhost } from "@/lib/openui/components/Callout";
import { PointsGhost } from "@/lib/openui/components/Points";
import { GHOSTS as WALL_GHOSTS, WallGhost } from "@/lib/openui/components/ProjectWall";
import { ProseGhost } from "@/lib/openui/components/Prose";
import { StepsGhost } from "@/lib/openui/components/Steps";
import { markOakFirstGhost } from "@/lib/oakWorkspaceTransport";
import type { OakPlanBlock } from "../../../packages/oak-agent-contracts/src/openui/plan";

const cards = (kind: "project" | "role") => (count: number) => Array.from({ length: count }, (_, index) => <CardSkeleton key={index} kind={kind} />);
/**
 * Ticket 17: each planned kind's own ghost, filled with the plan's count. A kind missing here draws no ghost; Sources draws
 * none because a layout's Sources slot renders nothing (its pill lives in the action row). `claims` are the unplaced claims
 * this ghost likely stands in for, in answer order.
 */
const GHOSTS: Readonly<Record<string, (count: number, claims: readonly string[]) => React.ReactNode>> = {
  Prose: (_, claims) => <ProseGhost claim={claims[0]} />, Points: (count, claims) => <PointsGhost count={count} claims={claims} />, Steps: (count, claims) => <StepsGhost count={count} claims={claims} />,
  Callout: () => <CalloutGhost />, Project: cards("project"), Role: cards("role"),
  ProjectWall: count => <WallGhost count={Math.min(Math.max(count, 2), WALL_GHOSTS)} />,
};
const ghosted = (kind: string) => Object.hasOwn(GHOSTS, kind);
export type OakGhostRow = { ghost: OakPlanGhost; claims: readonly string[] };

/** The root block kinds a parsed layout draws so far, in order (a name still unresolved is not drawn). */
function oakDrawnKinds(result: ParseResult | null) {
  const children = (result?.root?.props as { children?: unknown } | undefined)?.children;
  return Array.isArray(children) ? children.flatMap(child => child && typeof child === "object" && "typeName" in child ? [String(child.typeName)] : []) : [];
}

/**
 * The ghost rows to draw: with a plan, one per planned block still to come, sized by claims; with none (the plan ended), the
 * rows last held, all folding, until `released`.
 */
export function oakGhostRows({ plan, drawn, unplaced, held, released }: {
  plan: readonly OakPlanBlock[] | null; drawn: readonly string[]; unplaced: readonly string[]; held: readonly OakGhostRow[]; released: boolean;
}): OakGhostRow[] {
  if (!plan) return released ? [] : held.map(row => ({ ...row, ghost: { ...row.ghost, folding: true } }));
  const ghosts = oakPlanGhosts(plan, drawn, ghosted);
  const firstClaim = ghosts.map((_, index) => ghosts.slice(0, index).reduce((sum, ghost) => sum + ghost.count, 0));
  // An open ghost sizes from the claims it stands in for; once its block is dropped those claims are placed elsewhere, so it keeps the size it had while it eases out.
  return ghosts.map((ghost, index) => {
    const kept = held.find(row => row.ghost.at === ghost.at)?.claims ?? [];
    if (ghost.folding) return { ghost, claims: kept };
    // A row with no claim of its own yet keeps the claim it was first sized by (or one still unplaced), so a ghost holds its height as other blocks fill and as its own block lands.
    const own = unplaced.slice(firstClaim[index], firstClaim[index]! + ghost.count);
    return { ghost, claims: Array.from({ length: Math.max(own.length, ghost.count) }, (_, row) => own[row] ?? kept[row] ?? unplaced[(row - own.length) % Math.max(unplaced.length, 1)])
      .filter((claim): claim is string => claim !== undefined) };
  });
}

/** The rows for this render, held across renders so the column folds out after the plan ends (ticket 119). */
export function useOakGhostRows({ id, plan, result, unplaced, frame }: {
  id: string; plan: readonly OakPlanBlock[] | null; result: ParseResult | null; unplaced: readonly string[]; frame: React.RefObject<HTMLDivElement | null>;
}) {
  const held = React.useRef<OakGhostRow[]>([]);
  const [released, setReleased] = React.useState(false);
  const rows = oakGhostRows({ plan, drawn: plan ? oakDrawnKinds(result) : [], unplaced, held: held.current, released });
  // Ticket 119: when the plan ends (the turn settles) the ghosts still open or folding stay mounted and fold out, then the column goes.
  React.useLayoutEffect(() => {
    if (plan) {
      held.current = rows;
      if (rows.some(row => !row.ghost.folding)) markOakFirstGhost(id);
      if (released) setReleased(false);
      return;
    }
    const column = frame.current?.querySelector(":scope > .oak-openui-ghosts");
    if (!column) return;
    let current = true;
    void Promise.allSettled(column.getAnimations({ subtree: true }).filter(animation => animation instanceof CSSTransition).map(animation => animation.finished))
      .then(() => { if (current) { held.current = []; setReleased(true); } });
    return () => { current = false; };
  });
  return rows;
}

export function OakGhostColumn({ rows }: { rows: readonly OakGhostRow[] }) {
  return rows.length ? <div className="oak-openui oak-openui-ghosts" aria-hidden="true">{rows.map(({ ghost, claims }) =>
    // A dropped block's ghost stays mounted and eases its rows to nothing, so no frame moves the content by more than a line.
    <div key={ghost.at} className="oak-openui-ghost" data-ghost={ghost.kind} data-fold={ghost.folding ? "" : undefined}>
      <div className="oak-openui">{GHOSTS[ghost.kind]!(ghost.count, claims)}</div></div>)}</div> : null;
}
