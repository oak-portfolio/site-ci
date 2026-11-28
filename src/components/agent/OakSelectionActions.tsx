import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { Toolbar, ToolbarButton, ToolbarSeparator } from "@/components/ui/toolbar";
import { oakMotion } from "@/lib/oakMotion";
import { showOakToast } from "@/lib/oakToasts";
import { addOakQuote, getOakWorkspace, setOakDraft } from "@/lib/oakWorkspace";

/** What Explain simply puts in the box beside the quote chip. The visitor still presses Send. */
export const OAK_EXPLAIN_PROMPT = "Explain this simply";

/** `text` is the selection with its spacing collapsed, for a quote; `raw` is exactly what was selected, for Copy (D139). */
/** `anchor` is the selection's centre; `x` is where the bar's centre lands once its measured width is kept inside the panel. */
type Picked = { text: string; raw: string; anchor: number; x: number; y: number; side: "top" | "bottom"; source?: string };

/** Room kept between the bar and the panel's reading edges. */
const edge = 8;

/** The answer a selection end sits in. A selection counts only when both ends share one, so it never sweeps up the visitor's own messages. */
function answerOf(root: HTMLElement, node: Node | null) {
  const element = node instanceof Element ? node : node?.parentElement;
  return element && root.contains(element) ? element.closest(".oak-turn__answer") : null;
}

/** M5 K2: body text right under the selection would sit beneath the bar, so the bar goes above it instead. */
function textBelow(answer: Element, x: number, y: number) {
  const below = document.elementFromPoint(x, y);
  return Boolean(below && answer.contains(below) && below.closest("p, li, blockquote, dd"));
}

/**
 * Words selected in one of Oak's answers get a small bar under their last line, or above their first when more of the
 * answer's text sits right below (ChatGPT's "Ask ChatGPT", Beautiful UI
 * SelectionActions): Ask about this stages them as a quote chip in the message box without sending (D123), Copy copies them. The bar keeps the
 * selection while it is pressed, and leaves when the selection collapses or on Escape. A transcript scroll re-reads the
 * selection instead of dropping the bar: Tab moves focus through the transcript, and that scroll used to dismiss the bar
 * before a keyboard reader could reach it (M5 keyboard panel K0). While focus is inside the bar it stays put.
 */
