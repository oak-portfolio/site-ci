import * as React from "react";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Inline status, system note or labeled separator in a conversation. Set `role="status"` for progress. Ported from shadcn Marker. */
export const markerVariants = cva("ui-marker", {
  variants: {
    variant: {
      default: "ui-marker--default",
      border: "ui-marker--border",
      separator: "ui-marker--separator",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Marker({ className, variant, render, ...props }: useRender.ComponentProps<"div"> & VariantProps<typeof markerVariants>) {
  return useRender({ defaultTagName: "div", render, props: { "data-slot": "marker", className: cn(markerVariants({ variant }), className as string), ...props } });
}

export function MarkerIcon({ className, ...props }: React.ComponentProps<"span">) {
  return <span aria-hidden="true" data-slot="marker-icon" className={cn("ui-marker__icon", className)} {...props} />;
}

export function MarkerContent({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="marker-content" className={cn("ui-marker__content", className)} {...props} />;
}
