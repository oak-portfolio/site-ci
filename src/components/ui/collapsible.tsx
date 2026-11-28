import * as React from "react";
import { Collapsible as BaseCollapsible } from "@base-ui/react/collapsible";
import { cn } from "@/lib/utils";

/** Base UI Collapsible, unstyled: callers own the trigger and panel classes and the height transition. */
export function Collapsible({ className, ...props }: React.ComponentProps<typeof BaseCollapsible.Root>) {
  return <BaseCollapsible.Root data-slot="collapsible" className={cn("ui-collapsible", className as string)} {...props} />;
}

export function CollapsibleTrigger({ className, ...props }: React.ComponentProps<typeof BaseCollapsible.Trigger>) {
  return <BaseCollapsible.Trigger data-slot="collapsible-trigger" className={cn("ui-collapsible__trigger", className as string)} {...props} />;
}

export function CollapsibleContent({ className, ...props }: React.ComponentProps<typeof BaseCollapsible.Panel>) {
  return <BaseCollapsible.Panel data-slot="collapsible-content" className={cn("ui-collapsible__content", className as string)} {...props} />;
}
