import * as React from "react";
import { useRender } from "@base-ui/react/use-render";
import { MessageScroller } from "@shadcn/react/message-scroller";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** One conversation row. `align="end"` is the visitor's side. Ported from shadcn Message (Base UI). */
export function Message({ className, align = "start", ...props }: React.ComponentProps<"div"> & { align?: "start" | "end" }) {
  return <div data-slot="message" data-align={align} className={cn("ui-message", className)} {...props} />;
}

/** Consecutive rows from the same sender. */
export function MessageGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="message-group" className={cn("ui-message-group", className)} {...props} />;
}

export function MessageAvatar({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="message-avatar" className={cn("ui-message__avatar", className)} {...props} />;
}

export function MessageContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="message-content" className={cn("ui-message__content", className)} {...props} />;
}

export function MessageHeader({ className, render, ...props }: useRender.ComponentProps<"div">) {
  return useRender({ defaultTagName: "div", render, props: { "data-slot": "message-header", className: cn("ui-message__header", className as string), ...props } });
}

/** Status and message-level actions such as copy and retry. */
export function MessageFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="message-footer" className={cn("ui-message__footer", className)} {...props} />;
}

/** "Jump to latest" for the headless MessageScroller. Hidden while the reader is at the live edge. */
export function MessageScrollerButton() {
  // A round frosted arrow, as in iOS Messages and ChatGPT: it marks newer messages below without covering the text it floats
  // over, and names itself on hover like every other icon control.
  return <Tooltip>
    <TooltipTrigger render={<MessageScroller.Button className="oak-conversation__latest" behavior="instant"
      render={<Button variant="secondary" size="icon" aria-label="Latest messages" />} />}>
      <Icon name="arrowDown" />
    </TooltipTrigger>
    <TooltipContent positionerClassName="oak-composer__tooltip">Latest messages</TooltipContent>
  </Tooltip>;
}
