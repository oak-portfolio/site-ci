import { z } from 'zod';

/** Public templates only. No visitor text is interpolated into provider requests. */
export const publicResearchTopics = {
  'ai-sdk-streaming': { label: 'Current AI SDK streaming guidance', query: 'AI SDK current UI message streaming and cancellation official documentation', domains: ['ai-sdk.dev'] },
  'astro-react-islands': { label: 'Current Astro React island guidance', query: 'Astro current React client islands hydration official documentation', domains: ['docs.astro.build'] },
  'workers-limits': { label: 'Current Cloudflare Workers limits', query: 'Cloudflare Workers current runtime resource limits official documentation', domains: ['developers.cloudflare.com'] },
} as const;
export const publicResearchTopicIds = ['ai-sdk-streaming', 'astro-react-islands', 'workers-limits'] as const;
export type PublicResearchTopicId = typeof publicResearchTopicIds[number];
/**
 * R19 (Oak, 2026-10-22): "Sometimes just sources from current case studies are not enough", so an open web search may follow a
 * work answer. Its topic id appears only on research events the Worker emits; a browser can never request it, so the request
 * schema below keeps the three fixed topics.
 */
export const openWebResearchTopicId = 'web' as const;
export const researchTopicIds = [...publicResearchTopicIds, openWebResearchTopicId] as const;
export type ResearchTopicId = typeof researchTopicIds[number];
export const openWebResearchLabel = 'From the web, not Steve’s pages' as const;
/** The card's note under its "From the web" title, so the label reads once (title + note) rather than twice. */
export const openWebResearchNote = 'Not Steve’s pages. Check a source before relying on a detail.' as const;

/**
 * ARCH@31 (R19): one plan decides what a turn's research sends, whichever adapter made it. The fixed topics send their template
 * query to their docs domain; the open web topic sends a scrubbed query with no domain allowlist (`domains: null`). The
 * runtime and the trace both read this plan, so what is traced is exactly what was sent.
 */
export type PublicResearchPlan = Readonly<{ topicId: ResearchTopicId; query: string; domains: readonly string[] | null; recent?: true;
  /** An open web plan's company lookup, sent alongside it when the visitor's session still has its one lookup. The trace
   * records it (query and domains) only on a turn that actually sent it to Exa, not one served from the cache or skipped. */
  lookup?: PublicResearchPlan }>;
const recentQuestion = /\b(?:current(?:ly)?|latest|newest|today|nowadays|these days|recent(?:ly)?|right now|up to date|state of the art|this (?:week|month|year))\b/i;
const recentFlag = (text: string) => recentQuestion.test(text) ? { recent: true as const } : {};
export const COMPANY_LOOKUP_NAME_CHARS = 60;
const companyLookupBlocked = /(?:^|\.)(?:linkedin\.com|facebook\.com|instagram\.com|tiktok\.com|x\.com|twitter\.com|threads\.net|youtube\.com|youtu\.be|reddit\.com|pinterest\.com|snapchat\.com|bsky\.app|mastodon\.social|linktr\.ee|about\.me|github\.com|medium\.com|substack\.com)$/;
const steveOwnHosts = ['steveoak.com', 'independent-performance-642823.framer.app'] as const;
const steveOwnSite = (value: string) => /steveoak|okkar/.test(value) || steveOwnHosts.some(host => value === host || value.endsWith(`.${host}`));
const schoolOrStateSite = /(?:^|\.)(?:edu|gov|mil)(?:\.[a-z]{2})?$|(?:^|\.)ac\.[a-z]{2}$/;
export function isCompanySiteDomain(value: string) {
  return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(value) && isOpenWebUrl(`https://${value}/`) && !companyLookupBlocked.test(value) &&
    !steveOwnSite(value) && !schoolOrStateSite.test(value);
}
export function companyLookupName(raw: string): string | null {
  const name = raw.normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, COMPANY_LOOKUP_NAME_CHARS).trim();
  return name.length >= 3 && !/steve|okkar|\boak\b/i.test(name) ? name : null;
}
export function companyLookupPlan(name: string, domain: string): PublicResearchPlan | null {
  const query = companyLookupName(name), site = domain.trim().toLowerCase();
  return query && isCompanySiteDomain(site) ? { topicId: openWebResearchTopicId, query, domains: [site] } : null;
}
export const isCompanyLookupPlan = (plan: PublicResearchPlan) => plan.topicId === openWebResearchTopicId && plan.domains !== null;
const be = String.raw`(?:['\u2019]m|['\u2019]re| am| are)`, roleWords = String.raw`(?:[A-Za-z0-9]+\s+){0,5}?`;
const worksAt = String.raw`(?:I|[Ww]e)${be}?\s+(?:currently\s+)?work(?:ing)?\s+at`;
const hiresAt = String.raw`(?:I|[Ww]e)${be}?\s+(?:hiring|recruiting)\s+${roleWords}(?:at|for)`;
const roleAt = String.raw`(?:I|[Ww]e)${be}\s+(?:an?|the)\s+${roleWords}at`;
const companyIs = String.raw`(?:[Mm]y|[Oo]ur)\s+(?:company|employer|startup)\s+is`;
const capitalizedName = String.raw`([A-Z][A-Za-z0-9&]*(?:[ -](?!I\b)[A-Z][A-Za-z0-9&]*){0,2})(?![A-Za-z0-9&'\u2019-])`;
const visitorCompanyPattern = new RegExp(String.raw`\b(?:${worksAt}|${hiresAt}|${roleAt}|${companyIs})\s+${capitalizedName}`);
const schoolWords = /\b(?:students?|undergrad\w*|alumn\w*|pupils?|professors?|lecturers?|faculty|universit\w*|colleges?|schools?|institutes?|academy)\b/i;
const statedDomains = (text: string) => [...text.toLowerCase().matchAll(/\b(?:[a-z0-9-]+\.)+[a-z]{2,24}\b/g)]
  .map(match => match[0].replace(/^www\./, '')).filter(domain => !/\.js$/.test(domain));
