import * as React from "react";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Icon, type IconName } from "@/components/ui/Icon";
import { oakSiteInventory } from "@/data/oakSiteInventory";
import { requestOakWorkspace, setOakDraft } from "@/lib/oakWorkspace";
import { scrollToOakSection } from "@/lib/oakFlags/commandPalette";
import { wrapTab } from "@/lib/oakFocusWrap";
import "@/styles/palette.css";

export type OakPaletteRecent = Readonly<{ href: string; label: string; group: string }>;
type Row = Readonly<{ id: string; label: string; icon: IconName; kind: "ask" | "link"; href?: string; detail?: string; draft?: string }>;
type Group = Readonly<{ label: string; items: Row[] }>;

export const oakPaletteFieldName = "Search without asking";

// shortcut: hand-kept like oakSiteInventory; command-palette.test.mjs fails when a Work case study is added or renamed.
export const oakPaletteProjects = [
  { slug: "ecosmartloop", name: "EcoSmartLoop" },
  { slug: "agentic-brain", name: "Agentic Brain" },
  { slug: "oakminder", name: "Oakminder" },
  { slug: "linkedin-growth-loop", name: "LinkedIn Growth Loop" },
  { slug: "omnisocial", name: "OmniSocial" },
] as const;

const pages: Row[] = oakSiteInventory.map((page) => ({ id: `page:${page.path}`, label: page.title, icon: page.path === "/" ? "globe" : "briefcase", kind: "link", href: page.path }));
const sections: Row[] = oakSiteInventory.flatMap((page) => page.sections.map((section) => ({
  id: `section:${section.tag}`, label: section.title, detail: page.title, icon: "bookOpenText" as const, kind: "link" as const, href: `${page.path}#${section.tag}` })));
const projects: Row[] = oakPaletteProjects.map(({ slug, name }) => ({ id: `project:${slug}`, label: name, detail: "Case study", icon: "workHistory", kind: "link", href: `/work/${slug}/` }));

/** Ask Oak AI first, Recent while the field is empty, then every matching link group, and the page's own Ask row last. */
export function oakPaletteGroups(query: string, pathname: string, recent: readonly OakPaletteRecent[]): Group[] {
  const q = query.trim();
  const needle = q.toLowerCase();
  const match = (row: Row) => !needle || `${row.label} ${row.detail ?? ""}`.toLowerCase().includes(needle);
  const ask: Row = { id: "ask", label: q ? `Ask Oak AI about \u201c${q}\u201d` : "Ask Oak AI", icon: "aiChat", kind: "ask", draft: q || undefined };
  const groups: Group[] = [
    { label: "Ask", items: [ask] },
    { label: "Recent", items: q ? [] : recent.slice(0, 3).map((item) => ({ id: `recent:${item.href}`, label: item.label, detail: item.group, icon: "history", kind: "link", href: item.href })) },
    { label: "Pages", items: pages.filter(match) },
    { label: "Sections", items: sections.filter(match) },
    { label: "Projects", items: projects.filter(match) },
    { label: "This page", items: [{ id: `ask:${pathname}`, label: "Ask about this page", icon: "followUp", kind: "ask" }] },
  ];
  return groups.filter((group) => group.items.length);
}

export function oakPaletteStatus(groups: readonly Group[]) {
  const count = groups.flatMap((group) => group.items).filter((row) => row.kind === "link").length;
  return count ? `${count} ${count === 1 ? "result" : "results"}` : "No results";
}

const recentKey = "oak-palette-recent";

const isRecent = (item: unknown): item is OakPaletteRecent => {
  const { href, label, group } = (item ?? {}) as Record<string, unknown>;
  return typeof href === "string" && /^\/(?![/\\])/.test(href) && typeof label === "string" && typeof group === "string";
};

/** Session storage is untrusted: only a list of at most 3 same-site paths counts, anything else reads as empty. */
export function oakPaletteParseRecent(raw: string | null): OakPaletteRecent[] {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(value) && value.length <= 3 && value.every(isRecent) ? value : [];
  } catch { return []; }
}

function readRecent(): OakPaletteRecent[] {
  try { return oakPaletteParseRecent(sessionStorage.getItem(recentKey)); } catch { return []; }
}

function remember(row: Row, group: string) {
  if (!row.href) return;
  const next = [{ href: row.href, label: row.label, group: row.detail && group === "Recent" ? row.detail : group },
    ...readRecent().filter((item) => item.href !== row.href)].slice(0, 3);
  try { sessionStorage.setItem(recentKey, JSON.stringify(next)); } catch { /* private mode keeps no recents */ }
}

type PaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opener: React.RefObject<HTMLElement | null>;
  container?: React.RefObject<HTMLElement | null>;
};

