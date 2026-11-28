import { useSyncExternalStore } from "react";

/**
 * One-time tips, on Apple's TipKit rules: inline, short, dismissible, and once dismissed (or once the feature is used)
 * never shown again. Stored per browser under a versioned key, so a later feature can be announced without resetting
 * the ones a visitor already closed (D126).
 */
const tipIds = ["welcome", "tools", "documents", "role", "advice", "brief", "history", "funding"] as const;
export type OakTipId = typeof tipIds[number];
type OakTipRecord = Partial<Record<OakTipId, "dismissed" | "used">>;

const storageKey = "oak.tips.v1";
const listeners = new Set<() => void>();
let record: OakTipRecord | null = null;
/** The design gallery pins tips closed so every other state renders as designed; `?tips=live` lifts the pin. */
let pinned: OakTipRecord | null = null;

function read(): OakTipRecord {
  if (pinned) return pinned;
  if (record) return record;
  try { record = JSON.parse(localStorage.getItem(storageKey) ?? "{}") ?? {}; } catch { record = {}; }
  return record!;
}

function write(id: OakTipId, value: "dismissed" | "used") {
  if (read()[id]) return;
  const next = { ...read(), [id]: value };
  if (pinned) pinned = next;
  else {
    record = next;
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Private browsing: the tip closes for this visit only. */ }
  }
  listeners.forEach(listener => listener());
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export const dismissOakTip = (id: OakTipId) => write(id, "dismissed");
export const markOakTipUsed = (id: OakTipId) => write(id, "used");

/** Whether a tip still has something to teach. False on the server, so nothing flashes before the browser's record is read. */
export function useOakTip(id: OakTipId) {
  return useSyncExternalStore(subscribe, () => !read()[id], () => false);
}

/** Gallery only: every tip closed (`fresh: false`), or all open in memory for the onboarding state. */
export function pinOakTips(fresh: boolean) {
  pinned = fresh ? {} : Object.fromEntries(tipIds.map(id => [id, "dismissed"]));
  listeners.forEach(listener => listener());
}
