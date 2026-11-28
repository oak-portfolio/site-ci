import * as React from "react";
import { cn } from "@/lib/utils";

/** One keyboard key, for shortcut hints inside tooltips. Ported from shadcn Kbd. */
export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return <kbd data-slot="kbd" className={cn("ui-kbd", className)} {...props} />;
}
