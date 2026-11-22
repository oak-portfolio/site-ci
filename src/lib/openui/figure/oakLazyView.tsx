import * as React from "react";

/**
 * Fired on window when a lazy view replaces a ghost that drew something: the transcript keeps a reader at its end through
 * that growth only. An empty placeholder (`Ghost` null, or `drew` false for these props) never fires it.
 */
export const OAK_LAZY_LANDED = "oak:lazy-landed";

/**
 * A heavy view (Diagram, Explainer, EvidenceChart, the Screens viewer, Mermaid) loads in its own chunk: `Ghost` shows with
 * the same props until `load` resolves (null shows nothing; `drew` says when a Ghost that can render null drew something).
 * When the chunk fails to load (an old tab after a deploy), `Failed` renders with the same props instead, so the consumer
 * can open its list equivalent. Call once at module level so every render shares one lazy component.
 */
export function oakLazyView<P extends object>(load: () => Promise<{ default: React.ComponentType<P> }>, Ghost: React.ComponentType<P> | null,
  Failed: React.ComponentType<P>, drew: (props: P) => boolean = () => true) {
  const View = React.lazy(() => load().catch(() => ({ default: Failed })));
  const Shown = ({ ghost, props }: { ghost: React.RefObject<boolean>; props: P }) => {
    const visible = drew(props);
    React.useLayoutEffect(() => { if (visible) ghost.current = true; }, [ghost, visible]);
    return Ghost ? React.createElement(Ghost, props) : null;
  };
  const Landed = ({ ghost, props }: { ghost: React.RefObject<boolean>; props: P }) => {
    React.useLayoutEffect(() => {
      if (!ghost.current) return;
      ghost.current = false;
      window.dispatchEvent(new Event(OAK_LAZY_LANDED));
    }, [ghost]);
    return React.createElement(View, props);
  };
  return function OakLazyView(props: P) {
    const ghost = React.useRef(false);
    return <React.Suspense fallback={Ghost ? <Shown ghost={ghost} props={props} /> : null}><Landed ghost={ghost} props={props} /></React.Suspense>;
  };
}
