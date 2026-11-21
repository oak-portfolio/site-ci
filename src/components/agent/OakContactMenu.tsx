import * as React from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { socialLinks } from "@/data/homePage";
import { getOakRoleDescription, oakBriefSeed, openOakContactBrief, useOakWorkspace } from "@/lib/oakWorkspace";

const EMAIL = "okkark.pro@gmail.com";

/** Contact: one email card (the card is the mailto link, the trailing button copies the address), then profile tiles. */
export function OakContactMenu({
  container,
  open,
  onOpenChange,
}: {
  container: React.RefObject<HTMLDivElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trigger = React.useRef<HTMLButtonElement | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [copyError, setCopyError] = React.useState(false);
  // Q06: once the chat has a question, the brief can start from it.
  // Offered only when the chat holds words the brief can start from (a private document question does not count).
  const messages = useOakWorkspace().messages;
  const asked = Boolean(oakBriefSeed(messages, { get: (id: string) => getOakRoleDescription(id) } as ReadonlyMap<string, string>));
  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(EMAIL);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
      setCopied(false);
    }
  };
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        data-oak-contact-trigger
        ref={trigger}
        aria-label="Contact Steve"
        title="Contact Steve"
        render={<Button variant="ghost" size="sm" />}
      >
        <Icon name="mail" />
        <span>Contact Steve</span>
      </PopoverTrigger>
          <PopoverContent
            container={container}
            className="oak-contact__popup"
            finalFocus={trigger}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                onOpenChange(false);
                trigger.current?.focus({ preventScroll: true });
              }
            }}
          >
            <div className="oak-contact__header">
              <PopoverTitle className="oak-contact__title">
                Contact Steve
              </PopoverTitle>
              <PopoverDescription className="oak-contact__description">
                Email is the fastest way to reach Steve.
              </PopoverDescription>
            </div>
            <div className="oak-contact__email">
              <a className="oak-contact__email-link" href={`mailto:${EMAIL}`}>
                <span className="oak-contact__email-icon"><Icon name="mail" /></span>
                <span className="oak-contact__email-text">
                  <span className="oak-contact__email-label">Email Steve</span>
                  <span className="oak-contact__address">{EMAIL}</span>
                </span>
              </a>
              <Tooltip>
                <TooltipTrigger render={<button type="button" className="oak-contact__copy" data-copied={copied}
                  aria-label={copied ? "Email address copied" : "Copy email address"} onClick={() => void copyEmail()} />}>
                  <Icon name={copied ? "copyCheck" : "copy"} />
                </TooltipTrigger>
                <TooltipContent>{copied ? "Copied" : "Copy email address"}</TooltipContent>
              </Tooltip>
            </div>
            {asked ? <button type="button" className="oak-contact__brief"
              onClick={() => { onOpenChange(false); openOakContactBrief(); }}>
              <span className="oak-contact__email-link">
                <span className="oak-contact__email-icon"><Icon name="mailEdit" /></span>
                <span className="oak-contact__email-text">
                  <span className="oak-contact__email-label">Draft a brief from this chat</span>
                  <span className="oak-contact__address">Starts with your words. You send it yourself.</span>
                </span>
              </span>
            </button> : null}
            <p className="sr-only" role="status">{copied ? "Email address copied." : ""}</p>
            {copyError ? (
              <p className="oak-contact__description" role="status">
                Copy is unavailable. Select the email address or use Email
                Steve.
              </p>
            ) : null}
            <nav
              className="oak-contact__socials"
              aria-label="Steve's social profiles"
            >
              {socialLinks.map((link) => (
                <Tooltip key={link.label}>
                  <TooltipTrigger render={<a className="oak-contact__social" href={link.href} target="_blank" rel="noreferrer"
                    aria-label={`Steve on ${link.label} (new tab)`} />}>
                    <Icon name={link.icon} size={20} />
                    <span>{link.label}</span>
                  </TooltipTrigger>
                  <TooltipContent>Steve on {link.label}</TooltipContent>
                </Tooltip>
              ))}
            </nav>
          </PopoverContent>
    </Popover>
  );
}
