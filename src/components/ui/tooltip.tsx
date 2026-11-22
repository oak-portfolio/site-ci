import * as React from "react";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { cn } from "@/lib/utils";

export const TooltipProvider = BaseTooltip.Provider;
export function Tooltip({ open, defaultOpen, onOpenChange, children }: Pick<React.ComponentProps<typeof BaseTooltip.Root>, "open" | "defaultOpen" | "onOpenChange" | "children">) {
  return <BaseTooltip.Root open={open} defaultOpen={defaultOpen} onOpenChange={(next, details) => {
    if (details.reason === "escape-key") details.allowPropagation();
    onOpenChange?.(next, details);
  }}>{children}</BaseTooltip.Root>;
}
export const TooltipTrigger = BaseTooltip.Trigger;
export const TooltipPortal = BaseTooltip.Portal;

type TooltipPositionerProps = React.ComponentProps<typeof BaseTooltip.Positioner>;

export type TooltipContentProps = React.ComponentProps<typeof BaseTooltip.Popup> & {
  side?: TooltipPositionerProps["side"];
  align?: TooltipPositionerProps["align"];
  sideOffset?: TooltipPositionerProps["sideOffset"];
  alignOffset?: TooltipPositionerProps["alignOffset"];
  positionerClassName?: string;
};

export const TooltipContent = React.forwardRef<HTMLDivElement, TooltipContentProps>(
  (
    {
      className,
      positionerClassName,
      side = "top",
      align = "center",
      sideOffset = 8,
      alignOffset,
      ...props
    },
    ref,
  ) => (
    <TooltipPortal>
      <BaseTooltip.Positioner
        align={align}
        alignOffset={alignOffset}
        className={cn("ui-tooltip-positioner", positionerClassName)}
        side={side}
        sideOffset={sideOffset}
      >
        <BaseTooltip.Popup ref={ref} className={cn("ui-tooltip-content", className)} {...props} />
      </BaseTooltip.Positioner>
    </TooltipPortal>
  ),
);

TooltipContent.displayName = "TooltipContent";
