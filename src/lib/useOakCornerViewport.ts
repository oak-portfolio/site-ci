import { useSyncExternalStore, type CSSProperties } from "react";

type LauncherViewport = Readonly<{
  layoutWidth: number; layoutHeight: number;
  width: number; height: number; left: number; top: number;
  safeLeft: number; safeRight: number;
}>;

/** Keep the centered launcher inside the visible viewport without moving the page. */
export function oakLauncherGeometry(viewport: LauncherViewport) {
  const left = Math.max(0, viewport.left);
  const width = Math.max(0, Math.min(viewport.width, viewport.layoutWidth - left));
  const top = Math.max(0, viewport.top);
  const clearance = Math.max(16, viewport.safeLeft, viewport.safeRight);
  return {
    center: left + width / 2,
    bottom: Math.max(0, viewport.layoutHeight - top - viewport.height),
    maxWidth: Math.max(0, Math.min(220, width - 2 * clearance)),
    compact: width <= 640,
  };
}

type LauncherSnapshot = ReturnType<typeof oakLauncherGeometry> & { style: CSSProperties };
let snapshot: LauncherSnapshot | undefined;
const listeners = new Set<() => void>();

function getSnapshot(): LauncherSnapshot | undefined {
  if (typeof window === "undefined") return undefined;
  const visible = window.visualViewport;
  const safeArea = document.querySelector(".oak-workspace__safe-area");
  const safe = safeArea ? getComputedStyle(safeArea) : null;
  const next = oakLauncherGeometry({
    layoutWidth: document.documentElement.getBoundingClientRect().width,
    layoutHeight: window.innerHeight,
    width: visible?.width ?? document.documentElement.getBoundingClientRect().width,
    height: visible?.height ?? window.innerHeight,
    left: visible?.offsetLeft ?? 0, top: visible?.offsetTop ?? 0,
    safeLeft: Number.parseFloat(safe?.paddingLeft ?? "0") || 0,
    safeRight: Number.parseFloat(safe?.paddingRight ?? "0") || 0,
  });
  if (!snapshot || next.center !== snapshot.center || next.bottom !== snapshot.bottom || next.maxWidth !== snapshot.maxWidth || next.compact !== snapshot.compact) {
    snapshot = { ...next, style: {
      "--oak-launcher-center": `${next.center}px`,
      "--oak-launcher-bottom-offset": `${next.bottom}px`,
      "--oak-launcher-max-width": `${next.maxWidth}px`,
    } as CSSProperties };
  }
  return snapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("resize", notify);
    window.addEventListener("orientationchange", notify);
    window.visualViewport?.addEventListener("resize", notify);
    window.visualViewport?.addEventListener("scroll", notify);
    document.addEventListener("astro:page-load", notify);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      window.removeEventListener("resize", notify);
      window.removeEventListener("orientationchange", notify);
      window.visualViewport?.removeEventListener("resize", notify);
      window.visualViewport?.removeEventListener("scroll", notify);
      document.removeEventListener("astro:page-load", notify);
    }
  };
}

function notify() { for (const listener of listeners) listener(); }
const getServerSnapshot = () => undefined;

/** CSS owns placement; this subscription supplies visible-viewport coordinates only. */
export function useOakLauncherViewport() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
