import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Suggestion, Suggestions } from "@/components/ui/suggestion";
import { oakStarterSet, oakStarters, type OakStarterIntent } from "@/lib/oakSuggestions";
import type { OakCitationLabels } from "@/lib/oakCitationLabels";
import { openOakSurface, useOakWorkspace } from "@/lib/oakWorkspace";
import { oakAudienceOf } from "../../../packages/oak-agent-contracts/src/transport";
import { OakSprite, type OakActivitySpritePose } from "./OakActivitySprite";
import { useOakAccount } from "./OakAccountAvatar";
import { OakPausedBanner } from "./OakPausedBanner";
import { OakTip } from "./OakTip";

export { oakStarters };

/**
 * Leading glyph and tint per starter, like iOS Settings rows: blue for what Steve built, violet for how he works, gold
 * for reaching Steve, leaf for a page's own project, pink for current public sources. The tint carries meaning, so each
 * row reads before its words.
 */
const starterIcons: Readonly<Record<OakStarterIntent, { name: IconName; tone: "blue" | "violet" | "gold" | "leaf" | "pink" }>> = {
  page: { name: "identityFile", tone: "leaf" },
  built: { name: "code", tone: "blue" },
  owned: { name: "workHistory", tone: "blue" },
  role: { name: "compare", tone: "blue" },
  learned: { name: "bookOpenText", tone: "blue" },
  approach: { name: "agentSystems", tone: "violet" },
  run: { name: "group", tone: "violet" },
  advice: { name: "bulb", tone: "violet" },
  draft: { name: "edit", tone: "gold" },
  brief: { name: "mailEdit", tone: "gold" },
  availability: { name: "calendar", tone: "gold" },
  current: { name: "news", tone: "pink" },
};
/**
 * Review v4 (Customer.io, Writer): a signed-in visitor is greeted for why they came, in one warm line and one line of what
 * Oak can do for that, instead of the guest headline. Time of day leads. R12 (Claude's "Good morning, Sam"): with the
 * visitor's first name when their sign-in provider gave one; the name is painted in this browser only and never reaches
 * the agent.
 */
