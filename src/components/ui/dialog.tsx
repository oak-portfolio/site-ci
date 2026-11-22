import * as React from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { oakMotion } from "@/lib/oakMotion";
import { cn } from "@/lib/utils";

export const Dialog = BaseDialog.Root;
export const DialogTrigger = BaseDialog.Trigger;
export const DialogClose = BaseDialog.Close;

/**
 * Modal surface with its backdrop. `container` keeps it inside the persisted workspace island.
 * Pass the controlled `open` state to fade (and, for `panel`, slide) in and out; reduced motion changes instantly.
 * `panel` leaves position and size to the caller's classes, for the docked workspace; `window` does the same for a
 * full-screen one, which rises and settles in instead of sliding from the edge.
 */
export const DialogContent = React.forwardRef<HTMLDivElement, React.ComponentProps<typeof BaseDialog.Popup> & {
  container?: React.ComponentProps<typeof BaseDialog.Portal>["container"];
  open?: boolean;
  variant?: "default" | "panel" | "window";
  portalClassName?: string;
  backdropClassName?: string;
}>(({ className, container, open, variant = "default", portalClassName, backdropClassName, ...props }, ref) => {
  const reduced = useReducedMotion();
  const animated = open !== undefined;
  const panel = variant !== "default";
  const backdrop = oakMotion("backdrop", reduced);
  const surface = oakMotion(variant === "window" ? "window" : panel ? "panel" : "dialog", reduced);
  // Without `open`, the portal always renders and Base UI owns mounting as before.
  return <AnimatePresence>
    {open !== false ? <BaseDialog.Portal keepMounted={animated} container={container} className={portalClassName}>
      {/* forceRender: nested dialogs (the saved-conversation delete confirm) still dim what is behind them. */}
      <BaseDialog.Backdrop forceRender className={cn(!panel && "ui-dialog__backdrop", backdropClassName)}
        render={animated ? <motion.div initial={backdrop.initial} animate={backdrop.animate} exit={backdrop.exit} transition={backdrop.transition} /> : undefined} />
      <BaseDialog.Popup ref={ref} data-slot="dialog-content" className={cn(!panel && "ui-dialog__popup", className as string)}
        render={animated ? <motion.div initial={surface.initial} animate={surface.animate} exit={surface.exit} transition={surface.transition} /> : undefined} {...props} />
    </BaseDialog.Portal> : null}
  </AnimatePresence>;
});

DialogContent.displayName = "DialogContent";

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof BaseDialog.Title>) {
  return <BaseDialog.Title data-slot="dialog-title" className={cn("ui-dialog__title", className as string)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.ComponentProps<typeof BaseDialog.Description>) {
  return <BaseDialog.Description data-slot="dialog-description" className={cn("ui-dialog__description", className as string)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-footer" className={cn("ui-dialog__footer", className)} {...props} />;
}
