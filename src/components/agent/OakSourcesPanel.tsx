import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/Icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { OakCitationLabels } from "@/lib/oakCitationLabels";
import { useReturnFocus } from "@/lib/openui/a11y/useReturnFocus";
import type { PublicCitation } from "../../../packages/oak-agent-contracts/src/types";
import { OakSprite } from "./OakActivitySprite";
import { oakAnswerOrnamentOn } from "@/lib/oakFlags/answerOrnament";
import { oakRecede } from "@/lib/openui/a11y/oakRecede";
import { OakSourceRow } from "./OakSourceChip";

/** Mounted with the open sheet: when it unmounts with focus dropped to the page, focus goes back to the opener. */
function SheetReturnFocus({ opener }: { opener: React.RefObject<HTMLElement | null> }) {
  useReturnFocus(opener);
  return null;
}

/**
 * Every source behind one answer, in a sheet at the workspace's right edge (ChatGPT's Sources sheet). Rows are numbered
 * in first-appearance order, the same numbers Copy with sources writes.
 */
export function OakSourcesPanel({ open, onOpenChange, sources, knowledgeRevision, citationLabels, container }: {
  open: boolean; onOpenChange: (open: boolean) => void; sources: readonly PublicCitation[];
  knowledgeRevision: string; citationLabels?: OakCitationLabels; container: HTMLElement | null;
}) {
  const cited = React.useId();
  // Ticket 58: behind the switch, the conversation recedes while the sheet is open and comes back before focus returns.
  const depth = oakAnswerOrnamentOn();
  const opener = React.useRef<HTMLElement | null>(null);
  // While closed, remember the control the visitor last pressed or focused: Safari never focuses a clicked button.
  React.useEffect(() => {
    if (!depth || open) return;
    const remember = (event: Event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("button, a[href], [tabindex]") : null;
      if (target) opener.current = target;
    };
    document.addEventListener("pointerdown", remember, true);
    document.addEventListener("focusin", remember, true);
    return () => { document.removeEventListener("pointerdown", remember, true); document.removeEventListener("focusin", remember, true); };
  }, [depth, open]);
  const layer = container?.querySelector<HTMLElement>(".oak-workspace__body") ?? null;
  const change = (next: boolean) => {
    if (depth && !next) oakRecede(layer, false, opener.current);
    onOpenChange(next);
  };
  React.useEffect(() => {
    if (!depth || !open) return;
    oakRecede(layer, true);
    return () => oakRecede(layer, false);
  }, [depth, open, layer]);
  return <Dialog open={open} onOpenChange={change}>
    <DialogContent open={open} variant="panel" container={container ?? undefined} className="oak-sources-panel" backdropClassName="oak-sources-panel__backdrop">
      {depth ? <SheetReturnFocus opener={opener} /> : null}
      <header className="oak-sources-panel__header">
        <OakSprite pose="bookshelf" size="medium" className="oak-sources-panel__art" />
        <div className="oak-sources-panel__heading-group">
          <DialogTitle className="oak-sources-panel__title">Sources</DialogTitle>
          <p className="oak-sources-panel__count">{sources.length === 1 ? "1 page" : `${sources.length} pages`} behind this answer</p>
        </div>
        <Tooltip>
          <TooltipTrigger render={<DialogClose render={<Button type="button" variant="ghost" size="icon" />} />} aria-label="Close sources">
            <Icon name="cancel" />
          </TooltipTrigger>
          <TooltipContent positionerClassName="oak-composer__tooltip">Close sources</TooltipContent>
        </Tooltip>
      </header>
      {/* Cited first, as in ChatGPT's Sources view; the contract exposes no retrieved-but-uncited links yet. */}
      <section className="oak-sources-panel__section" aria-labelledby={cited}>
        <h4 id={cited} className="oak-sources-panel__heading">Cited</h4>
        <ol className="oak-source-list">
          {sources.map((citation, index) => <li key={citation.documentId}>
            <OakSourceRow citation={citation} knowledgeRevision={knowledgeRevision} citationLabels={citationLabels} number={index + 1} />
          </li>)}
        </ol>
      </section>
    </DialogContent>
  </Dialog>;
}
