import type { OakAnswer } from "../../packages/oak-agent-contracts/src/types";
import { oakGapNoteBelowOn } from "@/lib/oakFlags/gapNoteBelow";

/**
 * Ticket 235: with the gap note below, a gap's rendered text is spoken and copied claims first, note last, the order it
 * shows. The stored text keeps renderOakAnswer's order (saved records compare against it), so only this copy moves.
 */
export function oakNoteLast(answer: OakAnswer, text: string) {
  if (answer.kind !== "gap" || !answer.acknowledgment || !answer.claims.length || !oakGapNoteBelowOn()) return text;
  const lead = `${answer.acknowledgment}\n\n`;
  return text.startsWith(lead) ? `${text.slice(lead.length)}\n\n${answer.acknowledgment}` : text;
}
