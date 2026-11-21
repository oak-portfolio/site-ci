/** Ticket 29: the invitation and the Related line each show in one answer of a conversation; the answer that spent one keeps it on re-render. A new conversation resets it. */
export type OakBridgeKind = "invitation" | "related";

const spent = new Map<OakBridgeKind, string>();

export function oakBridgeAllowed(kind: OakBridgeKind, messageId: string) {
  if (!spent.has(kind)) spent.set(kind, messageId);
  return spent.get(kind) === messageId;
}

/** Whether `oakBridgeAllowed` would say yes, without claiming the slot. */
export const oakBridgeOpen = (kind: OakBridgeKind, messageId: string) => !spent.has(kind) || spent.get(kind) === messageId;

export function resetOakBridgeOnce() {
  spent.clear();
}
