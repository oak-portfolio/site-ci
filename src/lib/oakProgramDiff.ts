import { oakOpenUIStatements } from "../../packages/oak-agent-contracts/src/openui/verdict";

export type OakProgramDiff = Readonly<{ kept: readonly string[]; dropped: readonly string[]; added: readonly string[] }>;

/** The root and the rows a block draws inside itself are parts of a block, not blocks a visitor would name. */
const parts = new Set(["Answer", "CompareRow", "TimelineItem", "Source", "Metric", "Meter"]);
const words: Readonly<Record<string, string>> = { Pills: "related questions", Prose: "paragraph" };
const plain = (component: string) => words[component] ?? component.replace(/(?<=[a-z])(?=[A-Z])/g, " ").toLowerCase();

function blockKinds(program: string) {
  const statements = oakOpenUIStatements(program);
  return statements && statements.filter(statement => !parts.has(statement.component)).map(statement => plain(statement.component));
}

/** The blocks of `from` left over once each block of `take` has claimed one of its own kind. */
function unmatched(from: readonly string[], take: readonly string[]) {
  const left = [...take];
  return from.filter(kind => {
    const at = left.indexOf(kind);
    if (at < 0) return true;
    left.splice(at, 1);
    return false;
  });
}

/**
 * Ticket 56: the block kinds two answer programs share, and the blocks only one has, counted per kind (two projects to one
 * drops a project), in plain words and program order. Only component names are read, so no claim text or block title can
 * reach the note. Null when there is no previous program, the program is unchanged, or either does not parse.
 */
export function oakProgramDiff(previous: string | null | undefined, next: string | null | undefined): OakProgramDiff | null {
  if (!previous || !next || previous.trim() === next.trim()) return null;
  const before = blockKinds(previous), after = blockKinds(next);
  if (!before || !after) return null;
  return { kept: [...new Set(after.filter(kind => before.includes(kind)))], dropped: unmatched(before, after), added: unmatched(after, before) };
}
