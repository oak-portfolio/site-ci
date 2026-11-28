import * as React from "react";
import { Icon } from "@/components/ui/Icon";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { oakContactCardFacts } from "@/data/contactCard";
import { heroCopy, socialLinks } from "@/data/homePage";
import { declineOakContactCard, oakContactCardDeclined } from "@/lib/oakContactCardOnce";
import { getOakWorkspace, openOakContactBrief, setOakContactBriefInput } from "@/lib/oakWorkspace";

const EMAIL = "okkark.pro@gmail.com";
const PORTRAIT = "/assets/brand/oak-profile.png";
const linkedin = socialLinks.find(link => link.label === "LinkedIn")!;
/** The focus state's reasons; a chosen one starts an empty "What you're after" in the visitor's voice, which they edit. */
const reasons = [
  { label: "Hiring", icon: "briefcase", goals: "I'm reaching out about hiring Steve." },
  { label: "Collaboration", icon: "group", goals: "I'd like to talk with Steve about working together." },
  { label: "A question", icon: "helpCircle", goals: "I have a question for Steve." },
] as const;
type Reason = (typeof reasons)[number];

/** Send a note opens the existing contact brief; it starts from the visitor's words, else from the chosen reason. */
function sendNote(reason: Reason | null) {
  openOakContactBrief();
  if (reason && !getOakWorkspace().briefDraft?.goals.trim()) setOakContactBriefInput("goals", reason.goals);
}

function Portrait({ size }: { size: number }) {
  return <span className="oak-contact-card__ring" aria-hidden="true"><img className="oak-contact-card__portrait" src={PORTRAIT} alt="" width={size} height={size} /></span>;
}

/** Ticket 49 (Q31 A): the Contact card, the one block in an answer with the ring glow. Availability and Book a call render only from the reviewed record. */
export function OakContactCard({ conversationId }: { conversationId: string | null }) {
  const { availability, bookingUrl } = oakContactCardFacts();
  const [declined, setDeclined] = React.useState(() => oakContactCardDeclined(conversationId));
  const [focused, setFocused] = React.useState(false);
  const [host, setHost] = React.useState<HTMLElement | null>(null);
  const [reason, setReason] = React.useState<Reason | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [copyError, setCopyError] = React.useState(false);
  const card = React.useRef<HTMLElement>(null);
  const receipt = React.useRef<HTMLParagraphElement>(null);
  const justDeclined = React.useRef(false);
  const titleId = React.useId();
  // Only a fresh Not now moves focus; the same answer rendering again later keeps the receipt without taking focus.
  React.useEffect(() => { if (declined && justDeclined.current) { justDeclined.current = false; receipt.current?.focus(); } }, [declined]);
  // Base UI's modal leaves the chat reachable inside the workspace host, so the focus state marks the host's other children inert.
  React.useEffect(() => {
    if (!focused || !host) return;
    const rest = [...host.children].filter((el): el is HTMLElement => el instanceof HTMLElement && !el.classList.contains("oak-contact-focus__portal") && !el.inert);
    rest.forEach(el => { el.inert = true; });
    return () => rest.forEach(el => { el.inert = false; });
  }, [focused, host]);
  if (declined) return <p ref={receipt} tabIndex={-1} className="oak-proposal__receipt oak-openui__proposal">Got it. Contact Steve stays in the header.</p>;
  const copyEmail = async () => {
    try { await navigator.clipboard.writeText(EMAIL); setCopied(true); setCopyError(false); }
    catch { setCopyError(true); setCopied(false); }
  };
  const openFocus = () => { setHost(card.current?.closest<HTMLElement>(".oak-workspace") ?? null); setFocused(true); };
  const availabilityLine = availability ? <p className="oak-contact-card__availability"><span className="oak-contact-card__dot" aria-hidden="true" />{availability}</p> : null;
  const booking = bookingUrl ? <a className="oak-contact-card__secondary" href={bookingUrl} target="_blank" rel="noreferrer"><Icon name="calendar" size={16} /><span>Book a call</span></a> : null;
  return <section ref={card} className="oak-contact-card" data-glow="" aria-labelledby={titleId}>
    <div className="oak-contact-card__head">
      <Portrait size={48} />
      <div className="oak-contact-card__titles">
        <button type="button" id={titleId} className="oak-contact-card__title" aria-haspopup="dialog" onClick={openFocus}>Talk to Steve</button>
        <p className="oak-contact-card__subline">Replies come to Steve's inbox.</p>
        {availabilityLine}
      </div>
      <button type="button" className="oak-contact-card__decline" aria-label="Not now" title="Not now"
        onClick={() => { declineOakContactCard(conversationId); justDeclined.current = true; setDeclined(true); }}><Icon name="cancel" size={16} /></button>
    </div>
    <div className="oak-contact-card__actions">
      <button type="button" className="oak-contact-card__primary" onClick={() => sendNote(null)}><span>Send a note</span><Icon name="arrowRight" size={16} /></button>
      {booking}
      <a className="oak-contact-card__link" href={linkedin.href} target="_blank" rel="noreferrer" aria-label="Steve on LinkedIn (new tab)"><Icon name="linkedin" size={16} /><span>LinkedIn</span></a>
    </div>
    <Dialog open={focused} onOpenChange={setFocused}>
      <DialogContent open={focused} container={host ?? undefined} className="oak-contact-focus" portalClassName="oak-contact-focus__portal" backdropClassName="oak-contact-focus__backdrop">
        <div className="oak-contact-focus__head">
          <Portrait size={64} />
          <div className="oak-contact-card__titles">
            <DialogTitle className="oak-contact-focus__title">Talk to Steve</DialogTitle>
            <DialogDescription className="oak-contact-card__subline">Replies come to Steve's inbox.</DialogDescription>
            {availabilityLine}
          </div>
          <DialogClose className="oak-contact-card__decline" aria-label="Close" title="Close"><Icon name="cancel" size={16} /></DialogClose>
        </div>
        <div className="oak-contact-focus__reasons" role="group" aria-label="What it's about">
          {reasons.map(item => <button key={item.label} type="button" className="oak-contact-focus__reason" aria-pressed={reason === item}
            onClick={() => setReason(reason === item ? null : item)}><Icon name={item.icon} size={16} /><span>{item.label}</span></button>)}
        </div>
        <div className="oak-contact-card__actions">
          <button type="button" className="oak-contact-card__primary" onClick={() => { setFocused(false); sendNote(reason); }}><span>Send a note</span><Icon name="arrowRight" size={16} /></button>
          <button type="button" className="oak-contact-card__secondary" data-copied={copied} onClick={() => void copyEmail()}>
            <Icon name={copied ? "copyCheck" : "copy"} size={16} /><span>{copied ? "Copied" : "Copy email"}</span></button>
          {booking}
        </div>
        <p className={copyError ? "oak-contact-card__subline" : "sr-only"} role="status">
          {copied ? "Email address copied." : copyError ? <>Copy is unavailable. Select the address: {EMAIL}</> : ""}</p>
        <Collapsible className="oak-contact-focus__about">
          <CollapsibleTrigger className="oak-contact-focus__about-trigger"><span>About Steve</span><Icon name="arrowDown" size={14} /></CollapsibleTrigger>
          <CollapsibleContent className="oak-contact-focus__about-panel"><p>{heroCopy.description}</p></CollapsibleContent>
        </Collapsible>
      </DialogContent>
    </Dialog>
  </section>;
}
