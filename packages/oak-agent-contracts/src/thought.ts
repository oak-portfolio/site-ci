import { OAK_THOUGHT_LIMITS } from './transport.ts';

/** The model's summaries say "the user"; Oak talks to the visitor, so they read as "you". Longest phrases first. */
const secondPerson: readonly [RegExp, string][] = [
  [/\bthe user's\b/gi, 'your'], [/\bthe user is\b/gi, 'you are'], [/\bthe user was\b/gi, 'you were'], [/\bthe user has\b/gi, 'you have'],
  [/\bthe user wants\b/gi, 'you want'], [/\bthe user needs\b/gi, 'you need'], [/\bthe user asks\b/gi, 'you ask'], [/\bthe user\b/gi, 'you'],
  [/\buser's\b/gi, 'your'],
];

const clip = (value: string, limit: number) => value.length <= limit ? value : `${value.slice(0, limit - 1).replace(/\s+\S*$/, '')}…`;

/** Retrieval words the visitor never needs: what Oak read are its sources. */
const plainWords: readonly [RegExp, string][] = [
  [/\bretrieved (?:excerpts|passages|sources)\b/gi, 'sources I found'], [/\bretrieved (?:excerpt|passage|source)\b/gi, 'source I found'],
  [/\b(?:excerpts|passages|snippets)\b/gi, 'sources'], [/\b(?:excerpt|passage|snippet)\b/gi, 'source'],
];

/**
 * A summary about the answer's own machinery (schema fields, citation rules, IDs, offsets, instructions) is Oak talking to
 * itself, not to the visitor. The Worker never shows one, and takes back a block that turns out to be one.
 */
const internal = new RegExp([
  String.raw`passage\s?ids?`, String.raw`passageids?`, String.raw`\bids?\b`, String.raw`acknowledge?ments?`, String.raw`\bnull\b`,
  String.raw`\bschema`, String.raw`\bjson\b`, String.raw`sentinel`, String.raw`\boffsets?\b`, String.raw`\bcanonical\b`,
  String.raw`system prompt`, String.raw`\binstructions?\b`, String.raw`\brules?\b`, String.raw`\bguidelines?\b`, String.raw`\bpolicy\b`,
  String.raw`citation (?:rules?|requirements?|format|logic)`, String.raw`citing (?:rules?|requirements?)`, String.raw`gap (?:statements?|logic|handling)`,
  String.raw`output format`, String.raw`(?:answer|output|response) (?:format|structure|kind|field)`, String.raw`tool ?calls?`, String.raw`\bexposed\b`,
  String.raw`kind (?:gap|sourced|advice|role-fit)`, String.raw`\bfacet\b`, String.raw`verbatim`,
  String.raw`\b(?:read|search|navigate|draft) (?:versus|vs\.?|or) (?:read|search|navigate|draft)\b`, String.raw`\bnavigat(?:e|ion) (?:card|tool)s?\b`,
  String.raw`\b(?:read|search|navigate|draft) tool\b`, String.raw`tool (?:functionality|choice|selection|usage)`, String.raw`(?:selecting|choosing|picking) (?:a |the |which )?tools?\b`,
  String.raw`\bindic(?:es|ex)\b`, String.raw`\bindex(?:es)?\b`, String.raw`\b(?:text|character|quote|string) (?:length|limits?|counts?|indices|boundar\w*)`,
  String.raw`\btextual (?:boundar\w*|accuracy|match\w*)`,
].join('|'), 'i');
export function oakThoughtIsInternal(value: { title: string; text: string }): boolean {
  return internal.test(value.title) || internal.test(value.text);
}

/**
 * One reasoning summary as the visitor sees it: Gemini opens each summary with a bold title line, then a short first-person
 * paragraph. Control characters go, Markdown emphasis marks go, "the user" becomes "you", and both parts are capped.
 */
export function oakThought(raw: string): { title: string; text: string } {
  let text = raw.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\r\n?/g, '\n');
  let title = '';
  const heading = text.match(/^\s*\*\*([^*\n]{1,200})\*\*\s*\n?/);
  if (heading) { title = heading[1].trim(); text = text.slice(heading[0].length); }
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|\s)\*([^*\n]+)\*(?=\s|$)/g, '$1$2').replace(/`([^`\n]*)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n').trim();
  for (const [pattern, replacement] of secondPerson) text = text.replace(pattern, replacement);
  for (const [pattern, replacement] of plainWords) { text = text.replace(pattern, replacement); title = title.replace(pattern, replacement); }
  // A sentence that now starts with a lowercase "you" or "your" keeps its capital.
  text = text.replace(/(^|[.!?]\s+)(you|your)\b/g, (_, lead: string, word: string) => lead + word[0].toUpperCase() + word.slice(1));
  return { title: clip(title, OAK_THOUGHT_LIMITS.title), text: clip(text, OAK_THOUGHT_LIMITS.text) };
}
