import * as React from "react";
import { Icon } from "@/components/ui/Icon";
import { useReturnFocus } from "../a11y/useReturnFocus";
import { ShotMedia, type ViewerProps } from "./ScreensView";

/** The in-place viewer: one screen whole, its caption the visitor can hide, Tab held inside, Escape back to the opener. */
export function ScreensViewer({ shots, index, opener, onClose, onIndex }: ViewerProps) {
  const [hidden, setHidden] = React.useState(false);
  const { ref, onKeyDown } = useReturnFocus(opener, onClose);
  React.useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest" });
    ref.current?.querySelector<HTMLElement>(".oak-screens-viewer__close")?.focus({ preventScroll: true });
  }, [ref]);
  const shot = shots[index]!;
  const step = (by: number) => onIndex(Math.min(shots.length - 1, Math.max(0, index + by)));
  const keys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return onKeyDown(event);
    const buttons = [...(ref.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? [])];
    const edge = event.shiftKey ? buttons[0] : buttons.at(-1);
    if (document.activeElement !== edge) return;
    event.preventDefault();
    (event.shiftKey ? buttons.at(-1) : buttons[0])?.focus();
  };
  return <div ref={ref} className="oak-screens-viewer" role="dialog" aria-modal="true" aria-label={shot.label} onKeyDown={keys}>
    <div className="oak-screens-viewer__bar">
      {shots.length > 1 ? <span className="oak-screens__count">{index + 1} of {shots.length}</span> : null}
      <button type="button" className="oak-screens-viewer__toggle" aria-pressed={hidden} onClick={() => setHidden(value => !value)}>
        <Icon name={hidden ? "view" : "viewOff"} size={16} />Hide caption</button>
      <button type="button" className="oak-screens-viewer__close oak-screens__arrow" aria-label="Close viewer" onClick={onClose}><Icon name="cancel" size={16} /></button>
    </div>
    <figure className="oak-screens-viewer__figure" aria-label={shot.label}>
      <ShotMedia shot={shot} className="oak-screens-viewer__media" />
      {hidden ? null : <figcaption className="oak-screens-viewer__caption">{shot.label}</figcaption>}
    </figure>
    {shots.length > 1 ? <div className="oak-screens__nav">
      <button type="button" className="oak-screens__arrow" aria-label="Previous screen" aria-disabled={index === 0} onClick={() => step(-1)}><Icon name="arrowLeft" size={16} /></button>
      <button type="button" className="oak-screens__arrow" aria-label="Next screen" aria-disabled={index === shots.length - 1} onClick={() => step(1)}><Icon name="arrowRight" size={16} /></button>
    </div> : null}
  </div>;
}

export default ScreensViewer;
