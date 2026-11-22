import * as React from "react";
import type { OakAnswer } from "../../../packages/oak-agent-contracts/src/types";
import { oakSourceCover, type OakCitationLabels } from "@/lib/oakCitationLabels";
import { oakAnswerSources } from "@/lib/oakAnswerActions";
import { RevealText, revealWordCount } from "@/components/ui/reveal-text";
import { resolverQuote } from "@/lib/oakQuote";
import { oakGapNoteBelowOn } from "@/lib/oakFlags/gapNoteBelow";
import { OakSourceChip, OakSourceFace, oakSourceFaceImage, useOakWorkspaceHost } from "./OakSourceChip";
import { OakSourcesPanel } from "./OakSourcesPanel";

type WorkAnswer = Extract<OakAnswer, { kind: "sourced" | "gap" }>;

/**
 * The one Sources button that closes an answer, opening every source in a panel numbered like Copy with sources. With one
 * source, its chip already names it, so the button only gathers two or more. Q17: an arranged answer ends with the same one.
 */
export function OakAnswerSources({ answer, citationLabels, delay = "0ms" }: { answer: WorkAnswer; citationLabels?: OakCitationLabels; delay?: string }) {
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [host, anchor] = useOakWorkspaceHost();
  const sources = React.useMemo(() => oakAnswerSources(answer), [answer]);
  // Q05, review v6: the pill shows up to three sources that have a real picture (cover or brand icon), overlapping; with none it is words only.
  const faces = sources.filter(citation => oakSourceFaceImage({ url: citation.url, cover: oakSourceCover(citation, answer.knowledgeRevision, citationLabels) })).slice(0, 3);
  if (sources.length < 2) return null;
  return <div className="oak-answer__sources" ref={anchor} style={{ "--oak-stack-delay": delay } as React.CSSProperties}>
    <button type="button" className="oak-answer__sources-button" aria-haspopup="dialog" aria-expanded={panelOpen} onClick={() => setPanelOpen(true)}>
      {faces.length ? <span className="oak-answer__stack-icons" aria-hidden="true">
        {faces.map(citation => <span key={citation.documentId} className="oak-answer__stack-icon">
          <OakSourceFace url={citation.url} documentId={citation.documentId} cover={oakSourceCover(citation, answer.knowledgeRevision, citationLabels)} /></span>)}
      </span> : null}
      <span>Sources</span><span className="oak-answer__sources-count">{sources.length}</span>
    </button>
    <OakSourcesPanel open={panelOpen} onOpenChange={setPanelOpen} sources={sources} knowledgeRevision={answer.knowledgeRevision}
      citationLabels={citationLabels} container={host} />
  </div>;
}

/** One claim's validated text and its one quiet source chip; a resolver quote shows as the quote itself (D146, D148). */
export function OakClaimText({ claim, knowledgeRevision, citationLabels }: {
  claim: WorkAnswer["claims"][number]; knowledgeRevision: string; citationLabels?: OakCitationLabels;
}) {
  const quote = resolverQuote(claim.text);
  return <>{quote !== null ? <q className="oak-openui__quote">{quote}</q> : claim.text}{" "}
    <OakSourceChip citations={claim.citations} knowledgeRevision={knowledgeRevision} citationLabels={citationLabels} /></>;
}

/**
 * A live answer streams in at a reading pace, about 33 words a second (a hundred words take 3s), and never takes more than
 * 4s however long it is (long answers just step faster). D87 slowed it from a 1.2s cap that read as a fade, not a stream.
 */
const REVEAL_TOTAL_MS = 4000;
const REVEAL_STEP_MAX_MS = 30;

/** The shared word clock for a live answer: the step between words, where each block starts, and when the last word lands. */
export function oakAnswerRevealPlan(answer: WorkAnswer, pace?: number) {
  const words = [answer.acknowledgment ?? "", ...answer.claims.map(claim => resolverQuote(claim.text) ?? claim.text)].map(revealWordCount);
  const count = words.reduce((sum, value) => sum + value, 0);
  const step = pace ?? Math.min(REVEAL_STEP_MAX_MS, REVEAL_TOTAL_MS / Math.max(1, count));
  const starts = words.map((_, index) => words.slice(0, index).reduce((sum, value) => sum + value, 0) * step);
  return { words, step, starts, total: Math.round(count * step) };
}

/**
 * Render only the validated answer. Each point ends with one quiet source chip after its last word (D122); the Sources
 * button that opens every source leads the turn's action row (review v4).
 * Once validated, the whole answer is in place at once; inside a live turn its words resolve in order and each point's
 * chip arrives right after its last word (Beautiful UI StreamingText). A reopened turn renders still.
 */
export function OakWorkAnswer({ answer, citationLabels }: { answer: WorkAnswer; citationLabels?: OakCitationLabels }) {
  const noteBelow = oakGapNoteBelowOn() && answer.claims.length > 0;
  // Below, the note is the last thing the reveal reaches: the claims start without it, at the whole answer's pace, so the
  // note's last word lands at the total OakTurn reads.
  const { words, step, starts, total } = noteBelow ? oakAnswerRevealPlan({ ...answer, acknowledgment: null }, oakAnswerRevealPlan(answer).step)
    : oakAnswerRevealPlan(answer);
  // Each point's chip waits for its last word.
  const pillDelays = answer.claims.map((_, index) => `${Math.round(starts[index + 1]! + words[index + 1]! * step)}ms`);
  return (
    <>
      {answer.acknowledgment && !noteBelow ? <p><RevealText text={answer.acknowledgment} start={starts[0]} step={step} /></p> : null}
      {answer.claims.map((claim, index) => {
        // A resolver-quoted source ("<Author> wrote: “…”") shows as a quote block, never a third-person lead-in (D146, D148).
        const quote = resolverQuote(claim.text);
        const chip = <OakSourceChip citations={claim.citations} knowledgeRevision={answer.knowledgeRevision} citationLabels={citationLabels} />;
        const text = <RevealText text={quote ?? claim.text} start={starts[index + 1]} step={step} />;
        return <section key={claim.id} className="oak-answer__point"
          style={{ "--oak-pill-delay": pillDelays[index] } as React.CSSProperties}>
          {quote !== null ? <>
            <blockquote className="oak-quote">{text}</blockquote>
            {chip}
          </> : <p>{text}{" "}{chip}</p>}
        </section>;
      })}
      {answer.acknowledgment && noteBelow ? <p className="oak-answer__note-below"><RevealText text={answer.acknowledgment} start={total} step={step} /></p> : null}
    </>
  );
}
