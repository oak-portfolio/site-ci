"use client";

import * as React from "react";
import { AnimatePresence, LayoutGroup, MotionConfig, motion, useReducedMotion } from "motion/react";
import type { Transition, Variants } from "motion/react";
import { socialLinks } from "@/data/homePage";
import { Button, buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { emitOakMascotEvent } from "@/lib/oakMascotEvents";
import { cn } from "@/lib/utils";
import { requestOakWorkspace } from "@/lib/oakWorkspace";

type ContactMorphAppearance = "header" | "hero" | "mobile" | "footer";
type ContactMorphAlign = "start" | "center" | "end";
type ContactMorphSide = "top" | "bottom" | "left" | "right" | "inline-end" | "inline-start";
type ContactMorphPlacement = "top" | "bottom";
type ResolvedContactPlacement = {
  placement: ContactMorphPlacement;
  offset: number;
};
type CopyState = "idle" | "copying" | "copied" | "failed";

type ContactMorphProps = {
  appearance?: ContactMorphAppearance;
  destination?: "workspace" | "direct";
  align?: ContactMorphAlign;
  side?: ContactMorphSide;
  className?: string;
};

const CONTACT_EMAIL = "okkark.pro@gmail.com";
const VIEWPORT_GUTTER = 12;
const CONTACT_CARD_ESTIMATED_HEIGHT = 214;
const CONTACT_CARD_COMPACT_ESTIMATED_HEIGHT = 194;
const MotionButton = motion.button;
const MotionAnchor = motion.a;
const CLOSED_SURFACE_BACKGROUND = "#07080d";
const CLOSED_SURFACE_BORDER = "rgba(255, 255, 255, 0)";
const CLOSED_GHOST_SURFACE_BACKGROUND = "rgba(7, 8, 13, 0)";
const CLOSED_GHOST_SURFACE_BORDER = "rgba(255, 255, 255, 0)";
const OPEN_SURFACE_BACKGROUND = "#07080d";
const OPEN_SURFACE_BORDER = "rgba(255, 255, 255, 0.14)";
const CLOSED_TRIGGER_FILL_BACKGROUND = "#ffffff";
const CLOSED_SURFACE_RADIUS = "999px";
const FALLBACK_OPEN_SURFACE_RADIUS = "40px";
const SQUIRCLE_OPEN_SURFACE_RADIUS = "56px";

const openSurfaceTransition: Transition = {
  type: "tween",
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1],
};

const closeSurfaceTransition: Transition = {
  type: "tween",
  duration: 0.14,
  ease: [0.4, 0, 0.2, 1],
};

const footerOpenSurfaceTransition: Transition = {
  type: "tween",
  duration: 0.36,
  ease: [0.16, 1, 0.3, 1],
};

const footerCloseSurfaceTransition: Transition = {
  type: "tween",
  duration: 0.32,
  ease: [0.4, 0, 0.2, 1],
};

const reducedSurfaceTransition: Transition = {
  type: "tween",
  duration: 0.05,
  ease: [0.4, 0, 0.2, 1],
};

const openSurfaceShapeTransition = {
  duration: 0.11,
  ease: [0.22, 1, 0.36, 1],
} as const;

const closeSurfaceShapeTransition = {
  duration: 0.06,
  ease: [0.4, 0, 0.2, 1],
} as const;

const footerOpenSurfaceShapeTransition = {
  duration: 0.18,
  ease: [0.16, 1, 0.3, 1],
} as const;

const footerCloseSurfaceShapeTransition = {
  duration: 0.2,
  ease: [0.4, 0, 0.2, 1],
} as const;

const reducedSurfaceShapeTransition = {
  duration: 0.05,
  ease: [0.4, 0, 0.2, 1],
} as const;

const copyIcons: Record<CopyState, React.ComponentProps<typeof Icon>["name"]> = {
  idle: "mail",
  copying: "loading",
  copied: "copyCheck",
  failed: "cancel",
};

const copyAriaLabels: Record<CopyState, string> = {
  idle: "Copy email address",
  copying: "Copying email address",
  copied: "Copied email address",
  failed: "Copy email failed. Try again",
};

