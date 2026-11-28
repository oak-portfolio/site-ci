import * as React from "react";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Toggle } from "@base-ui/react/toggle";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Textarea } from "@/components/ui/textarea";
import { OakOpenRouterMark, oakOpenGrantCode, oakUseOpenRouter } from "@/components/agent/OakFundingControl";
import { oakAllowanceCapped, oakAllowanceSummary, oakBudgetReset } from "@/lib/oakAllowance";
import { getOakWorkspace, oakInlineHostOn, requestOakWorkspace, setOakDraft, submitOakTurn, useOakWorkspace, type OakWorkspaceState } from "@/lib/oakWorkspace";

export type HomeComposerMode = "ask" | "search" | "agent";
type HomeComposerState = { text: string; mode: HomeComposerMode };
/** The home input grows with its text to this many lines, then scrolls; `--home-composer-max-lines` in home-chat.css holds the same number. */
export const homeComposerMaxLines = 2;
type HomeComposerAction = { type: "text"; text: string } | { type: "mode"; mode: HomeComposerMode };

export const homeComposerModes: ReadonlyArray<{ id: HomeComposerMode; label: string; icon: IconName; placeholder: string; send: string }> = [
  { id: "ask", label: "Ask", icon: "aiChat", placeholder: "Ask about Steve's work", send: "Send" },
  { id: "search", label: "Search", icon: "search", placeholder: "Search pages, sections and projects", send: "Search" },
  { id: "agent", label: "Agent", icon: "compass", placeholder: "Open the full agent with this text", send: "Open agent" },
];

export function homeComposerReducer(state: HomeComposerState, action: HomeComposerAction): HomeComposerState {
  return action.type === "text" ? { ...state, text: action.text } : { ...state, mode: action.mode };
}

type PaletteModule = typeof import("@/components/OakCommandPalette");

export type HomeNotice = { kind: "one-left" | "limit" | "budget" | "model" | "ai-off" | "gate"; icon: IconName; title: string; detail: string; more?: string };

function refillIn(refillsAt: number | null | undefined, now: number) {
  if (!refillsAt || refillsAt <= now) return undefined;
  const minutes = Math.ceil((refillsAt - now) / 60_000), hours = Math.floor(minutes / 60);
  return `More in ${hours ? `${hours} h ` : ""}${minutes % 60 || !hours ? `${minutes % 60} min` : ""}`.trim();
}

/** The one notice the home shows, from the allowance and the last turn the agent already holds. Nothing here reads the Worker. */
export function homeNotice(state: Pick<OakWorkspaceState, "authStatus" | "messages"> & Partial<Pick<OakWorkspaceState, "authError" | "error">>, aiOn: boolean, now = Date.now()): HomeNotice | null {
  if (!aiOn) return { kind: "ai-off", icon: "pause", title: "Oak AI is off right now.", detail: "Search still finds every page, section and project, no AI needed." };
  if (state.authError) return { kind: "gate", icon: "alert", title: state.authError, detail: "" };
  const last = state.messages.at(-1);
  const failure = last?.role === "assistant" ? last.failure : undefined;
  if (failure === "budget") return { kind: "budget", icon: "pause", title: "Answers are paused for this month.", detail: `${oakBudgetReset("month")}.` };
  if (failure === "budget-today") return { kind: "budget", icon: "pause", title: "Today's free answers are used up.", detail: `${oakBudgetReset("today")}.` };
  if (failure === "unavailable" || failure === "busy") return { kind: "model", icon: "alert", title: "The model is unavailable right now.", detail: "Your question is still here to try again in a moment." };
  if (state.error) return { kind: "gate", icon: "alert", title: state.error, detail: "" };
  const summary = oakAllowanceSummary(state.authStatus);
  if (summary?.remaining === 0) return { kind: "limit", icon: "clock", title: "You are out of free answers.", detail: summary.reset,
    more: (!oakAllowanceCapped(state.authStatus?.allowance) && refillIn(state.authStatus?.allowance?.answers.refillsAt, now)) || summary.reset };
  if (summary?.remaining === 1) return { kind: "one-left", icon: "clock", title: "One answer left.", detail: summary.reset };
  return null;
}

