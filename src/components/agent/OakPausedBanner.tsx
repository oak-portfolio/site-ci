import { useEffect, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/Icon";
import { oakAllowanceCapped, oakAllowanceSummary } from "@/lib/oakAllowance";
import { oakPausedBannerOn } from "@/lib/oakFlags/pausedBanner";
import { getOakFundingServerState, getOakFundingState, subscribeOakFunding } from "@/lib/oakFundingSession";
import type { OakWorkspaceState } from "@/lib/oakWorkspace";

export const oakPausedBannerTitle = "You have used the answers available for now.";
export const oakPausedBannerAsk = "Ask again then, or contact Steve.";

export function oakPausedBannerView(status: OakWorkspaceState["authStatus"], now = Date.now()) {
  const summary = oakAllowanceSummary(status);
  if (!summary || summary.remaining > 0) return null;
  const returnsAt = status?.allowance && !oakAllowanceCapped(status.allowance) ? status.allowance.answers.refillsAt : null;
  if (returnsAt !== null && returnsAt <= now) return null;
  return { title: oakPausedBannerTitle, detail: `${summary.reset} ${oakPausedBannerAsk}`, returnsAt };
}

export function OakPausedBanner({ status }: { status: OakWorkspaceState["authStatus"] }) {
  const funding = useSyncExternalStore(subscribeOakFunding, getOakFundingState, getOakFundingServerState);
  const [now, setNow] = useState(Date.now);
  const view = oakPausedBannerOn() && funding.selected !== "visitor" ? oakPausedBannerView(status, now) : null;
  const returnsAt = view?.returnsAt ?? null;
  useEffect(() => {
    if (returnsAt === null) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, returnsAt - Date.now()));
    return () => clearTimeout(timer);
  }, [returnsAt]);
  if (!view) return null;
  return <div className="oak-turn__stopped oak-paused-banner" role="status" data-tone="limit">
    <span className="oak-turn__stopped-art oak-art-tile" aria-hidden="true"><Icon name="clock" /></span>
    <div className="oak-turn__stopped-body">
      <p className="oak-turn__stopped-title">{view.title}</p>
      <p className="oak-turn__stopped-detail">{view.detail}</p>
    </div>
  </div>;
}
