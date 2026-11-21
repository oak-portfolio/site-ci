/**
 * Ticket 29: general topics a visitor may ask about, each tied to the one public case study that names it and Steve's own sentence
 * from that page. Every `quote` is an exact substring of the page's MDX and every keyword appears in it; reviewed at the sitting.
 * `oakBridgeAreas` lists areas no case study names: they only ever draw a quiet Related line, never a claim of use.
 */
export type OakBridgeTopic = Readonly<{ topic: string; keywords: readonly string[]; documentId: string; name: string; page: string; anchor?: string; quote: string }>;
export type OakBridgeArea = Readonly<{ area: string; keywords: readonly string[]; documentId: string; name: string; page: string; phrase: string }>;

export const oakBridgeTopics: readonly OakBridgeTopic[] = [
  { topic: "evals", keywords: ["eval", "evals", "evaluation", "evaluations"], documentId: "work:linkedin-growth-loop", name: "LinkedIn Growth Loop",
    page: "/work/linkedin-growth-loop/", anchor: "evaluation-turned-runs-into-learning",
    quote: "The team became more reliable when each run stopped ending as one vague success or failure." },
  { topic: "multi-agent teams", keywords: ["multi-agent", "agent teams", "orchestrator", "orchestration"], documentId: "work:linkedin-growth-loop", name: "LinkedIn Growth Loop",
    page: "/work/linkedin-growth-loop/", anchor: "orchestrator-workers-validators",
    quote: "The first real design decision was to stop treating the workflow as one agent." },
  { topic: "browser automation", keywords: ["browser automation", "browser control", "playwright"], documentId: "work:linkedin-growth-loop", name: "LinkedIn Growth Loop",
    page: "/work/linkedin-growth-loop/", anchor: "browser-control-kept-the-cost-honest",
    quote: "APIs are more valuable than ever in the agent era. They are still the cleanest path when they expose the work clearly." },
  { topic: "voice agents", keywords: ["voice agent", "voice agents", "voice"], documentId: "work:oakminder", name: "Oakminder",
    page: "/work/oakminder/", anchor: "voice-became-the-action-layer",
    quote: "AI made sense in Oakminder only if it reduced work." },
  { topic: "agent memory", keywords: ["agent memory", "memory systems", "memory"], documentId: "work:agentic-brain", name: "Agentic Brain",
    page: "/work/agentic-brain/",
    quote: "Separate short-term working context from durable project memory so future agent sessions do not need to rediscover the same constraints." },
];

export const oakBridgeAreas: readonly OakBridgeArea[] = [
  { area: "image recognition", keywords: ["image recognition", "object detection"], documentId: "work:ecosmartloop", name: "EcoSmartLoop",
    page: "/work/ecosmartloop/", phrase: "waste sorting" },
  { area: "reinforcement learning", keywords: ["reinforcement learning"], documentId: "work:linkedin-growth-loop", name: "LinkedIn Growth Loop",
    page: "/work/linkedin-growth-loop/", phrase: "learning from outcomes" },
];

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const named = (text: string, words: readonly string[]) => words.some(word => new RegExp(`(^|[^\\w])${escape(word)}($|[^\\w])`, "i").test(text));

/** The first topic whose keyword the text names as a whole word. */
export const oakBridgeTopicFor = (text: string) => oakBridgeTopics.find(row => named(text, row.keywords));
export const oakBridgeAreaFor = (text: string) => oakBridgeAreas.find(row => named(text, row.keywords));
