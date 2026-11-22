import { useEffect, useMemo, useRef, useState } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Transition } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Icon, type IconName } from "@/components/ui/Icon";
import {
  careerContextMetadata,
  type CareerTimelineGroup,
  type CareerTimelineId,
  type CareerTimelineItem,
} from "@/data/careerTimeline";

type CareerTimelineProps = {
  title?: string;
  subtitle?: string;
  items: CareerTimelineItem[];
  initialVisibleCount?: number;
  initiallyExpanded?: boolean;
  showAllLabel?: string;
  showLessLabel?: string;
};

const roleIconById: Record<CareerTimelineId, IconName> = {
  oaklabs: "machine",
  hyperskalers: "machine",
  sanfranciscobayuniversity: "ideas",
  uhttention: "settings",
  globaledtechorganization: "activitySpark",
  pnppsolutions: "schemaMap",
};

function normalizeHashValue(hash: string) {
  const rawHash = hash.startsWith("#") ? hash.slice(1) : hash;

  try {
    return decodeURIComponent(rawHash).toLowerCase();
  } catch {
    return rawHash.toLowerCase();
  }
}

function CareerTimelineGroups({
  groups,
  variant = "highlights",
}: {
  groups: CareerTimelineGroup[];
  variant?: "highlights" | "stack";
}) {
  return (
    <div className={`career-timeline-card__groups career-timeline-card__groups--${variant}`}>
      {groups.map((group, groupIndex) => (
        <section className="career-timeline-card__group" key={group.label ?? `group-${groupIndex}`}>
          {group.label && <h5>{group.label}</h5>}
          <ul>
            {group.items.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function CareerTimelineDetails({
  item,
  itemId,
  autoOpenItemId,
}: {
  item: CareerTimelineItem;
  itemId: string;
  autoOpenItemId: string | null;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!autoOpenItemId) return;
    setOpen(autoOpenItemId === itemId);
  }, [autoOpenItemId, itemId]);

  return (
    <Collapsible.Root className="career-timeline-card__details" open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger className="career-timeline-card__trigger">
        <span className="career-timeline-card__badges" aria-label={`${item.place} role focus areas`}>
          {item.badges.map((badge) => (
            <Badge key={badge} variant="secondary" className="career-timeline-card__badge">
              {badge}
            </Badge>
          ))}
        </span>
        <span className="career-timeline-card__trigger-action">
          <span>{open ? "Hide details" : "Show details"}</span>
          <Icon
            name="arrowDown"
            size={16}
            className={`career-timeline-card__trigger-icon${open ? " career-timeline-card__trigger-icon--open" : ""}`}
          />
        </span>
      </Collapsible.Trigger>
      <Collapsible.Panel className="career-timeline-card__panel">
        <div className="career-timeline-card__detail-grid">
          <div>
            <h4>Highlights</h4>
            <CareerTimelineGroups groups={item.highlights} />
          </div>
          <div>
            <h4>Stack</h4>
            <CareerTimelineGroups groups={item.stack} variant="stack" />
          </div>
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

export default function CareerTimeline({
  title,
  subtitle,
  items,
  initialVisibleCount = items.length,
  initiallyExpanded = false,
  showAllLabel = "Show all",
  showLessLabel = "Show latest",
}: CareerTimelineProps) {
  const canToggle = initialVisibleCount > 0 && items.length > initialVisibleCount;
  const [showAll, setShowAll] = useState(() => canToggle && initiallyExpanded);
  const [shouldScrollLatest, setShouldScrollLatest] = useState(false);
  const [autoOpenItemId, setAutoOpenItemId] = useState<string | null>(null);
  const [pendingScrollItemId, setPendingScrollItemId] = useState<string | null>(null);
  const firstItemRef = useRef<HTMLLIElement>(null);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  const shouldReduceMotion = useReducedMotion();
  const careerHashAliases = useMemo(() => {
    const aliases = new Map<string, string>();

    items.forEach((item) => {
      aliases.set(item.id, item.id);
      item.aliases.forEach((alias) => aliases.set(alias, item.id));
    });

    return aliases;
  }, [items]);
  const visibleItems = canToggle && !showAll ? items.slice(0, initialVisibleCount) : items;
  const timelineTransition: Transition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.34, ease: [0.22, 1, 0.36, 1] };
  const sectionClass = [
    "career-timeline-section",
    canToggle && "career-timeline-section--preview",
    showAll && "career-timeline-section--expanded",
  ]
    .filter(Boolean)
    .join(" ");
  const scrollToLatest = () => {
    window.requestAnimationFrame(() => {
      firstItemRef.current?.scrollIntoView({ behavior: shouldReduceMotion ? "auto" : "smooth", block: "start" });
    });
  };
  const resolveCareerHash = (hash: string) => {
    const hashValue = normalizeHashValue(hash);
    if (!hashValue) return null;
    return careerHashAliases.get(hashValue) ?? null;
  };
  const setTimelineItemRef = (item: CareerTimelineItem, itemId: string, node: HTMLLIElement | null) => {
    if (node) {
      itemRefs.current.set(itemId, node);
    } else {
      itemRefs.current.delete(itemId);
    }

    if (item === visibleItems[0]) {
      firstItemRef.current = node;
    }
  };

  useEffect(() => {
    const syncHashTarget = () => {
      const targetItemId = resolveCareerHash(window.location.hash);
      if (!targetItemId) return;

      setAutoOpenItemId(targetItemId);
      setPendingScrollItemId(targetItemId);

      if (canToggle) {
        setShowAll(true);
      }
    };

    syncHashTarget();
    window.addEventListener("hashchange", syncHashTarget);

    return () => {
      window.removeEventListener("hashchange", syncHashTarget);
    };
  }, [canToggle, careerHashAliases]);

  useEffect(() => {
    if (!pendingScrollItemId) return;

    const frame = window.requestAnimationFrame(() => {
      const target = itemRefs.current.get(pendingScrollItemId) ?? document.getElementById(pendingScrollItemId);
      target?.scrollIntoView({ behavior: shouldReduceMotion ? "auto" : "smooth", block: "start" });
      setPendingScrollItemId(null);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [pendingScrollItemId, shouldReduceMotion, showAll, visibleItems]);

  return (
    <section
      className={sectionClass}
      aria-labelledby="career-timeline-heading"
      data-oak-section="work.timeline"
      data-oak-context="home.work"
    >
      <div className="page-container career-timeline-section__inner">
        {(title || subtitle) && (
          <div className="career-timeline-section__heading">
            {title && (
              <h2 id="career-timeline-heading" className="section-title section-title--small">
                {title}
              </h2>
            )}
            {subtitle && <p>{subtitle}</p>}
          </div>
        )}
        {!title && (
          <h2 id="career-timeline-heading" className="sr-only">
            Career timeline
          </h2>
        )}
        <motion.ol className="career-timeline" aria-label="Career timeline" layout transition={timelineTransition}>
          <AnimatePresence
            initial={false}
            mode="popLayout"
            onExitComplete={() => {
              if (shouldScrollLatest) {
                setShouldScrollLatest(false);
                scrollToLatest();
              }
            }}
          >
            {visibleItems.map((item) => {
              const roleIcon = roleIconById[item.id];
              const itemId = item.id;

              return (
                <motion.li
                  id={itemId}
                  className="career-timeline__item"
                  key={item.id}
                  ref={(node) => setTimelineItemRef(item, itemId, node)}
                  layout
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 18, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.985 }}
                  transition={timelineTransition}
                >
                  <div className="career-timeline__meta" aria-label={`${item.place}, ${item.date}`}>
                    <span className="career-timeline__label">{item.label}</span>
                    <span className="career-timeline__date">{item.date}</span>
                    <span className="career-timeline__place">{item.place}</span>
                  </div>
                  <div className="career-timeline__rail" aria-hidden="true">
                    <span className="career-timeline__dot" />
                  </div>
                  <article className="career-timeline-card">
                    <div className="career-timeline-card__eyebrow">
                      <Icon name={roleIcon} size={15} className="career-timeline-card__role-icon" />
                      <span className="career-timeline-card__contexts">
                        {item.contexts.map((context) => (
                          <span className="career-timeline-card__context" key={`${context.type}-${context.title}`}>
                            <span>{context.title}</span>
                            <span className="career-timeline-card__context-meta">{careerContextMetadata(context)}</span>
                          </span>
                        ))}
                      </span>
                    </div>
                    <h3>{item.title}</h3>
                    <p>{item.summary}</p>
                    <picture className="career-timeline-card__media">
                      <source type="image/avif" srcSet={item.media.avifSrcSet} sizes={item.media.sizes} />
                      <source type="image/webp" srcSet={item.media.webpSrcSet} sizes={item.media.sizes} />
                      <img
                        src={item.media.fallbackSrc}
                        alt={item.media.alt}
                        width={item.media.width}
                        height={item.media.height}
                        loading="lazy"
                        decoding="async"
                      />
                    </picture>
                    <CareerTimelineDetails item={item} itemId={itemId} autoOpenItemId={autoOpenItemId} />
                  </article>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </motion.ol>
        {canToggle && (
          <div className="career-timeline__actions">
            <button
              type="button"
              className="pill-link pill-link--dark career-timeline__show-all"
              aria-expanded={showAll}
              onClick={() => {
                setShowAll((current) => {
                  if (current) {
                    setShouldScrollLatest(true);
                  }

                  return !current;
                });
              }}
            >
              {showAll ? showLessLabel : showAllLabel}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
