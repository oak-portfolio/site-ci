import * as React from "react";
import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { oakOpenUIOwnWords } from "../../../../packages/oak-agent-contracts/src/openui/verdict";
import { Claim, claimId, label } from "../scope";

export const CompareColumns = React.createContext<readonly [string, string] | null>(null);

function CompareCell({ id, name }: { id: string; name?: string }) {
  return <dd>{name ? <span className="oak-openui__compare-col">{name}<span className="sr-only">:</span></span> : null}<Claim id={id} /></dd>;
}

function CompareRowView({ label: text, claim, also }: { label: string; claim: string; also?: string }) {
  const columns = React.useContext(CompareColumns);
  return <div className="oak-openui__compare-row" data-pair={also ? "" : undefined}>
    <dt>{oakOpenUIOwnWords(text, 60) ?? ""}</dt><CompareCell id={claim} name={also ? columns?.[0] : undefined} />{also ? <CompareCell id={also} name={columns?.[1]} /> : null}
  </div>;
}

export const CompareRow = defineComponent({
  name: "CompareRow",
  description: "One point the compared items share (what it is, who it serves, how it was built, his role, the outcome), in a few words, the first item's claim on it and, in also, the second item's claim on the same point.",
  props: z.object({ label: label(60), claim: claimId, also: claimId.optional() }),
  // R27g live (live-v34 compare): one row per project described each in turn and never set them side by side; a row is one
  // shared point with both projects' claims beside each other.
  component: ({ props }) => <CompareRowView label={props.label} claim={props.claim} also={props.also} />,
});
