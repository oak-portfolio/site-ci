import * as React from "react";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";

export const Popover = BasePopover.Root;
export const PopoverTrigger = BasePopover.Trigger;
export const PopoverClose = BasePopover.Close;

/** Anchored panel. `container` keeps it inside the modal workspace. */
export function PopoverContent({ className, container, side = "bottom", align = "end", sideOffset = 8, ...props }: React.ComponentProps<typeof BasePopover.Popup> & {
  container?: React.ComponentProps<typeof BasePopover.Portal>["container"];
  side?: React.ComponentProps<typeof BasePopover.Positioner>["side"];
  align?: React.ComponentProps<typeof BasePopover.Positioner>["align"];
  sideOffset?: number;
}) {
  return (
    <BasePopover.Portal container={container}>
      <BasePopover.Positioner className="ui-popover__positioner" side={side} align={align} sideOffset={sideOffset} collisionPadding={8}>
        <BasePopover.Popup data-slot="popover-content" className={cn("ui-popover__popup", className as string)} {...props} />
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}

export function PopoverTitle({ className, ...props }: React.ComponentProps<typeof BasePopover.Title>) {
  return <BasePopover.Title data-slot="popover-title" className={cn("ui-popover__title", className as string)} {...props} />;
}

export function PopoverDescription({ className, ...props }: React.ComponentProps<typeof BasePopover.Description>) {
  return <BasePopover.Description data-slot="popover-description" className={cn("ui-popover__description", className as string)} {...props} />;
}