function visitorCompany(text: string): { name: string; domain: string } | null {
  const match = text.match(visitorCompanyPattern), query = match?.[1] ? companyLookupName(match[1]) : null;
  if (!match || !query || schoolWords.test(match[0])) return null;
  const collapsed = query.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''), first = query.toLowerCase().split(' ')[0]!;
  const domain = statedDomains(text).find(stated => stated.split('.').slice(0, -1).some(label => label === collapsed || first.length >= 3 && label === first));
  return domain && isCompanySiteDomain(domain) ? { name: query, domain } : null;
}
function companyPlan(taskKind: string, turn: SettledResearchTurn): PublicResearchPlan | null {
  if (turn.mode !== 'work' || taskKind !== 'question' || turn.privateTurn || turn.advice || turn.roleFit || turn.scopeEnded || turn.requested) return null;
  const answer = turn.answer;
  if (!answer || (answer.kind !== 'sourced' && answer.kind !== 'gap') || answer.scopeDecline || answer.kind === 'gap' && answer.claimless && !answer.scopedAbsence) return null;
  if (offTopic.test(turn.text) || harmful.test(turn.text) || thirdPartyPersonal.test(turn.text)) return null;
  const company = visitorCompany(turn.text);
  return company ? companyLookupPlan(company.name, company.domain) : null;
}
/**
 * The settled public work turn the open web adapter reads. The answer's text checks (scope decline, scoped absence) are
 * Worker rules, so the Worker passes their results in rather than this module reimplementing them.
 */
export type SettledResearchTurn = Readonly<{
  /** The visitor's own words for this turn (no quoted earlier answers, no document text, no history). */
  text: string;
  mode: string; privateTurn: boolean; advice: boolean; roleFit: boolean;
  /** The turn ended through outsideScope (Q04-G5): the decline stands and nothing is searched. */
  scopeEnded: boolean;
  /** The browser asked for a fixed topic; the open topic never replaces what it predicted. */
  requested: boolean;
  answer: Readonly<{ kind: string; claimless: boolean; scopeDecline: boolean; scopedAbsence: boolean }> | null;
  /** R19 live: the question names one of Steve's projects or employers (a Worker rule over his snapshot), so it is about him. */
  namesSteveWork?: boolean;
}>;

