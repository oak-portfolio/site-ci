import * as React from "react";
import { PreviewCard as BasePreviewCard } from "@base-ui/react/preview-card";
import { cn } from "@/lib/utils";

export const PreviewCard = BasePreviewCard.Root;
export const PreviewCardTrigger = BasePreviewCard.Trigger;

/** Read-only preview for a link, opened by hover or keyboard focus. Ported from shadcn Hover Card on Base UI Preview Card. */
export function PreviewCardContent({ className, side = "top", align = "start", sideOffset = 8, ...props }: React.ComponentProps<typeof BasePreviewCard.Popup> & {
  side?: React.ComponentProps<typeof BasePreviewCard.Positioner>["side"];
  align?: React.ComponentProps<typeof BasePreviewCard.Positioner>["align"];
  sideOffset?: number;
}) {
  return (
    <BasePreviewCard.Portal>
      <BasePreviewCard.Positioner className="ui-popover__positioner" side={side} align={align} sideOffset={sideOffset} collisionPadding={8}>
        <BasePreviewCard.Popup data-slot="preview-card-content" className={cn("ui-popover__popup ui-preview-card", className as string)} {...props} />
      </BasePreviewCard.Positioner>
    </BasePreviewCard.Portal>
  );
}
