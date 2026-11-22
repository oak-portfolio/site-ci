import { defineComponent } from "@openuidev/react-lang";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Icon } from "@/components/ui/Icon";
import { oakRoleEntryCardOn, oakRoleEntryLinks } from "@/lib/oakFlags/roleEntryCard";
import { oakLinkedCaseStudy } from "../../../../packages/oak-agent-contracts/src/openui/plan";
import { CardClaims, CardLink, CardSkeleton, ClaimList, OakArt, useCard, usePending } from "../cards";
import { claimId, useScope } from "../scope";

/** "Feb 2026 - May 2026" -> "4 mos", "Jan 2024 - Jan 2025" -> "1 yr 1 mo": arithmetic on the page's own dates, or null. */
const OAK_JOB_WORD = /\b(?:engineer|designer|developer|manager|lead|founder|co-founder|assistant|consultant|architect|scientist|analyst|intern|owner|specialist|director|researcher|marketer|strategist|officer|head|president|cto|ceo|coo|cpo|vp|chief|partner|advisor|mentor|teacher|instructor|editor|writer|producer)\b/i;
const OAK_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export const oakRoleTitles = (title: string | undefined) => (title ?? "").split(/,\s+/).map(item => item.trim()).filter(Boolean)
  .reduce<string[]>((list, part) => list.length && !OAK_JOB_WORD.test(part) ? [...list.slice(0, -1), `${list.at(-1)} \u00b7 ${part}`] : [...list, part], []);
export function oakRoleDuration(period: string | undefined) {
  const parts = period?.split(/\s+[-\u2013\u2014]\s+|\s+to\s+/i);
  if (!parts || parts.length !== 2) return null;
  const at = (text: string) => { const m = text.trim().match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/); const month = m ? OAK_MONTHS.indexOf(m[1]!.toLowerCase()) : -1;
    return m && month >= 0 ? Number(m[2]) * 12 + month : null; };
  const start = at(parts[0]!), end = at(parts[1]!);
  if (start === null || end === null || end < start) return null;
  const months = end - start + 1, years = Math.floor(months / 12), rest = months % 12;
  return [years ? `${years} yr${years > 1 ? "s" : ""}` : "", rest ? `${rest} mo${rest > 1 ? "s" : ""}` : ""].filter(Boolean).join(" ");
}

/** R21 (Oak, review v18: "I don't like the date and month"): a role's years, "2026", "2024 \u2013 2025" or "2026 \u2013 Now". */
export function oakRoleYears(period: string | undefined) {
  const parts = period?.split(/\s+[-\u2013\u2014]\s+|\s+to\s+/i);
  if (!parts?.length) return null;
  const year = (text: string) => /present|now/i.test(text) ? "Now" : text.match(/\b(19|20)\d\d\b/)?.[0] ?? null;
  const start = year(parts[0]!), end = parts[1] ? year(parts[1]) : null;
  // A period it cannot read as years ("January to March 2026" names the year once) shows as the page wrote it.
  if (!start) return period?.trim() || null;
  if (parts.length > 1 && !end) return period!.trim();
  return !end || end === start ? start : `${start} \u2013 ${end}`;
}

/**
 * R19 (Oak, review v16, third flag: "still too amateur, make it more spacious, modern, intuitive and visual"; Mobbin
 * Wrangle and Figma Sites experience lists): roles read as one career timeline. Each role is a row on a rail: a monogram
 * tile for the employer, the employer as the headline with its dates and length on the right, the job titles as chips,
 * then the lead claim and quieter points. Roles that follow one another share one frame and one rail.
 * R20 (Oak, review v17, sixth flag: "use the images I used for each work experience and use those aspect ratios"): the
 * v14 flag was about one cover repeated on every row, not about role art, so each role now leads with its employer's own
 * timeline artwork, whole at its native shape (2000x1050), the way Apple Music and LinkedIn lead a row with its banner. A
 * role with no artwork keeps the monogram tile.
 */
export type RoleMode = "row" | "entry";

type Timeline = typeof import("@/data/careerTimeline");
let timeline: Timeline | null = null;
/** Ticket 42 (r42 M1): the timeline loads on demand, as Table's does, so the eager agent bundle does not carry it. */
export const loadOakRoleTimeline = () => import("@/data/careerTimeline").then(mod => (timeline = mod));

function useTimeline(want: boolean) {
  const [mod, setMod] = useState(timeline);
  useEffect(() => { if (want && !mod) void loadOakRoleTimeline().then(setMod, () => {}); }, [want, mod]);
  return want ? mod : null;
}

/** Ticket 42: the case study an approved row of ticket 30's table links this entry to, as the labels name it; else null. */
function useLinkedStudy(page: string | undefined) {
  const { cardOf } = useScope();
  const linked = page ? oakLinkedCaseStudy(page, oakRoleEntryLinks()) : null;
  if (!linked) return null;
  const url = `https://steveoak.com/work/${linked.replace(/^work:/, "")}/`;
  const source = cardOf?.({ id: linked, text: "", citations: [{ documentId: linked, passageId: linked, sectionId: linked, url }] });
  return source ? { title: source.card?.title ?? source.title, page: source.page, verified: source.verified } : null;
}

