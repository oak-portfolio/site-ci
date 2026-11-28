import * as React from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { bindOakCommandPaletteKey, oakOnMac as onMac, oakPaletteShortcut, scrollToOakSection, type OakCommandPaletteSearchProps as SearchProps } from "@/lib/oakFlags/commandPalette";

type PaletteModule = typeof import("@/components/OakCommandPalette");

export default function PaletteSearch({ container, active = true }: SearchProps) {
  const [open, setOpen] = React.useState(false);
  const shown = React.useRef(false);
  const [palette, setPalette] = React.useState<PaletteModule | null>(null);
  const opener = React.useRef<HTMLElement | null>(null);
  const button = React.useRef<HTMLButtonElement | null>(null);
  const [mac, setMac] = React.useState(false);
  const change = React.useCallback((next: boolean) => { shown.current = next; setOpen(next); }, []);
  const show = React.useCallback((from?: HTMLElement | null) => {
    if (shown.current) return;
    shown.current = true;
    const active = document.activeElement;
    opener.current = from ?? (active instanceof HTMLElement && active !== document.body ? active : button.current);
    void import("@/components/OakCommandPalette").then((module) => { setPalette(() => module); setOpen(true); }, () => { shown.current = false; });
  }, []);
  React.useEffect(() => (active ? bindOakCommandPaletteKey(() => show()) : undefined), [active, show]);
  React.useEffect(() => {
    setMac(onMac());
    if (container) return;
    const land = () => { scrollToOakSection(); };
    land();
    document.addEventListener("astro:page-load", land);
    return () => document.removeEventListener("astro:page-load", land);
  }, [container]);
  return React.createElement(React.Fragment, null,
    React.createElement(Button, {
      ref: button, type: "button", variant: "ghost", className: "oak-palette-trigger", "aria-label": "Search pages, sections and projects",
      "aria-haspopup": "dialog", "aria-expanded": open, "aria-keyshortcuts": oakPaletteShortcut(mac).keys,
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => show(event.currentTarget),
    },
    React.createElement(Icon, { name: "search", size: 16 }),
    React.createElement("span", { className: "oak-palette-trigger__label" }, "Search"),
    React.createElement("kbd", { className: "oak-palette-trigger__key", "aria-hidden": "true" }, oakPaletteShortcut(mac).hint)),
    palette ? React.createElement(palette.OakCommandPalette, { open, onOpenChange: change, opener, container }) : null);
}
