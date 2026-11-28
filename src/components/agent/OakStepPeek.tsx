import * as React from "react";
import { Icon } from "@/components/ui/Icon";
import type { OakToolStep } from "@/lib/oakToolSteps";
import type { OakConversationMessage } from "@/lib/oakWorkspace";

type PeekRow = Readonly<{ title: string; meta: string; url: string; web: boolean }>;
const fetchedDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const siteOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };

/** Ticket 26: what one finished step read. Records name their section, web pages their site and the day they were fetched. */
export function oakPeekRows(step: OakToolStep, research: OakConversationMessage["research"]): readonly PeekRow[] {
  if (step.operation === "research") return (research?.sources ?? []).slice(0, 5).map(source => ({ title: source.title, url: source.url, web: true,
    meta: `${siteOf(source.url)}, fetched ${fetchedDay.format(source.retrievedAt)}` }));
  return (step.passages ?? []).map(passage => ({ title: passage.title, meta: passage.section, url: passage.url, web: false }));
}

/** Closed by default; the list is `hidden` while closed, so its links leave the tab order and the reading order.
 * Ticket 277: a list folded behind "N more" ends on one count line (drawn rows plus "N more", the header's own count);
 * a whole list only repeats the header, so it prints none. */
export function OakStepPeek({ rows, more }: { rows: readonly PeekRow[]; more: number }) {
  const [open, setOpen] = React.useState(false);
  const list = React.useId();
  return <div className="oak-cot__peek" data-open={open ? "" : undefined}>
    <button type="button" className="oak-cot__peek-toggle" aria-expanded={open} aria-controls={list} onClick={() => setOpen(value => !value)}>
      What I read<Icon name="arrowDown" size={14} />
    </button>
    <ul id={list} className="oak-cot__peek-list" hidden={!open}>
      {rows.map((row, index) => <li key={index}>
        <a className="oak-cot__peek-link" href={row.url} target={row.web ? "_blank" : undefined} rel={row.web ? "noopener noreferrer" : undefined}>
          <span className="oak-cot__peek-title">{row.title}</span><span className="sr-only">, </span><span className="oak-cot__peek-meta">{row.meta}</span>
          {row.web ? <span className="sr-only"> (new tab)</span> : null}
        </a>
      </li>)}
      {more ? <li className="oak-cot__peek-more">{more} more</li> : null}
    </ul>
    {more ? <p className="oak-cot__peek-total" hidden={!open}>{rows.length + more} passages</p> : null}
  </div>;
}
