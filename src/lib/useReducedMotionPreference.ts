import { useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

let mediaQueryList: MediaQueryList | null = null;

function getMediaQueryList(): MediaQueryList | null {
  if (typeof window === "undefined") return null;
  mediaQueryList ??= window.matchMedia(REDUCED_MOTION_QUERY);
  return mediaQueryList;
}

function subscribe(onStoreChange: () => void): () => void {
  const query = getMediaQueryList();
  if (!query) return () => {};

  query.addEventListener("change", onStoreChange);
  return () => query.removeEventListener("change", onStoreChange);
}

function getSnapshot(): boolean {
  return getMediaQueryList()?.matches ?? false;
}

function getServerSnapshot(): boolean {
  return false;
}

/** @internal Exported so the store lifecycle can be tested without a browser. */
export const reducedMotionPreferenceStore = {
  subscribe,
  getSnapshot,
  getServerSnapshot,
};

export function useReducedMotionPreference(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Q13: the one way a panel brings something it just opened into view. It glides only when the visitor allows motion and
 * jumps otherwise, and moves the least it can ("nearest") unless asked for an edge.
 */
export function scrollIntoViewGently(element: Element | null | undefined, block: ScrollLogicalPosition = "nearest"): void {
  element?.scrollIntoView?.({ block, behavior: getSnapshot() ? "auto" : "smooth" });
}
