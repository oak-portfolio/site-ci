/** Ticket 67: `/` opens as a full-screen chat whose first turn is the home's own sections; Close lays out the Classic home. */
export const oakChatFirstHome = false;
export const oakGalleryKey = "chatFirstHome";

let forced: boolean | null = null;

export function forceOakChatFirstHome(on: boolean | null) {
  forced = on;
}

export const oakChatFirstHomeOn = () => forced ?? oakChatFirstHome;

export type OakHomeMode = "chat" | "classic";
type ModeStore = Pick<Storage, "getItem" | "setItem">;

/** index.astro's inline pre-paint script reads this key too. */
export const oakHomeModeKey = "oak.home.mode";

const localStore = (): ModeStore | null => {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
};

export function readOakHomeMode(storage: ModeStore | null = localStore()): OakHomeMode {
  try { return storage?.getItem(oakHomeModeKey) === "classic" ? "classic" : "chat"; } catch { return "chat"; }
}

const listeners = new Set<() => void>();

export function setOakHomeMode(mode: OakHomeMode, { storage = localStore(), root = typeof document === "undefined" ? null : document.documentElement }: {
  storage?: ModeStore | null; root?: { dataset: DOMStringMap | Record<string, string> } | null;
} = {}) {
  try { storage?.setItem(oakHomeModeKey, mode); } catch { /* private mode: the choice lasts this page only */ }
  if (root) root.dataset.oakHome = mode;
  for (const listener of listeners) listener();
}

export function subscribeOakHomeMode(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const oakHomeModeSnapshot = (): OakHomeMode =>
  typeof document !== "undefined" && document.documentElement.dataset.oakHome === "classic" ? "classic" : "chat";
