import * as React from "react";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** `default` for the visitor, `ghost` for unframed assistant text, `destructive` for failed turns. Ported from shadcn Bubble. */
export const bubbleVariants = cva("ui-bubble", {
  variants: {
    variant: {
      default: "ui-bubble--default",
      secondary: "ui-bubble--secondary",
      ghost: "ui-bubble--ghost",
      destructive: "ui-bubble--destructive",
    },
  },
  defaultVariants: { variant: "default" },
});

export type BubbleProps = React.ComponentProps<"div"> & VariantProps<typeof bubbleVariants> & { align?: "start" | "end" };

export function Bubble({ className, variant, align = "start", ...props }: BubbleProps) {
  return <div data-slot="bubble" data-align={align} className={cn(bubbleVariants({ variant }), className)} {...props} />;
}

export function BubbleContent({ className, render, ...props }: useRender.ComponentProps<"div">) {
  return useRender({ defaultTagName: "div", render, props: { "data-slot": "bubble-content", className: cn("ui-bubble__content", className as string), ...props } });
}
