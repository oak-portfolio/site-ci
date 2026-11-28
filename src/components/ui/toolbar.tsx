import * as React from "react";
import { Toolbar as BaseToolbar } from "@base-ui/react/toolbar";
import { cn } from "@/lib/utils";

/** Base UI Toolbar: one tab stop, arrow keys move between its buttons. The caller names it. */
export function Toolbar({ className, ...props }: React.ComponentProps<typeof BaseToolbar.Root>) {
  return <BaseToolbar.Root data-slot="toolbar" className={cn("ui-toolbar", className as string)} {...props} />;
}

/** A toolbar item; render a house Button through `render` so it keeps the shared button look. */
export function ToolbarButton(props: React.ComponentProps<typeof BaseToolbar.Button>) {
  return <BaseToolbar.Button data-slot="toolbar-button" {...props} />;
}

export function ToolbarSeparator({ className, ...props }: React.ComponentProps<typeof BaseToolbar.Separator>) {
  return <BaseToolbar.Separator data-slot="toolbar-separator" className={cn("ui-toolbar__separator", className as string)} {...props} />;
}
