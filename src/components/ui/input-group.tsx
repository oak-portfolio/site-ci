import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A visible well around one bare input or textarea, with optional addons such as a character counter. Ported from shadcn
 * InputGroup. Pass the control with `variant="bare"`; the group owns the frame and the focus edge.
 */
export function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div role="group" data-slot="input-group" className={cn("ui-input-group", className)} {...props} />;
}

/** `block-end` sits under the control, right-aligned (a counter); `inline-end` sits beside it. */
export function InputGroupAddon({ className, align = "block-end", ...props }: React.ComponentProps<"div"> & { align?: "inline-end" | "block-end" }) {
  return <div data-slot="input-group-addon" data-align={align} className={cn("ui-input-group__addon", className)} {...props} />;
}