const copyLabels: Record<CopyState, string> = {
  idle: "Email",
  copying: "Copying",
  copied: "Copied",
  failed: "Try again",
};

const contentVariants: Variants = {
  hidden: { opacity: 0, y: 3 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { delay: 0.035, duration: 0.075, ease: [0.22, 1, 0.36, 1] },
  },
  closing: {
    opacity: 0,
    y: 2,
    transition: { duration: 0.03, ease: [0.4, 0, 1, 1] },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: (index = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.08,
      ease: [0.22, 1, 0.36, 1],
      delay: 0.04 + index * 0.008,
    },
  }),
  closing: (index = 0) => ({
    opacity: 0,
    y: 2,
    transition: {
      duration: 0.028,
      ease: [0.4, 0, 1, 1],
      delay: Math.max(0, 0.012 - index * 0.004),
    },
  }),
};

function getTriggerConfig(appearance: ContactMorphAppearance) {
  if (appearance === "header") {
    return { variant: "primary" as const, size: "sm" as const, className: "contact-trigger" };
  }

  if (appearance === "mobile") {
    return { variant: "primary" as const, size: "md" as const, className: "contact-trigger contact-trigger--mobile" };
  }

  if (appearance === "footer") {
    return { variant: "ghost" as const, size: "md" as const, className: "contact-trigger contact-trigger--footer" };
  }

  return { variant: "primary" as const, size: "md" as const, className: "contact-trigger pill-link pill-link--light" };
}

function getClosedSurfaceConfig(appearance: ContactMorphAppearance) {
  if (appearance === "footer") {
    return {
      backgroundColor: CLOSED_GHOST_SURFACE_BACKGROUND,
      borderColor: CLOSED_GHOST_SURFACE_BORDER,
      borderRadius: CLOSED_SURFACE_RADIUS,
    };
  }

  return {
    backgroundColor: CLOSED_SURFACE_BACKGROUND,
    borderColor: CLOSED_SURFACE_BORDER,
    borderRadius: CLOSED_SURFACE_RADIUS,
  };
}

function getPreferredPlacement(side: ContactMorphSide): ContactMorphPlacement {
  return side === "top" ? "top" : "bottom";
}

function getEstimatedCardHeight() {
  if (typeof window === "undefined") {
    return CONTACT_CARD_ESTIMATED_HEIGHT;
  }

  return window.matchMedia("(max-width: 640px)").matches
    ? CONTACT_CARD_COMPACT_ESTIMATED_HEIGHT
    : CONTACT_CARD_ESTIMATED_HEIGHT;
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the selection-based copy path for browsers that deny
      // clipboard permissions inside embedded previews.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.inset = "0 auto auto 0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    const execCopy = (document as Document & { execCommand?: (command: string) => boolean }).execCommand;
    if (!execCopy?.call(document, "copy")) {
      throw new Error("Copy command failed");
    }
  } finally {
    document.body.removeChild(textarea);
  }
}

export function ContactMorph({ destination, ...props }: ContactMorphProps) {
  if (destination === "direct" || props.appearance === "footer") {
    return (
      <DirectContactMorph
        appearance={props.appearance}
        align={props.align}
        side={props.side}
        className={props.className}
      />
    );
  }

  const appearance = props.appearance ?? "hero";
  const triggerConfig = getTriggerConfig(appearance);
  return (
    <div className={cn("contact-morph", `contact-morph--${appearance}`, props.className)}>
      <Button
        variant={triggerConfig.variant}
        size={triggerConfig.size}
        className={triggerConfig.className}
        data-oak-workspace-entry
        aria-haspopup="dialog"
        onClick={(event) => requestOakWorkspace(event.currentTarget)}
      >
        <span>Say Hi</span>
      </Button>
    </div>
  );
}

