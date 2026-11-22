import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva("ui-badge", {
  variants: {
    variant: {
      default: "ui-badge--default",
      secondary: "ui-badge--secondary",
      destructive: "ui-badge--destructive",
      outline: "ui-badge--outline",
      ghost: "ui-badge--ghost",
      link: "ui-badge--link",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export type BadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants>;

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <span
      ref={ref}
      data-slot="badge"
      data-variant={variant ?? "default"}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  ),
);

Badge.displayName = "Badge";
