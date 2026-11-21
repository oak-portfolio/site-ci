import * as React from "react";
import { OakWorkspace } from "@/components/agent/OakWorkspace";
import type { OakSprites } from "@/components/agent/OakActivitySprite";
import type { OakCitationLabels } from "@/lib/oakCitationLabels";
import { getOakDocumentsController, type OakDocumentsSnapshot } from "@/lib/oakDocumentsWorkspace";
import { getOakVoiceController, getOakWorkspace, setOakWorkspaceFixture, type OakConversationMessage, type OakWorkspaceState } from "@/lib/oakWorkspace";
import { pinOakTips } from "@/lib/oakTips";
import { setOakTurnstileFixture } from "@/lib/oakTurnstile";
import { setOakAccountIdentityFixture } from "@/lib/oakAccountClient";
// R12: a generated portrait of a fictional visitor, bundled only into this dev page.
import visitorPhoto from "./fixtures/visitor-photo.jpg";
import { disabledVoiceConfiguration, type VoiceCaptureState, type VoiceHttpConfiguration } from "@/lib/oakVoiceCapture";
import type { OakAnswer } from "../../packages/oak-agent-contracts/src/types";
import states from "@/data/dev/oak-states.json";
import workAnswers from "../../tests/agent/work-answers.v1.json";
import { forceOakFlags, type OakFlagSet } from "@/lib/oakChatFlags";
import { forceOakRoleEntryLinks } from "@/lib/oakFlags/roleEntryCard";
import { forceOakDiagramPresets } from "@/lib/oakFlags/diagram";
import { forceOakExplainerPresets } from "@/lib/oakFlags/explainer";
import { markOakRedo, resetOakRedo } from "@/components/agent/OakWhatChanged";
import { forceOakContactCardRecord, type OakContactCardRecord } from "@/data/contactCard";
import { resetOakContactCardOnce } from "@/lib/oakContactCardOnce";
import { loadOakRecordFacts, primeOakRecordFacts } from "@/lib/oakRecordFacts";
import { OakFigure, OakFigureBars, oakFigureBarItems, type OakFigureBarsData } from "@/lib/openui/figure/OakFigure";

// D126: one-time tips would cover every designed state on a fresh browser, so the gallery pins them closed; the
// onboarding state opens them in memory, and `?tips=live` uses the browser's real record (for the onboarding gates).
if (typeof window !== "undefined") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("tips") !== "live") pinOakTips(params.get("state") === "onboarding-tips");
}

/*
 * Fixture shorthand in src/data/dev/oak-states.json:
 * - workspace: merged into the workspace store. A message `{ "ask": "K01" }` expands to the visitor
 *   question and Oak's reviewed answer from tests/agent/work-answers.v1.json. An `answer` is a fixture id
 *   or an inline answer; `evidenceFrom` on an answer or role-fit row borrows that fixture's claims.
 *   `savedConversations: "sample"` fills three saved rows; a lifecycle `target: "first"` points at row one.
 * - documents: merged into the documents snapshot. `docs` expands into extracted documents, `select`
 *   picks section numbers, `use: true` also puts the selected sections in the next answer, `scanned` stages an image-only PDF that needs scanned-page reading,
 *   `expiresIn` sets the preview's minutes of reading time left (0 or less shows it expired; default 30).
 * - voice: opens dictation with an available service and shows that capture phase; `available: false` shows the service switched off.
 * - open: "funding" | "tools" | "account" | "contact" opens a component-owned panel or menu with a real click;
 *   "trail" opens a settled turn's folded reasoning.
 * - reveal: a selector scrolled into view when the state's defining content sits below the fold.
 * - verification: shows R11 verification mode with a placeholder box where Cloudflare's widget would sit.
 * - identity: R12, the signed-in visitor's display profile ({ name, firstName, email, photo }). `photo: "visitor"` is the
 *   bundled fictional portrait, `photo: "broken"` a URL that fails so the initials fallback shows, and null no photo.
 * - placeholder: the state has no design yet; the gallery marks it and shows the closest current view.
 */