/** Adapter 1, deliberately narrow lexical selection, not semantic relevance or declassification. */
function fixedTopicPlan(taskKind: string, text: string): PublicResearchPlan | null {
  if (!['question', 'advice'].includes(taskKind) || !/\b(?:current|latest|today|now|updated)\b/i.test(text) ||
    /\b(?:Steve|EcoSmartLoop|portfolio|historical)\b|\b(?:who built|what did|when did)\b/i.test(text)) return null;
  const topicId: PublicResearchTopicId | undefined = /\bAI SDK\b/i.test(text) && /\b(?:streaming|stream|cancellation|cancel|messages?)\b/i.test(text) ? 'ai-sdk-streaming' :
    /\bAstro\b/i.test(text) && /\b(?:React|islands?|hydration)\b/i.test(text) ? 'astro-react-islands' :
    /\bCloudflare Workers\b/i.test(text) && /\b(?:limits?|resources?|runtime)\b/i.test(text) ? 'workers-limits' : undefined;
  // v3 review (Oak, 2026-10-18): research runs without asking. Only the topic's fixed public query above reaches the
  // provider, never the visitor's words, so a private-sounding question needs no separate approval.
  return topicId ? { topicId, query: publicResearchTopics[topicId].query, domains: publicResearchTopics[topicId].domains, recent: true } : null;
}

