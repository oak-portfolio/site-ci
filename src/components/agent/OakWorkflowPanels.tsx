import * as React from "react";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Suggestion, Suggestions } from "@/components/ui/suggestion";
import { voiceServiceAvailable } from "@/lib/oakVoiceCapture";
import { OakVoiceCapture } from "./OakVoiceCapture";
import { OakFundingControl } from "./OakFundingControl";
import type { oakAllowanceSummary } from "@/lib/oakAllowance";
import { getOakFundingServerState, getOakFundingState, subscribeOakFunding } from "@/lib/oakFundingSession";
import { OakSavedConversations } from "./OakSavedConversations";
import { WorkflowPanel } from "./WorkflowPanel";
import { getOakVoiceController, OAK_DRAFT_LIMIT, setOakDraft, setOakQuestionDraftInput, setOakRoleDraftInput, stopOakTurn, type OakWorkspaceState } from "@/lib/oakWorkspace";

type PanelProps = { onReturn: () => void };

type OakIntakeExample = { text: string; icon: IconName; tone: "blue" | "violet" | "gold" | "leaf"; topic?: string };

/** What a recruiter or hiring manager tends to ask, per intake (D89). A tile's tint carries its meaning, as in the welcome starters. */
// D159: each example lands on a plan Oak can support (prototype interfaces, agent workflows); one that only ever got the
// "clarify the decision" fallback taught visitors the tool could not help.
const adviceExamples: readonly OakIntakeExample[] = [
  { text: "We want an AI agent with retrieval in our product. Where should a small team start?", icon: "agentSystems", tone: "violet" },
  { text: "Our model's answers are uncertain. How should we prototype the interface people act on?", icon: "visualDesign", tone: "blue" },
  { text: "Our agent workflows lose context between sessions. How should we handle memory?", icon: "target", tone: "gold" },
];
const roleExamples: readonly OakIntakeExample[] = [
  { text: "Is Steve a fit for a senior design engineer role on a small product team?", icon: "briefcase", tone: "blue" },
  { text: "Which of his projects show AI agents built and shipped end to end?", icon: "agentSystems", tone: "violet" },
  { text: "How does his frontend depth match what this role asks for?", icon: "code", tone: "leaf" },
];
const questionExamples: readonly OakIntakeExample[] = [
  { topic: "Availability", text: "Is Steve open to a full-time role, and when could he start?", icon: "calendar", tone: "gold" },
  { topic: "AI agent work", text: "Which shipped project best shows how Steve builds AI agents?", icon: "agentSystems", tone: "violet" },
  { topic: "Working style", text: "How does Steve work with designers and product managers day to day?", icon: "group", tone: "blue" },
];

/** Picking an example fills the field and focuses it so the visitor can edit; nothing is sent. */
function fillAndFocus(id: string, fill: () => void) {
  fill();
  document.getElementById(id)?.focus();
}

/**
 * Tappable example rows (Mobbin: ChatGPT, Grok and Claude starters on iOS), drawn as one inset grouped list like the
 * welcome's starters: a tinted icon tile, the example, and a pencil that says it fills in rather than sends.
 */
export function OakIntakeExamples({ examples, onPick }: { examples: readonly OakIntakeExample[]; onPick: (example: OakIntakeExample) => void }) {
  const id = React.useId();
  return <section className="oak-examples" aria-labelledby={id}>
    <h3 id={id} className="oak-group__header">Start from an example</h3>
    <Suggestions aria-labelledby={id}>
      {examples.map((example, order) => <Suggestion key={example.text} order={order} suggestion={example.text} onSelect={() => onPick(example)}
        icon={<span className="oak-starter-glyph" data-tone={example.tone}><Icon name={example.icon} /></span>} trailing={<Icon name="edit" />} />)}
    </Suggestions>
  </section>;
}

export function OakRoleExamples() {
  return <OakIntakeExamples examples={roleExamples} onPick={example => fillAndFocus("oak-role-intent", () => setOakRoleDraftInput("intent", example.text))} />;
}

