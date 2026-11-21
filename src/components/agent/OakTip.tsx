import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { oakMeaningIcons, type OakTone } from "@/lib/oakMeaningIcons";
import { dismissOakTip, markOakTipUsed, useOakTip, type OakTipId } from "@/lib/oakTips";

/**
 * One inline tip (D126): a tinted tile, a title and one or two sentences in Oak's own voice, optional actions, and a
 * dismiss button. It folds away in place when closed and never returns. It pushes content down rather than covering it,
 * so nothing on screen is hidden behind it.
 */
export function OakTip({ id, title, tone = "violet", icon = oakMeaningIcons["onboarding.tip"], children, actions }: {
  id: OakTipId;
  title: string;
  tone?: OakTone;
  icon?: IconName;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const open = useOakTip(id);
  const [held, setHeld] = React.useState(false);
  // Shown once (TipKit's display count of one): the first showing counts as seen and the tip stays until this view closes (D131).
  React.useEffect(() => { if (open) { setHeld(true); markOakTipUsed(id); } }, [open, id]);
  const reduced = useReducedMotion();
  const titleId = React.useId();
  return <AnimatePresence initial={false}>
    {open || held ? <motion.aside key={id} className="oak-tip" data-tip={id} aria-labelledby={titleId}
      initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0, y: 6 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, height: "auto", y: 0, transitionEnd: { overflow: "visible" } }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0, y: -4, overflow: "hidden" }}
      transition={{ height: { type: "spring", visualDuration: 0.36, bounce: 0 }, opacity: { duration: 0.24 }, y: { type: "spring", visualDuration: 0.36, bounce: 0.1 } }}>
      <div className="oak-tip__card">
        <span className="oak-starter-glyph oak-tip__tile" data-tone={tone} aria-hidden="true"><Icon name={icon} /></span>
        <div className="oak-tip__body">
          <h3 id={titleId} className="oak-tip__title">{title}</h3>
          <div className="oak-tip__text">{children}</div>
          {actions ? <div className="oak-tip__actions">{actions}</div> : null}
        </div>
        <Tooltip>
          <TooltipTrigger render={<Button type="button" variant="ghost" size="icon" />} aria-label="Dismiss tip" onClick={() => { setHeld(false); dismissOakTip(id); }}>
            <Icon name="cancel" />
          </TooltipTrigger>
          <TooltipContent positionerClassName="oak-composer__tooltip">Dismiss tip</TooltipContent>
        </Tooltip>
      </div>
    </motion.aside> : null}
  </AnimatePresence>;
}