type Json = Record<string, unknown>;
type DraftMessage = Omit<OakConversationMessage, "id">;
type GalleryIdentity = { name: string | null; firstName: string | null; email: string | null; photo: "visitor" | "broken" | null };
type GalleryState = { [switchKey: string]: unknown; flags?: Partial<OakFlagSet>; redo?: [number, number]; recordFacts?: Json | "pending"; id: string; label: string; placeholder?: string; open?: string; reveal?: string; atRest?: boolean; verification?: boolean; identity?: GalleryIdentity; roleLinks?: Json; explainerPresets?: string[]; diagramPresets?: string[]; contactRecord?: OakContactCardRecord; workspace: Json; documents?: Json; voice?: Json; figure?: OakFigureBarsData };
type Fixture = { id: string; input: { turns: { role: string; text: string }[] }; expected: Json & { claims?: unknown[] } };

const gallery = states as GalleryState[];
const fixtures = new Map((workAnswers.fixtures as unknown as Fixture[]).map(fixture => [fixture.id, fixture]));
const conversationId = "00000000-0000-4000-8000-000000000001";
const minute = 60_000;
const day = 24 * 60 * minute;

function claimsOf(id: unknown) {
  const claims = fixtures.get(String(id))?.expected.claims;
  if (!claims) throw new Error(`Unknown answer fixture ${String(id)}`);
  return claims;
}

function answerOf(value: unknown, knowledgeRevision: string): OakAnswer | null {
  if (!value) return null;
  const base = typeof value === "string" ? fixtures.get(value)?.expected : value as Json;
  if (!base) throw new Error(`Unknown answer fixture ${String(value)}`);
  const { evidenceFrom, rows, ...rest } = base as Json & { evidenceFrom?: string; rows?: Json[] };
  return {
    schema: "oak.answer.v1", speaker: "oak-ai-host", operations: [],
    characterVersion: workAnswers.characterVersion, hardPolicyVersion: workAnswers.hardPolicyVersion,
    ...rest,
    knowledgeRevision,
    ...(evidenceFrom ? { evidence: claimsOf(evidenceFrom) } : {}),
    ...(rows ? { rows: rows.map(({ evidenceFrom: from, ...row }) => ({ ...row, evidence: from ? claimsOf(from) : [] })) } : {}),
  } as unknown as OakAnswer;
}

function messagesOf(entries: Json[], knowledgeRevision: string): OakConversationMessage[] {
  const shell = { answer: null, cards: [], usage: null, state: "complete" as const, page: "/__dev/oak-states", text: "" };
  // Fixture step times are negative offsets from now, so durations and the live clock read like a real turn.
  const timed = (steps: unknown) => Array.isArray(steps) ? (steps as Json[]).map(step => ({ ...step,
    ...(typeof step.startedAt === "number" ? { startedAt: Date.now() + step.startedAt } : {}),
    ...(typeof step.endedAt === "number" ? { endedAt: Date.now() + step.endedAt } : {}) })) as unknown as OakConversationMessage["steps"] : undefined;
  return entries.flatMap((entry): DraftMessage[] => {
    if (typeof entry.ask === "string") {
      const { ask, user, ...fields } = entry as Json & { ask: string; user?: Json };
      const fixture = fixtures.get(ask);
      if (!fixture) throw new Error(`Unknown answer fixture ${ask}`);
      const question = fixture.input.turns.filter(turn => turn.role === "visitor").at(-1)?.text ?? "";
      // ARCH@24: every message field a fixture names passes through, as on the direct path below. A copied field list
      // dropped the Worker's contact card, so a duplicate Contact Steve only showed live (R12).
      return [{ ...shell, ...user, role: "user" as const, text: question },
        { ...shell, ...fields, role: "assistant" as const, ...(entry.steps ? { steps: timed(entry.steps) } : {}), answer: answerOf(ask, knowledgeRevision) } as unknown as DraftMessage];
    }
    return [{ ...shell, ...entry, ...(entry.steps ? { steps: timed(entry.steps) } : {}), answer: answerOf(entry.answer, knowledgeRevision) } as unknown as DraftMessage];
  }).map((message, index) => ({ ...message, id: `m${index + 1}` }));
}

function savedRows() {
  const now = Date.now(), midnight = new Date(now).setHours(0, 0, 0, 0);
  const base = Math.max(midnight + 20 * minute, Math.min(now, midnight + 12 * 60 * minute));
  const daysBefore = (daysAgo: number) => { const date = new Date(base); date.setDate(date.getDate() - daysAgo); return date.getTime(); };
  // Q16-D10: rows carry the visitor's first question as their title, as the Worker's list does.
  const titles = ["How does Steve approach AI systems?", "Compare a senior design engineer role with Steve's work",
    "What did Steve learn from building EcoSmartLoop's scanner flow with real users?"];
  return [0, 1, 4].map((daysAgo, index) => {
    const saved = daysBefore(daysAgo);
    return { conversationId: `00000000-0000-4000-8000-00000000010${index}`, version: 1, messageCount: 4 + index * 2, title: titles[index],
      createdAt: saved - 20 * minute, lastSavedMessageAt: saved, updatedAt: saved, expiresAt: saved + 30 * day, lastNewSavedMessageId: `m${4 + index * 2}` };
  });
}

