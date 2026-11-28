import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

/** Native details/summary for long disclosure copy: closed by default, the words stay verbatim one click away. */
export function Disclosure({ className, summary, count, children, ...props }: Omit<React.ComponentProps<"details">, "children"> & {
  summary: React.ReactNode; count?: number; children: React.ReactNode;
}) {
  return (
    <details data-slot="disclosure" className={cn("ui-disclosure", className)} {...props}>
      <summary className="ui-disclosure__summary">
        <Icon name="arrowDown" />
        <span className="ui-disclosure__label">{summary}</span>
        {count ? <Badge variant="secondary">{count}</Badge> : null}
      </summary>
      <div className="ui-disclosure__body">{children}</div>
    </details>
  );
}
