import * as React from "react";
import { cn } from "@/lib/utils";

/** A placeholder bar while content loads. Decorative: the caller announces the wait. Static under reduced motion. */
export function Skeleton({ className, ...props }: React.ComponentProps<"span">) {
  return <span aria-hidden="true" data-slot="skeleton" className={cn("ui-skeleton", className)} {...props} />;
}