function workspaceOf(entry: GalleryState, knowledgeRevision: string): Partial<OakWorkspaceState> {
  const { messages, savedConversations, historyLifecycle, savedRecord, ...rest } = entry.workspace as Json & { messages?: Json[]; historyLifecycle?: Json; savedRecord?: Json };
  const rows = savedConversations === "sample" ? savedRows() : [];
  const expanded = messagesOf(messages ?? [], knowledgeRevision);
  return {
    ...rest,
    presentation: "human-agent", agentEligible: true, route: window.location.pathname,
    conversationId: expanded.length || entry.documents ? conversationId : null,
    messages: expanded,
    ...(rows.length ? { savedConversations: rows } : {}),
    ...(savedRecord ? { savedRecord: { ...savedRecord, expiresAt: Date.now() + 30 * day } } : {}),
    ...(historyLifecycle ? { historyLifecycle: { ...historyLifecycle, target: historyLifecycle.target === "first" ? rows[0] ?? null : null } } : {}),
  } as Partial<OakWorkspaceState>;
}

function documentsOf(value: Json): Partial<OakDocumentsSnapshot> {
  const { docs, select, use, scanned, expiresIn = 30, ...rest } = value as Json & { docs?: Json[]; select?: number[]; use?: boolean; expiresIn?: number; scanned?: { label: string; pages: number; bytes: number } };
  const documents = (docs ?? []).map((doc, index) => {
    const text = String(doc.text);
    let cursor = 0;
    const sections = text.split("\n\n").map((block, number) => {
      const start = text.indexOf(block, cursor), end = start + block.length;
      cursor = end;
      return { id: `section-${number + 1}`, start, end, sourceStart: start, sourceEnd: end };
    });
    const bytes = new TextEncoder().encode(text).byteLength;
    return { documentId: `00000000-0000-4000-8000-00000000020${index}`, slots: [index], kind: doc.kind, text, sections, offsetUnit: "utf16",
      normalizedBytes: bytes, tokens: Math.ceil(bytes / 4), normalizationComplete: true, extractionCompleteness: "complete",
      pageMapping: "unavailable", warnings: doc.warnings ?? [], authority: "visitor-text-only" };
  });
  const selections = documents.flatMap(document => document.sections.filter((_section, index) => select?.includes(index + 1))
    .map(section => ({ documentId: document.documentId, sectionId: section.id, start: section.start, end: section.end })));
  const now = Date.now();
  const ocr = scanned ? { ocrSource: { ...scanned, expiresAt: now + 30 * minute } } : {};
  const names = Object.fromEntries((docs ?? []).flatMap((doc, index) => doc.name ? [[documents[index]!.documentId, String(doc.name)]] : []));
  return { ...rest, ...(documents.length ? { documents, selections, names, ...(use ? { usedSelections: selections } : {}), expiresAt: now + expiresIn * minute } : {}), ...ocr } as Partial<OakDocumentsSnapshot>;
}

function availableVoice(): VoiceHttpConfiguration {
  const now = Date.now();
  return { enabled: true, status: { schemaVersion: 1, service: "transcription", enabled: true, admission: "available", failure: "none",
    evidence: { settings: "verified", providerUsage: "verified", localReservations: "verified" },
    allowance: { unit: "micro-usd", limit: 100_000, providerObserved: 0, reserved: 0, conservativeUsed: 0, remainingBound: 100_000, periodStart: null, periodEnd: null, reset: "unknown" },
    health: { lastCheckAt: now, settingsObservedAt: now, usageObservedAt: now, lastAttemptAt: null, lastSuccessAt: null, accepted: 0, failed: 0, timedOut: 0 },
  } } as unknown as VoiceHttpConfiguration;
}

const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
async function click(selector: string, text?: string) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const target = [...document.querySelectorAll<HTMLElement>(selector)].find(element => !text || element.textContent?.includes(text));
    if (target) { target.click(); await frame(); return; }
    await frame();
  }
  throw new Error(`Gallery could not find ${selector} ${text ?? ""}`);
}

