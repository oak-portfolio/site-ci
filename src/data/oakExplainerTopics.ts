import type { IconName } from "@/components/ui/Icon";

/**
 * Ticket 52: the general topics Explainer can draw, each a reviewed fixture (ADR 0006's labeled lane: none of this text is
 * about Steve). `used` links a case study whose `stack` or `systemMap` names one of the topic's `keywords` (the test reads the
 * MDX to hold that true); `related` is work in the same area that names no keyword, so it never claims Steve used the topic.
 */
export type OakExplainerLink = Readonly<{ documentId: string; name: string; page: string }>;
export type OakExplainerStep = Readonly<{ label: string; line: string }>;
export type OakExplainerTopic = Readonly<{
  id: string; name: string; icon: IconName; title: string; summary: string; steps: readonly OakExplainerStep[];
  keywords: readonly string[]; used: readonly OakExplainerLink[]; related?: OakExplainerLink & Readonly<{ phrase: string }>;
}>;

const work = (slug: string, name: string): OakExplainerLink => ({ documentId: `work:${slug}`, name, page: `/work/${slug}/` });
const BRAIN = work("agentic-brain", "Agentic Brain");
const GROWTH = work("linkedin-growth-loop", "LinkedIn Growth Loop");
const OAKMINDER = work("oakminder", "Oakminder");
const ECO = work("ecosmartloop", "EcoSmartLoop");

export const oakExplainerTopics = [
  { id: "rag", name: "RAG", icon: "fileSearch", title: "RAG in three steps", keywords: ["rag", "retrieval"], used: [BRAIN],
    summary: "Retrieval-augmented generation looks up relevant passages first, adds them to the prompt, and only then lets the model write, so the answer leans on sources instead of memory alone.",
    steps: [{ label: "Retrieve", line: "Search a document store for the passages closest to the question." },
      { label: "Augment", line: "Add the retrieved passages to the prompt beside the question." },
      { label: "Generate", line: "The model writes its answer from the question and those passages." }] },
  { id: "embeddings", name: "Embeddings", icon: "schemaMap", title: "Embeddings in three steps", keywords: ["embedding", "embeddings", "vector"], used: [],
    related: { ...BRAIN, phrase: "retrieval for coding agents" },
    summary: "An embedding turns text into a list of numbers so that texts with similar meaning land close together, which lets a search find passages by meaning rather than exact words.",
    steps: [{ label: "Encode", line: "A model turns each passage into a vector of numbers." },
      { label: "Place", line: "Similar meanings land near each other in that space." },
      { label: "Compare", line: "A question is encoded too, and the nearest passages are its matches." }] },
  { id: "tool-calling", name: "Tool calling", icon: "puzzle", title: "Tool calling in three steps", keywords: ["mcp", "tools", "tool calling"], used: [OAKMINDER, BRAIN],
    summary: "Tool calling lets a model ask the app to run a named function, such as a search or a calendar write, and then continue with the result instead of guessing.",
    steps: [{ label: "Describe", line: "The app lists each tool with its name and the inputs it takes." },
      { label: "Call", line: "The model replies with a tool name and inputs instead of prose." },
      { label: "Continue", line: "The app runs the tool and hands the result back to the model." }] },
  { id: "agent-memory", name: "Agent memory", icon: "sourceData", title: "Agent memory in three steps", keywords: ["memory"], used: [BRAIN, GROWTH],
    summary: "Agent memory keeps what a session learned, such as decisions and constraints, somewhere a later session can read it back, so the agent does not start from nothing each time.",
    steps: [{ label: "Hold", line: "Short-term context keeps the current task and its constraints close." },
      { label: "Store", line: "Lasting decisions are written somewhere outside the conversation." },
      { label: "Recall", line: "A later session retrieves what applies before it starts work." }] },
  { id: "voice-agents", name: "Voice agents", icon: "microphone", title: "Voice agents in three steps", keywords: ["voice"], used: [OAKMINDER],
    summary: "A voice agent turns speech into text, decides what to do with a model, and answers or acts, so a person can get something done without typing.",
    steps: [{ label: "Listen", line: "Speech is transcribed into text as the person talks." },
      { label: "Decide", line: "A model reads the text and picks a reply or an action." },
      { label: "Respond", line: "The agent speaks the reply or carries out the action." }] },
  { id: "multi-agent", name: "Multi-agent teams", icon: "networking", title: "Multi-agent teams in three steps", keywords: ["orchestrator", "multi-agent"], used: [GROWTH],
    summary: "A multi-agent team splits one job between agents with narrow roles, with an orchestrator handing out the work and checking what comes back.",
    steps: [{ label: "Plan", line: "An orchestrator breaks the job into smaller tasks." },
      { label: "Delegate", line: "Each task goes to a worker agent with one narrow role." },
      { label: "Check", line: "Results come back and are checked before the next step." }] },
  { id: "image-classification", name: "Image classification", icon: "scanImage", title: "Image classification in three steps", keywords: ["classify"], used: [ECO],
    summary: "Image classification takes a photo and returns the label a trained model thinks fits best, often with a confidence score that decides what happens next.",
    steps: [{ label: "Capture", line: "A camera or upload provides the image." },
      { label: "Classify", line: "A trained model scores each label it knows for that image." },
      { label: "Act", line: "The best label, if confident enough, drives the next step." }] },
] as const satisfies readonly OakExplainerTopic[];

export type OakExplainerTopicId = (typeof oakExplainerTopics)[number]["id"];
export const OAK_EXPLAINER_TOPIC_IDS = oakExplainerTopics.map(topic => topic.id) as [OakExplainerTopicId, ...OakExplainerTopicId[]];
export const oakExplainerTopic = (id: string): OakExplainerTopic => oakExplainerTopics.find(topic => topic.id === id) ?? oakExplainerTopics[0];

/** The case studies the topic map draws, once each, in the order their topics first name them. */
export const oakExplainerProjects: readonly OakExplainerLink[] = [...new Map(oakExplainerTopics.flatMap(topic => topic.used as readonly OakExplainerLink[]).map(link => [link.documentId, link])).values()];
