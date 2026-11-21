import * as React from "react";
import { OakMascot } from "@/components/OakMascot";
import { useOakWorkspace } from "@/lib/oakWorkspace";

// Keep the existing island identity while retiring the alternate reader surface.
export function HumanMachineMode({ currentPath }: { currentPath?: string }) {
  const workspace = useOakWorkspace();
  const [routePath, setRoutePath] = React.useState(currentPath ?? "/");
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const updateRoutePath = () => {
      const isNotFoundPage = document.querySelector("[data-oak-section='404.hero']") !== null;
      setRoutePath(isNotFoundPage ? "/404" : window.location.pathname || "/");
    };
    setMounted(true);
    updateRoutePath();
    document.addEventListener("astro:after-swap", updateRoutePath);
    document.addEventListener("astro:page-load", updateRoutePath);
    return () => {
      document.removeEventListener("astro:after-swap", updateRoutePath);
      document.removeEventListener("astro:page-load", updateRoutePath);
    };
  }, []);
  return (
    <div className="oak-browse-chrome">
      {mounted && workspace.mascotEligible ? (
        <OakMascot key={routePath} currentPath={routePath}
          enabled={workspace.presentation === "human-browse" && !workspace.overlayActive} />
      ) : null}
    </div>
  );
}