export function OakSelectionActions({ host, composer }: {
  host: React.RefObject<HTMLElement | null>; composer: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [picked, setPicked] = React.useState<Picked | null>(null);
  const bar = React.useRef<HTMLDivElement>(null);
  const pop = oakMotion("pop", useReducedMotion());
  React.useEffect(() => {
    const root = host.current;
    if (!root) return;
    let frame = 0;
    const read = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const selection = document.getSelection();
        const range = selection && selection.rangeCount && !selection.isCollapsed ? selection.getRangeAt(0) : null;
        const text = selection?.toString().replace(/\s+/g, " ").trim() ?? "";
        const answer = range ? answerOf(root, range.startContainer) : null;
        if (!range || text.length < 2 || !answer || answerOf(root, range.endContainer) !== answer) {
          if (!bar.current?.contains(document.activeElement)) setPicked(null);
          return;
        }
        const box = range.getBoundingClientRect(), last = [...range.getClientRects()].at(-1) ?? box, area = root.getBoundingClientRect();
        const source = answer.closest("[data-message-id]")?.getAttribute("data-message-id") ?? undefined;
        // Above only when the bar fits inside the scroller there; a line just under the header would put it under the header.
        const roomAbove = box.top - area.top >= (bar.current?.offsetHeight || 48) + 8;
        const side = roomAbove && textBelow(answer, last.left + Math.min(last.width, 24) / 2, last.bottom + 12) ? "top" : "bottom";
        const anchor = Math.round(box.left - area.left + box.width / 2);
        // Ticket 282: the bar stays inside the transcript's visible box, so words under its edge never put it over the message box row.
        const height = bar.current?.offsetHeight || 48;
        const top = side === "top" ? box.top - area.top + root.scrollTop - 8 - height : last.bottom - area.top + root.scrollTop + 8;
        const low = root.scrollTop + edge, high = Math.max(low, root.scrollTop + root.clientHeight - height - edge);
        const kept = Math.min(Math.max(top, low), high);
        setPicked({ text, raw: selection!.toString(), source, side, anchor, x: anchor, y: Math.round(side === "top" ? kept + height : kept) });
      });
    };
    document.addEventListener("selectionchange", read);
    root.addEventListener("scroll", read, true);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("selectionchange", read); root.removeEventListener("scroll", read, true); };
  }, [host]);
  // The bar's own measured size keeps it inside the panel, whatever its labels add up to (M5 #429 L1), and its real height
  // replaces the first read's guess, so its edge keeps the full gap from the scroller's (ticket 291).
  React.useLayoutEffect(() => {
    const node = bar.current, area = host.current;
    if (!picked || !node || !area) return;
    const half = node.offsetWidth / 2, room = area.clientWidth;
    const x = Math.round(half * 2 + 2 * edge >= room ? room / 2 : Math.min(Math.max(picked.anchor, half + edge), room - half - edge));
    const height = node.offsetHeight, lift = picked.side === "top" ? height : 0;
    const low = area.scrollTop + edge, high = Math.max(low, area.scrollTop + area.clientHeight - height - edge);
    const y = Math.round(Math.min(Math.max(picked.y - lift, low), high) + lift);
    if (x !== picked.x || y !== picked.y) setPicked({ ...picked, x, y });
  }, [picked, host]);
  // Escape drops the selection and the bar first, before the workspace would close.
  React.useEffect(() => {
    if (!picked) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      document.getSelection()?.removeAllRanges();
      setPicked(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [picked]);

  /** Stages the quote chip; `prefill` fills an empty box, or follows the visitor's own words, which are never replaced (D114). */
  const stage = (prefill?: string) => {
    if (!picked) return;
    // The draft keeps only what the visitor typed; the quote sits beside it and gives way when room is short (D114).
    const earlier = getOakWorkspace().draft;
    const typed = earlier.trimEnd();
    const prefilled = Boolean(prefill) && !typed.endsWith(prefill!);
    if (prefilled) setOakDraft(typed ? `${typed} ${prefill}` : prefill!);
    const added = addOakQuote(picked.text, picked.source);
    if (added !== "added") {
      if (prefilled) setOakDraft(earlier);
      showOakToast(added === "full" ? "selection-quotes-full" : "selection-no-room");
      setPicked(null);
      return;
    }
    document.getSelection()?.removeAllRanges();
    setPicked(null);
    requestAnimationFrame(() => {
      const box = composer.current;
      box?.focus({ preventScroll: true });
      box?.setSelectionRange(box.value.length, box.value.length);
    });
  };
  const ask = () => stage();
  const explain = () => stage(OAK_EXPLAIN_PROMPT);
  const copy = () => {
    if (!picked) return;
    void navigator.clipboard?.writeText(picked.raw).then(() => showOakToast("selection-copied"), () => {});
    document.getSelection()?.removeAllRanges();
    setPicked(null);
  };
  return <AnimatePresence>
    {picked ? <Toolbar key="pick" ref={bar} aria-label="Selected text" className="oak-pick" data-explain="" data-side={picked.side}
      style={{ "--oak-pick-x": `${picked.x}px`, "--oak-pick-y": `${picked.y}px` } as React.CSSProperties}
      // Pressing the bar must not collapse the selection it acts on.
      render={<motion.div onPointerDown={event => event.preventDefault()}
        initial={pop.initial} animate={pop.animate} exit={pop.exit} transition={pop.transition} />}>
      <ToolbarButton render={<Button type="button" variant="ghost" size="sm" />} onClick={ask}><Icon name="question" />Ask about this</ToolbarButton>
      <ToolbarSeparator />
      <ToolbarButton render={<Button type="button" variant="ghost" size="sm" />} onClick={explain}><Icon name="bulb" />Explain simply</ToolbarButton>
      <ToolbarSeparator />
      <ToolbarButton render={<Button type="button" variant="ghost" size="sm" />} onClick={copy}><Icon name="copy" />Copy</ToolbarButton>
    </Toolbar> : null}
  </AnimatePresence>;
}
