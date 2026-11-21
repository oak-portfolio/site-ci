import { OAK_OPENUI_BLOCKS, OAK_PENDING_CAP, type OakPendingKind } from "../../packages/oak-agent-contracts/src/openui/blocks.generated";
import { oakLayoutParsePrefix } from "../../packages/oak-agent-contracts/src/openui/program";
import type { OakPlanBlock } from "../../packages/oak-agent-contracts/src/openui/plan";

/**
 * Ticket 16: what a streaming layout has promised but not yet delivered. A Stats, Compare or Timeline line names its
 * children (`nums = Stats([a, b])`) before their own lines stream, and the renderer drops a name it cannot resolve, so the
 * block would stand empty and then grow. The names say how many are coming and the container says what they are, which is
 * all a typed skeleton needs. The kind of a root-level block that has not started streaming is not in the text; that needs
 * the plan-first order (a Worker change) and is not guessed here.
 */
export { OAK_PENDING_CAP, type OakPendingKind };
export type OakPendingChildren = Readonly<{
  kind: OakPendingKind;
  /** The child names the container's line lists (empty for a line still being written). */
  refs: readonly string[];
  /** The distinct names among them that have no statement yet (a half-written one may still be drawn by OpenUI itself). */
  missing: readonly string[];
  /** How many places the line holds that nothing draws yet. */
  waiting: number;
  /** The line is still being written, so no child is named for certain. */
  open: boolean;
}>;

/** Each container's pending kind (its fragment's `pendingKind`); the cap (`pendingCap`) keeps a long list from growing the page by itself. */
const KINDS: Readonly<Record<string, OakPendingKind>> = Object.fromEntries(Object.values(OAK_OPENUI_BLOCKS)
  .flatMap(block => block.pendingKind ? [[block.name, block.pendingKind]] : []));
const OPEN_CONTAINER = new RegExp(`^\\s*\\w+\\s*=\\s*(${Object.keys(KINDS).join("|")})\\(([^\\n]*)`);
/** Each container takes at least two children, so a line still being written holds two places. */
const OPEN_LINE_PLACES = 2;
const NAME = /^[A-Za-z_]\w*$/;

/** The containers in a streaming program that still wait on children, in the order their lines appear. */
export function oakOpenUIPendingChildren(program: string): OakPendingChildren[] {
  const { program: whole, rest } = oakLayoutParsePrefix(program);
  const defined = new Set(whole.statements.map(statement => statement.name));
  const found: OakPendingChildren[] = [];
  for (const { component, body } of whole.statements) {
    const kind = Object.hasOwn(KINDS, component) ? KINDS[component] : undefined;
    if (!kind) continue;
    const refs = [...new Set((body.match(/^\s*\[([\s\S]*)\]\s*$/)?.[1] ?? "").split(",").map(value => value.trim()).filter(value => NAME.test(value)))];
    const missing = refs.filter(name => !defined.has(name));
    found.push({ kind, refs, missing, waiting: Math.min(missing.length, OAK_PENDING_CAP[kind]), open: false });
  }
  const openLine = rest.join("\n").match(OPEN_CONTAINER);
  // An open line whose array already holds a component call writes its children inline; they render as they arrive.
  if (openLine && !/\b[A-Z]\w*\(/.test(openLine[2] ?? "")) {
    const kind = KINDS[openLine[1]!]!;
    const written = new Set((openLine[2] ?? "").split(/[\s,\[\]]+/).filter(value => NAME.test(value))).size;
    found.push({ kind, refs: [], missing: [], waiting: Math.min(Math.max(OPEN_LINE_PLACES, written), OAK_PENDING_CAP[kind]), open: true });
  }
  return found.filter(entry => entry.waiting > 0);
}

/** Places still to draw for one container: what the line promises, less the children OpenUI already shows, within the cap. */
export function oakPendingPlaces(entry: OakPendingChildren | null, shown: readonly string[]) {
  if (!entry) return 0;
  const left = entry.open ? entry.waiting : entry.missing.filter(name => !shown.includes(name)).length;
  return Math.max(0, Math.min(left, OAK_PENDING_CAP[entry.kind] - shown.length));
}

/**
 * The entry for one rendered container, found from the statement names of the children it already shows. A container with
 * none yet takes the first entry of its kind that has none either.
 */
export function oakPendingFor(plan: readonly OakPendingChildren[], kind: OakPendingKind, shown: readonly string[]) {
  return plan.find(entry => entry.kind === kind && (shown.length ? entry.refs.some(name => shown.includes(name)) : entry.refs.length <= entry.waiting)) ?? null;
}

/** One ghost the plan still holds open: `at` is its plan index; a folding one keeps its space hidden until the answer settles. */
export type OakPlanGhost = Readonly<{ kind: string; count: number; at: number; folding: boolean }>;
/** A card block is one item, so a plan of three projects fills across three blocks; any other block fills its whole slot. */
const ONE_ITEM_BLOCKS = new Set(["Project", "Role"]);

/**
 * Ticket 17 (ARCH-REVIEW A4, Q28 A "may drop or shorten, never add"): the plan's ghosts against the blocks the layout has drawn
 * so far, in order. Planned blocks fill in plan order; a slot the layout skips, or a card list it ends early, folds. A block the
 * plan never named folds every ghost left, so it is never drawn ahead of one. Only kinds with a ghost (`ghosted`) appear.
 */
export function oakPlanGhosts(plan: readonly OakPlanBlock[], drawn: readonly string[], ghosted: (kind: string) => boolean): OakPlanGhost[] {
  const folded = new Map<number, number>();
  let next = 0, current = -1, left = 0, unplanned = false;
  for (const kind of drawn) {
    if (current >= 0 && left > 0 && plan[current]!.kind === kind) { left--; continue; }
    const at = plan.findIndex((block, index) => index >= next && block.kind === kind);
    if (at < 0) { unplanned = true; break; }
    if (left > 0) folded.set(current, left);
    for (let skipped = next; skipped < at; skipped++) folded.set(skipped, plan[skipped]!.count);
    current = at; next = at + 1;
    left = ONE_ITEM_BLOCKS.has(kind) ? plan[at]!.count - 1 : 0;
  }
  const ghosts: OakPlanGhost[] = [];
  plan.forEach((block, at) => {
    const open = at === current && left > 0;
    if (at < next && !folded.has(at) && !open) return;
    const count = folded.get(at) ?? (open ? left : block.count);
    if (ghosted(block.kind)) ghosts.push({ kind: block.kind, count, at, folding: unplanned || folded.has(at) });
  });
  return ghosts;
}

const PLAN_WORDS: Readonly<Record<string, readonly [string, string]>> = {
  Project: ["a project", "projects"], Role: ["a role", "roles"], Steps: ["a step", "steps"], Points: ["a point", "points"],
  Sources: ["a source", "sources"], Stats: ["a number", "numbers"], Timeline: ["a dated entry", "dated entries"],
  Compare: ["a comparison", "compared items"], Callout: ["a caveat", "caveats"], Stack: ["the stack", "stack lists"],
  ProjectWall: ["a project tile", "project tiles"],
};

/** The trace's one plan line, in the app's own words from the plan's kinds and counts (no model text). */
export function oakPlanLine(plan: readonly OakPlanBlock[]) {
  const parts = plan.map(({ kind, count }, index) => index === 0 ? "a lead"
    : PLAN_WORDS[kind] ? count === 1 ? PLAN_WORDS[kind]![0] : `${count} ${PLAN_WORDS[kind]![1]}` : `${count === 1 ? "a" : count} ${kind.toLowerCase()}`);
  return `Planned the answer: ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0]}`;
}