/** PR 1d: pastes the box's own text through the paste handler, so the Compare a role offer shows as it does for a visitor. */
async function pasteDraft() {
  const field = document.querySelector<HTMLTextAreaElement>("#oak-composer-input");
  if (!field) throw new Error("Gallery could not find the message box");
  const data = new DataTransfer();
  data.setData("text/plain", field.value);
  field.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  await frame();
}

/** PR 1e: selects the opening words of the newest answer's text, the way a drag would, so the selection bar shows. */
async function selectAnswerWords() {
  const node = [...document.querySelectorAll(".oak-turn__answer p, .oak-turn__answer li")].filter(element => !element.closest(".oak-turn__kind") && (element.textContent?.trim().length ?? 0) >= 24).at(-1);
  const walker = node ? document.createTreeWalker(node, NodeFilter.SHOW_TEXT) : null;
  const first = walker?.nextNode();
  if (!walker || !first) throw new Error("Gallery could not find answer words to select");
  // Like a drag across the opening words: on through the text nodes until about 44 characters are covered.
  let last = first, total = first.textContent!.length;
  while (total < 44 && walker.nextNode()) { last = walker.currentNode; total += last.textContent!.length; }
  const range = document.createRange();
  range.setStart(first, 0);
  range.setEnd(last, Math.max(0, last.textContent!.length - Math.max(0, total - 44)));
  document.getSelection()?.removeAllRanges();
  document.getSelection()?.addRange(range);
  // The bar pops in over a few frames; the state is ready once it has settled.
  await new Promise(resolve => setTimeout(resolve, 500));
  await frame();
}

/** PR 1e: opens the prepared brief's email draft. A mail link would leave the page, so its default action is held back. */
async function openBriefEmail() {
  document.addEventListener("click", event => { if ((event.target as Element).closest("a[href^='mailto:']")) event.preventDefault(); }, true);
  await click(".oak-brief-actions a[href^='mailto:']");
}

/** The record-facts request never answers, so a block reading it stays at its ghost. */
function holdRecordFacts() {
  const real = window.fetch.bind(window);
  window.fetch = (input, init) => String(input instanceof Request ? input.url : input).includes("/oak/record-facts.") ? new Promise<Response>(() => {}) : real(input, init);
}

// Ticket 161: each switch file names its gallery key, so a state pins a switch by that key; the presets and Role's links take other shapes.
const switchFiles = Object.values(import.meta.glob<Record<string, unknown>>("@/lib/oakFlags/*.ts", { eager: true }));
const explicitForces = new Set<unknown>([forceOakRoleEntryLinks, forceOakDiagramPresets, forceOakExplainerPresets]);

function forceSwitches(entry: GalleryState) {
  for (const file of switchFiles) {
    for (const [name, force] of Object.entries(file)) {
      if (name.startsWith("force") && !explicitForces.has(force)) (force as (on: unknown) => void)(entry[file.oakGalleryKey as string] ?? null);
    }
  }
}

