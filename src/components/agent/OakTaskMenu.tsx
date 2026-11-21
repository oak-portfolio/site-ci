import * as React from "react";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Menu, MenuContent, MenuGroup, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { markOakTipUsed, useOakTip } from "@/lib/oakTips";
import type { OakTone } from "@/lib/oakMeaningIcons";

export type OakSecondaryAction = "role" | "advice" | "brief" | "voice" | "history" | "funding" | "documents";

type Tool = { action: OakSecondaryAction; label: string; icon: IconName; tone: OakTone };
/**
 * R11 (Oak, review v8; Claude's "+" menu, Mobbin): Tools holds only what shapes the next message, as short labels with no
 * hint lines. Attach documents and Dictate already sit beside it in the composer, so they are not repeated here, and saved
 * chats, answers and the model moved to the header's account menu (OakAccountMenu).
 */
const tools: readonly Tool[] = [
  { action: "role", label: "Compare a role", icon: "identityFile", tone: "violet" },
  { action: "advice", label: "Get project advice", icon: "ideas", tone: "gold" },
  { action: "brief", label: "Prepare a contact brief", icon: "mail", tone: "leaf" },
];

/**
 * The message modes share one keyboard-navigable menu within the persisted modal. Each row leads with the welcome
 * starters' tinted tile (D94). Until the menu is first opened, Tools carries a small new mark (D126).
 */
export function OakTaskMenu({ container, open, onOpenChange, onSelect }: {
  container?: React.RefObject<HTMLDivElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (action: OakSecondaryAction) => void;
}) {
  const trigger = React.useRef<HTMLButtonElement | null>(null);
  const selected = React.useRef(false);
  const fresh = useOakTip("tools");
  const hintId = React.useId();
  const choose = (action: OakSecondaryAction) => {
    selected.current = true;
    onOpenChange(false);
    onSelect(action);
  };
  const row = (tool: Tool) => <MenuItem key={tool.action} nativeButton render={<button type="button" />} className="oak-task-menu__item"
    aria-label={tool.label} onClick={() => choose(tool.action)}>
    <span className="oak-starter-glyph oak-task-menu__tile" data-tone={tool.tone} aria-hidden="true"><Icon name={tool.icon} /></span>
    <span className="oak-task-menu__label">{tool.label}</span>
  </MenuItem>;
  return <Menu open={open} modal={false} onOpenChange={next => {
    if (next) { selected.current = false; markOakTipUsed("tools"); }
    onOpenChange(next);
  }}>
    <Tooltip>
      <TooltipTrigger render={<MenuTrigger ref={trigger} data-oak-tools-trigger data-new={fresh ? "true" : undefined}
        aria-describedby={fresh ? `${hintId}-new` : undefined} aria-label="Tools" render={<Button type="button" variant="ghost" size="icon" />} />}>
        <Icon name="tools" />
        {fresh ? <span className="oak-task-menu__new"><span id={`${hintId}-new`} className="sr-only">New: tools for roles, advice and more</span></span> : null}
      </TooltipTrigger>
      <TooltipContent positionerClassName="oak-composer__tooltip">Tools</TooltipContent>
    </Tooltip>
    <MenuContent container={container} side="top" align="start" aria-label="Oak tools" finalFocus={() => selected.current ? false : trigger.current}>
      <MenuGroup aria-label="Start with">{tools.map(row)}</MenuGroup>
    </MenuContent>
  </Menu>;
}
