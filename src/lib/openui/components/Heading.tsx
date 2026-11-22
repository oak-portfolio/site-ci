import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { Icon } from "@/components/ui/Icon";
import { oakHeadingChip, oakHeadingChipOn } from "@/lib/oakFlags/headingChip";
import { oakOpenUIOwnWords } from "../../../../packages/oak-agent-contracts/src/openui/verdict";
import { label } from "../scope";

const props = z.object({ text: label(48), from: label(32).optional() });

export const Heading = defineComponent({
  name: "Heading",
  description: "A 2 to 5 word section label above a block, never a sentence or a fact. Only in answers with 2 or more sections.",
  // Ticket 238: the render library always parses from; the chip stays behind oakHeadingChipOn().
  props,
  // Ticket 14: the explored block header, an icon tile then the words then a hairline. The tile is decoration; the h4 reads as its words alone.
  component: ({ props }) => { const text = oakOpenUIOwnWords(props.text, 48); const from = oakHeadingChipOn() && props.from ? oakOpenUIOwnWords(props.from, 32) : null;
    return text ? <h4 className="oak-openui__heading"><span className="oak-openui__heading-mark" aria-hidden="true"><Icon name="bookOpenText" size={14} /></span>
      <span className="oak-openui__heading-text">{text}</span>{from ? <span className="oak-openui__heading-chip"><span className="sr-only">, from </span>{from}</span> : null}</h4> : null; },
});

/** The prompt library's Heading: the prompt and spec.json teach from only once the constant flips. */
export const HeadingTaught = oakHeadingChip ? Heading : defineComponent({ ...Heading, props: props.omit({ from: true }) as unknown as typeof props });
