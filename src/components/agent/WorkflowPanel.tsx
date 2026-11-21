import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { oakMotion } from "@/lib/oakMotion";
import type { OakTipId } from "@/lib/oakTips";
import { OakSprite, type OakActivitySpritePose } from "./OakActivitySprite";
import { OakTip } from "./OakTip";

type HeroTone = "blue" | "violet" | "gold" | "leaf" | "pink";
/** The hero's ground is tinted to what the panel is for (D88): documents and roles blue, money and questions gold, voice pink, contact leaf. */
const heroTones: Partial<Record<OakActivitySpritePose, HeroTone>> = {
  reviewing: "blue", comparing: "blue", document: "blue", parsing: "blue", scanner: "blue", highlighting: "blue",
  asking: "gold", coins: "gold", "budget-paused": "gold",
  recording: "pink", listening: "pink", "voice-scroll": "pink", "voice-off": "pink",
  mailbox: "leaf", "signing-in": "leaf", sent: "leaf", "brief-letter": "leaf",
  "doc-stack": "blue", "own-key": "gold", "keep-calendar": "violet",
};
/** The halo tint for a pose, shared by panel heroes and the inline account card (D116). */
export const oakHeroTone = (pose: OakActivitySpritePose): HeroTone => heroTones[pose] ?? "violet";

/**
 * Every workflow panel opens with an iOS-style navigation bar (a back chevron and the title), then the panel's picture as its
 * hero on a soft ground tinted to its meaning (D70, D88). The heading takes focus when the panel opens. The bar is clear while
 * the panel sits at the top and frosts once content scrolls under it. The picture is keyed by pose, so a panel whose state
 * changes (voice, documents) settles its new art in.
 */
export function WorkflowPanel({ title, onReturn, pose, busy = false, tip, returns, className, children }: {
  title: string;
  onReturn: () => void;
  pose?: OakActivitySpritePose;
  /** Oak is working on something for this panel (transcribing, preparing files, loading the list): the picture's ring turns. */
  busy?: boolean;
  /** D126: what this panel does, said once on its first open, under the picture. */
  tip?: { id: OakTipId; text: string };
  /** Q06: one line, always shown, saying what this tool gives back. */
  returns?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const heading = React.useRef<HTMLHeadingElement | null>(null);
  const sentinel = React.useRef<HTMLSpanElement | null>(null);
  const [scrolled, setScrolled] = React.useState(false);
  const titleId = React.useId();
  const reduced = useReducedMotion();
  const reveal = oakMotion("reveal", reduced);
  const settle = oakMotion("settle", reduced);
  React.useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  // The sentinel sits where the bar starts; once it scrolls out of its clipping scroller, content is passing under the bar.
  React.useEffect(() => {
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    // The newest entry wins: a panel that opens already scrolled can deliver its initial and its scrolled entry in one batch.
    const observer = new IntersectionObserver(entries => setScrolled(!entries[entries.length - 1]!.isIntersecting));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <motion.section className={["oak-workflow", className].filter(Boolean).join(" ")} aria-labelledby={titleId}
      initial={reveal.initial} animate={reveal.animate} transition={reveal.transition}>
      <span ref={sentinel} className="oak-panel-nav__sentinel" aria-hidden="true" />
      <div className="oak-workflow__heading oak-panel-nav" data-scrolled={scrolled ? "" : undefined}>
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon" />} type="button" aria-label="Return to chat" onClick={onReturn}>
            <Icon name="arrowLeft" />
          </TooltipTrigger>
          <TooltipContent positionerClassName="oak-composer__tooltip">Return to chat</TooltipContent>
        </Tooltip>
        <h2 id={titleId} ref={heading} tabIndex={-1}>{title}</h2>
        {/* Keeps the title centred opposite the back button. */}
        <span className="oak-panel-nav__mark" aria-hidden="true" />
      </div>
      {pose ? <motion.div key={pose} className="oak-panel-hero" aria-hidden="true" data-busy={busy ? "" : undefined} data-tone={oakHeroTone(pose)}
        initial={settle.initial} animate={settle.animate} transition={settle.transition}>
        <OakSprite pose={pose} size="large" />
      </motion.div> : null}
      {returns ? <p className="oak-workflow__returns">{returns}</p> : null}
      {tip ? <OakTip id={tip.id} title="How this works" tone={pose ? oakHeroTone(pose) : "violet"}><p>{tip.text}</p></OakTip> : null}
      {children}
    </motion.section>
  );
}