// Work, career and tech vocabulary a question plausibly connected to Steve's work uses. Banana bread and the World Cup do not.
const workTopic = /\b(?:ai|ml|llms?|gpt|genai|machine learning|models?|agents?|agentic|evals?|evaluations?|benchmarks?|prompts?|prompting|rag|retrieval|embeddings?|vectors?|fine-?tun\w*|inference|guardrails?|injection|hallucinations?|design(?:ers?)?|ux|ui|user research|usability|accessibility|a11y|front-?end|back-?end|full-?stack|web|react|astro|next\.?js|typescript|javascript|python|swift|css|html|cloudflare|workers|serverless|edge|apis?|sdks?|databases?|sql|testing|tests|deploy\w*|devops|infrastructure|observability|tracing|latency|performance|security|privacy|software|engineer\w*|developers?|coding|code|programming|product|startups?|careers?|hiring|interviews?|resumes?|portfolios?|jobs?|roles?|tech|technology|open source|hackathons?|data|analytics|automation|workflows?|mobile|ios|android|apps?)\b/i;
// Requests outside work that can still contain a work word ("a poem about AI", "a cake recipe app").
const offTopic = /\b(?:recipes?|bak(?:e|ing)|cook(?:ing)?|bread|cakes?|world cup|football|soccer|basketball|baseball|nba|nfl|olympics|poems?|poetry|haiku|lyrics|songs?|jokes?|horoscopes?|astrology|weather|movies?|films?|tv shows?|celebrit(?:y|ies)|dating|girlfriend|boyfriend|religio\w*|politic\w*|elections?|medical|symptoms?|diagnos\w*|medications?|lottery|gambling|betting|stock tips?|favou?rite)\b/i;
// R19 redteam H1/S2: harmful, deceptive or war topics never reach the web, whoever they name and whatever the answer said.
const harmful = /\b(?:wars?|warfare|military|militar\w+|weapons?|weaponi\w+|guns?|firearms?|drones? strikes?|missiles?|bombs?|pipe ?bombs?|explosives?|terror\w*|drugs?|meth\w*|cocaine|heroin|fentanyl|narcotics?|cheat\w*|plagiari\w*|hack(?:ing|s)? (?:into|someone)|break into|get into (?:my|his|her|their|someone)|someone(?:['\u2019]s| else['\u2019]s) (?:account|password|phone|email)|steal\w*|stolen|exploits?|malware|ransomware|keyloggers?|phishing|spyware|stalk\w*|dox\w*|track (?:my|his|her|their|someone)|crack(?:ing)? (?:passwords?|accounts?)|bypass\w*|jailbreak\w*|suicide|self-?harm|kill\w*|murder\w*|porn\w*|nsfw|nude\w*|ukraine|russia|gaza|israel)\b/i;
// R19 redteam H1: personal data about anyone (not only Steve) is never looked up.
const thirdPartyPersonal = /\b(?:home address(?:es)?|street address|where (?:does|do|did) (?!teams|companies|engineers|designers|developers)\w+ live|salar(?:y|ies) of|(?:his|her|their|my (?:ex|boss|manager|coworker)['\u2019]?s?) (?:salary|address|phone|email|password|account)|net worth|phone numbers?|social security|ssn|date of birth|passport|medical records?|criminal records?|background check|ex['\u2019]s|my ex\b)/i;
// Personal facts about Steve are never looked up on the open web (wrong person, and not his public work).
const personal = /\b(?:age|how old|birthday|born|live|lives|living|address|home ?town|salary|net worth|phone|email|kids|children|family|married|wife|husband|health|religion)\b/i;
// The question reaches past Steve's own work: current, industry, comparative or how-to knowledge.
const beyondSteve = /\b(?:current(?:ly)?|latest|today|nowadays|these days|recent(?:ly)?|state of the art|industry|best practices?|common practices?|standard practices?|how (?:do|does|should|can|would) (?:teams|companies|people|engineers|designers|others|you|i|one)|how to|compare[sd]?|comparison|versus|vs\.?|trends?|alternatives?|in general)\b/i;
// R19 live (#292): about Steve or his work, a time word ("his recent roles") or "compare" between his own projects is still
// about him. Only an explicit outside cue (industry, practice, how teams do it, trends) reaches past his pages.
const beyondForSteve = /\b(?:industry|state of the art|best practices?|common practices?|standard practices?|in general|trends?|alternatives?|other (?:teams|companies|engineers|designers|developers|people)|(?:how|what) (?:do|does|should|can|would) (?:teams|companies|people|engineers|designers|developers|others|startups)|elsewhere|market|benchmarks?)\b/i;
/** R19: a public work question that also reaches past Steve's pages (industry, current, comparative); the answer covers
 * Steve's side and the open web card covers the rest, so the answer must not decline it as out of scope. */
export function openWebQuestion(text: string, namesSteveWork = false) {
  return (namesSteveWork || namesSteve.test(text) ? beyondForSteve : beyondSteve).test(text) && !personal.test(text) && !harmful.test(text) && !thirdPartyPersonal.test(text) && !offTopic.test(text);
}
const namesSteve = /\b(?:Steve|Okkar|Oak['\u2019]s|his|he|him)\b/i;
const steveRef = /\b(?:Steve(?:\s+Oak)?|Okkar|Oak)(?:['\u2019]s)?\b/gi;
export const OPEN_WEB_QUERY_CHARS = 160;

/**
 * R19 (Oak, 2026-10-22): "Sometimes just sources from current case studies are not enough. In those cases you should use web
 * search and combine the sources and realtime search." Decided after a public work answer settles: Steve's pages did not
 * cover it (a gap or a scoped absence), or it asks for current, industry or how-to knowledge beyond his work. Off-topic
 * turns, private documents and quotes, role-fit and advice never search the web. Fails closed.
 */
export function openWebResearchGate(taskKind: string, turn: SettledResearchTurn): boolean {
  if (turn.mode !== 'work' || taskKind !== 'question' || turn.privateTurn || turn.advice || turn.roleFit || turn.scopeEnded || turn.requested) return false;
  const answer = turn.answer;
  if (!answer || (answer.kind !== 'sourced' && answer.kind !== 'gap')) return false;
  // A model-authored scope decline ("I only cover Steve's work, so...") is as final as the app's own. R19 redteam H1: so is
  // any other refusal. A claimless gap searches only when its note says Steve's pages do not cover the topic (a scoped
  // absence) and declines nothing; "I can't help with that" never reaches the web.
  if (answer.kind === 'gap' && answer.claimless && (answer.scopeDecline || !answer.scopedAbsence)) return false;
  const text = turn.text;
  if (offTopic.test(text) || harmful.test(text) || thirdPartyPersonal.test(text) || !workTopic.test(text)) return false;
  const aboutSteve = namesSteve.test(text) || turn.namesSteveWork === true;
  if (aboutSteve && personal.test(text)) return false;
  if ((aboutSteve ? beyondForSteve : beyondSteve).test(text)) return true;
  // A gap about Steve's own facts is not something the web can fill: it would find other people, not his pages.
  return !aboutSteve && (answer.kind === 'gap' || answer.scopedAbsence);
}
/**
 * Words the open web query may carry. R19 redteam H2: the query is built from this allowlist, not by scrubbing a denylist,
 * so names, companies, addresses, salaries, emails in any spelling, hostnames and keys never leave the Worker: an unknown
 * word is simply dropped. Work vocabulary plus plain English function and question words.
 */
const queryWords = new Set(`ai ml llm llms gpt genai machine learning model models agent agents agentic eval evals evaluation evaluations evaluate evaluating benchmark benchmarks prompt prompts prompting rag retrieval embedding embeddings vector vectors fine tuning finetuning inference guardrail guardrails injection hallucination hallucinations design designer designers designing ux ui user users research usability accessibility a11y frontend front back backend end full stack fullstack web react astro next.js nextjs typescript javascript python swift css html cloudflare workers worker serverless edge api apis sdk sdks database databases sql testing tests test deploy deploying deployment deployments devops infrastructure observability tracing traces latency performance security privacy software engineer engineers engineering developer developers development coding code programming product products startup startups career careers hiring interview interviews resume resumes portfolio portfolios job jobs role roles tech technology open source hackathon hackathons data analytics automation workflow workflows mobile ios android app apps streaming cancellation hydration islands limits runtime tools tool calling structured output outputs chat chatbot chatbots assistant assistants copilot copilots voice multimodal ocr search ranking recommendation recommendations personalization experiment experiments experimentation metrics growth onboarding conversion retention scale scaling scalable cost costs pricing budget budgets quality reliability monitoring reviews review production prototype prototypes prototyping system systems architecture patterns pattern framework frameworks library libraries team teams company companies industry practice practices best common standard current currently latest today nowadays recent recently trends trend state art alternatives alternative compare compared comparing comparison versus vs general approach approaches method methods technique techniques strategy strategies process processes measure measuring metric how what why when which where who do does did should can could would is are was were be been being to the a an of in on for with without and or vs. about into from by as at than more most less least better best good typical typically usually often teams people others one i you we they use used using build built building make making work works working run running handle handling ship shipping improve improving reduce reducing avoid avoiding choose choosing pick picking tradeoff tradeoffs trade offs context window windows long short memory memories state stateful stateless cache caching speed fast faster slow small large big new old open closed local cloud hosted self private public safe safety risk risks pros cons benefit benefits limit limitation limitations problem problems issue issues error errors failure failures mistake mistakes lesson lessons example examples guide guides tip tips rule rules policy policies size customer customers client clients b2b b2c saas enterprise enterprises healthcare fintech education ecommerce commerce marketplace marketplaces games gaming consumer consumers small medium sizes need needs require requires requirement requirements skill skills skillset learn learning teach teaching mentor mentoring junior senior staff lead leads leadership manager managers management collaborate collaboration communication stakeholder stakeholders roadmap roadmaps planning plan plans scope scoping estimate estimates estimation feature features release releases launch launching iterate iteration iterations feedback loop loops human humans review reviewing judge judges judging grading rubric rubrics label labels labelled labeled dataset datasets ground truth accuracy precision recall score scores scoring rate rates measure measures measured baseline baselines regression regressions drift version versions versioning migration migrations refactor refactoring debt documentation docs spec specs specification type types typed schema schemas validation validate validating error-handling retry retries timeout timeouts fallback fallbacks queue queues async concurrency parallel batch batching stream streams token tokens context-window throughput scale-up cost-effective cheap expensive free paid open-source license licenses vendor vendors provider providers hosting server servers client-side server-side browser browsers component components design-system systems tokens motion animation animations layout layouts responsive typography color colors contrast dark mode theme themes interface interfaces interaction interactions prototyping figma wireframe wireframes persona personas journey journeys funnel funnels survey surveys interviewing synthesis insight insights generative multi agentic-ai orchestration planner planners memory-management rerank reranking chunk chunking index indexing semantic keyword hybrid knowledge graph graphs`.split(/\s+/));
const queryFillers = new Set('is are was were be been being to the a an of in on for with without and or about into from by as at than i you we they one'.split(' '));
/**
 * The open topic's query, from the visitor's question only, never document text or history. R19 (Oak's request above)
 * replaces the v3 "fixed query only" rule for this topic; the three fixed topics keep theirs. Only allowlisted words are
 * kept, in order (Steve's name is never one, so the web is not searched for a person), cut to 160 characters. Null unless
 * at least three words survive and one of them is a work word.
 */
export function openWebResearchQuery(text: string): string | null {
  const words = text.normalize('NFKC').toLowerCase().replace(/[\u0000-\u001f\u007f]/g, ' ')
    .split(/[^a-z0-9.+#-]+/).map(word => word.replace(/^[.+#-]+|[.-]+$/g, '')).filter(word => queryWords.has(word));
  const kept: string[] = [];
  for (const word of words) if (kept.at(-1) !== word) kept.push(word);
  // Filler left behind by dropped words ("is at how do teams...") is trimmed from both ends.
  while (kept.length && queryFillers.has(kept[0]!)) kept.shift();
  while (kept.length && queryFillers.has(kept.at(-1)!)) kept.pop();
  let query = kept.join(' ');
  if (query.length > OPEN_WEB_QUERY_CHARS) query = query.slice(0, query.lastIndexOf(' ', OPEN_WEB_QUERY_CHARS)).trim();
  return kept.length >= 3 && workTopic.test(query) ? query : null;
}
/** Adapter 2: the open web topic. */
function openWebPlan(taskKind: string, turn: SettledResearchTurn): PublicResearchPlan | null {
  const query = openWebResearchGate(taskKind, turn) ? openWebResearchQuery(turn.text) : null;
  return query ? { topicId: openWebResearchTopicId, query, domains: null, ...recentFlag(turn.text) } : null;
}
/**
 * The one place a turn's research is planned. Before the answer (no `settled`) only a fixed topic can plan; after it, the
 * open web adapter may plan when no fixed topic did.
 */
export function publicResearchPlan(task: Readonly<{ kind: string; text: string }>, settled?: SettledResearchTurn): PublicResearchPlan | null {
  const fixed = fixedTopicPlan(task.kind, task.text);
  if (fixed || !settled) return fixed;
  const company = companyPlan(task.kind, settled), open = openWebPlan(task.kind, settled);
  return company && open ? { ...open, lookup: company } : company ?? open;
}
/** The browser's prediction of a fixed topic. `requiresConsent` stays false (v3), kept for saved clients and their tests. */
export function publicResearchNeed(taskKind: string, text: string): { topicId: PublicResearchTopicId; requiresConsent: false } | null {
  const plan = fixedTopicPlan(taskKind, text);
  return plan && plan.topicId !== openWebResearchTopicId ? { topicId: plan.topicId, requiresConsent: false } : null;
}
export const publicResearchRecipient = 'Exa' as const;
export const publicResearchUnavailable = 'I can’t check current public sources right now. I can still answer from Steve’s approved portfolio materials, and I’ll mark any current detail I can’t verify.';
export const publicResearchSourceLabel = 'External public sources, separate from Steve’s approved portfolio evidence';
export const publicResearchRequestSchema = z.strictObject({ topicId: z.enum(publicResearchTopicIds),
  consent: z.strictObject({ recipient: z.literal(publicResearchRecipient), query: z.enum([
    publicResearchTopics['ai-sdk-streaming'].query, publicResearchTopics['astro-react-islands'].query, publicResearchTopics['workers-limits'].query,
  ]) }).optional() });
export type PublicResearchRequest = z.infer<typeof publicResearchRequestSchema>;
export const publicResearchReasons = ['none', 'disabled', 'current-need-missing', 'consent', 'configuration', 'unknown-allowance',
  'stale-allowance', 'quota', 'provider-quota', 'provider-error', 'redirect', 'timeout', 'cancelled', 'unreadable', 'wire-limit', 'storage', 'duplicate'] as const;
export type PublicResearchReason = typeof publicResearchReasons[number];
/** R19: an open-web result is a link only. https, no credentials or port, a public DNS name: no IP literal, localhost or internal suffix. */
export function isOpenWebUrl(value: string) {
  try {
    const url = new URL(value), host = url.hostname.toLowerCase(), labels = host.split('.');
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && value === url.href && value.length <= 1000 &&
      labels.length >= 2 && labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) && /[a-z]/.test(labels.at(-1)!) &&
      !/(?:^|\.)(?:localhost|local|localdomain|internal|intranet|lan|home|corp|arpa|test|invalid|example)$/.test(host) &&
      // Redteam low: wildcard DNS names that resolve to any address, and redirectors carrying another URL.
      !/(?:^|\.)(?:nip\.io|sslip\.io|xip\.io|localtest\.me|lvh\.me|traefik\.me)$/.test(host) && !/https?(?::|%3a)/i.test(url.search) &&
      // R19 live (#292): a person's social profile is never a web source (one result was a stranger's LinkedIn page).
      !(/(?:^|\.)linkedin\.com$/.test(host) && /^\/(?:in|pub)\//i.test(url.pathname)) &&
      !/(?:^|\.)(?:facebook\.com|instagram\.com|tiktok\.com|x\.com|twitter\.com|threads\.net)$/.test(host);
  } catch { return false; }
}
export function isPublicResearchUrl(value: string, topicId: ResearchTopicId) {
  if (topicId === openWebResearchTopicId) return isOpenWebUrl(value);
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
    (publicResearchTopics[topicId].domains as readonly string[]).includes(url.hostname) && value === url.href; } catch { return false; }
}
/** R21: a web source's favicon, fetched by the Worker (never by the visitor's page) and carried as a small data: URI. No SVG. */
export const faviconMimeTypes = ['image/png', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/jpeg', 'image/webp', 'image/gif'] as const;
/**
 * R23: what the Worker sends stays at 3 KB this round (R23 review M1: a page loaded before this deploy checks 3 KB and would
 * fail the whole turn on a larger icon), while the contract accepts 8 KB, so the send cap can rise once old pages are gone.
 * The icon service's icons are about 1 KB, so most sites the own-site fetch missed still get one.
 */
export const FAVICON_MAX_BYTES = 3072;
export const FAVICON_ACCEPT_BYTES = 8192;
/** 8 KB of bytes (the accepted size) is 10,924 base64 characters, plus the longest `data:<type>;base64,` prefix. */
export const faviconDataUriSchema = z.string().max(11000)
  .regex(/^data:image\/(?:png|x-icon|vnd\.microsoft\.icon|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/);
export const externalPublicSourceSchema = z.strictObject({ sourceId: z.string().regex(/^external:[0-9a-f-]{36}:[1-3]$/),
  favicon: faviconDataUriSchema.optional(),
  origin: z.literal('external-web'), title: z.string().min(1).max(200), url: z.string().min(1).max(1000),
  publishedAt: z.string().datetime({ offset: true }).nullable(), retrievedAt: z.number().int().nonnegative(),
  excerpt: z.string().min(1).max(1500), contentStatus: z.enum(['read', 'partial']) });
export type ExternalPublicSource = z.infer<typeof externalPublicSourceSchema>;
/** M2: favicons ride only the live event. Anything the client persists or hands off drops them; the row falls back to the web icon. */
export function withoutFavicons<T extends { sources: readonly ExternalPublicSource[] }>(event: T): T {
  return event.sources.some(source => source.favicon) ? { ...event, sources: event.sources.map(({ favicon: _favicon, ...source }) => source) } : event;
}
/** R19: the combine step, at most three short sentences, each citing a web source on this event or a claim of the answer. */
export const WEB_SYNTHESIS_SENTENCES = 3;
export const WEB_SYNTHESIS_SENTENCE_CHARS = 240;
export const webSynthesisSchema = z.strictObject({ sentences: z.array(z.strictObject({
  text: z.string().min(1).max(WEB_SYNTHESIS_SENTENCE_CHARS), cites: z.array(z.string().min(1).max(120)).min(1).max(4) })).min(1).max(WEB_SYNTHESIS_SENTENCES) });
export type WebSynthesis = z.infer<typeof webSynthesisSchema>;
export const answerClaimIdPattern = /^claim-[1-8]$/;
// R19 redteam M1: any scheme, markup, domain-shaped token (any ending, bracketed or spelled-out dots, full width after NFKC),
// email or phone number. "Node.js" and "Next.js" stay readable.
const webLink = /\b(?:https?|ftp|mailto|javascript|data|file):|\bwww\b|\]\(|<\/?[a-z]|@|\[\.\]|\(\.\)|\b(?:dot|d0t)\s+(?:com|org|net|io|dev|ai|app|co|ru|top|xyz)\b|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?!js\b)[a-z]{2,24}\b|\+?\d[\d\s().-]{6,}\d/i;
const steveNamed = /\b(?:Steve|Okkar|Oak|Kyaw)\b/i;
export type WebSynthesisProblem = 'shape' | 'count' | 'length' | 'sentences' | 'url' | 'uncited' | 'unknown-id' | 'steve' | 'marker';
// Review F H1 and G M4: a planted marker ("REDTEAM-WEB-08", "PWNED_01") is never a finding, whoever wrote the sentence.
// An underscore name needs a digit or an all-caps part (top_p and pass_at_k are words); a hyphen one needs a four-letter caps part.
const plantedMarker = /\b[A-Za-z0-9]*(?:[A-Z]{3,}|\d)[A-Za-z0-9]*(?:_[A-Za-z0-9]+)+\b|\b[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*_(?:[A-Z]{3,}|\d+)\b|\b[A-Z0-9]*[A-Z]{4,}[A-Z0-9]*(?:-[A-Z0-9]+)+\b/;
// Review G H1: a word mixing Latin with Cyrillic or Greek letters is a lookalike spelling ("St\u0435ve").
const mixedScript = (text: string) => text.split(/\s+/).some(word => /\p{Script=Latin}/u.test(word) && /[\p{Script=Cyrillic}\p{Script=Greek}]/u.test(word));
/**
 * Fail closed: any problem means the card shows sources only. `known` says which citation ids exist for this turn.
 * R19 review S1 and redteam H3: every sentence cites at least one web source (a claim id may ride along, never alone), and
 * no sentence names Steve: the summary speaks only for the web, the answer above speaks for Steve.
 */
export function webSynthesisProblem(value: unknown, known: (id: string) => boolean): WebSynthesisProblem | null {
  const rows = value && typeof value === 'object' ? (value as { sentences?: unknown }).sentences : undefined;
  if (!Array.isArray(rows) || !rows.length) return 'shape';
  if (rows.length > WEB_SYNTHESIS_SENTENCES) return 'count';
  for (const row of rows) {
    const text = row && typeof row === 'object' ? (row as { text?: unknown }).text : undefined;
    const cites = row && typeof row === 'object' ? (row as { cites?: unknown }).cites : undefined;
    if (typeof text !== 'string' || !text.trim()) return 'shape';
    if (text.length > WEB_SYNTHESIS_SENTENCE_CHARS) return 'length';
    // Review F H1: invisible format characters (zero-width, soft hyphen) are dropped first, so "Ste\u200bve" is still Steve.
    const plain = text.normalize('NFKC').replace(/\p{Cf}/gu, '').trim();
    // One sentence: no sentence end before the last character, whatever case follows it.
    if (/[.!?;]["”’)]?\s+\S/.test(plain) || /\n/.test(plain)) return 'sentences';
    if (webLink.test(plain)) return 'url';
    if (steveNamed.test(plain) || mixedScript(plain)) return 'steve';
    if (plantedMarker.test(plain)) return 'marker';
    if (!Array.isArray(cites) || !cites.length) return 'uncited';
    if (cites.some(id => typeof id !== 'string' || !known(id))) return 'unknown-id';
    if (!cites.some(id => typeof id === 'string' && id.startsWith('external:'))) return 'uncited';
  }
  return webSynthesisSchema.safeParse(value).success ? null : 'shape';
}
export const publicResearchEventSchema = z.strictObject({ requestId: z.uuid(), topicId: z.enum(researchTopicIds),
  provider: z.literal(publicResearchRecipient), phase: z.enum(['started', 'completed', 'partial', 'blocked', 'failed', 'zero-results']),
  reason: z.enum(publicResearchReasons), returnedSources: z.number().int().min(0).max(3), sources: z.array(externalPublicSourceSchema).max(3),
  synthesis: webSynthesisSchema.optional(),
}).refine(value => value.sources.every(source => source.sourceId.startsWith(`external:${value.requestId.toLowerCase()}:`) &&
  isPublicResearchUrl(source.url, value.topicId)) && new Set(value.sources.map(source => source.sourceId)).size === value.sources.length &&
  new Set(value.sources.map(source => source.url)).size === value.sources.length && value.sources.length <= value.returnedSources &&
  (value.synthesis === undefined || (value.topicId === openWebResearchTopicId && (value.phase === 'completed' || value.phase === 'partial') &&
    webSynthesisProblem(value.synthesis, id => answerClaimIdPattern.test(id) || value.sources.some(source => source.sourceId === id)) === null)) &&
  (value.phase === 'completed' ? value.reason === 'none' && value.sources.length > 0 && value.sources.length === value.returnedSources :
    value.phase === 'partial' ? value.reason === 'unreadable' && value.sources.length > 0 :
    value.phase === 'zero-results' ? value.reason === 'none' && value.returnedSources === 0 && value.sources.length === 0 :
    value.phase === 'started' ? value.reason === 'none' && value.returnedSources === 0 && value.sources.length === 0 :
      value.reason !== 'none' && value.sources.length === 0));
export type PublicResearchEvent = z.infer<typeof publicResearchEventSchema>;
