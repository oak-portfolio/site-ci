import { Icon } from "@/components/ui/Icon";
import { Suggestion, Suggestions } from "@/components/ui/suggestion";
import { oakMeaningIcons } from "@/lib/oakMeaningIcons";
import { askOakSuggestion } from "@/lib/oakWorkspace";

/**
 * v3 review: follow-ups sit under the answer they follow, as full-width rows with a plus at the end (Perplexity's
 * Related list). A row wraps to two lines instead of squeezing into a pill, and the composer keeps only the message box.
 * Review v5: when the answer has an action row, the "Related" title leads that row (actions on the right) and only the
 * rows sit here, labelled by the title's id.
 */
export function OakRelatedTitle({ id }: { id?: string }) {
  return <h4 className="oak-related__title" id={id}><Icon name={oakMeaningIcons["action.follow-up"]} size={16} />Related</h4>;
}

export function OakRelated({ questions, disabled = false, labelledBy, titleId }: {
  questions: readonly string[]; disabled?: boolean; labelledBy?: string;
  /** Inside the Other ways drawer the title travels with the rows: one section, titled, rows layout. */
  titleId?: string;
}) {
  if (!questions.length) return null;
  const heading = titleId ?? labelledBy;
  return <section className={heading ? "oak-related oak-related--rows" : "oak-related"} aria-labelledby={heading} aria-label={heading ? undefined : "Related questions"}>
    {titleId ? <OakRelatedTitle id={titleId} /> : labelledBy ? null : <OakRelatedTitle />}
    <Suggestions aria-label="Follow-up questions">
      {questions.map((question, order) => <Suggestion key={question} order={order} suggestion={question} disabled={disabled}
        trailing={<Icon name="add" size={16} />}
        onSelect={text => { if (!askOakSuggestion(text)) document.getElementById("oak-composer-input")?.focus(); }} />)}
    </Suggestions>
  </section>;
}
