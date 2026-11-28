"use client";

import * as React from "react";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import {
  getOakMascotEntry,
  oakMascotDefaultContextId,
  oakMascotSprite,
  type OakMascotAnimation,
  type OakMascotEntry,
  type OakMascotMessage,
  type OakMascotSpriteFrame,
  type OakMascotTrigger,
} from "@/data/oakMascot";
import { getCompactMascotImageSet, getMascotImageSet } from "@/data/generated/mascotImageSets";
import { OAK_MASCOT_EVENT, type OakMascotEventDetail } from "@/lib/oakMascotEvents";
import { getTypewriterGraphemes, typewriterVisibleCount, MascotCallbackOwner, retainMascotReadingState, type MascotSpeech } from "@/lib/oakMascotLifecycle";
import { useReducedMotionPreference } from "@/lib/useReducedMotionPreference";
import { Icon } from "@/components/ui/Icon";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type OakMascotProps = {
  currentPath?: string;
  enabled: boolean;
};

type SpeechState = MascotSpeech;

// Every phone and 1x desktop keeps the compact sheet. Dense desktop screens upgrade to the full sheet
// only after the load event, a short pause, and an idle slot, so the 900 KB file never competes with first paint.
const FULL_SHEET_QUERY = "(min-width: 821px) and (min-resolution: 1.25dppx)";
const FULL_SHEET_DELAY_MS = 3000;
const FULL_SHEET_IDLE_TIMEOUT_MS = 2000;