/** iOS inset grouped form: both fields share one raised group with a hairline between rows; the message Send submits reads below it. */
export function OakQuestionDraftPanel({ draft, message = "", composerId, onReturn }: PanelProps & { draft: NonNullable<OakWorkspaceState["questionDraft"]>; message?: string; composerId: string }) {
  return <WorkflowPanel title="Draft a question for Steve" pose="asking" onReturn={onReturn} className="oak-role-intake">
    <OakIntakeExamples examples={questionExamples} onPick={example => fillAndFocus("oak-question-goal", () => {
      setOakQuestionDraftInput("topic", example.topic ?? "");
      setOakQuestionDraftInput("goal", example.text);
    })} />
    <section className="oak-group">
      <h3 className="oak-group__header">Your question</h3>
      <div className="oak-group__body">
        <div className="oak-group__row"><span className="oak-group__icon" aria-hidden="true"><span className="oak-starter-glyph" data-tone="blue"><Icon name="tag" /></span></span><Field>
          <FieldLabel>Topic</FieldLabel>
          <Input form={composerId} value={draft.topic} maxLength={1500} onChange={event => setOakQuestionDraftInput("topic", event.target.value)} />
        </Field></div>
        <div className="oak-group__row"><span className="oak-group__icon" aria-hidden="true"><span className="oak-starter-glyph" data-tone="gold"><Icon name="question" /></span></span><Field>
          <FieldLabel>What do you want to ask?</FieldLabel>
          <Input id="oak-question-goal" form={composerId} value={draft.goal} maxLength={1500} onChange={event => setOakQuestionDraftInput("goal", event.target.value)} />
        </Field></div>
      </div>
      {/* The message preview appears once there is a message; before that the footnote says how to get one. */}
      <p className="oak-group__footnote">{message.trim() ? "Review the message below." : "Fill in both to see your message."} Nothing is sent until you choose Send.</p>
    </section>
    {message.trim() ? <section className="oak-group">
      <h3 className="oak-group__header">Message</h3>
      <div className="oak-group__body oak-group__preview">{message}</div>
    </section> : null}
  </WorkflowPanel>;
}

/** The advice question lives in the panel's group; the composer below becomes the bottom bar with Send. Enter sends, as in the message box. */
export function OakAdvicePanel({ draft, composerId, inputRef, onReturn }: PanelProps & { draft: string; composerId: string; inputRef?: React.Ref<HTMLTextAreaElement> }) {
  return <WorkflowPanel title="Project advice" returns="A recommended approach, its tradeoffs, and where Steve has done similar work." pose="planning" onReturn={onReturn} className="oak-advice-intake"
    tip={{ id: "advice", text: "Describe a product or AI decision and I'll suggest a next step, grounded in what Steve has shipped." }}>
    <OakIntakeExamples examples={adviceExamples} onPick={example => fillAndFocus("oak-advice-input", () => setOakDraft(example.text))} />
    <div className="oak-group"><Field>
      <FieldLabel htmlFor="oak-advice-input"><Icon name="ideas" size={14} />Your project advice question</FieldLabel>
      <div className="oak-group__body">
        <Textarea ref={inputRef} variant="bare" rows={4} id="oak-advice-input" aria-describedby="oak-advice-help" form={composerId} value={draft} maxLength={OAK_DRAFT_LIMIT}
          placeholder="What decision would you like advice on?" onChange={event => setOakDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }} />
      </div>
      <FieldDescription id="oak-advice-help">Share the decision and its constraints. Oak suggests a next step from public work.</FieldDescription>
    </Field></div>
  </WorkflowPanel>;
}

