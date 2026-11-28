import { Icon } from "@/components/ui/Icon";
import { useOakRecordFacts } from "@/lib/oakRecordFacts";
import { ClaimList } from "../../cards";
import { useScope } from "../../scope";
import type { SiteKindProps } from "./SiteView";
import { SiteFrame, SiteLink } from "./Frame";

/** The app card from the build-time record facts of the cited page; pending, missing or another kind is the claim as a point. */
export function SiteApp({ own, documentId }: SiteKindProps) {
  const { knowledgeRevision = "" } = useScope();
  const state = useOakRecordFacts(documentId, knowledgeRevision);
  const app = state.status === "loaded" && state.facts.kind === "app" ? state.facts : null;
  if (!app) return <ClaimList ids={own} />;
  return <SiteFrame kind="app" icon="meditation" title={app.name} from={{ href: app.path, label: "From the app's own page" }} own={own} page={documentId}>
    {app.facts.length > 0 && <ul className="oak-site__facts" aria-label="Facts">{app.facts.map(fact => <li key={fact} className="oak-site__fact">{fact}</li>)}</ul>}
    {app.privacy && <p className="oak-site__privacy">{app.privacy}</p>}
    <ul className="oak-site__rows">{app.pages.map(page => <li key={page.href}>
      <SiteLink to={page.href} className="oak-site__row"><span>{page.label}</span><Icon name="arrowRight" size={14} /></SiteLink></li>)}</ul>
  </SiteFrame>;
}