function useFullSpriteSheet(enabled: boolean): boolean {
  const [full, setFull] = React.useState(false);
  React.useEffect(() => {
    if (!enabled) return;
    const query = window.matchMedia(FULL_SHEET_QUERY);
    let ready = false;
    let timer = 0;
    let idle = 0;
    const sync = () => setFull(ready && query.matches);
    const arm = () => {
      timer = window.setTimeout(() => {
        if (typeof window.requestIdleCallback === "function") {
          idle = window.requestIdleCallback(() => { ready = true; sync(); }, { timeout: FULL_SHEET_IDLE_TIMEOUT_MS });
        } else {
          ready = true;
          sync();
        }
      }, FULL_SHEET_DELAY_MS);
    };
    if (document.readyState === "complete") arm();
    else window.addEventListener("load", arm, { once: true });
    query.addEventListener("change", sync);
    return () => {
      window.removeEventListener("load", arm);
      query.removeEventListener("change", sync);
      window.clearTimeout(timer);
      if (idle && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
    };
  }, [enabled]);
  return full;
}

type ScrollContextCandidate = {
  id: string;
  element: HTMLElement;
  sectionId: string | null;
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
  docTop: number;
  docBottom: number;
};

type ScrollContextRow = {
  candidates: ScrollContextCandidate[];
  top: number;
  bottom: number;
  docTop: number;
  docBottom: number;
};

const SESSION_COLLAPSED_KEY = "steveoak-oak-mascot-collapsed";
const SESSION_WELCOMED_KEY = "steveoak-oak-mascot-welcomed";
const GLOBAL_COOLDOWN_MS = 2400;
const NOTE_READ_MS = 12000;
const TYPEWRITER_MS_PER_GRAPHEME = 18;
const TYPEWRITER_MIN_DURATION_MS = 180;
const CONTEXT_ROW_TOLERANCE = 96;
const HOME_FEATURE_CONTEXT_SEQUENCE = [
  "home.feature.technology",
  "home.feature.design",
  "home.feature.bay-area",
] as const;

function canUseStorage(storage: Storage | undefined): storage is Storage {
  return typeof storage !== "undefined";
}

const agentInviteContextId = "oak.agent-invite";

function normalizeMessage(message: OakMascotMessage) {
  return typeof message === "string" ? { text: message, triggers: undefined } : message;
}

function getMessagePool(entry: OakMascotEntry, trigger?: OakMascotTrigger) {
  const messages = entry.messages.map(normalizeMessage);
  const triggerPool = trigger
    ? messages.filter((message) => !message.triggers || message.triggers.includes(trigger))
    : messages;
  return triggerPool.length > 0 ? triggerPool : messages;
}

function pickMessage(entry: OakMascotEntry, previousText: string | undefined, trigger?: OakMascotTrigger) {
  const contextPool = getMessagePool(entry, trigger);
  const choices = contextPool.filter((message) => message.text !== previousText);
  const pool = choices.length > 0 ? choices : contextPool;
  return pool[Math.floor(Math.random() * pool.length)] ?? contextPool[0] ?? { text: "" };
}

function getHomeFeatureContextIndex(contextId: string | null | undefined) {
  if (!contextId) return -1;
  return HOME_FEATURE_CONTEXT_SEQUENCE.findIndex((featureContextId) => featureContextId === contextId);
}

function getNextHomeFeatureContext(contextId: string | null | undefined) {
  const index = getHomeFeatureContextIndex(contextId);
  if (index < 0) return null;
  return HOME_FEATURE_CONTEXT_SEQUENCE[(index + 1) % HOME_FEATURE_CONTEXT_SEQUENCE.length];
}

function getPageInitialContext(pathname: string | undefined) {
  if (pathname === "/work/oakminder" || pathname === "/work/oakminder/") return "oakminder.hero";
  if (pathname === "/work/ecosmartloop" || pathname === "/work/ecosmartloop/") return "ecosmartloop.hero";
  if (pathname === "/work/linkedin-growth-loop" || pathname === "/work/linkedin-growth-loop/") {
    return "linkedin-growth.hero";
  }
  if (pathname === "/work" || pathname === "/work/") return "home.work";
  if (pathname === "/404" || pathname === "/404/") return "404.hero";
  return "home.hero";
}

type RouteMascotOverride = {
  animation: OakMascotAnimation;
  collapsedAnimation: OakMascotAnimation;
  character: "oak" | "orbi" | "claw";
  name: "Oak" | "Orbi" | "Claw";
};

function getRouteMascotOverride(pathname: string | undefined): RouteMascotOverride | null {
  if (pathname === "/work/oakminder" || pathname === "/work/oakminder/") {
    return {
      animation: "oakminderSleepAlarm",
      collapsedAnimation: "oakminderAlarmCollapsed",
      character: "oak",
      name: "Oak",
    };
  }
  if (pathname === "/work/ecosmartloop" || pathname === "/work/ecosmartloop/") {
    return {
      animation: "ecosmartloopOrbiGuide",
      collapsedAnimation: "ecosmartloopOrbiCapCollapsed",
      character: "orbi",
      name: "Orbi",
    };
  }
  if (pathname === "/work/linkedin-growth-loop" || pathname === "/work/linkedin-growth-loop/") {
    return {
      animation: "clawLinkedinGrowthControl",
      collapsedAnimation: "clawLinkedinGrowthCollapsedClaw",
      character: "claw",
      name: "Claw",
    };
  }
  return null;
}

function estimateBubbleMultiline(text: string) {
  const length = getTypewriterGraphemes(text).length;
  if (text.includes("\n")) return true;
  if (typeof window === "undefined") return length > 42;
  const width = window.innerWidth;
  const characterLimit = width <= 380 ? 20 : width <= 640 ? 26 : 42;
  return length > characterLimit;
}

const pageContent = "a, button, input, select, textarea, summary, p, li, h1, h2, h3, h4, h5, h6, figcaption";

function bubbleCoversPage(bubble: HTMLElement) {
  const box = bubble.getBoundingClientRect();
  return [...document.querySelectorAll<HTMLElement>(pageContent)].some((element) => {
    if (element.closest(".oak-mascot")) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1
      && rect.left < box.right && rect.right > box.left && rect.top < box.bottom && rect.bottom > box.top
      && getComputedStyle(element).visibility !== "hidden";
  });
}

function getScrollContextCandidates() {
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const scrollTop = window.scrollY;

  return Array.from(document.querySelectorAll<HTMLElement>("[data-oak-context]"))
    .map((element) => {
      if (element.closest(".route-exit-layer")) return null;
      const id = element.dataset.oakContext;
      if (!id || !getOakMascotEntry(id)) return null;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      if (rect.bottom < viewportHeight * 0.06 || rect.top > viewportHeight * 0.92) return null;
      if (rect.right < 0 || rect.left > viewportWidth) return null;

      const sectionElement = element.closest<HTMLElement>("[data-oak-section]");
      return {
        id,
        element,
        sectionId: sectionElement?.dataset.oakSection ?? null,
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
        docTop: rect.top + scrollTop,
        docBottom: rect.bottom + scrollTop,
      } satisfies ScrollContextCandidate;
    })
    .filter((candidate): candidate is ScrollContextCandidate => candidate !== null)
    .sort((a, b) => a.docTop - b.docTop || a.left - b.left);
}

function groupScrollContextRows(candidates: ScrollContextCandidate[]) {
  return candidates.reduce<ScrollContextRow[]>((rows, candidate) => {
    const row = rows.find((currentRow) => Math.abs(candidate.docTop - currentRow.docTop) <= CONTEXT_ROW_TOLERANCE);
    if (!row) {
      rows.push({
        candidates: [candidate],
        top: candidate.top,
        bottom: candidate.bottom,
        docTop: candidate.docTop,
        docBottom: candidate.docBottom,
      });
      return rows;
    }

    row.candidates.push(candidate);
    row.candidates.sort((a, b) => a.left - b.left);
    row.top = Math.min(row.top, candidate.top);
    row.bottom = Math.max(row.bottom, candidate.bottom);
    row.docTop = Math.min(row.docTop, candidate.docTop);
    row.docBottom = Math.max(row.docBottom, candidate.docBottom);
    return rows;
  }, []);
}

function pickActiveScrollContext(activeContextId: string | null) {
  const candidates = getScrollContextCandidates();
  if (candidates.length === 0) return null;

  const viewportHeight = window.innerHeight;
  const anchorY = viewportHeight * 0.48;
  const rows = groupScrollContextRows(candidates);
  const activeRow = activeContextId
    ? rows.find((currentRow) => currentRow.candidates.some((candidate) => candidate.id === activeContextId))
    : null;
  let row: ScrollContextRow | undefined;
  const activeRowContainsAnchor = activeRow ? anchorY >= activeRow.top && anchorY <= activeRow.bottom : false;
  if (activeRow && activeRow.candidates.length > 1 && activeRowContainsAnchor) {
    row = activeRow;
  } else {
    row = rows
      .map((currentRow) => {
        const distance =
          anchorY >= currentRow.top && anchorY <= currentRow.bottom
            ? 0
            : Math.min(Math.abs(currentRow.top - anchorY), Math.abs(currentRow.bottom - anchorY));
        const visibleHeight = Math.max(0, Math.min(currentRow.bottom, viewportHeight) - Math.max(currentRow.top, 0));
        return { row: currentRow, distance, visibleHeight };
      })
      .sort((a, b) => a.distance - b.distance || b.visibleHeight - a.visibleHeight || a.row.docTop - b.row.docTop)[0]
      ?.row;
  }

  if (!row) return null;
  const ordered = [...row.candidates].sort((a, b) => a.left - b.left);
  if (ordered.length === 1) return ordered[0];

  const start = row.docTop - viewportHeight * 0.08;
  const end = row.docBottom - viewportHeight * 0.14;
  const range = Math.max(1, end - start);
  const progress = Math.min(0.999, Math.max(0, (window.scrollY - start) / range));
  const index = Math.min(ordered.length - 1, Math.floor(progress * ordered.length));
  return ordered[index];
}

export function OakMascot({ currentPath, enabled }: OakMascotProps) {
  const retained = React.useMemo(() => {
    const value = retainMascotReadingState(currentPath ?? "/");
    const entry = value.speech ? getOakMascotEntry(value.speech.contextId) : null;
    if (value.speech && (!entry || !entry.messages.map(normalizeMessage).some((message) => message.text === value.speech?.text))) {
      // An edited or retired authored note is no longer eligible for restoration.
      value.speech = null;
      value.typedText = "";
      value.activeContext = null;
      value.typewriter = null;
      value.noteDeadline = null;
      value.welcomeDeadline = null;
    }
    return value;
  }, [currentPath]);
  const callbacks = React.useMemo(() => new MascotCallbackOwner(), []);
  const enabledRef = React.useRef(enabled);
  enabledRef.current = enabled;
  const canRead = React.useCallback(() => enabledRef.current &&
    document.documentElement.dataset.oakPresentation !== "human-agent" &&
    document.documentElement.dataset.menuOpen !== "true" &&
    document.documentElement.dataset.contactMorphOpen !== "true" &&
    document.querySelector("dialog[open]") === null &&
    ((currentPath === "/404" && document.querySelector("[data-oak-section='404.hero']") !== null) ||
      (window.location.pathname.replace(/\/$/, "") || "/") === ((currentPath ?? "/").replace(/\/$/, "") || "/")), [currentPath]);
  const shouldReduceMotion = useReducedMotionPreference();
  const fullSpriteSheet = useFullSpriteSheet(enabled);
  const { scrollY } = useScroll();
  const [collapsed, setCollapsed] = React.useState(retained.collapsed);
  const [expandNonce, setExpandNonce] = React.useState(0);
  const [isScrollTransitioning, setIsScrollTransitioning] = React.useState(false);
  const [speech, setSpeech] = React.useState<SpeechState | null>(retained.speech);
  const [typedText, setTypedText] = React.useState(retained.typedText);
  const [bubbleMultiline, setBubbleMultiline] = React.useState(retained.bubbleMultiline);
  const [bubbleCovering, setBubbleCovering] = React.useState(false);
  const bubbleRef = React.useRef<HTMLDivElement | null>(null);
  const [frame, setFrame] = React.useState(retained.frame);
  const lastSpeechAtRef = React.useRef(retained.lastSpeechAt);
  const lastContextAtRef = React.useRef<Record<string, number>>(retained.lastContextAt);
  const activeSectionRef = React.useRef<string | null>(retained.activeSection);
  const activeContextRef = React.useRef<string | null>(retained.activeContext);
  const speechKeyRef = React.useRef(retained.speechKey);
  const previousTextRef = React.useRef<string | undefined>(retained.previousText);
  const isDraggingRef = React.useRef(false);
  const typewriterStoppedRef = React.useRef(false);
  const typewriterRunRef = React.useRef(0);
  const scrollContextFrameRef = React.useRef<number | null>(null);
  React.useLayoutEffect(() => {
    if (enabled) retained.clock.resume();
    else { retained.clock.pause(); callbacks.cancel(); isDraggingRef.current = false; }
    return () => { retained.clock.pause(); callbacks.cancel(); };
  }, [callbacks, enabled, retained]);

  React.useLayoutEffect(() => {
    Object.assign(retained, {
      collapsed, speech, typedText, bubbleMultiline, frame,
      activeSection: activeSectionRef.current, activeContext: activeContextRef.current,
      lastSpeechAt: lastSpeechAtRef.current, lastContextAt: lastContextAtRef.current,
      speechKey: speechKeyRef.current, previousText: previousTextRef.current,
    });
  });

  const scheduleOwnedTimeout = React.useCallback((callback: () => void, delay: number) => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    const timeout = window.setTimeout(callbacks.guard(() => {
      if (cancelled) return;
      cleanup?.();
      if (canRead()) callback();
    }), delay);
    cleanup = callbacks.own(() => { cancelled = true; window.clearTimeout(timeout); });
    return cleanup;
  }, [callbacks, canRead]);

  const setVisibleTypedText = React.useCallback((text: string) => {
    setTypedText(text);
  }, []);

  React.useEffect(() => {
    if (!retained.initialized) {
      retained.initialized = true;
      if (canUseStorage(window.sessionStorage)) {
        setCollapsed(window.sessionStorage.getItem(SESSION_COLLAPSED_KEY) === "true");
      }
    }
  }, [retained]);

  const speak = React.useCallback(
    (contextId: string | null | undefined, options: { immediate?: boolean; trigger?: OakMascotTrigger; source?: "scroll" | "direct" } = {}) => {
      if (!canRead() || collapsed) return;
      const entry = getOakMascotEntry(contextId) ?? getOakMascotEntry(oakMascotDefaultContextId);
      if (!entry) return;

      const now = retained.clock.now();
      const lastGlobal = lastSpeechAtRef.current;
      const lastContext = lastContextAtRef.current[entry.id] ?? 0;
      const cooldownMs = entry.cooldownMs ?? 18000;

      if (!options.immediate && lastGlobal > 0 && now - lastGlobal < GLOBAL_COOLDOWN_MS) return;
      if (!options.immediate && lastContext > 0 && now - lastContext < cooldownMs) return;

      // Every third line between page notes invites the visitor to the agent, only where its launcher is on the page.
      const invite = speechKeyRef.current % 3 === 2 && !getRouteMascotOverride(currentPath) && !/^(contact|event)\./.test(entry.id) &&
        document.querySelector("[data-oak-workspace-launcher]") ? getOakMascotEntry(agentInviteContextId) : undefined;
      const spoken = invite ?? entry;
      // Invites rotate in order so every one shows before any repeats.
      const message = invite ? normalizeMessage(invite.messages[Math.floor(speechKeyRef.current / 3) % invite.messages.length])
        : pickMessage(entry, previousTextRef.current, options.trigger);
      const text = message.text;
      activeContextRef.current = entry.id;
      previousTextRef.current = text;
      lastSpeechAtRef.current = now;
      lastContextAtRef.current[entry.id] = now;
      speechKeyRef.current += 1;
      typewriterStoppedRef.current = false;
      const nextSpeech = {
        key: speechKeyRef.current,
        contextId: spoken.id,
        rotationId: entry.id,
        text,
        trigger: options.trigger,
        animation: spoken.animation ?? "idle",
        source: options.source ?? "direct",
      };
      setSpeech(nextSpeech);
    },
    [canRead, collapsed, currentPath, enabled, retained],
  );

  // While an invite line shows, the launcher it points to gives a small nudge (CSS reads this flag).
  React.useEffect(() => {
    const root = document.documentElement;
    root.toggleAttribute("data-oak-invite", Boolean(enabled && speech?.contextId === agentInviteContextId));
    return () => root.removeAttribute("data-oak-invite");
  }, [enabled, speech?.contextId]);

  const syncRouteSpeech = React.useCallback(
    ({ allowDelay = false }: { allowDelay?: boolean } = {}) => {
      if (!canRead() || collapsed || retained.speech) return undefined;
      const storage = canUseStorage(window.sessionStorage) ? window.sessionStorage : undefined;
      const hasWelcomed = storage?.getItem(SESSION_WELCOMED_KEY) === "true";
      const pageContext = getPageInitialContext(currentPath);
      activeSectionRef.current = pageContext;
      activeContextRef.current = pageContext;
      retained.welcomeDeadline ??= retained.clock.now() + (allowDelay ? (hasWelcomed ? 900 : 650) : 0);
      return scheduleOwnedTimeout(() => {
        if (activeContextRef.current === pageContext) {
          speak(pageContext, { immediate: !hasWelcomed, trigger: "page-load" });
          storage?.setItem(SESSION_WELCOMED_KEY, "true");
          retained.welcomeDeadline = null;
        }
      }, Math.max(0, retained.welcomeDeadline - retained.clock.now()));
    },
    [canRead, collapsed, currentPath, retained, scheduleOwnedTimeout, speak],
  );

  const collapse = React.useCallback(() => {
    typewriterStoppedRef.current = true;
    if (canUseStorage(window.sessionStorage)) {
      window.sessionStorage.setItem(SESSION_COLLAPSED_KEY, "true");
    }
    setCollapsed(true);
  }, []);

  const expand = React.useCallback(() => {
    if (canUseStorage(window.sessionStorage)) {
      window.sessionStorage.setItem(SESSION_COLLAPSED_KEY, "false");
    }
    typewriterStoppedRef.current = true;
    setSpeech(null);
    setCollapsed(false);
    setExpandNonce((currentNonce) => currentNonce + 1);
  }, []);

  const refreshSpeech = React.useCallback(() => {
    const spokenContextId = speech?.contextId === agentInviteContextId ? null : speech?.contextId;
    const currentContextId = spokenContextId ?? activeContextRef.current ?? activeSectionRef.current ?? getPageInitialContext(currentPath);
    const nextFeatureContextId = getNextHomeFeatureContext(currentContextId);
    speak(nextFeatureContextId ?? currentContextId, {
      immediate: true,
      trigger: nextFeatureContextId ? "section-enter" : (speech?.trigger ?? "section-enter"),
    });
  }, [currentPath, speak, speech?.contextId, speech?.trigger]);

  const updateScrollContext = React.useCallback(() => {
    if (!canRead() || collapsed || isDraggingRef.current) return;
    const nextContext = pickActiveScrollContext(activeContextRef.current);
    if (!nextContext || activeContextRef.current === nextContext.id) return;
    if (nextContext.sectionId) {
      activeSectionRef.current = nextContext.sectionId;
    }
    speak(nextContext.id, { immediate: true, trigger: "section-enter", source: "scroll" });
  }, [canRead, collapsed, enabled, speak]);

  const scheduleScrollContextUpdate = React.useCallback(() => {
    if (!canRead() || scrollContextFrameRef.current !== null) return;
    scrollContextFrameRef.current = window.requestAnimationFrame(callbacks.guard(() => {
      scrollContextFrameRef.current = null;
      updateScrollContext();
    }));
  }, [callbacks, canRead, updateScrollContext]);

  useMotionValueEvent(scrollY, "change", scheduleScrollContextUpdate);

  const spokenExpandNonceRef = React.useRef(0);
  React.useEffect(() => {
    if (!canRead() || collapsed || expandNonce === 0 || spokenExpandNonceRef.current === expandNonce) return;
    spokenExpandNonceRef.current = expandNonce;
    speak(activeSectionRef.current ?? getPageInitialContext(currentPath), {
      immediate: true,
      trigger: "section-enter",
    });
  }, [canRead, collapsed, currentPath, enabled, expandNonce, speak]);

  React.useEffect(() => {
    if (!canRead() || collapsed || expandNonce > 0) return;
    return syncRouteSpeech({ allowDelay: true });
  }, [canRead, collapsed, currentPath, enabled, expandNonce, syncRouteSpeech]);

  React.useEffect(() => {
    if (!canRead() || collapsed) return;
    let cancelSetup: (() => void) | undefined;
    const setupScrollContext = () => {
      cancelSetup?.();
      cancelSetup = scheduleOwnedTimeout(scheduleScrollContextUpdate, 80);
    };

    // Restoring a paused note must not replace it with a queued scroll note.
    if (!retained.speech) setupScrollContext();
    window.addEventListener("resize", scheduleScrollContextUpdate);
    document.addEventListener("astro:page-load", setupScrollContext);
    document.addEventListener("astro:after-swap", setupScrollContext);
    return () => {
      cancelSetup?.();
      if (scrollContextFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollContextFrameRef.current);
        scrollContextFrameRef.current = null;
      }
      window.removeEventListener("resize", scheduleScrollContextUpdate);
      document.removeEventListener("astro:page-load", setupScrollContext);
      document.removeEventListener("astro:after-swap", setupScrollContext);
    };
  }, [canRead, collapsed, enabled, retained, scheduleOwnedTimeout, scheduleScrollContextUpdate]);

  React.useEffect(() => {
    if (!canRead() || collapsed) return;

    const handleContextPreview = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const contextElement = target.closest<HTMLElement>("[data-oak-context]");
      if (!contextElement?.dataset.oakContext) return;
      if (contextElement.closest(".route-exit-layer")) return;
      speak(contextElement.dataset.oakContext, { trigger: "target-hover" });
    };

    const handleMascotEvent = (event: Event) => {
      const detail = (event as CustomEvent<OakMascotEventDetail>).detail;
      speak(detail?.contextId, { immediate: detail?.immediate ?? true, trigger: detail?.trigger ?? "event" });
    };

    document.addEventListener("mouseover", handleContextPreview);
    document.addEventListener("focusin", handleContextPreview);
    window.addEventListener(OAK_MASCOT_EVENT, handleMascotEvent);
    return () => {
      document.removeEventListener("mouseover", handleContextPreview);
      document.removeEventListener("focusin", handleContextPreview);
      window.removeEventListener(OAK_MASCOT_EVENT, handleMascotEvent);
    };
  }, [canRead, collapsed, enabled, speak]);

  React.useEffect(() => {
    if (!canRead() || collapsed) return;
    if (!speech) {
      setIsScrollTransitioning(false);
      setVisibleTypedText("");
      return;
    }
    if (speech.source === "scroll" || shouldReduceMotion) {
      if (retained.scrollDeadline?.key !== speech.key) {
        retained.scrollDeadline = { key: speech.key, at: retained.clock.now() + 160 };
      }
      retained.typewriter = { key: speech.key, startedAt: retained.clock.now(), visibleCount: getTypewriterGraphemes(speech.text).length };
      setVisibleTypedText(speech.text);
      const remaining = Math.max(0, retained.scrollDeadline.at - retained.clock.now());
      setIsScrollTransitioning(speech.source === "scroll" && !shouldReduceMotion && remaining > 0);
      return scheduleOwnedTimeout(() => setIsScrollTransitioning(false), remaining);
    }

    setIsScrollTransitioning(false);
    typewriterStoppedRef.current = false;
    const graphemes = getTypewriterGraphemes(speech.text);
    const durationMs = Math.max(TYPEWRITER_MIN_DURATION_MS, graphemes.length * TYPEWRITER_MS_PER_GRAPHEME);
    if (retained.typewriter?.key !== speech.key) {
      retained.typewriter = { key: speech.key, startedAt: retained.clock.now(), visibleCount: 0 };
      setVisibleTypedText("");
    }
    const progressState = retained.typewriter;
    if (progressState.visibleCount >= graphemes.length) return;
    const runId = ++typewriterRunRef.current;
    let animationFrame = 0;
    const complete = () => {
      if (!canRead() || typewriterRunRef.current !== runId || typewriterStoppedRef.current) return;
      progressState.visibleCount = graphemes.length;
      setVisibleTypedText(speech.text);
    };
    const tick = callbacks.guard(() => {
      if (!canRead() || typewriterRunRef.current !== runId || typewriterStoppedRef.current) return;
      const visibleCount = typewriterVisibleCount(graphemes.length, retained.clock.now() - progressState.startedAt, durationMs);
      if (visibleCount !== progressState.visibleCount) {
        progressState.visibleCount = visibleCount;
        setVisibleTypedText(graphemes.slice(0, visibleCount).join(""));
      }
      if (visibleCount < graphemes.length) animationFrame = window.requestAnimationFrame(tick);
    });
    animationFrame = window.requestAnimationFrame(tick);
    const cancelCompletion = scheduleOwnedTimeout(complete,
      Math.max(0, durationMs - (retained.clock.now() - progressState.startedAt)) + 240);
    return () => {
      typewriterRunRef.current++;
      window.cancelAnimationFrame(animationFrame);
      cancelCompletion();
    };
  }, [callbacks, canRead, collapsed, enabled, retained, scheduleOwnedTimeout, setVisibleTypedText, shouldReduceMotion, speech]);

  React.useEffect(() => {
    if (!speech || collapsed || !enabled || typedText !== speech.text) return;
    // An invite rotates on from the page note it interrupted, so the page's own notes keep coming after it.
    const rotationId = speech.rotationId ?? speech.contextId;
    const entry = getOakMascotEntry(rotationId);
    const nextFeatureContextId = getNextHomeFeatureContext(rotationId);
    if (!nextFeatureContextId && (!entry || getMessagePool(entry, speech.trigger).length < 2)) return;

    if (retained.noteDeadline?.key !== speech.key) {
      retained.noteDeadline = { key: speech.key, at: retained.clock.now() + NOTE_READ_MS };
    }
    return scheduleOwnedTimeout(() => {
      if (typewriterStoppedRef.current || isDraggingRef.current || activeContextRef.current !== rotationId) return;
      if (nextFeatureContextId) {
        speak(nextFeatureContextId, {
          immediate: true,
          trigger: "section-enter",
        });
        return;
      }
      speak(rotationId, {
        immediate: true,
        trigger: speech.trigger ?? "section-enter",
      });
    }, Math.max(0, retained.noteDeadline.at - retained.clock.now()));
  }, [collapsed, enabled, retained, scheduleOwnedTimeout, speak, speech, typedText]);

  React.useLayoutEffect(() => {
    if (!enabled || !speech) return;
    let frame: number | null = null;
    const check = () => {
      const bubble = bubbleRef.current;
      // Stepping aside hides the actions, so keep the bubble in place while focus is inside it.
      if (bubble) setBubbleCovering(!bubble.contains(document.activeElement) && bubbleCoversPage(bubble));
    };
    const onFrame = callbacks.guard(() => {
      frame = null;
      check();
    });
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(onFrame);
    };
    check();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [callbacks, enabled, speech, typedText]);

  React.useEffect(() => {
    if (!enabled) return;
    if (!speech) {
      setBubbleMultiline(false);
      return;
    }

    const updateLineState = () => {
      setBubbleMultiline(estimateBubbleMultiline(speech.text));
    };

    updateLineState();
    window.addEventListener("resize", updateLineState);
    return () => window.removeEventListener("resize", updateLineState);
  }, [enabled, speech]);

  const routePathForMascot = currentPath ?? "/";
  const routeMascotOverride = getRouteMascotOverride(routePathForMascot);
  const oakminderCollapsedAnimation: OakMascotAnimation | null =
    routePathForMascot === "/work/oakminder" || routePathForMascot === "/work/oakminder/" ? "oakminderAlarmCollapsed" : null;
  const mascotName = routeMascotOverride?.name ?? "Oak";
  const activeAnimationName: OakMascotAnimation = collapsed
    ? (routeMascotOverride?.collapsedAnimation ?? oakminderCollapsedAnimation ?? "crownCollapsed")
    : (routeMascotOverride?.animation ?? speech?.animation ?? "idle");

  React.useEffect(() => {
    if (!enabled) return;
    const animation = oakMascotSprite.animations[activeAnimationName];
    if (retained.animationName !== activeAnimationName) {
      retained.animationName = activeAnimationName;
      setFrame(0);
    }
    if (shouldReduceMotion) return;
    const interval = window.setInterval(callbacks.guard(() => {
      if (canRead()) setFrame((currentFrame) => (currentFrame + 1) % animation.frames);
    }), 1000 / animation.fps);
    return callbacks.own(() => window.clearInterval(interval));
  }, [activeAnimationName, callbacks, canRead, enabled, retained, shouldReduceMotion]);

  const animation: OakMascotSpriteFrame = oakMascotSprite.animations[activeAnimationName];
  const spriteSrc = animation.src ?? oakMascotSprite.src;
  const spriteFrameWidth = animation.frameWidth ?? oakMascotSprite.frameWidth;
  const spriteFrameHeight = animation.frameHeight ?? oakMascotSprite.frameHeight;
  const spriteColumns = animation.columns ?? oakMascotSprite.columns;
  const spriteRows = animation.rows ?? oakMascotSprite.rows;
  const backgroundPosition = `-${frame * spriteFrameWidth}px -${animation.row * spriteFrameHeight}px`;
  const backgroundSize = `${spriteFrameWidth * spriteColumns}px ${spriteFrameHeight * spriteRows}px`;
  // Everyone starts on the compact sheet; dense desktop screens add the full one after load (data-sheet).
  const spriteImage = getMascotImageSet(spriteSrc);
  const spriteImageCompact = getCompactMascotImageSet(spriteSrc);
  return (
    <aside
      className="oak-mascot"
      hidden={!enabled}
      inert={!enabled}
      aria-hidden={!enabled}
      data-paused={!enabled ? "true" : undefined}
      data-collapsed={collapsed ? "true" : undefined}
      data-sheet={fullSpriteSheet ? "full" : undefined}
      data-character={routeMascotOverride?.character ?? "oak"}
      data-animation={activeAnimationName}
      aria-label={mascotName}
    >
          {collapsed ? (
            <motion.button
              key="crown"
              className="oak-mascot__crown-button"
              type="button"
              aria-label={`Show ${mascotName} note`}
              title={`Show ${mascotName} note`}
              onClick={expand}
              initial={shouldReduceMotion ? false : { opacity: 0, y: 8, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              whileHover={shouldReduceMotion ? undefined : { y: -2, scale: 1.04 }}
              whileFocus={shouldReduceMotion ? undefined : { y: -2, scale: 1.04 }}
              transition={{ duration: shouldReduceMotion ? 0.01 : 0.16, ease: [0.22, 1, 0.36, 1] }}
            >
              <span
                className="oak-mascot__crown"
                style={{ "--oak-sprite-image": spriteImage, "--oak-sprite-image-compact": spriteImageCompact, backgroundPosition, backgroundSize } as React.CSSProperties}
              />
            </motion.button>
          ) : (
            <motion.div
              key="full"
              className="oak-mascot__body"
              drag={shouldReduceMotion ? false : true}
              dragConstraints={{ top: -24, left: -56, right: 56, bottom: 72 }}
              dragElastic={0.18}
              dragMomentum={false}
              dragSnapToOrigin
              whileDrag={shouldReduceMotion ? undefined : { scale: 1.03 }}
              onDragStart={() => {
                isDraggingRef.current = true;
              }}
              onDragEnd={() => {
                scheduleOwnedTimeout(() => { isDraggingRef.current = false; }, 0);
              }}
              initial={shouldReduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: shouldReduceMotion ? 0.01 : 0.16, ease: [0.22, 1, 0.36, 1] }}
            >
              {speech && (
                  <motion.div
                    key={speech.source === "scroll" ? "scroll" : speech.key}
                    ref={bubbleRef}
                    className="oak-mascot__bubble"
                    data-context={speech.contextId}
                    data-multiline={bubbleMultiline ? "true" : undefined}
                    data-transitioning={isScrollTransitioning ? "true" : undefined}
                    data-covering={bubbleCovering ? "true" : undefined}
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: bubbleCovering ? 0 : 1, y: 0, scale: 1 }}
                    transition={{ duration: shouldReduceMotion ? 0.01 : 0.16, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {/* The visible character talks straight to the visitor; only assistive tech hears who is speaking. */}
                    <p className="oak-mascot__message" aria-label={`${mascotName}. ${speech.text}`}>
                      <motion.span
                        key={speech.key}
                        className="oak-mascot__message-text"
                        aria-hidden="true"
                        initial={
                          shouldReduceMotion
                            ? false
                            : {
                                opacity: speech.source === "scroll" ? 0.68 : 1,
                                y: speech.source === "scroll" ? 2 : 0,
                                filter: speech.source === "scroll" ? "blur(0.8px)" : "blur(0px)",
                              }
                        }
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        transition={{ duration: speech.source === "scroll" ? 0.16 : 0.01, ease: [0.22, 1, 0.36, 1] }}
                      >
                        {typedText}
                      </motion.span>
                    </p>
                    <div className="oak-mascot__bubble-actions" aria-label={`${mascotName} note controls`}>
                      <TooltipProvider delay={220} closeDelay={80}>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <motion.button
                                type="button"
                                aria-label={`Collapse ${mascotName} note`}
                                onClick={collapse}
                                whileHover={shouldReduceMotion ? undefined : { scale: 1.08 }}
                                whileTap={shouldReduceMotion ? undefined : { scale: 0.92 }}
                                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                              >
                                <Icon name="arrowDown" size={14} />
                              </motion.button>
                            }
                          />
                          <TooltipContent side="right" sideOffset={10}>
                            Collapse note
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </motion.div>
                )}

              <div className="oak-mascot__sprite-track">
                <motion.button
                  className="oak-mascot__sprite-button"
                  type="button"
                  aria-label={`Show another ${mascotName} note`}
                  title={`Show another ${mascotName} note`}
                  onClick={() => {
                    if (isDraggingRef.current) return;
                    refreshSpeech();
                  }}
                  whileHover={shouldReduceMotion ? undefined : { scale: 1.06, y: -2 }}
                  whileTap={shouldReduceMotion ? undefined : { scale: 0.92, y: 1 }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                >
                  <span className="oak-mascot__sprite-shell" aria-hidden="true">
                    <span
                      className="oak-mascot__sprite"
                      style={{ "--oak-sprite-image": spriteImage, "--oak-sprite-image-compact": spriteImageCompact, backgroundPosition, backgroundSize } as React.CSSProperties}
                    />
                  </span>
                </motion.button>
              </div>
            </motion.div>
          )}
      </aside>
  );
}