const purposeGreetings: Readonly<Record<string, string>> = {
  recruiting: "Let's see how Steve fits your role.",
  consulting: "Let's talk through your project.",
  research: "Let's find the work behind your question.",
  exploring: "Glad you're back to look around.",
  other: "Ask me anything about Steve's work.",
};
const purposeLines: Readonly<Record<string, string>> = {
  recruiting: "Ownership, timelines and evidence, each answer cited.",
  consulting: "Decisions Steve made, and where he did similar work.",
  research: "Case studies, methods and what he measured.",
  exploring: "Projects, decisions and how he works.",
  other: "Projects, decisions and how he works.",
};
function partOfDay(hour = new Date().getHours()) {
  return hour < 5 ? "Hello" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** Starters that are a tool open it straight away; the rest are asked (or open the draft) through `onStarter`. */
const starterTools: Partial<Record<OakStarterIntent, "role" | "advice" | "brief">> = { role: "role", advice: "advice", brief: "brief" };

/**
 * The greeting before any message. Q08: the starters follow the visitor's account purpose (a guest gets the mixed set) and
 * the page. Picking one asks it, or opens its tool or the question draft.
 */
export function OakEmptyState({ onStarter, route = "/", citationLabels, pose = "greeting", onOpenTools, onFunding }: {
  onStarter: (text: string) => void;
  route?: string;
  citationLabels?: OakCitationLabels;
  /** The one Oak on screen; a pending decision below (such as research consent) lends him its pose. */
  pose?: OakActivitySpritePose;
  /** D126: the first-visit tip can open Tools and the funding panel. */
  onOpenTools?: () => void;
  onFunding?: () => void;
}) {
  // At rest the empty state greets with the waving loop; a pending decision still lends its own pose.
  const art: OakActivitySpritePose = pose === "idle" ? "greeting" : pose;
  const { authStatus, authStatusLoading, startersFrozen, authReauthenticate, authSignInConfiguration } = useOakWorkspace();
  // A status that lands after the hold never swaps the set already on screen; the next conversation uses it.
  const audience = startersFrozen ? undefined : oakAudienceOf(authStatus?.purpose);
  // Q15: while the first status read is in flight the starters keep their place unseen, so a visitor with a purpose never
  // sees the mixed set swap to their own under the pointer. The store stops holding after a beat on a slow read.
  const holding = authStatusLoading && !authStatus;
  // ARCH@25: one account rule. The greeting waits for a ready account, and an account that must sign in again is a guest.
  const account = useOakAccount({ status: authStatus, reauthenticate: authReauthenticate, signInConfiguration: authSignInConfiguration });
  const signedIn = account.ready;
  const purpose = authStatus?.purpose;
  const firstName = account.firstName;
  // R13 (Oak, review v10: the nudge "feels slop"; the Signed in badge is "redundant"): signing in is offered once, in the
  // header, where ChatGPT and Claude put it, and a signed-in visitor is greeted by name with nothing to say they are.
  return (
    <div className="oak-conversation" data-empty="true">
      <div className="oak-conversation__viewport" role="region" aria-label="Start a conversation" tabIndex={0}>
        <div className="oak-conversation__content">
          <section className="oak-conversation__empty" aria-label="Start a conversation">
            {/* D116: the greeting stands on the same soft tinted halo as every panel's picture, one art language. */}
            <span className="oak-conversation__hero">
              <span className="oak-panel-hero" data-tone="violet" aria-hidden="true"><OakSprite pose={art} size="large" /></span>
            </span>
            {signedIn ? <>
              {/* Review v5: two lines. A quiet line says hello by name; the title below is why they came, in plain white. */}
              <p className="oak-conversation__hello">
                <span className="oak-conversation__greeting">{partOfDay()}{firstName ? `, ${firstName}` : ""}</span>
              </p>
              <h2>{purposeGreetings[purpose ?? "other"] ?? purposeGreetings.other}</h2>
              <p>{purposeLines[purpose ?? "other"] ?? purposeLines.other}</p>
            </> : <>
              <h2>Ask about Steve's work</h2>
              <p>Projects, decisions and how he works.</p>
            </>}
            <OakPausedBanner status={authStatus} />
            <div className="oak-conversation__starters" data-audience={audience ?? "mixed"} data-holding={holding ? "" : undefined}
              inert={holding || undefined} aria-busy={holding || undefined}>
              {/* Keyed by the set, so the rows rise in once when the visitor's own set is known. */}
              <Suggestions key={holding ? "holding" : audience ?? "mixed"} aria-label="Suggested questions">
                {oakStarterSet(route, citationLabels, audience).map(({ text, intent }, order) => {
                  const glyph = starterIcons[intent], tool = starterTools[intent];
                  return <Suggestion key={text} order={order + 1} suggestion={text} onSelect={tool ? () => openOakSurface(tool) : onStarter}
                    icon={<span className="oak-starter-glyph" data-tone={glyph.tone}><Icon name={glyph.name} /></span>} trailing={<Icon name="chevronRight" />} />;
                })}
              </Suggestions>
            </div>
            {/* D126: a first visit learns, once, that answers are free within Steve's allowance, that an own key is an
                option, and that Tools holds more than chat. */}
            <OakTip id="welcome" title="Here's how I work" tone="violet"
              actions={<>
                {onOpenTools ? <Button type="button" variant="secondary" size="sm" onClick={onOpenTools}><Icon name="tools" />Open tools</Button> : null}
                {onFunding ? <Button type="button" variant="secondary" size="sm" onClick={onFunding}><Icon name="gift" />How funding works</Button> : null}
              </>}>
              <p>Answers are free within an allowance Steve covers that refills every few hours, or you can use your own OpenRouter account. Tools has more: compare a role, get project advice or draft a note to Steve.</p>
            </OakTip>
          </section>
        </div>
      </div>
    </div>
  );
}
