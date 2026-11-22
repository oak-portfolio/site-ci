import * as React from "react";
import { cn } from "@/lib/utils";

const cells = Array.from({ length: 9 }, (_, index) => index);

/**
 * Oak's loading glyph: a 3x3 pixel grid whose cells light in a chevron wave (beautiful-ui LoadingState "Drive"), which
 * speaks the same pixel language as Oak's chibi art. Static under reduced motion. Pass `aria-hidden` when a status line
 * already announces the wait.
 */
export function Spinner({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span role="status" aria-label="Loading" data-slot="spinner" className={cn("ui-spinner", className)} {...props}>
      {cells.map(cell => <span key={cell} className="ui-spinner__cell" />)}
    </span>
  );
}
