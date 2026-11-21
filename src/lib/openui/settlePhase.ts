import * as React from "react";

/**
 * Ticket 152: a turn's settle phase, one per message. `live` while Oak works; `committing` once the turn is complete and its
 * trail is still open; `folding` while a held trail (a planned turn's, which keeps every row and folds in flow) plays its
 * fold; `settled` at rest. OakTurn advances it from the trail's reports; the transcript reads it before it moves the view.
 */
export type OakSettlePhase = "live" | "committing" | "folding" | "settled";
/** `fold` is the trail coming to rest (its fold starting, or a visitor's own toggle); `fold-end` is the fold done playing. */
export type OakSettleEvent = "pending" | "complete" | "fold" | "fold-end";
export type OakSettle = { readonly phase: OakSettlePhase; readonly held: boolean };

/** A fold that never reports its end (a missed animation event) can never keep an answer or the view waiting longer. */
export const OAK_SETTLE_FALLBACK_MS = 2500;

const order: readonly OakSettlePhase[] = ["live", "committing", "folding", "settled"];
const atRest: OakSettle = { phase: "settled", held: false };
const settles = new Map<string, OakSettle>();
const listeners = new Set<() => void>();

export function readOakSettle(id: string): OakSettle {
  return settles.get(id) ?? atRest;
}

export function subscribeOakSettle(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Phases only move forward, so a late report never reopens a fold; a pending turn (a new ask or a retry) starts over. */
export function advanceOakSettle(id: string, event: OakSettleEvent, held = false) {
  const phase: OakSettlePhase = event === "pending" ? "live" : event === "complete" ? "committing"
    : event === "fold" && held ? "folding" : "settled";
  const was = readOakSettle(id);
  if (event !== "pending" && order.indexOf(phase) < order.indexOf(was.phase)) return;
  const next = phase === "settled" ? atRest : { phase, held };
  if (next.phase === was.phase && next.held === was.held) return;
  if (next === atRest) settles.delete(id); else settles.set(id, next);
  for (const listener of listeners) listener();
}

/** Settles a turn still committing or folding after the fallback; returns the cancel. */
export function settleOakAfterFallback(id: string) {
  const timer = setTimeout(() => {
    const { phase } = readOakSettle(id);
    if (phase === "committing" || phase === "folding") advanceOakSettle(id, "fold-end");
  }, OAK_SETTLE_FALLBACK_MS);
  return () => clearTimeout(timer);
}

export function useOakSettle(id: string) {
  const read = React.useCallback(() => readOakSettle(id), [id]);
  return React.useSyncExternalStore(subscribeOakSettle, read, read);
}