export function homeAnswersLeft(status: OakWorkspaceState["authStatus"], notice: HomeNotice | null = null) {
  if (notice) return null;
  const summary = oakAllowanceSummary(status);
  return summary && summary.remaining > 0 ? `${summary.remaining} ${summary.remaining === 1 ? "answer" : "answers"} left today` : null;
}

/** The one next step a paused budget or AI off offers, sat in the composer row so the notice never grows the composer. */
export function OakHomeNoticeAction({ notice, onBrowse }: { notice: HomeNotice | null; onBrowse: () => void }) {
  if (notice?.kind !== "budget" && notice?.kind !== "ai-off") return null;
  return (
    <Button type="button" size="sm" variant="ghost" data-home-browse="" onClick={onBrowse}>
      <Icon name="webBrowsing" size={16} />
      <span>Browse the site</span>
    </Button>
  );
}

type RefillContext = { opener: HTMLElement | null; browse: () => void };
export const homeRefillRows: ReadonlyArray<{ id: string; title: string; detail?: string; icon?: IconName; run?: (context: RefillContext) => void }> = [
  { id: "wait", title: "Wait for the reset", icon: "clock" },
  { id: "grant", title: "Grant code", detail: "Have a code from Steve?", icon: "gift",
    run: ({ opener }) => { if (requestOakWorkspace(opener)) oakOpenGrantCode(); } },
  { id: "openrouter", title: "Connect OpenRouter", detail: "Use your own OpenRouter account",
    run: ({ opener }) => { if (requestOakWorkspace(opener)) oakUseOpenRouter(); } },
  { id: "browse", title: "Browse the site", detail: "Work, career and apps, no AI needed", icon: "compass",
    run: ({ browse }) => browse() },
];

/** One live region holds the notice text, so a state is announced once; the refill rows sit outside it. */
export function OakHomeNotice({ notice, line, onBrowse }: { notice: HomeNotice | null; line: string | null; onBrowse: () => void }) {
  const limit = notice?.kind === "limit";
  return (
    <>
      <div className="home-chat__notice" role="status" data-notice={notice?.kind}>
        {limit ? <><h2 className="home-chat__refill-title" id="home-refill-title">{notice.title}</h2><p className="home-chat__refill-more">{notice.more}</p></>
          : notice ? <><Icon name={notice.icon} size={16} /><span><strong>{notice.title}</strong>{notice.detail ? ` ${notice.detail}` : null}</span></> : null}
      </div>
      {notice?.kind === "gate" ? (
        <div className="home-chat__gate">
          <Button type="button" size="sm" variant="secondary" data-home-gate=""
            onClick={(event: React.MouseEvent<HTMLElement>) => requestOakWorkspace(event.currentTarget)}>
            Continue in Oak AI Agent<Icon name="chevronRight" size={16} />
          </Button>
        </div>
      ) : null}
      {limit ? (
        <ul className="home-chat__refill" aria-labelledby="home-refill-title">
          {homeRefillRows.map((row) => (
            <li key={row.id} data-refill-row={row.id}>
              {React.createElement(row.run ? "button" : "div", {
                className: "home-chat__refill-row",
                ...(row.run ? { type: "button", onClick: (event: React.MouseEvent<HTMLElement>) => row.run?.({ opener: event.currentTarget, browse: onBrowse }) } : {}),
              },
              row.icon ? <Icon name={row.icon} size={20} /> : <OakOpenRouterMark size={20} />,
              <span className="home-chat__refill-text"><strong>{row.title}</strong><span>{row.id === "wait" ? notice.detail : row.detail}</span></span>,
              row.run ? <Icon name="chevronRight" size={16} /> : null)}
            </li>
          ))}
        </ul>
      ) : null}
      {line ? <p className="home-chat__left">{line}</p> : null}
    </>
  );
}

