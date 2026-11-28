import type { OakMascotContextId, OakMascotTrigger } from "@/data/oakMascot";

export const OAK_MASCOT_EVENT = "oak-mascot:event";

export type OakMascotEventDetail = {
  contextId: OakMascotContextId | string;
  source?: string;
  immediate?: boolean;
  trigger?: OakMascotTrigger;
};

export function emitOakMascotEvent(detail: OakMascotEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<OakMascotEventDetail>(OAK_MASCOT_EVENT, { detail }));
}
