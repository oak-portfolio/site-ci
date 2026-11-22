import { getOakWorkspace } from "@/lib/oakWorkspace";

/**
 * Ticket 49: the Contact card shows in one answer of a conversation, the answer that drew it keeps it on re-render, and a decline ends it for that conversation.
 * Ticket 143: the answer that drew it keeps the slot after a decline, so it re-renders as the receipt; a holder whose turn failed gives the slot to the retry.
 */
const shown = new Map<string, string>();
const declined = new Set<string>();

const failed = (messageId: string) => getOakWorkspace().messages.some(message => message.id === messageId && message.state === "failed");

export function oakContactCardAllowed(conversationId: string | null, messageId: string) {
  const key = conversationId ?? "";
  const holder = shown.get(key);
  if (holder === messageId) return true;
  if (declined.has(key) || (holder !== undefined && !failed(holder))) return false;
  shown.set(key, messageId);
  return true;
}

export function oakContactCardDeclined(conversationId: string | null) {
  return declined.has(conversationId ?? "");
}

// shortcut: lives for the page visit only, so a reload or a reopened saved chat may offer the card once more; persist per conversation if Oak asks.
export function declineOakContactCard(conversationId: string | null) {
  declined.add(conversationId ?? "");
}

export function resetOakContactCardOnce() {
  shown.clear();
  declined.clear();
}
