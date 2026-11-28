import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { oakMeaningIcons } from "@/lib/oakMeaningIcons";
import { oakMotionTokens } from "@/lib/oakMotion";
import { shortenOakQuote } from "@/lib/oakQuote";
import { jumpOakTranscriptToMessage } from "@/lib/oakTranscriptScroll";

/** Enter 160 ms from slightly small, leave in 120 ms; reduced motion only fades. Siblings slide over with `layout`. */
function chipMotion(reduced: boolean | null) {
  const hidden = reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 };
  return { initial: hidden, animate: reduced ? { opacity: 1 } : { opacity: 1, scale: 1 },
    exit: { ...hidden, transition: { duration: 0.12, ease: oakMotionTokens.ease } },
    transition: { duration: oakMotionTokens.quick, ease: oakMotionTokens.ease } };
}

/**
 * D123 Quote chip: a phrase from one of Oak's answers, staged above the message box by Ask about this, and shown read-only
 * above the sent question. One line with an ellipsis; hover or focus shows every word. `onRemove` adds the remove button.
 * `source` is the answer the quote came from: clicking the words scrolls back to it (D135).
 */
export function OakQuoteChip({ text, source, onRemove, ref }: { text: string; source?: string; onRemove?: () => void; ref?: React.Ref<HTMLSpanElement> }) {
  const reduced = useReducedMotion();
  const enter = chipMotion(reduced);
  const show = source ? (event: React.MouseEvent<HTMLElement>) => {
    const behavior = reduced ? "instant" : "smooth";
    // Through the scroller, so it sees an explicit jump and releases auto-follow; the DOM scroll is only a fallback.
    if (jumpOakTranscriptToMessage(source, behavior)) return;
    const answer = event.currentTarget.closest(".oak-workspace")?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(source)}"]`);
    answer?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  } : undefined;
  return <motion.span ref={ref} className="oak-quote-chip" data-removable={onRemove ? "" : undefined} layout={reduced ? false : "position"}
    initial={enter.initial} animate={enter.animate} exit={enter.exit} transition={enter.transition}>
    <Icon name={oakMeaningIcons["composer.quote"]} size={14} />
    <Tooltip>
      {/* Base UI's trigger is a focusable button, so a keyboard reader can open the whole quote too. */}
      <TooltipTrigger type="button" className="oak-quote-chip__text" onClick={show}>{`\u201c${text}\u201d`}</TooltipTrigger>
      <TooltipContent positionerClassName="oak-composer__tooltip" className="oak-quote-chip__tip">{text}</TooltipContent>
    </Tooltip>
    {onRemove ? <Tooltip>
      {/* Each button names its own quote, so a stack of them reads apart. */}
      <TooltipTrigger render={<Button variant="ghost" size="icon" />} type="button" aria-label={`Remove quote \u201c${shortenOakQuote(text, 40)}\u201d`}
        onClick={onRemove}>
        <Icon name="cancel" size={14} />
      </TooltipTrigger>
      <TooltipContent positionerClassName="oak-composer__tooltip">Remove quote</TooltipContent>
    </Tooltip> : null}
  </motion.span>;
}
