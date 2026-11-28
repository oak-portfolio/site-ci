import * as React from "react";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { cn } from "@/lib/utils";

export const Menu = BaseMenu.Root;
export const MenuTrigger = BaseMenu.Trigger;

/**
 * One highlight glides between rows as the pointer or arrow keys move (beautiful-ui GlideMenu): it follows Base UI's
 * `data-highlighted` item, and appears in place, without sliding in from the top, the first time a row lights.
 */
function useMenuGlide() {
  const stop = React.useRef<(() => void) | null>(null);
  return React.useCallback((popup: HTMLDivElement | null) => {
    stop.current?.();
    stop.current = null;
    const glide = popup?.querySelector<HTMLElement>(":scope > .ui-menu__glide");
    if (!popup || !glide) return;
    let hide = 0;
    const place = () => {
      const item = popup.querySelector<HTMLElement>(".ui-menu__item[data-highlighted]");
      // Moving between rows clears one highlight an event before the next lands: wait a frame before hiding, so the glide
      // slides to the new row instead of vanishing and reappearing there.
      if (!item) {
        cancelAnimationFrame(hide);
        hide = requestAnimationFrame(() => { if (!popup.querySelector(".ui-menu__item[data-highlighted]")) glide.style.opacity = "0"; });
        return;
      }
      cancelAnimationFrame(hide);
      const fresh = glide.style.opacity !== "1";
      if (fresh) glide.dataset.snap = "";
      glide.style.transform = `translateY(${item.offsetTop}px)`;
      glide.style.height = `${item.offsetHeight}px`;
      glide.style.opacity = "1";
      // Commit the new place while the slide is off, then turn it back on, so a first highlight appears where it is.
      if (fresh) { void glide.offsetHeight; delete glide.dataset.snap; }
    };
    const observer = new MutationObserver(place);
    observer.observe(popup, { subtree: true, attributes: true, attributeFilter: ["data-highlighted"] });
    place();
    stop.current = () => { observer.disconnect(); cancelAnimationFrame(hide); };
  }, []);
}

/**
 * Inside a modal dialog, Escape hides the highlighted item before the menu returns focus, so focus drops to the page for a
 * moment and the dialog's focus guard takes it (Base UI's DialogPopup restores to the popup a frame later). Handing focus to
 * the return target first keeps it on the trigger (R8: saved-row menu at full screen lost focus about 1 run in 4).
 */
function returnTarget(popup: HTMLElement, finalFocus: unknown): HTMLElement | null {
  if (finalFocus === false) return null;
  const chosen = typeof finalFocus === "function" ? (finalFocus as (type: string) => unknown)("keyboard")
    : finalFocus && typeof finalFocus === "object" && "current" in finalFocus ? (finalFocus as React.RefObject<unknown>).current : null;
  if (chosen instanceof HTMLElement) return chosen;
  if (chosen === false) return null;
  return popup.id ? popup.ownerDocument.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(popup.id)}"]`) : null;
}

/** Popup list of commands. `container` keeps it inside the modal workspace. */
export function MenuContent({ className, container, side = "bottom", align = "start", sideOffset = 8, children, onKeyDown, finalFocus, ...props }: React.ComponentProps<typeof BaseMenu.Popup> & {
  container?: React.ComponentProps<typeof BaseMenu.Portal>["container"];
  side?: React.ComponentProps<typeof BaseMenu.Positioner>["side"];
  align?: React.ComponentProps<typeof BaseMenu.Positioner>["align"];
  sideOffset?: number;
}) {
  const glide = useMenuGlide();
  return (
    <BaseMenu.Portal container={container}>
      <BaseMenu.Positioner className="ui-menu__positioner" side={side} align={align} sideOffset={sideOffset} collisionPadding={8}>
        <BaseMenu.Popup ref={glide} data-slot="menu-content" className={cn("ui-menu__popup", className as string)} finalFocus={finalFocus}
          onKeyDown={event => {
            if (event.key === "Escape") returnTarget(event.currentTarget, finalFocus)?.focus({ preventScroll: true });
            onKeyDown?.(event);
          }} {...props}>
          <span className="ui-menu__glide" aria-hidden="true" />
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

export function MenuItem({ className, ...props }: React.ComponentProps<typeof BaseMenu.Item>) {
  return <BaseMenu.Item data-slot="menu-item" className={cn("ui-menu__item", className as string)} {...props} />;
}

export function MenuGroup({ className, ...props }: React.ComponentProps<typeof BaseMenu.Group>) {
  return <BaseMenu.Group data-slot="menu-group" className={cn("ui-menu__group", className as string)} {...props} />;
}

export function MenuGroupLabel({ className, ...props }: React.ComponentProps<typeof BaseMenu.GroupLabel>) {
  return <BaseMenu.GroupLabel data-slot="menu-group-label" className={cn("ui-menu__group-label", className as string)} {...props} />;
}

export function MenuSeparator({ className, ...props }: React.ComponentProps<typeof BaseMenu.Separator>) {
  return <BaseMenu.Separator data-slot="menu-separator" className={cn("ui-menu__separator", className as string)} {...props} />;
}
