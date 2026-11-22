import * as React from "react";

/** Ticket 47: Cmd K or the header Search button opens a no-AI list of pages, sections and projects; off, no button and no key. */
export const oakCommandPalette = false;
export const oakGalleryKey = "commandPalette";

let forced: boolean | null = null;

export function forceOakCommandPalette(on: boolean | null) {
  forced = on;
}

export const oakCommandPaletteOn = () => forced ?? oakCommandPalette;

const openers: Array<() => void> = [];

export const oakOnMac = () => /Mac|iPhone|iPad/.test(navigator.platform);

/** Cmd K on a Mac, where Ctrl K deletes to the line end in text fields; Ctrl K elsewhere. */
export const oakPaletteShortcut = (mac: boolean) => mac ? { keys: "Meta+K", hint: "\u2318K" } : { keys: "Control+K", hint: "Ctrl K" };

function onKey(event: KeyboardEvent) {
  if (event.key.toLowerCase() !== "k" || event.altKey || event.shiftKey || !(oakOnMac() ? event.metaKey : event.ctrlKey)) return;
  const open = openers.at(-1);
  if (!open) return;
  event.preventDefault();
  open();
}

/** The newest bound palette owns Cmd K, so the workspace one wins while the workspace is open. */
export function bindOakCommandPaletteKey(open: () => void) {
  if (!openers.length) window.addEventListener("keydown", onKey);
  openers.push(open);
  return () => {
    openers.splice(openers.lastIndexOf(open), 1);
    if (!openers.length) window.removeEventListener("keydown", onKey);
  };
}

/** A palette section link lands on `/path#tag`; the section carries `data-oak-section`, not an id, so scroll to it here. */
export function scrollToOakSection(hash = location.hash) {
  const tag = decodeURIComponent(hash.slice(1));
  if (!/^[a-z]+\.[a-z]+$/.test(tag)) return false;
  const section = document.querySelector(`[data-oak-section="${tag}"]`);
  section?.scrollIntoView({ block: "start" });
  return Boolean(section);
}

export type OakCommandPaletteSearchProps = { container?: React.RefObject<HTMLElement | null>; active?: boolean };
const PaletteSearch = React.lazy(() => import("@/components/OakCommandPaletteSearch"));

export function OakCommandPaletteSearch(props: OakCommandPaletteSearchProps) {
  if (!oakCommandPaletteOn()) return null;
  return React.createElement(React.Suspense, { fallback: null }, React.createElement(PaletteSearch, props));
}
