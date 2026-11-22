import * as React from "react";
import { Button as BaseButton } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva("ui-button", {
  variants: {
    variant: {
      primary: "ui-button--primary",
      secondary: "ui-button--secondary",
      ghost: "ui-button--ghost",
    },
    size: {
      sm: "ui-button--sm",
      md: "ui-button--md",
      icon: "ui-button--icon",
    },
  },
  defaultVariants: {
    variant: "primary",
    size: "md",
  },
});

export type ButtonProps = React.ComponentProps<typeof BaseButton> &
  VariantProps<typeof buttonVariants>;

export const Button = React.forwardRef<HTMLElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <BaseButton ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);

Button.displayName = "Button";
