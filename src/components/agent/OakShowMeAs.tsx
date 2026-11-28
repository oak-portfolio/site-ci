import * as React from "react";
import { RadioGroup, RadioSegment } from "@/components/ui/radio-group";
import { Icon } from "@/components/ui/Icon";
import { useOakWorkspace } from "@/lib/oakWorkspace";
import { announceOakBlock } from "@/lib/openui/a11y/oakBlockAnnounce";
import { oakAudienceOf, type OakAudience } from "../../../packages/oak-agent-contracts/src/transport";
import { oakPlanOrder } from "../../../packages/oak-agent-contracts/src/openui/plan";
import { oakLayoutParse, oakLayoutPrint } from "../../../packages/oak-agent-contracts/src/openui/program";
import { OakArrangedAnswer } from "./OakOpenUIAnswer";

/** The three audiences main knows (transport.ts), under plain labels; a fourth is a contracts change with its own ticket. */
export const oakShowMeAsAudiences: readonly { value: OakAudience; label: string; noun: string }[] = [
  { value: "recruiter", label: "Recruiter", noun: "a recruiter" },
  { value: "collaborator", label: "Collaborator", noun: "a collaborator" },
  { value: "learner", label: "Learner", noun: "a learner" },
];

/**
 * The program with its root Answer's blocks in ticket 16's order for `audience`. Each Heading moves with the block under it,
 * and the first unit (the lead with any Headings above it, program.ts) stays first. Unchanged text when nothing moves.
 */
export function oakShowMeAsProgram(program: string, audience: OakAudience | undefined) {
  const parsed = audience ? oakLayoutParse(program) : null;
  const root = parsed?.statements.find(statement => statement.name === "root" && statement.component === "Answer");
  const names = root?.body.match(/^\s*\[([^\]]*)\]\s*$/)?.[1]!.split(",").map(name => name.trim()).filter(Boolean);
  if (!parsed || !names) return program;
  const kinds = new Map(parsed.statements.map(statement => [statement.name, statement.component]));
  const units: string[][] = [[]];
  for (const name of names) {
    units.at(-1)!.push(name);
    if (kinds.get(name) !== "Heading") units.push([]);
  }
  if (!units.at(-1)!.length) units.pop();
  const ordered = oakPlanOrder(units.map(unit => ({ kind: kinds.get(unit.at(-1)!) ?? "", unit })), audience).flatMap(entry => entry.unit);
  if (ordered.every((name, index) => name === names[index])) return program;
  return oakLayoutPrint({ statements: parsed.statements.map(statement => statement === root ? { ...root, body: `[${ordered.join(", ")}]` } : statement) });
}

type Arranged = React.ComponentProps<typeof OakArrangedAnswer>;

/**
 * Ticket 19 (Q34 A): a settled arranged answer in the visitor's order. A known purpose reorders it at once under a quiet
 * capsule with Undo; with none, a small switch offers the three audiences. The choice lives in this answer only.
 * `purpose` overrides the account's (tests); undefined reads the workspace's.
 */
export function OakShowMeAs(props: Arranged & { purpose?: string | null }) {
  const { purpose } = props;
  const { authStatus } = useOakWorkspace();
  const known = oakAudienceOf(purpose === undefined ? authStatus?.purpose : purpose);
  const settled = props.ui?.status === "done" ? props.ui : null;
  const moves = (audience: OakAudience) => Boolean(settled && oakShowMeAsProgram(settled.program, audience) !== settled.program);
  const tailored = Boolean(known && moves(known));
  // undefined follows the account; null is the original order.
  const [chosen, setChosen] = React.useState<OakAudience | null | undefined>(undefined);
  const [open, setOpen] = React.useState(false);
  const capsule = React.useRef<HTMLButtonElement>(null);
  const audience = chosen === undefined ? (tailored ? known : undefined) : chosen ?? undefined;
  const ui = React.useMemo(() => settled && audience ? { ...settled, program: oakShowMeAsProgram(settled.program, audience) } : props.ui,
    [settled, audience, props.ui]);
  const nounOf = (value: OakAudience | null | undefined) => oakShowMeAsAudiences.find(entry => entry.value === value)?.noun;
  const choose = (next: OakAudience | null) => {
    setChosen(next);
    const noun = nounOf(next);
    announceOakBlock(`${props.id}:show-me-as`, noun ? `Reordered for ${noun}.` : "Original order.", { repeat: true });
  };
  const offered = Boolean(settled) && oakShowMeAsAudiences.some(entry => moves(entry.value));
  const showSwitch = offered && (!known || open);
  return <div className="oak-show-me-as">
    <OakArrangedAnswer id={props.id} answer={props.answer} ui={ui} question={props.question} citationLabels={props.citationLabels}
      latest={props.latest} live={props.live} plan={props.plan} pending={props.pending} />
    {offered && tailored ? <div className="oak-show-me-as__bar">
      <button ref={capsule} type="button" className="oak-show-me-as__capsule" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        {audience ? `Ordered for ${nounOf(audience)}` : "Original order"}</button>
      {audience ? <button type="button" className="oak-show-me-as__undo" onClick={() => { choose(null); capsule.current?.focus(); }}>
        <Icon name="retry" size={14} />Undo</button> : null}
    </div> : null}
    {showSwitch ? <div className="oak-show-me-as__switch">
      <span className="oak-show-me-as__label" aria-hidden="true">Show me as</span>
      <RadioGroup aria-label="Show me as" value={audience ?? null}
        onValueChange={value => choose(value as OakAudience)}>
        {oakShowMeAsAudiences.map(entry => <RadioSegment key={entry.value} value={entry.value}
          data-audience={entry.value}>{entry.label}</RadioSegment>)}
      </RadioGroup>
    </div> : null}
  </div>;
}