async function applyState(entry: GalleryState, knowledgeRevision: string) {
  // A state pins the switches it names (the PR 1b drawer, the PR 1e behaviors); every other switch follows its shipped constant.
  forceOakFlags(entry.flags ?? {});
  forceSwitches(entry);
  forceOakRoleEntryLinks((entry.roleLinks as never) ?? null);
  // Ticket 45: a record preset state pins which Diagram and Explainer presets count as taught.
  forceOakDiagramPresets(entry.diagramPresets ?? null);
  forceOakExplainerPresets(entry.explainerPresets ?? null);
  // Ticket 49: a Contact card state pins its record and starts a fresh once-per-conversation count.
  forceOakContactCardRecord(entry.contactRecord ?? null);
  resetOakContactCardOnce();
  if (entry.recordFacts === "pending") holdRecordFacts();
  else if (entry.recordFacts) primeOakRecordFacts(knowledgeRevision, { version: 1, knowledgeRevision, records: entry.recordFacts as never });
  // A card that fetches its record (the site app card) has its facts before the gallery reports ready.
  else await loadOakRecordFacts(knowledgeRevision);
  // Every state starts from its own identity, so a photo from the last state never leaks into the next one.
  if (entry.identity) {
    const { photo, ...identity } = entry.identity;
    setOakAccountIdentityFixture({ ...identity, imageUrl: photo === "visitor" ? visitorPhoto.src : photo === "broken" ? "/__dev/missing-visitor-photo.jpg" : null });
  } else setOakAccountIdentityFixture(null);
  const workspace = workspaceOf(entry, knowledgeRevision);
  const messages = workspace.messages ?? [];
  // Ticket 56: redo [question, count] marks that question as Edit or Ask again before the next one sent.
  resetOakRedo();
  if (entry.redo) markOakRedo(messages[entry.redo[0]]?.id ?? "", entry.redo[1]);
  const last = messages.at(-1);
  // Replay a completed turn the way a visitor sees it: pending first, then the whole answer lands.
  // A state marked atRest mounts with every turn already on screen, the way a reopened conversation does.
  const replay = !entry.atRest && last?.role === "assistant" && last.state === "complete" && messages.at(-2)?.role === "user";
  if (replay) {
    setOakWorkspaceFixture({ ...workspace, pending: true, messages: [...messages.slice(0, -1), { ...last, state: "pending", answer: null, text: "", cards: [] }] });
    await frame();
  }
  setOakWorkspaceFixture(replay ? { pending: false, progress: "", ...workspace } : workspace);
  // The transcript settles a landed answer over a few frames (follow, then read from its question), then the answer
  // finishes arriving (a work answer streams for up to about 4 s, then its actions) and its reasoning folds, so "ready"
  // means the state at rest: no held answer, no thought typing, no fold playing, and the actions in the tab order.
  if (replay) {
    for (let settle = 0; settle < 4; settle++) await frame();
    const started = performance.now();
    await new Promise(resolve => setTimeout(resolve, 700));
    const busy = "[data-slot='message'][data-held], .ui-stream-text[data-streaming], .ui-chain-of-thought[data-folding], .oak-turn__answer [data-slot='message-footer'][inert]";
    while (performance.now() - started < 9000 && document.querySelector(busy)) await new Promise(resolve => setTimeout(resolve, 100));
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (entry.documents) getOakDocumentsController().setFixture(documentsOf(entry.documents));
  if (entry.verification) setOakTurnstileFixture();
  if (entry.voice) {
    const { available = true, ...phase } = entry.voice as Json & { available?: boolean };
    setOakWorkspaceFixture({ voiceOpen: true, voiceConfiguration: available ? availableVoice() : disabledVoiceConfiguration });
    await frame();
    getOakVoiceController().setFixture({ seconds: 0, transcript: "", failure: null, ...phase } as Partial<VoiceCaptureState>);
  }
  await frame();
  // R11: answers and the model moved from Tools to the header's account menu.
  if (entry.open === "funding") { await click("[data-oak-account-trigger]"); await click(".oak-account-menu__item", "Answers and model"); }
  else if (entry.open === "tools") await click("[data-oak-tools-trigger]");
  else if (entry.open === "account") await click("[data-oak-account-trigger]");
  else if (entry.open === "contact") await click("[data-oak-contact-trigger]");
  else if (entry.open === "trail") await click(".ui-chain-of-thought__header");
  else if (entry.open === "peeks") {
    await click(".ui-chain-of-thought__header");
    await click(".oak-cot__peek-toggle");
    for (const toggle of [...document.querySelectorAll<HTMLElement>(".oak-cot__peek-toggle")].slice(1)) toggle.click();
  }
  else if (entry.open === "dictate") await click("button[aria-label='Dictate a message']");
  else if (entry.open === "paste") await pasteDraft();
  else if (entry.open === "selection") await selectAnswerWords();
  else if (entry.open === "brief-opened") await openBriefEmail();
  else if (entry.open === "stack-map-tool") await click(".oak-stack-map__trigger");
  else if (entry.open === "sources-sheet") await click(".oak-answer__sources-button");
  else if (entry.open === "source-chip") await click(".oak-source-chip__trigger");
  else if (entry.open === "screens-viewer") await click(".oak-screens__open");
  else if (entry.open === "screens-viewer-no-caption") { await click(".oak-screens__open"); await click(".oak-screens-viewer__toggle"); }
  else if (entry.open === "page-card-second") await click(".oak-page-card:nth-child(2) .oak-page-card__head");
  else if (entry.open === "diagram-step") await click(".oak-diagram__node", "Identity and billing");
  else if (entry.open === "diagram-list") await click(".oak-figure button[aria-controls]", "Show as list");
  else if (entry.open === "contact-card-focus") await click(".oak-contact-card__title");
  else if (entry.open === "contact-card-decline") await click(".oak-contact-card__decline");
  // PR 1e: Edit shows on hover or focus, so a still focuses the first one, or presses it to show what sending will do.
  else if (entry.open === "edit-focus") document.querySelector<HTMLElement>("button[aria-label^='Edit question']")?.focus();
  else if (entry.open === "edit-click") {
    await click("button[aria-label^='Edit question']");
    document.querySelector(".oak-turn__edit-note")?.scrollIntoView({ block: "center", behavior: "instant" });
  }
  if (entry.reveal) document.querySelector(entry.reveal)?.scrollIntoView({ block: "start", behavior: "instant" });
  await frame();
}

/** Scroller probes for the capture script's `--check scroller`. */
function installProbes() {
  const append = (messages: DraftMessage[], next: Partial<OakWorkspaceState> = {}) =>
    setOakWorkspaceFixture({ ...next, messages: [...getOakWorkspace().messages, ...messages.map((message, index) => ({ ...message, id: `probe-${Date.now()}-${index}` }))] });
  const shell = { answer: null, cards: [], usage: null, page: "/__dev/oak-states" };
  Object.assign(window, { __oakGallery: {
    appendAssistant: (text: string) => append([{ ...shell, role: "assistant", text, state: "complete" }]),
    sendUser: (text: string) => append([{ ...shell, role: "user", text, state: "complete" }, { ...shell, role: "assistant", text: "", state: "pending" }],
      { pending: true, progress: "Preparing an answer" }),
    // A real answer completes the pending assistant item in place; it does not append a new one.
    completeAssistant: (text: string) => setOakWorkspaceFixture({ pending: false, progress: "",
      messages: getOakWorkspace().messages.map((message, index, all) => index === all.length - 1 ? { ...message, text, state: "complete" } : message) }),
    // Live-provider states (the mounted Clerk sign-in) patch a fixture with values supplied at capture time, never stored here.
    // Fixture message ids do not satisfy the sign-in handoff schema, so the live capture starts from an empty transcript.
    setAuthKey: (publishableKey: string) => {
      const status = getOakWorkspace().authStatus;
      if (status) setOakWorkspaceFixture({ messages: [], conversationId: null, authStatus: { ...status, publishableKey } });
    },
  } });
}

export function OakStatesGallery({ activitySprites, citationLabels }: {
  activitySprites?: OakSprites; citationLabels: OakCitationLabels;
}) {
  const id = new URLSearchParams(window.location.search).get("state");
  const entry = gallery.find(state => state.id === id);
  React.useEffect(() => {
    const root = document.documentElement;
    if (!entry) { root.dataset.oakGallery = id ? "missing" : "index"; return; }
    if (entry.figure) { root.dataset.oakGallery = "ready"; return; }
    installProbes();
    applyState(entry, citationLabels.knowledgeRevision)
      // Ready once the workspace has finished its opening stagger, so captures and tests measure settled content.
      .then(() => new Promise<void>(resolve => {
        const started = performance.now();
        const check = () => !document.querySelector(".oak-workspace[data-entering]") || performance.now() - started > 1500 ? resolve() : requestAnimationFrame(check);
        requestAnimationFrame(check);
      }))
      .then(() => { root.dataset.oakGallery = "ready"; })
      .catch(error => { root.dataset.oakGallery = "error"; console.error(error); });
  }, [entry, id, citationLabels.knowledgeRevision]);
  if (!entry) return <nav className="dev-oak-states__index" aria-label="Oak AI Agent states">
    <h1>Oak AI Agent states</h1>
    {id ? <p>No state named {id}.</p> : null}
    <ol>{gallery.map(state => <li key={state.id}><a href={`?state=${state.id}`}>{state.id}</a> {state.label}{state.placeholder ? " (not designed yet)" : ""}</li>)}</ol>
  </nav>;
  return <>
    <aside className="dev-oak-states__caption">
      <p><a href="?">States</a> / {entry.id}</p>
      <p>{entry.label}</p>
      {entry.placeholder ? <p data-oak-gallery-placeholder>Not designed yet. {entry.placeholder}</p> : null}
    </aside>
    {/* Ticket 06: a figure fixture shows the figure alone on the agent's tokens, without the workspace's own frame; no OpenUI component draws one yet. */}
    {entry.figure ? <main className="oak-workspace" data-gallery-figure>
      <OakFigure caption={entry.figure.caption} items={oakFigureBarItems(entry.figure)}><OakFigureBars data={entry.figure} /></OakFigure>
    </main> : <OakWorkspace activitySprites={activitySprites} citationLabels={citationLabels} />}
  </>;
}
