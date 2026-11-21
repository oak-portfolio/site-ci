type Listener = (text: string) => void;
const listeners = new Set<Listener>();
const said = new Set<string>();

/** The transcript's one polite region (OakOutputAnnouncements) listens here; blocks never add a live region of their own. */
export function subscribeOakBlockAnnouncements(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Forget what was said, so a new conversation announces again. */
export function clearOakBlockAnnouncements() { said.clear(); }

/**
 * Posts `text` once per block: the same block saying the same thing again is dropped, unless `repeat` is set because the
 * visitor asked again (a second Undo, a page revisited). Returns whether a region heard it; with none listening nothing is
 * said or remembered. Blocks announce on change, never on mount, so a reopened saved chat stays quiet like the output
 * units the region already seeds.
 */
export function announceOakBlock(block: string, text: string, { repeat = false }: { repeat?: boolean } = {}) {
  const key = `${block}\u0000${text}`;
  if (!text || (!repeat && said.has(key)) || !listeners.size) return false;
  said.add(key);
  for (const listener of listeners) listener(text);
  return true;
}
