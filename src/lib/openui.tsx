import { z } from "zod";
import { createLibrary } from "@openuidev/react-lang";
import { defineAnswer } from "./openui/components/Answer";
import { Callout, CalloutTaught } from "./openui/components/Callout";
import { Compare } from "./openui/components/Compare";
import { CompareRow } from "./openui/components/CompareRow";
import { Heading, HeadingTaught } from "./openui/components/Heading";
import { Meter } from "./openui/components/Meter";
import { Metric } from "./openui/components/Metric";
import { Ownership } from "./openui/components/Ownership";
import { Pills } from "./openui/components/Pills";
import { Board } from "./openui/components/Board";
import { EvidenceChart } from "./openui/components/EvidenceChart";
import { Diagram } from "./openui/components/Diagram";
import { Explainer } from "./openui/components/Explainer";
import { SiteCard } from "./openui/components/SiteCard";
import { PageCards } from "./openui/components/PageCards";
import { Quote } from "./openui/components/Quote";
import { Table } from "./openui/components/Table";
import { Points, PointsTaught } from "./openui/components/Points";
import { Profile } from "./openui/components/Profile";
import { Project } from "./openui/components/Project";
import { ProjectWall } from "./openui/components/ProjectWall";
import { Proposal } from "./openui/components/Proposal";
import { Prose } from "./openui/components/Prose";
import { Role } from "./openui/components/Role";
import { Screens } from "./openui/components/Screens";
import { Source } from "./openui/components/Source";
import { Sources } from "./openui/components/Sources";
import { Stack } from "./openui/components/Stack";
import { StackMap } from "./openui/components/StackMap";
import { Stats } from "./openui/components/Stats";
import { Steps } from "./openui/components/Steps";
import { Timeline } from "./openui/components/Timeline";
import { TimelineItem } from "./openui/components/TimelineItem";
import taught from "../../packages/oak-agent-contracts/src/openui/taught.json";

/**
 * Q17: the OpenUI library for arranged answers. The model never writes a fact here: every block names validated claims by
 * id, and the island fills in each claim's checked text and source chip from the answer itself. Labels, headings and pills
 * are the only model words, and a Metric value, Meter share or Timeline date shows only when it appears verbatim in its claim.
 *
 * Stored answers keep their programs, so a shipped component is never renamed or removed, and its props only grow at the end.
 */
const block = z.union([Heading.ref, Prose.ref, Points.ref, Steps.ref, Compare.ref, Metric.ref, Meter.ref, Timeline.ref, Callout.ref,
  Sources.ref, Pills.ref, Proposal.ref, Project.ref, Role.ref, Source.ref, Stack.ref, Stats.ref, Ownership.ref, Profile.ref, Quote.ref, ProjectWall.ref, StackMap.ref, Table.ref, Board.ref, Screens.ref, EvidenceChart.ref,
  PageCards.ref, Diagram.ref, SiteCard.ref, Explainer.ref]);

const Answer = defineAnswer(block);

export const oakRenderLibrary = createLibrary({
  id: "oak-answers",
  root: "Answer",
  components: [Answer, Heading, Prose, Points, Steps, Compare, CompareRow, Metric, Meter, Timeline, TimelineItem, Callout, Pills, Sources, Proposal,
    Project, Role, Source, Stack, Stats, Ownership, Profile, Quote, ProjectWall, StackMap, Table, Board, Screens, EvidenceChart,
    PageCards, Diagram, SiteCard, Explainer],
});

/** Ticket 238: the taught schema of each block whose flagged argument the render library always parses. */
export const oakTaughtArgs = [CalloutTaught, HeadingTaught, PointsTaught];

export const oakPromptLibrary = /* @__PURE__ */ oakRenderLibrary.extend({
  components: { remove: Object.keys(oakRenderLibrary.components).filter(name => !taught.includes(name)),
    override: oakTaughtArgs.filter(component => taught.includes(component.name)) },
});

export { OakOpenUIScopeContext, oakVerbatim, type OakOpenUIScope, type OakOpenUISource } from "./openui/scope";
export { oakOpenUINames } from "./openui/cards";
export { oakRoleDuration, oakRoleYears } from "./openui/components/Role";
export { oakOpenUIStack } from "./openui/components/Stack";
export { promptOptions } from "../../packages/oak-agent-contracts/src/openui/prompt-options";
export { oakRecordToolProvider } from "./openui/query/oakRecordQuery";