export function OakCommandPalette({ open, onOpenChange, opener, container }: PaletteProps) {
  const [query, setQuery] = React.useState("");
  const [recent, setRecent] = React.useState<OakPaletteRecent[]>([]);
  const input = React.useRef<HTMLInputElement | null>(null);
  const box = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    setRecent(readRecent());
  }, [open]);
  const pathname = typeof location === "undefined" ? "/" : location.pathname;
  const groups = oakPaletteGroups(query, pathname, recent);
  const empty = Boolean(query.trim()) && !groups.some((group) => group.items.some((row) => row.kind === "link"));

  const holdTab = (event: React.KeyboardEvent) => { if (box.current) wrapTab(event, box.current); };
  // Base UI highlights only from the input or the pointer; its own hover path puts the highlight on the row Tab focused.
  const highlight = (row: HTMLElement) => { if (!row.hasAttribute("data-highlighted")) row.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, movementX: 1 })); };
  // Base UI moves its highlight on ArrowUp and ArrowDown from a focused row too, and stops the event; focus follows it so fill and focus stay one row (r192 P3-3).
  const followArrow = (event: React.KeyboardEvent) => {
    const row = event.target as HTMLElement;
    if ((event.key !== "ArrowDown" && event.key !== "ArrowUp") || !row.classList.contains("oak-palette__row")) return;
    highlight(row);
    requestAnimationFrame(() => box.current?.querySelector<HTMLElement>(".oak-palette__row[data-highlighted]")?.focus());
  };

  const choose = (row: Row, group: string, event: React.MouseEvent) => {
    onOpenChange(false);
    if (row.kind === "ask") {
      event.preventDefault();
      if (row.draft) setOakDraft(row.draft);
      requestOakWorkspace(opener.current);
      return;
    }
    remember(row, group);
    const url = new URL(row.href!, location.href);
    if (url.pathname.replace(/\/$/, "") === location.pathname.replace(/\/$/, "") && url.hash) {
      event.preventDefault();
      history.replaceState(history.state, "", url.hash);
      scrollToOakSection(url.hash);
    }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent open={open} container={container} initialFocus={input} finalFocus={opener}>
      <div ref={box} className="oak-palette" onKeyDown={holdTab} onKeyDownCapture={followArrow}>
      <DialogTitle>Search the site</DialogTitle>
      <Autocomplete.Root open inline items={groups} filteredItems={groups} filter={null} autoHighlight="always" keepHighlight
        value={query} onValueChange={(next, details) => { if (details.reason !== "item-press") setQuery(next); }}>
        <div className="oak-palette__field">
          <Icon name="search" size={18} className="oak-palette__glyph" />
          <Autocomplete.Input ref={input} className="oak-palette__input" aria-label={oakPaletteFieldName}
            placeholder="Search pages, sections, projects" />
          {query ? <button type="button" className="oak-palette__clear" aria-label="Clear search" onClick={() => { setQuery(""); input.current?.focus(); }}>
            <Icon name="cancel" size={16} />
          </button> : null}
          <button type="button" className="oak-palette__cancel" onClick={() => onOpenChange(false)}>Cancel</button>
        </div>
        <Autocomplete.Status className="sr-only">{oakPaletteStatus(groups)}</Autocomplete.Status>
        {empty ? <div className="oak-palette__empty">
          <Icon name="search" size={20} />
          <p className="oak-palette__empty-title">No matches for &ldquo;{query.trim()}&rdquo;</p>
          <p className="oak-palette__empty-hint">Try a project name, or ask Oak AI below.</p>
          <button type="button" className="oak-palette__empty-clear" onClick={() => { setQuery(""); input.current?.focus(); }}>Clear search</button>
        </div> : null}
        <Autocomplete.List className="oak-palette__list">
          {(group: Group) => <Autocomplete.Group key={group.label} items={group.items} className="oak-palette__group">
            {group.label === "Ask" || group.label === "This page" ? null
              : <Autocomplete.GroupLabel className="oak-palette__group-label">{group.label}</Autocomplete.GroupLabel>}
            <Autocomplete.Collection>
              {(row: Row) => <Autocomplete.Item key={row.id} value={row} className="oak-palette__row" data-kind={row.kind}
                render={row.href ? <a href={row.href} /> : <div />} onFocus={(event: React.FocusEvent<HTMLElement>) => highlight(event.currentTarget)} onClick={(event: React.MouseEvent) => choose(row, group.label, event)}>
                <Icon name={row.icon} size={18} className="oak-palette__icon" />
                <span className="oak-palette__label">{row.label}</span>
                {row.detail ? <span className="oak-palette__detail">{row.detail}</span> : null}
                <span className="oak-palette__enter" aria-hidden="true">Open <kbd>&crarr;</kbd></span>
                <Icon name="chevronRight" size={16} className="oak-palette__chevron" />
              </Autocomplete.Item>}
            </Autocomplete.Collection>
          </Autocomplete.Group>}
        </Autocomplete.List>
        <footer className="oak-palette__footer">
          <Icon name="checkmark" size={16} />
          <span>No AI needed</span>
          <span className="oak-palette__keys">Up and down to move, Enter to open</span>
        </footer>
      </Autocomplete.Root>
      </div>
    </DialogContent>
  </Dialog>;
}
