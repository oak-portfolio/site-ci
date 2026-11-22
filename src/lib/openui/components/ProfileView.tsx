import { useOakRecordFacts, type OakProfileFacts } from "@/lib/oakRecordFacts";
import { oakProfileBlockOn } from "@/lib/oakFlags/profile";
import { ClaimList, OakArt, usePending } from "../cards";
import { Claim, useScope } from "../scope";
import { ProfileGhost, type ProfileProps } from "./Profile";

const PROFILE = "profile:steve-oak";
/** The portrait `/profile.json` publishes as `image` (siteProfile.image), the site's own 300px square. */
const PORTRAIT = "/assets/brand/oak-profile.png";

export default function ProfileView({ claim: id, size }: ProfileProps) {
  const { claims, knowledgeRevision = "" } = useScope();
  const cites = claims.get(id)?.citations.some(citation => citation.documentId === PROFILE) ?? false;
  const state = useOakRecordFacts(cites ? PROFILE : "", knowledgeRevision);
  const waiting = usePending([id]);
  const on = oakProfileBlockOn();
  if (on && (waiting || (cites && state.status === "pending"))) return <ProfileGhost />;
  if (!on || !cites || state.status !== "loaded" || state.facts.kind !== "profile") return <ClaimList ids={[id]} />;
  const { summary, knowsAbout } = state.facts as OakProfileFacts;
  const full = size === "full";
  const about = full && claims.get(id)?.text.trim() !== summary.description.trim();
  return <article className="oak-profile oak-openui-card" data-size={full ? "full" : "brief"}>
    <div className="oak-profile__head">
      <OakArt className="oak-profile__art" src={PORTRAIT} alt="Portrait of Steve Oak" ratio={1} />
      <div className="oak-profile__name">
        <h4 className="oak-openui-card__title">{summary.heading}</h4>
        <p className="oak-profile__lead"><Claim id={id} /></p>
      </div>
    </div>
    {about ? <p className="oak-profile__about">{summary.description}</p> : null}
    <dl className="oak-profile__facts">{summary.facts.map(fact => <div key={fact.label} className="oak-profile__fact"><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
    {full && knowsAbout.length ? <ul className="oak-openui-chips" aria-label="Knows about">{knowsAbout.map(item => <li key={item} className="oak-openui-chip">{item}</li>)}</ul> : null}
  </article>;
}
