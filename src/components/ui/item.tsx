import * as React from "react";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** One row of content: media, title and description, and actions. Group rows in ItemGroup. Ported from shadcn Item (Base UI). */
export const itemVariants = cva("ui-item", {
  variants: {
    variant: { default: "ui-item--default", outline: "ui-item--outline", muted: "ui-item--muted" },
    size: { default: "ui-item--size-default", sm: "ui-item--size-sm" },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export function Item({ className, variant, size, render, ...props }: useRender.ComponentProps<"div"> & VariantProps<typeof itemVariants>) {
  return useRender({ defaultTagName: "div", render, props: { "data-slot": "item", className: cn(itemVariants({ variant, size }), className as string), ...props } });
}

export function ItemGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div role="list" data-slot="item-group" className={cn("ui-item-group", className)} {...props} />;
}

export function ItemMedia({ className, variant = "default", ...props }: React.ComponentProps<"div"> & { variant?: "default" | "icon" | "image" }) {
  return <div data-slot="item-media" data-variant={variant} className={cn("ui-item__media", className)} {...props} />;
}

export function ItemContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="item-content" className={cn("ui-item__content", className)} {...props} />;
}

export function ItemTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="item-title" className={cn("ui-item__title", className)} {...props} />;
}

export function ItemDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="item-description" className={cn("ui-item__description", className)} {...props} />;
}

export function ItemActions({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="item-actions" className={cn("ui-item__actions", className)} {...props} />;
}
