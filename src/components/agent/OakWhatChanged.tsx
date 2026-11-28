import { Icon } from "@/components/ui/Icon";
import { oakWhatChangedOn } from "@/lib/oakFlags/whatChanged";
import { oakProgramDiff, type OakProgramDiff } from "@/lib/oakProgramDiff";
import type { OakConversationMessage } from "@/lib/oakWorkspace";

type Turn = Pick<OakConversationMessage, "id" | "role" | "ui">;

/** The question an Edit or Ask again came from, waiting for the first question sent at or after `from`. Memory only. */
let pending: { source: string; from: number } | null = null;
const redoOf = new Map<string, string>();

/**
 * Edit or Ask again on `questionId`: `send` stages the Edit or sends the Ask again and says whether it did; only then does
 * the next question sent replace that question's answer. A newer mark wins. Returns what `send` returned.
 * shortcut: the next question sent binds even when the visitor cleared the box and typed another; carry the source id on the sent message in oakWorkspace if that misleads.
 */
export function markOakRedo(questionId: string, messageCount: number, send: () => boolean = () => true) {
  const sent = send();
  if (sent && oakWhatChangedOn()) pending = { source: questionId, from: messageCount };
  return sent;
}

export function resetOakRedo() {
  pending = null;
  redoOf.clear();
}

const firstSentAfterMark = (messages: readonly Turn[]) => pending ? messages.find((turn, at) => at >= pending!.from && turn.role === "user") : undefined;

/** The question `questionId` was sent: when it is the first one after a mark, it keeps that mark. Called from its turn's effect. */
export function bindOakRedo(questionId: string, messages: readonly Turn[]) {
  if (!pending || firstSentAfterMark(messages)?.id !== questionId) return;
  redoOf.set(questionId, pending.source);
  pending = null;
}

/**
 * The program of the answer the assistant turn at `index` replaces, or null when its question was not an Edit or Ask
 * again. Reads only: a mark not yet bound counts for the first question sent after it.
 */
export function oakWhatChangedPrevious(messages: readonly Turn[], index: number) {
  const question = messages[index - 1];
  if (!oakWhatChangedOn() || !question || question.role !== "user") return null;
  const source = redoOf.get(question.id) ?? (firstSentAfterMark(messages)?.id === question.id ? pending!.source : undefined);
  const at = source ? messages.findIndex(message => message.id === source) : -1;
  const answer = at >= 0 ? messages[at + 1] : undefined;
  return answer?.role === "assistant" ? answer.ui?.program ?? null : null;
}

const sentence = (label: string, kinds: readonly string[]) => kinds.length ? ` ${label} ${kinds.join(", ")}.` : "";
const unchanged = (diff: OakProgramDiff) => !diff.dropped.length && !diff.added.length;
const spoken = (diff: OakProgramDiff) => unchanged(diff) ? `Same blocks as the last answer: ${diff.kept.join(", ")}.`
  : `What changed from the last answer.${sentence("Kept", diff.kept)}${sentence("Dropped", diff.dropped)}${sentence("Added", diff.added)}`;

/** The note's sentence for the answer at `index`, for the transcript's polite region; empty when it draws no note. */
export function oakWhatChangedSpoken(messages: readonly Turn[], index: number) {
  const answer = messages[index];
  if (!oakWhatChangedOn() || answer?.ui?.status !== "done") return "";
  const diff = oakProgramDiff(oakWhatChangedPrevious(messages, index), answer.ui.program);
  return diff ? spoken(diff) : "";
}

/**
 * Ticket 56: the app's note above a replaced answer, from the two programs alone. The model writes none of it. The
 * transcript's one polite region says it (oakWhatChangedSpoken), so the note has no live region of its own. No lead icon:
 * the turn already carries the Related plus, and one icon per unit (R6-C8).
 */
export function OakWhatChanged({ previous, next }: { previous: string | null | undefined; next: string | null | undefined }) {
  const diff = oakWhatChangedOn() ? oakProgramDiff(previous, next) : null;
  if (!diff) return null;
  const same = unchanged(diff);
  return <div className="oak-what-changed" data-same={same ? "" : undefined}>
    {same ? <p>{spoken(diff)}</p> : <>
      <p className="sr-only">{spoken(diff)}</p>
      <p className="oak-what-changed__label" aria-hidden="true">What changed</p>
      <ul className="oak-what-changed__blocks" aria-hidden="true">
        {diff.kept.map(kind => <li key={`kept:${kind}`} data-change="kept">{kind}</li>)}
        {diff.dropped.map((kind, at) => <li key={`dropped:${at}`} data-change="dropped"><s>{kind}</s></li>)}
        {diff.added.map((kind, at) => <li key={`added:${at}`} data-change="added"><Icon name="add" size={12} />{kind}</li>)}
      </ul>
    </>}
  </div>;
}