/** Ask sends a turn (inline on the chat-first home), Agent opens the workspace holding the text, Search opens the no-AI palette. */
export function submitHomeComposer(state: HomeComposerState, opener?: HTMLElement | null, openPalette?: () => void) {
  const text = state.text.trim();
  if (state.mode === "search") { openPalette?.(); return true; }
  if (!text) return false;
  setOakDraft(text);
  if (state.mode === "ask" && oakInlineHostOn()) { void submitOakTurn(); return true; }
  if (!requestOakWorkspace(opener)) return false;
  if (state.mode === "ask") void submitOakTurn();
  return true;
}

/** A turn that could not finish hands its words back to the draft; the home box takes them once nothing is still running. */
export function homeDraftReturn(workspace: Pick<OakWorkspaceState, "draft" | "pending" | "authPending">) {
  return oakInlineHostOn() && workspace.draft && !workspace.pending && !workspace.authPending ? workspace.draft : null;
}

export function OakHomeComposer() {
  const [state, dispatch] = React.useReducer(homeComposerReducer, { text: "", mode: "ask" });
  const workspace = useOakWorkspace();
  const [aiOn, setAiOn] = React.useState<boolean | null>(null);
  React.useEffect(() => { setAiOn(document.body.dataset.oakAgentEligible === "true"); }, []);
  const notice = aiOn === null ? null : homeNotice(workspace, aiOn);
  const left = homeAnswersLeft(workspace.authStatus, notice);
  const [palette, setPalette] = React.useState<PaletteModule | null>(null);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const sendButton = React.useRef<HTMLElement | null>(null);
  const input = React.useRef<HTMLTextAreaElement | null>(null);
  const current = homeComposerModes.find((mode) => mode.id === state.mode)!;
  const openPalette = () => {
    void import("@/components/OakCommandPalette").then((module) => { setPalette(() => module); setPaletteOpen(true); });
  };
  const submit = (event?: React.SyntheticEvent) => {
    event?.preventDefault();
    if (submitHomeComposer(state, sendButton.current, openPalette) && state.mode === "ask" && !homeDraftReturn(getOakWorkspace())) dispatch({ type: "text", text: "" });
  };
  const returned = homeDraftReturn(workspace);
  React.useEffect(() => {
    if (returned) dispatch({ type: "text", text: returned });
  }, [returned]);
  React.useLayoutEffect(() => {
    const field = input.current;
    if (!field) return;
    delete field.dataset.grown;
    field.style.height = "";
    if (!state.text) return;
    const style = getComputedStyle(field);
    const text = field.scrollHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    if (Math.round(text / parseFloat(style.lineHeight)) > 1) field.dataset.grown = "";
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  }, [state.text]);
  return (
    <form className="home-chat__composer" onSubmit={submit} aria-label="Ask Oak">
      <OakHomeNotice notice={notice} line={null} onBrowse={openPalette} />
      <Textarea
        ref={input}
        variant="bare"
        rows={1}
        value={state.text}
        placeholder={current.placeholder}
        aria-label={current.placeholder}
        onChange={(event) => dispatch({ type: "text", text: event.currentTarget.value })}
        onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) submit(event); }}
      />
      <div className="home-chat__composer-row">
        <ToggleGroup
          className="home-chat__modes"
          aria-label="Composer mode"
          value={[state.mode]}
          onValueChange={(value) => { const next = value[0] as HomeComposerMode | undefined; if (next) dispatch({ type: "mode", mode: next }); }}
        >
          {homeComposerModes.map((mode) => (
            <Toggle key={mode.id} value={mode.id} className="home-chat__mode">
              <Icon name={mode.icon} size={16} />
              <span>{mode.label}</span>
            </Toggle>
          ))}
        </ToggleGroup>
        <OakHomeNoticeAction notice={notice} onBrowse={openPalette} />
        <Button ref={sendButton} type="submit" size="icon" aria-label={current.send} disabled={state.mode !== "search" && !state.text.trim()}>
          <Icon name={state.mode === "search" ? "search" : "send"} size={18} />
        </Button>
      </div>
      {aiOn && left ? <p className="home-chat__left">{left}</p> : null}
      {palette ? <palette.OakCommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} opener={sendButton} /> : null}
    </form>
  );
}
