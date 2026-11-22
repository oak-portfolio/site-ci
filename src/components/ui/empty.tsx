import * as React from "react";
import { cn } from "@/lib/utils";

/** An empty or waiting state: media, title, description, then any action. Ported from shadcn Empty. */
export function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="empty" className={cn("ui-empty", className)} {...props} />;
}

export function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="empty-header" className={cn("ui-empty__header", className)} {...props} />;
}

/** `icon` draws a small rounded tile; `default` leaves the caller's art (a sprite on its halo) as it is. */
export function EmptyMedia({ className, variant = "default", ...props }: React.ComponentProps<"div"> & { variant?: "default" | "icon" }) {
  return <div data-slot="empty-media" data-variant={variant} className={cn("ui-empty__media", className)} {...props} />;
}

export function EmptyTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="empty-title" className={cn("ui-empty__title", className)} {...props} />;
}

export function EmptyDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="empty-description" className={cn("ui-empty__description", className)} {...props} />;
}

export function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="empty-content" className={cn("ui-empty__content", className)} {...props} />;
}
