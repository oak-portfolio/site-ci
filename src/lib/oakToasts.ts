import type { IconName } from "../components/ui/Icon";
import type { OakActivitySpritePose } from "../components/agent/OakActivitySprite";

export type OakToastKind = "copied" | "copied-sources" | "draft-copied" | "brief-copied" | "draft-opened" | "saved" | "deleted" | "exported"
  | "reopened" | "signed-in" | "selection-copied" | "selection-no-room" | "selection-quotes-full";
/** Each confirmation names what happened; the icon carries the meaning and the art, when loaded, gives it a face. */
export const oakToasts: Record<OakToastKind, { title: string; icon: IconName; pose: OakActivitySpritePose }> = {
  copied: { title: "Answer copied", icon: "copyCheck", pose: "thumbs-up" },
  "copied-sources": { title: "Answer and sources copied", icon: "copyCheck", pose: "thumbs-up" },
  "draft-copied": { title: "Request copied", icon: "copyCheck", pose: "thumbs-up" },
  "brief-copied": { title: "Brief copied", icon: "copyCheck", pose: "thumbs-up" },
  "draft-opened": { title: "Email draft opened in your mail app", icon: "mail", pose: "sent" },
  // Shown once the Worker accepts the report, so a browser with no mail app still gets a confirmation; the email adds details.
  saved: { title: "Conversation saved", icon: "checkmark", pose: "chest-locked" },
  deleted: { title: "Saved conversation deleted", icon: "delete", pose: "swept" },
  exported: { title: "Conversation downloaded", icon: "download", pose: "carrying" },
  reopened: { title: "Saved conversation reopened", icon: "history", pose: "bookmark" },
  "signed-in": { title: "Signed in. Your conversation continues", icon: "checkmark", pose: "welcome" },
  "selection-copied": { title: "Selection copied", icon: "copyCheck", pose: "thumbs-up" },
  "selection-no-room": { title: "Your message is too long to add a quote", icon: "alert", pose: "waiting" },
  "selection-quotes-full": { title: "Up to 3 quotes. Remove one to add another.", icon: "alert", pose: "waiting" },
};

export type OakToast = { id: OakToastKind; title: string; type: OakToastKind; timeout: number; data: { icon: IconName; pose: OakActivitySpritePose } };
// Library code stays free of UI packages; the mounted workspace listens and owns the toast manager.
const listeners = new Set<(toast: OakToast) => void>();
export function onOakToast(listener: (toast: OakToast) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Confirms a finished visitor action. A repeat of the same kind refreshes the visible toast instead of stacking. */
export function showOakToast(kind: OakToastKind) {
  const { title, icon, pose } = oakToasts[kind];
  for (const listener of listeners) listener({ id: kind, title, type: kind, timeout: 3200, data: { icon, pose } });
}