function RoleView({ claims: ids, mode }: { claims: string[]; mode?: RoleMode }) {
  const pending = usePending(ids);
  const { source, card, page, said, own, others } = useCard(ids, "role");
  const on = oakRoleEntryCardOn();
  const study = useLinkedStudy(on && mode === "entry" ? page : undefined);
  const career = useTimeline(on && !!page?.startsWith("experience:"));
  if (pending) return <CardSkeleton kind="role" />;
  if (!ids.length) return null;
  if (!source || !card) return <ClaimList ids={ids} />;
  const employer = card.place ?? source.title;
  // R19 review: a comma splits job titles only when every part names a job ("Agentic AI Engineer, Design Engineer"); a part
  // like "Forward Deployed" or "AI ML & Design Systems" is a qualifier, so that title stays whole as one chip.
  // R21 (Oak, review v18: "separate those titles smartly"): every comma part is its own chip; a qualifier with no job word
  // ("Forward Deployed") joins the title before it ("Design Engineer, Forward Deployed" reads as one role) unless it leads.
  // Ticket 214: the record row drops what the answer already says: the employer, the whole job title, or one title chip.
  const titles = said(card.title) ? [] : oakRoleTitles(card.title).filter(item => !said(item));
  const duration = oakRoleDuration(card.period);
  const years = oakRoleYears(card.period);
  const when = [years, duration].filter(Boolean).join(" \u00b7 ");
  const named = !said(employer) || !when;
  // Ticket 42: situation tags are the entry's employment engagements and credentials its education contexts, from the timeline only.
  const entry = career?.careerTimelineItems.find(item => item.id === page!.slice("experience:".length));
  const tags = [...new Set(entry?.contexts.filter(context => context.type === "employment").map(career!.careerContextMetadata) ?? [])];
  const creds = entry?.contexts.filter(context => context.type === "education") ?? [];
  const framed = on && mode === "entry";
  return <><article className="oak-openui-card oak-openui-role" data-art={card.image ? "" : undefined} data-entry={framed ? "" : undefined}>
    {framed ? <p className="oak-openui-role__frame-head"><Icon name="workHistory" size={16} /><span>From the career timeline</span></p> : null}
    {card.image ? <OakArt className="oak-openui-role__art" src={card.image} alt="" ratio={card.imageRatio} />
      : <span className="oak-openui-role__tile" aria-hidden="true">{employer.trim().charAt(0).toUpperCase()}</span>}
    <div className="oak-openui-role__body">
      <CardClaims ids={own} page={page} about={employer}>
        <div className="oak-openui-role__head">
          {named ? <h4 className="oak-openui-card__title oak-openui-role__employer"><CardLink to={source.page} verified={source.verified}>{employer}</CardLink></h4>
            : <h4 className="oak-openui-card__title oak-openui-role__employer" data-said=""><CardLink to={source.page} verified={source.verified} label={employer}>{when}</CardLink></h4>}
          {named && when ? <p className="oak-openui-role__when">{when}</p> : null}
        </div>
        {titles.length ? <ul className="oak-openui-chips oak-openui-role__titles" aria-label="Role">{titles.map(item => <li key={item} className="oak-openui-chip">{item}</li>)}</ul> : null}
        {tags.length ? <ul className="oak-openui-chips oak-openui-role__tags" aria-label="Situation">{tags.map(tag => <li key={tag} className="oak-openui-chip" data-tag="">{tag}</li>)}</ul> : null}
        {creds.length ? <ul className="oak-openui-role__creds" aria-label="Credentials">{creds.map(cred => <li key={cred.title} className="oak-openui-role__cred">
          <span className="oak-openui-role__cred-tile" aria-hidden="true"><Icon name="bookOpenText" size={14} /></span>
          <span className="oak-openui-role__cred-label">{cred.title}</span><span className="oak-openui-role__cred-value">{career!.careerContextMetadata(cred)}</span></li>)}</ul> : null}
      </CardClaims>
    </div>
    {framed && study ? <p className="oak-openui-role__bridge"><Icon name="link" size={14} />
      <span>This entry links to the <CardLink to={study.page} verified={study.verified}>{study.title}</CardLink> case study</span></p> : null}
  </article><ClaimList ids={others} /></>;
}

export const Role = defineComponent({
  name: "Role",
  description: "When the visitor asks about Steve's role at an employer or where he worked on something: shows that role from his timeline as a card, with the claims from its experience page under its title, dates and place. The rest of the answer keeps its usual blocks. Mode \"entry\" frames it as the career entry the answer cites.",
  props: z.object({ claims: z.array(claimId), mode: z.enum(["row", "entry"]).optional() }),
  component: ({ props }) => <RoleView claims={props.claims} mode={props.mode} />,
});
