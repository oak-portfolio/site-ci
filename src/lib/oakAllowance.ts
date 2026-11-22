import type { OakWorkspaceState } from "./oakWorkspace";

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

type OakAllowance = NonNullable<NonNullable<OakWorkspaceState["authStatus"]>["allowance"]>;

/**
 * The rolling 30-day cap binds when it leaves fewer answers than the refilling allowance (ADR 0002), or when it is empty:
 * a refilled answer cannot be used until the window frees one. Every allowance line reads this one rule.
 */
export function oakAllowanceCapped(allowance: OakAllowance | null | undefined) {
  return Boolean(allowance && (allowance.window.remaining < allowance.answers.remaining || allowance.window.remaining === 0));
}

/** Q13: how a spent allowance comes back, true under the 30-day cap as well as on the 4-hour refill. */
export function oakAllowanceComesBack(allowance: OakAllowance | null | undefined) {
  return oakAllowanceCapped(allowance) ? "Each answer comes back 30 days after you used it." : "One comes back every 4 hours.";
}

/** The allowance that limits the visitor's next answer, from status the client already holds; null when unknown. */
export function oakAllowanceSummary(status: OakWorkspaceState["authStatus"]) {
  // The composer renders in every state, so a status without counts shows nothing instead of failing.
  if (!status?.allowance) return null;
  // Guests and signed-in visitors hold the same refilling allowance (ADR 0002); the 30-day cap binds only when lower.
  const { answers, window, granted = 0 } = status.allowance;
  const capped = oakAllowanceCapped(status.allowance);
  // Redeemed grant-code answers (P09-G1) sit on top of whatever the refilling allowance has left.
  const remaining = (capped ? window.remaining : answers.remaining) + granted, limit = (capped ? window.limit : answers.limit) + granted;
  const next = !capped && answers.refillsAt !== null ? ` Next one back at ${time(answers.refillsAt)}.` : "";
  // Q11-G1: under the 30-day cap the 4-hour refill no longer frees an answer; each one returns 30 days after it was used.
  const reset = capped ? "Each answer comes back 30 days after you used it."
    : answers.refillsAt !== null ? `Next answer back at ${time(answers.refillsAt)}.`
    : answers.remaining >= answers.limit ? "Full now. Answers you use come back one every 4 hours." : "One answer comes back every 4 hours.";
  return { remaining, limit,
    label: granted ? `of ${limit} answers left` : capped ? `of ${window.limit} left for 30 days` : `of ${answers.limit} answers left`,
    detail: `${remaining} of ${limit} answers left${capped ? " for 30 days" : ""}.${next}`,
    reset,
    note: `${capped ? window.remaining === 0 ? "You have reached the 30-day limit, so the 4-hour refill pauses. Each answer comes back 30 days after you used it." : "Your 30-day limit is lower than the refill now, so each answer comes back 30 days after you used it."
      : "One answer comes back every 4 hours."}${granted ? ` ${granted} came from a grant code.` : ""} Your OpenRouter account never uses them.`,
    // Q06/Q09: the funding panel's one line already says how answers refill, so only a grant needs its own footnote.
    grant: granted ? `${granted} of these came from a grant code.` : "" };
}

/** When paused sponsored answers open again: the next UTC day for today's pool, the next UTC month for the budget. */
export function oakBudgetReset(kind: "today" | "month", now = Date.now()) {
  const date = new Date(now);
  if (kind === "today") return `New questions open again at ${time(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1))}`;
  const first = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  return `New questions open again on ${new Date(first).toLocaleDateString([], { month: "long", day: "numeric" })} at ${time(first)}`;
}