function DirectContactMorph({
  appearance = "hero",
  align = "center",
  side = "bottom",
  className,
}: ContactMorphProps) {
  const reactId = React.useId();
  const motionScopeId = React.useMemo(() => `contact-${reactId.replace(/:/g, "")}`, [reactId]);
  const surfaceLayoutId = `${motionScopeId}-surface`;
  const titleId = `${motionScopeId}-title`;
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const openerRef = React.useRef<HTMLElement | null>(null);
  const shouldRestoreFocus = React.useRef(false);
  const shouldReduceMotion = useReducedMotion();
  const [copyState, setCopyState] = React.useState<CopyState>("idle");
  const [open, setOpen] = React.useState(false);
  const [isClosing, setIsClosing] = React.useState(false);
  const [openCycle, setOpenCycle] = React.useState(0);
  const preferredPlacement = getPreferredPlacement(side);
  const [placement, setPlacement] = React.useState<ContactMorphPlacement>(preferredPlacement);
  const [cardViewportOffset, setCardViewportOffset] = React.useState(0);
  const resetTimer = React.useRef<number | null>(null);
  const closeTimer = React.useRef<number | null>(null);
  const focusTimer = React.useRef<number | null>(null);
  const triggerConfig = getTriggerConfig(appearance);
  const linkedin = socialLinks.find((link) => link.label === "LinkedIn");
  const connectLinks = socialLinks.filter((link) => link.label !== "LinkedIn");
  const isFooter = appearance === "footer";
  const showPlaceholder = open;
  const closedSurface = getClosedSurfaceConfig(appearance);
  const supportsSquircle = React.useMemo(
    () => typeof CSS !== "undefined" && CSS.supports?.("corner-shape", "squircle") === true,
    [],
  );
  const openSurfaceRadius = supportsSquircle ? SQUIRCLE_OPEN_SURFACE_RADIUS : FALLBACK_OPEN_SURFACE_RADIUS;
  const activeSurfaceTransition = shouldReduceMotion
    ? reducedSurfaceTransition
    : isFooter
      ? isClosing
        ? footerCloseSurfaceTransition
        : footerOpenSurfaceTransition
      : isClosing
      ? closeSurfaceTransition
      : openSurfaceTransition;
  const activeShapeTransition = shouldReduceMotion
    ? reducedSurfaceShapeTransition
    : isFooter
      ? isClosing
        ? footerCloseSurfaceShapeTransition
        : footerOpenSurfaceShapeTransition
      : isClosing
      ? closeSurfaceShapeTransition
      : openSurfaceShapeTransition;
  const surfaceColorTransition = {
    duration: shouldReduceMotion ? 0.04 : isFooter ? (isClosing ? 0.16 : 0.1) : isClosing ? 0.028 : 0.055,
    ease: [0.4, 0, 0.2, 1],
  } as const;

  React.useEffect(() => {
    if (open) {
      document.documentElement.dataset.contactMorphOpen = "true";
      return () => {
        delete document.documentElement.dataset.contactMorphOpen;
      };
    }

    delete document.documentElement.dataset.contactMorphOpen;
    return undefined;
  }, [open]);

  const resolvePlacement = React.useCallback((): ResolvedContactPlacement => {
    const root = rootRef.current;
    if (!root || typeof window === "undefined") {
      return { placement: preferredPlacement, offset: 0 };
    }

    const rootRect = root.getBoundingClientRect();
    const cardHeight = getEstimatedCardHeight();
    const spaceAbove = Math.max(0, rootRect.bottom - VIEWPORT_GUTTER);
    const spaceBelow = Math.max(0, window.innerHeight - rootRect.top - VIEWPORT_GUTTER);
    const preferredSpace = preferredPlacement === "top" ? spaceAbove : spaceBelow;
    const fallbackSpace = preferredPlacement === "top" ? spaceBelow : spaceAbove;

    const nextPlacement =
      cardHeight > preferredSpace && fallbackSpace > preferredSpace
        ? preferredPlacement === "top"
          ? "bottom"
          : "top"
        : preferredPlacement;
    const nextOffset =
      nextPlacement === "top"
        ? Math.max(0, rootRect.bottom - (window.innerHeight - VIEWPORT_GUTTER))
        : Math.max(0, VIEWPORT_GUTTER - rootRect.top);

    return { placement: nextPlacement, offset: Math.ceil(nextOffset) };
  }, [preferredPlacement]);

  const updatePlacement = React.useCallback(() => {
    const nextPlacement = resolvePlacement();
    setPlacement(nextPlacement.placement);
    setCardViewportOffset(nextPlacement.offset);
  }, [resolvePlacement]);

  const openCard = React.useCallback(() => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }

    if (focusTimer.current) {
      window.clearTimeout(focusTimer.current);
      focusTimer.current = null;
    }

    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : triggerRef.current;
    shouldRestoreFocus.current = true;
    const nextPlacement = resolvePlacement();
    setIsClosing(false);
    setPlacement(nextPlacement.placement);
    setCardViewportOffset(nextPlacement.offset);
    setOpenCycle((cycle) => cycle + 1);
    setOpen(true);
    emitOakMascotEvent({ contextId: "contact.open", source: "contact-morph", immediate: true });

    focusTimer.current = window.setTimeout(() => {
      focusTimer.current = null;
      const closeButton =
        rootRef.current?.querySelector<HTMLButtonElement>(".contact-card__close") ??
        document.querySelector<HTMLButtonElement>(".contact-card__close");
      closeButton?.focus({ preventScroll: true });
    }, 120);
  }, [resolvePlacement]);

  const closeCard = React.useCallback(() => {
    setIsClosing(true);

    if (focusTimer.current) {
      window.clearTimeout(focusTimer.current);
      focusTimer.current = null;
    }

    if (isFooter) {
      if (closeTimer.current) {
        window.clearTimeout(closeTimer.current);
      }

      closeTimer.current = window.setTimeout(() => {
        closeTimer.current = null;
        setOpen(false);
      }, 58);
      return;
    }

    setOpen(false);
  }, [isFooter]);

  const completeClose = React.useCallback(() => {
    if (open) return;

    setIsClosing(false);
    setPlacement(preferredPlacement);
    setCardViewportOffset(0);
    if (shouldRestoreFocus.current) {
      shouldRestoreFocus.current = false;
      const opener = openerRef.current;
      openerRef.current = null;

      if (opener?.isConnected) {
        opener.focus({ preventScroll: true });
      } else {
        rootRef.current
          ?.querySelector<HTMLButtonElement>(".contact-trigger:not(.contact-trigger--placeholder)")
          ?.focus({ preventScroll: true });
      }
    }
  }, [open, preferredPlacement]);

  React.useLayoutEffect(() => {
    if (!open || isClosing) return;

    const focusCloseButton = () => {
      const closeButton =
        closeButtonRef.current ??
        rootRef.current?.querySelector<HTMLButtonElement>(".contact-card__close") ??
        document.querySelector<HTMLButtonElement>(".contact-card__close");
      closeButton?.focus({ preventScroll: true });
    };
    focusCloseButton();

    const frame = window.requestAnimationFrame(focusCloseButton);
    const timeout = window.setTimeout(focusCloseButton, 80);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [isClosing, open, openCycle]);

  React.useEffect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeCard();
      }
    };

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      const target = event.target;

      if (!root || !(target instanceof Node)) return;
      if (!root.contains(target)) {
        closeCard();
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("pointerdown", closeOnOutsidePointerDown, true);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
    };
  }, [closeCard, open]);

  React.useEffect(() => {
    if (!open && !isClosing) {
      setPlacement(preferredPlacement);
      setCardViewportOffset(0);
    }
  }, [isClosing, open, preferredPlacement]);

  React.useEffect(() => {
    if (!open) return;

    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [open, updatePlacement]);

  React.useEffect(() => {
    return () => {
      if (resetTimer.current) {
        window.clearTimeout(resetTimer.current);
      }

      if (closeTimer.current) {
        window.clearTimeout(closeTimer.current);
      }

      if (focusTimer.current) {
        window.clearTimeout(focusTimer.current);
      }
    };
  }, []);

  const copyEmail = async () => {
    if (resetTimer.current) {
      window.clearTimeout(resetTimer.current);
    }

    setCopyState("copying");

    try {
      await copyText(CONTACT_EMAIL);
      setCopyState("copied");
      emitOakMascotEvent({ contextId: "contact.copy.success", source: "contact-morph", immediate: true });
    } catch {
      setCopyState("failed");
      emitOakMascotEvent({ contextId: "contact.copy.error", source: "contact-morph", immediate: true });
    }

    resetTimer.current = window.setTimeout(() => {
      setCopyState("idle");
    }, 1400);
  };

  return (
    <MotionConfig transition={activeSurfaceTransition}>
      <LayoutGroup id={motionScopeId}>
        <motion.div
          ref={rootRef}
          className={cn(
            "contact-morph",
            `contact-morph--${appearance}`,
            `contact-morph--align-${align}`,
            open && "contact-morph--open",
            className,
          )}
          data-open={open ? "true" : "false"}
          data-side={placement}
          style={{ "--contact-card-viewport-offset": `${cardViewportOffset}px` } as React.CSSProperties}
        >
          {showPlaceholder && (
            <Button
              variant={triggerConfig.variant}
              size={triggerConfig.size}
              className={cn(triggerConfig.className, "contact-trigger--placeholder")}
              type="button"
              aria-hidden="true"
              tabIndex={-1}
            >
              <span className="contact-trigger__label">Say Hi</span>
            </Button>
          )}

          <AnimatePresence mode="popLayout" initial={false} onExitComplete={completeClose}>
            {!open ? (
              <MotionButton
                ref={triggerRef}
                key="trigger"
                layout={isFooter ? "position" : true}
                layoutId={isFooter ? undefined : surfaceLayoutId}
                className={cn(buttonVariants({ variant: triggerConfig.variant, size: triggerConfig.size }), triggerConfig.className)}
                type="button"
                aria-expanded="false"
                onClick={openCard}
                data-oak-context="contact.trigger"
                initial={false}
                animate={{
                  backgroundColor: closedSurface.backgroundColor,
                  borderColor: closedSurface.borderColor,
                  borderRadius: closedSurface.borderRadius,
                  opacity: 1,
                }}
                exit={{
                  backgroundColor: closedSurface.backgroundColor,
                  borderColor: closedSurface.borderColor,
                  borderRadius: closedSurface.borderRadius,
                  opacity: 1,
                }}
                transition={{
                  ...activeSurfaceTransition,
                  layout: activeSurfaceTransition,
                  borderRadius: activeShapeTransition,
                  backgroundColor: surfaceColorTransition,
                  borderColor: surfaceColorTransition,
                }}
              >
                {!isFooter && (
                  <motion.span
                    aria-hidden="true"
                    className="contact-trigger__closed-fill"
                    style={{ backgroundColor: CLOSED_TRIGGER_FILL_BACKGROUND }}
                    initial={false}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.035, ease: [0.4, 0, 1, 1] } }}
                  />
                )}
                {isFooter && (
                  <motion.span
                    aria-hidden="true"
                    className="contact-trigger__footer-surface"
                    layout
                    layoutId={surfaceLayoutId}
                    initial={false}
                    animate={{
                      backgroundColor: closedSurface.backgroundColor,
                      borderColor: closedSurface.borderColor,
                      borderRadius: closedSurface.borderRadius,
                      opacity: 1,
                    }}
                    exit={{
                      backgroundColor: closedSurface.backgroundColor,
                      borderColor: closedSurface.borderColor,
                      borderRadius: closedSurface.borderRadius,
                      opacity: 1,
                    }}
                    transition={{
                      ...activeSurfaceTransition,
                      layout: activeSurfaceTransition,
                      borderRadius: activeShapeTransition,
                      backgroundColor: surfaceColorTransition,
                      borderColor: surfaceColorTransition,
                    }}
                  />
                )}
                <motion.span
                  className="contact-trigger__label"
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -2, transition: { duration: 0.05, ease: [0.4, 0, 1, 1] } }}
                >
                  Say Hi
                </motion.span>
              </MotionButton>
            ) : (
              <motion.div
                key="card"
                layout
                layoutId={surfaceLayoutId}
                className="contact-card"
                role="dialog"
                aria-labelledby={titleId}
                initial={{
                  backgroundColor: closedSurface.backgroundColor,
                  borderColor: closedSurface.borderColor,
                  borderRadius: closedSurface.borderRadius,
                  opacity: 1,
                }}
                animate={{
                  backgroundColor: OPEN_SURFACE_BACKGROUND,
                  borderColor: OPEN_SURFACE_BORDER,
                  borderRadius: openSurfaceRadius,
                  opacity: 1,
                }}
                exit={{
                  backgroundColor: closedSurface.backgroundColor,
                  borderColor: closedSurface.borderColor,
                  borderRadius: closedSurface.borderRadius,
                  opacity: 1,
                }}
                transition={{
                  ...activeSurfaceTransition,
                  layout: activeSurfaceTransition,
                  borderRadius: activeShapeTransition,
                  backgroundColor: surfaceColorTransition,
                  borderColor: surfaceColorTransition,
                }}
              >
                <motion.div
                  key={`content-${openCycle}`}
                  layout="position"
                  className="contact-card__content"
                  variants={contentVariants}
                  initial="hidden"
                  animate={isClosing ? "closing" : "visible"}
                  exit="closing"
                >
                  <div className="contact-card__header">
                    <motion.h2
                      id={titleId}
                      className="contact-card__title"
                      layout="position"
                      variants={itemVariants}
                      custom={0}
                    >
                      Let's Connect
                    </motion.h2>
                    <motion.button
                      ref={closeButtonRef}
                      className="contact-card__close"
                      type="button"
                      aria-label="Close contact card"
                      onClick={closeCard}
                      variants={itemVariants}
                      custom={1}
                    >
                      <Icon name="cancel" size={17} />
                    </motion.button>
                  </div>

                  <div className="contact-card__groups">
                    <section className="contact-card__group contact-card__group--contact" aria-label="Contact">
                      <motion.button
                        className="contact-pill-button contact-pill-button--email"
                        type="button"
                        onClick={copyEmail}
                        aria-live="polite"
                        aria-label={copyAriaLabels[copyState]}
                        title={copyAriaLabels[copyState]}
                        data-state={copyState}
                        data-oak-context="contact.trigger"
                        variants={itemVariants}
                        custom={2}
                      >
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.span
                            key={copyState}
                            className="contact-pill-button__glyph"
                            initial={{ opacity: 0, scale: 0.62, rotate: -18 }}
                            animate={{ opacity: 1, scale: 1, rotate: 0 }}
                            exit={{ opacity: 0, scale: 0.62, rotate: 18 }}
                            transition={{ duration: 0.16 }}
                          >
                            <Icon name={copyIcons[copyState]} size={20} />
                          </motion.span>
                        </AnimatePresence>
                        <span>{copyLabels[copyState]}</span>
                      </motion.button>

                      {linkedin && (
                        <MotionAnchor
                          className="contact-pill-button contact-pill-button--linkedin"
                          href={linkedin.href}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="LinkedIn"
                          title="LinkedIn"
                          data-oak-context="contact.linkedin"
                          onClick={() =>
                            emitOakMascotEvent({ contextId: "contact.linkedin", source: "contact-morph", immediate: true })
                          }
                          variants={itemVariants}
                          custom={3}
                        >
                          <Icon name={linkedin.icon} size={20} />
                          <span>LinkedIn</span>
                        </MotionAnchor>
                      )}
                    </section>

                    <motion.span
                      className="contact-card__divider"
                      aria-hidden="true"
                      variants={itemVariants}
                      custom={4}
                    />

                    <section className="contact-card__group contact-card__group--connect" aria-label="Connect">
                      {connectLinks.map((link, index) => (
                        <MotionAnchor
                          key={link.label}
                          className="contact-social-icon"
                          href={link.href}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={link.label}
                          title={link.label}
                          variants={itemVariants}
                          custom={5 + index}
                        >
                          <Icon name={link.icon} size={20} />
                        </MotionAnchor>
                      ))}
                    </section>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </LayoutGroup>
    </MotionConfig>
  );
}
