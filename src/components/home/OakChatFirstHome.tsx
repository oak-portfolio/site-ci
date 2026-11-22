import * as React from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { ToastProvider, ToastViewport, createToastManager } from "@/components/ui/toast";
import { OakOutputAnnouncements, OakTranscript } from "@/components/agent/OakTranscript";
import { OakVerification, useOakVerification } from "@/components/agent/OakTurnstile";
import { oakHomeModeSnapshot, setOakHomeMode, subscribeOakHomeMode } from "@/lib/oakFlags/chatFirstHome";
import { requestOakWorkspace, setOakInlineHost, useOakWorkspace } from "@/lib/oakWorkspace";
import { onOakToast } from "@/lib/oakToasts";

const serverMode = () => "chat" as const;

/** The chat's top bar and Oak's opening line. The sections below it are the page's own, so Close only changes the layout. */
export function OakChatFirstHome() {
  const mode = React.useSyncExternalStore(subscribeOakHomeMode, oakHomeModeSnapshot, serverMode);
  const chat = mode === "chat";
  const toggle = React.useRef<HTMLElement | null>(null);
  const flip = () => {
    setOakHomeMode(chat ? "classic" : "chat");
    if (chat) window.scrollTo({ top: 0 });
    requestAnimationFrame(() => toggle.current?.focus({ preventScroll: true }));
  };
  return (
    <div className="home-chat__chrome">
      <div className="home-chat__bar">
        <p className="home-chat__brand">Oak AI <span>Agent</span></p>
        <Button ref={toggle} type="button" size="sm" variant={chat ? "ghost" : "secondary"} onClick={flip}>
          <Icon name={chat ? "cancel" : "aiChat"} size={16} />
          <span>{chat ? "Close chat" : "Open chat"}</span>
        </Button>
      </div>
      <p className="home-chat__opening" role="note">
        Hi, I'm Oak, Steve's AI agent. Here is his home page, right in this chat. Ask about anything below, or close the chat to browse it as a page.
      </p>
    </div>
  );
}

/** The conversation under the Opening turn: the agent's own transcript, hosted inline while the full agent is closed. */
export function OakHomeThread() {
  const state = useOakWorkspace();
  const mode = React.useSyncExternalStore(subscribeOakHomeMode, oakHomeModeSnapshot, serverMode);
  const [hosted, setHosted] = React.useState(false);
  React.useEffect(() => {
    if (document.documentElement.dataset.oakHome === undefined) return;
    setOakInlineHost(true);
    setHosted(true);
    return () => setOakInlineHost(false);
  }, []);
  const verification = useOakVerification(state.authStatus, false);
  const toasts = React.useMemo(() => createToastManager(), []);
  const live = hosted && mode === "chat" && state.presentation !== "human-agent";
  React.useEffect(() => live ? onOakToast(toast => toasts.add(toast)) : undefined, [live, toasts]);
  if (!live) return null;
  const key = state.conversationId ?? "home";
  return (
    <ToastProvider toastManager={toasts} limit={2}>
      <section className="home-chat__thread" aria-label="Conversation with Oak">
        {verification.mounted ? <OakVerification siteKey={verification.siteKey} placeholder={verification.placeholder}
          attempt={verification.attempt} challenge={verification.verifying ? "interactive" : "idle"} onCancel={verification.dismiss} /> : null}
        {state.messages.length ? <OakTranscript key={key} state={state} conversationKey={key} geometryKey="home" onContact={() => requestOakWorkspace()} /> : null}
        <OakOutputAnnouncements key={state.historyRevision} messages={state.messages} />
      </section>
      {createPortal(<div className="home-chat__toasts"><ToastViewport /></div>, document.body)}
    </ToastProvider>
  );
}