export function OakVoicePanel({ state, onReturn, onUseTranscript }: PanelProps & { state: OakWorkspaceState; onUseTranscript: (text: string) => void }) {
  const controller = getOakVoiceController();
  const phase = React.useSyncExternalStore(controller.subscribe, () => controller.getSnapshot().phase, () => controller.getSnapshot().phase);
  const daily = React.useSyncExternalStore(controller.subscribe, () => controller.getSnapshot().failure === "daily", () => false);
  const available = voiceServiceAvailable(state.voiceConfiguration);
  const checking = !available && state.voiceConfiguration.checking === true;
  // While checking, the line and pose promise neither on nor off: a failed read must not flip an "on" picture to "off".
  return <WorkflowPanel title="Dictate a message" returns={available ? "Oak turns your clip into text; the audio is not kept. Using the text never sends it." : "Your words as text in the message box, ready to edit."} pose={checking ? "hourglass" : !available ? "voice-off" : daily ? "keep-calendar" : phase === "transcribing" ? "listening" : phase === "review" ? "voice-scroll" : "recording"} onReturn={onReturn}
    busy={checking || (available && (phase === "transcribing" || phase === "stopping"))}>
    {available ? <OakVoiceCapture configuration={state.voiceConfiguration} controller={controller} onUseTranscript={onUseTranscript} />
      // The status read takes a moment; say so quietly rather than flashing the "off" card first.
      : checking ? <p className="oak-voice__checking" role="status">Checking that dictation is on</p>
      // With the service off there is nothing to record: one calm card says so and hands back to typing, with no dead recorder.
      : <OakVoiceOff onType={onReturn} />}
  </WorkflowPanel>;
}

function OakVoiceOff({ onType }: { onType: () => void }) {
  // The sleeping microphone leads the panel as its header picture, so the card itself is words and one action.
  return <div className="oak-turn__stopped oak-voice__off" role="note" data-tone="closed">
    <span className="oak-voice__off-tile" data-oak-tile="voice-off" aria-hidden="true"><Icon name="microphoneOff" /></span>
    <div className="oak-turn__stopped-body">
      <p className="oak-turn__stopped-title">Voice input is off right now</p>
      <p className="oak-turn__stopped-detail">Dictation is switched off on this site. Typing works the same way.</p>
      <span className="oak-turn__stopped-actions">
        <Button type="button" size="sm" onClick={onType}><Icon name="edit" />Type instead</Button>
      </span>
    </div>
  </div>;
}

export function OakFundingPanel({ onReturn, allowance }: PanelProps & { allowance?: ReturnType<typeof oakAllowanceSummary> }) {
  // D117: the picture follows the choice, the coin pouch for Oak's allowance and the acorn key for the visitor's own account.
  const funding = React.useSyncExternalStore(subscribeOakFunding, getOakFundingState, getOakFundingServerState);
  // Q11: the allowance note already says when the 30-day cap pauses the 4-hour refill.
  return <WorkflowPanel title="Model funding" returns={allowance?.note ?? "Free answers refill one every 4 hours. Your own key is never charged for them."} pose={funding.selected === "visitor" ? "own-key" : "coins"} onReturn={onReturn} className="oak-conversation-options"
    tip={{ id: "funding", text: "I answer for free within an allowance Steve covers. When it runs out, connect your own OpenRouter account or ask Steve for more." }}>
    <OakFundingControl onBeforeChange={stopOakTurn} answersLeft={allowance} />
  </WorkflowPanel>;
}

export function OakConversationPanel({ state, onReturn }: PanelProps & { state: OakWorkspaceState }) {
  // The panel's one picture follows the list: the hourglass while it loads, an empty chest when nothing is saved yet (D72).
  const pose = state.historyOpen && state.historyPending ? "hourglass"
    : state.historyLoaded && !state.savedConversations.length ? "empty-chest" : "saved";
  return <WorkflowPanel title="Your conversation" returns="Save this chat, reopen an earlier one, or delete it." pose={pose} busy={state.historyOpen && state.historyPending} onReturn={onReturn} className="oak-conversation-options"
    tip={{ id: "history", text: "Save this chat to come back to it later. Saved chats are kept for 30 days, and you can export or delete them." }}>
    <OakSavedConversations state={state} />
  </WorkflowPanel>;
}
