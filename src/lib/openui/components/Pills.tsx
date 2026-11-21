import * as React from "react";
import { createPortal } from "react-dom";
import { defineComponent, useTriggerAction } from "@openuidev/react-lang";
import { z } from "zod";
import { Icon } from "@/components/ui/Icon";
import { oakOpenUIOwnWords } from "../../../../packages/oak-agent-contracts/src/openui/verdict";
import { label, useScope } from "../scope";

function PillsView({ questions }: { questions: string[] }) {
  const { latest } = useScope();
  const trigger = useTriggerAction();
  const shown = questions.map(question => oakOpenUIOwnWords(question, 80)).filter((question): question is string => Boolean(question)).slice(0, 3);
  // Review v5: once the turn's action row is on screen, the rows move under it into its slot, named by the row's
  // "Related" title. Without a slot (server render, a stopped turn) they stay inline with their own title.
  const { id } = useScope();
  const [slot, setSlot] = React.useState<HTMLElement | null>(null);
  React.useLayoutEffect(() => {
    const find = () => setSlot(document.getElementById(`${id}-pills`));
    find();
    const observer = new MutationObserver(find);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [id]);
  if (!shown.length) return null;
  const rows = <section className={slot ? "oak-related oak-related--rows oak-openui__pills" : "oak-related oak-openui__pills"}
    aria-labelledby={slot ? `${id}-related` : undefined} aria-label={slot ? undefined : "Related questions"}>
    {slot ? null : <h4 className="oak-related__title"><Icon name="followUp" size={16} />Related</h4>}
    <div className="ui-suggestions" data-slot="suggestions" role="group" aria-label="Ask next">
      {shown.map(question => <button key={question} type="button" className="ui-suggestion" data-slot="suggestion" disabled={!latest}
        onClick={() => void trigger(question)}><span className="ui-suggestion__label">{question}</span>
        <span className="ui-suggestion__trailing" aria-hidden="true"><Icon name="add" size={16} /></span></button>)}
    </div>
  </section>;
  return slot ? createPortal(rows, slot) : rows;
}

export const Pills = defineComponent({
  name: "Pills",
  description: "2 or 3 short follow-up questions in the visitor's voice, each under 60 characters. Last block, at most once.",
  props: z.object({ questions: z.array(label(80)) }),
  component: ({ props }) => <PillsView questions={props.questions} />,
});
