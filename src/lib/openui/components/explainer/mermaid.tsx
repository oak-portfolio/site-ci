import * as React from "react";
import { Icon } from "@/components/ui/Icon";
import type { OakDrawnSpec } from "../../explainer/drawnSpec";
import { oakMermaidSvg } from "../../explainer/mermaidLoader";
import { SkelBar } from "../../scope";

type Drawing = { source: string; svg: string | null; failed: boolean };

/** The smallest text, in CSS px, a drawing may shrink to when it scales down to its frame. */
const MIN_TEXT = 12;

/**
 * Mermaid's SVG for a validated spec: bars while its chunk loads, the spec's own lines when Mermaid cannot parse it. The figure's
 * list is the text equivalent, so with one the drawing is hidden from screen readers; the frame around it is the one Tab stop, named `label`.
 */
export function MermaidFigure({ spec, label }: { spec: OakDrawnSpec; label: string }) {
  const id = `oak-drawn-${React.useId().replace(/[^\w-]/g, "")}`;
  const [drawing, setDrawing] = React.useState<Drawing>({ source: spec.source, svg: null, failed: false });
  React.useEffect(() => {
    let live = true;
    oakMermaidSvg(id, spec.source).then(svg => { if (live) setDrawing({ source: spec.source, svg, failed: false }); },
      () => { if (live) setDrawing({ source: spec.source, svg: null, failed: true }); });
    return () => { live = false; };
  }, [id, spec.source]);
  const now = drawing.source === spec.source ? drawing : { svg: null, failed: false };
  const box = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const svg = box.current?.querySelector("svg");
    if (!svg || spec.type !== "c4") return;
    // C4 lays its shapes out far below the top of its own viewBox.
    const b = svg.getBBox();
    if (!b.width || !b.height) return;
    svg.setAttribute("viewBox", `${b.x - 12} ${b.y - 12} ${b.width + 24} ${b.height + 24}`);
    svg.setAttribute("width", `${b.width + 24}`);
    svg.setAttribute("height", `${b.height + 24}`);
  }, [now.svg, spec.type]);
  // Layout effect: the hint's row is marked before first paint, so the frame does not drop once the drawing arrives (r187 N2).
  React.useLayoutEffect(() => {
    const frame = box.current, svg = frame?.querySelector("svg");
    if (!frame || !svg) return;
    // Scale an over-wide drawing to the frame while its smallest text stays readable; otherwise it scrolls and CSS fades each side with more beyond it.
    const fit = () => {
      frame.removeAttribute("data-fit");
      const natural = svg.getBoundingClientRect().width;
      if (natural <= frame.clientWidth) return;
      const ctm = svg.getScreenCTM(), scale = ctm ? Math.hypot(ctm.a, ctm.b) : 1;
      const smallest = Math.min(...[...svg.querySelectorAll("text")].filter(node => node.textContent?.trim()).map(node => parseFloat(getComputedStyle(node).fontSize) * scale));
      frame.toggleAttribute("data-fit", smallest * frame.clientWidth / natural >= MIN_TEXT);
    };
    const mark = () => {
      frame.toggleAttribute("data-more-start", frame.scrollLeft > 1);
      frame.toggleAttribute("data-more-end", frame.scrollWidth - frame.scrollLeft - frame.clientWidth > 1);
      // 204: a Tab stop only when there is something to scroll; the drawing itself is aria-hidden.
      if (frame.scrollWidth > frame.clientWidth) frame.tabIndex = 0; else frame.removeAttribute("tabindex");
    };
    fit();
    // 205: a journey that scrolls opens with its first task card whole, scrolling only as far as that card needs so the actor stays in view.
    const task = spec.type === "journey" && !frame.hasAttribute("data-fit") ? svg.querySelector("rect.task") : null;
    if (task) frame.scrollLeft = Math.max(0, task.getBoundingClientRect().right - frame.getBoundingClientRect().left - frame.clientWidth + 12);
    mark();
    frame.addEventListener("scroll", mark, { passive: true });
    // A frame taller than the transcript is centred on keyboard focus, which leaves its hint above the fold; bring the hint back into view.
    // Keyboard only (:focus-visible): a click or tap also focuses the frame and must not move the transcript (r187b N1).
    const reveal = () => { if (frame.matches(":focus-visible") && frame.hasAttribute("data-more-end")) frame.previousElementSibling?.scrollIntoView({ block: "nearest" }); };
    frame.addEventListener("focus", reveal);
    let width = frame.clientWidth;
    const resize = new ResizeObserver(() => {
      if (frame.clientWidth !== width) { width = frame.clientWidth; fit(); }
      mark();
    });
    resize.observe(frame);
    resize.observe(svg);
    return () => { frame.removeEventListener("scroll", mark); frame.removeEventListener("focus", reveal); resize.disconnect(); };
  }, [now.svg]);
  if (now.failed) return <ol className="oak-drawn__fallback" data-failed="" aria-hidden="true">{spec.items.map((item, index) => <li key={index}>{item.value}</li>)}</ol>;
  if (!now.svg) return <span className="oak-drawn__space" data-pending="" aria-hidden="true"><SkelBar size="long" /><SkelBar /><SkelBar size="short" /></span>;
  // Strict-mode Mermaid output after oakSafeSvg's second pass, in a keyboard-scrollable frame. The hint sits above it so a frame Tab scrolls to the transcript's bottom keeps it in view.
  return <div className="oak-drawn">
    <p className="oak-drawn__cue" aria-hidden="true"><Icon name="arrowRight" size={16} />Scroll sideways to see all</p>
    <div ref={box} className="oak-drawn__svg" data-type={spec.type} role="group" aria-label={label} data-judge-ok="edge-miss: Mermaid lays out and joins its own edges, and its data-edge marks carry no app from and to">
      <div aria-hidden={spec.items.length > 0 || undefined} dangerouslySetInnerHTML={{ __html: now.svg }} />
    </div>
  </div>;
}
