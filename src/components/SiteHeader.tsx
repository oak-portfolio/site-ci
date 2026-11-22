import * as React from "react";
import { AnimatePresence, LayoutGroup, motion, useIsPresent, useMotionValueEvent, useScroll } from "motion/react";
import type { Transition, Variants } from "motion/react";
import { navItems } from "@/data/homePage";
import { ContactMorph } from "@/components/ContactMorph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { useOakWorkspace } from "@/lib/oakWorkspace";
import { OakCommandPaletteSearch } from "@/lib/oakFlags/commandPalette";
import { wrapTab } from "@/lib/oakFocusWrap";

type SiteHeaderProps = {
  logoSrc: string;
  portraitSrc: string;
  portraitSources?: { avif?: string; webp?: string; sizes?: string };
  currentPath?: string;
};

const headerLayoutTransition = {
  type: "spring",
  stiffness: 420,
  damping: 38,
  mass: 0.8,
} as const;

const mobileMenuTransition: Transition = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1],
};

const mobileNavVariants: Variants = {
  open: {
    transition: {
      delayChildren: 0.1,
      staggerChildren: 0.055,
    },
  },
  closed: {
    transition: {
      staggerChildren: 0.035,
      staggerDirection: -1,
    },
  },
};

const mobileItemVariants: Variants = {
  open: {
    opacity: 1,
    y: 0,
    transition: mobileMenuTransition,
  },
  closed: {
    opacity: 0,
    y: 18,
    transition: { duration: 0.16, ease: [0.4, 0, 1, 1] },
  },
};

export function SiteHeader({ logoSrc, portraitSrc, portraitSources, currentPath = "/" }: SiteHeaderProps) {
  const workspace = useOakWorkspace();
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    if (workspace.presentation !== "human-browse") setOpen(false);
  }, [workspace.presentation]);
  const [scrolled, setScrolled] = React.useState(false);
  const [showDockedPortrait, setShowDockedPortrait] = React.useState(false);
  const [isSmallHeader, setIsSmallHeader] = React.useState(false);
  const [routePath, setRoutePath] = React.useState(currentPath);
  const { scrollY } = useScroll();
  const isCompact = scrolled || open;
  const avatarWidth = isSmallHeader ? 34 : 36;
  const wordmarkWidth = showDockedPortrait ? (isSmallHeader ? 78 : 86) : isSmallHeader ? 96 : 104;
  const normalizedPath = normalizePath(routePath);
  const isNavActive = (href: string | undefined) => {
    if (!href) return false;

    const normalizedHref = normalizePath(href);
    if (normalizedHref === "/work") {
      return normalizedPath === "/work" || normalizedPath.startsWith("/work/");
    }

    return normalizedPath === normalizedHref;
  };

  const updateHeaderState = React.useCallback(
    (latest: number) => {
      setScrolled(latest > 56);

      const heroPortrait = document.querySelector<HTMLElement>("[data-hero-portrait]");
      if (!heroPortrait) {
        setShowDockedPortrait(latest > 320);
        return;
      }

      const headerInner = document.querySelector<HTMLElement>(".site-header__inner");
      const headerBottom = headerInner?.getBoundingClientRect().bottom ?? 72;
      const portraitBottom = heroPortrait.getBoundingClientRect().bottom;

      setShowDockedPortrait(portraitBottom <= headerBottom + 8);
    },
    []
  );

  React.useEffect(() => {
    document.documentElement.dataset.menuOpen = open ? "true" : "false";
  }, [open]);

  React.useEffect(() => {
    setOpen(false);
    const frame = window.requestAnimationFrame(() => {
      updateHeaderState(window.scrollY);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [routePath, updateHeaderState]);

  React.useEffect(() => {
    const updateRoutePath = () => {
      setRoutePath(window.location.pathname || "/");
    };

    updateRoutePath();
    document.addEventListener("astro:after-swap", updateRoutePath);
    document.addEventListener("astro:page-load", updateRoutePath);

    return () => {
      document.removeEventListener("astro:after-swap", updateRoutePath);
      document.removeEventListener("astro:page-load", updateRoutePath);
    };
  }, []);

  useMotionValueEvent(scrollY, "change", updateHeaderState);

  React.useEffect(() => {
    const updateFromViewport = () => {
      const small = window.matchMedia("(max-width: 640px)").matches;
      setIsSmallHeader(small);
      if (!small) setOpen(false);
      updateHeaderState(window.scrollY);
    };

    updateFromViewport();
    window.addEventListener("resize", updateFromViewport);
    window.addEventListener("orientationchange", updateFromViewport);
    return () => {
      window.removeEventListener("resize", updateFromViewport);
      window.removeEventListener("orientationchange", updateFromViewport);
    };
  }, [updateHeaderState]);

  const menuButton = React.useRef<HTMLElement>(null);
  const menuModal = open && workspace.presentation === "human-browse";

  React.useEffect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  React.useEffect(() => {
    if (!menuModal) return;
    const header = document.querySelector(".site-header");
    // The workspace owns `inert` on .route-surface itself, so its children (main, contact band, footer) are marked instead.
    const outside = Array.from(document.body.children).filter(node => !node.contains(header) && !node.matches(".route-surface, script, style"));
    const behind = [...document.querySelectorAll(".route-surface > *"), ...outside].filter(node => !node.hasAttribute("inert"));
    for (const node of behind) node.setAttribute("inert", "");
    const holdTab = (event: KeyboardEvent) => { if (header) wrapTab(event, header, true); };
    window.addEventListener("keydown", holdTab);
    return () => {
      window.removeEventListener("keydown", holdTab);
      for (const node of behind) node.removeAttribute("inert");
    };
  }, [menuModal]);

  return (
    <LayoutGroup>
      <motion.header className="site-header" data-scrolled={isCompact ? "true" : "false"} layoutRoot>
        <motion.div
          className="site-header__inner"
          data-compact={isCompact ? "true" : "false"}
          data-menu-open={open ? "true" : "false"}
          data-portrait-visible={showDockedPortrait ? "true" : "false"}
          layout
          transition={headerLayoutTransition}
        >
          <motion.a
            href="/"
            className="brand-logo"
            aria-label="Steve Oak Home"
            layout
            transition={headerLayoutTransition}
          >
            <AnimatePresence initial={false}>
              {showDockedPortrait && (
                <motion.span
                  className="brand-logo__portrait-frame"
                  aria-hidden="true"
                  initial={{ opacity: 0, width: 0, marginRight: 0, scale: 0.84, x: -8 }}
                  animate={{ opacity: 1, width: avatarWidth, marginRight: 8, scale: 1, x: 0 }}
                  exit={{ opacity: 0, width: 0, marginRight: 0, scale: 0.84, x: -8 }}
                  transition={headerLayoutTransition}
                >
                  <picture className="brand-logo__portrait-picture">
                    {portraitSources?.avif && <source type="image/avif" srcSet={portraitSources.avif} sizes={portraitSources.sizes} />}
                    {portraitSources?.webp && <source type="image/webp" srcSet={portraitSources.webp} sizes={portraitSources.sizes} />}
                    <img className="brand-logo__portrait" src={portraitSrc} alt="" width="300" height="300" loading="lazy" decoding="async" />
                  </picture>
                </motion.span>
              )}
            </AnimatePresence>
            <motion.img
              className="brand-logo__wordmark"
              src={logoSrc}
              alt="Steve Oak"
              width="104"
              height="20"
              animate={{ width: wordmarkWidth }}
              transition={headerLayoutTransition}
              layout
            />
          </motion.a>

          <motion.nav className="desktop-nav" aria-label="Main navigation" layout transition={headerLayoutTransition}>
            {navItems.map((item) => (
              item.disabled ? (
                <motion.span
                  key={item.label}
                  className="nav-link nav-link--disabled"
                  aria-disabled="true"
                  layout
                  transition={headerLayoutTransition}
                >
                  <span>{item.label}</span>
                  {item.badge && (
                    <Badge className="nav-link__badge" variant="outline">
                      {item.badge}
                    </Badge>
                  )}
                </motion.span>
              ) : (
                <motion.a
                  key={item.label}
                  className="nav-link"
                  href={item.href}
                  aria-current={isNavActive(item.href) ? "page" : undefined}
                  data-active={isNavActive(item.href) ? "true" : undefined}
                  data-astro-prefetch="viewport"
                  layout
                  transition={headerLayoutTransition}
                >
                  {item.label}
                </motion.a>
              )
            ))}
          </motion.nav>

          <motion.div className="header-actions" aria-label="Header actions" layout transition={headerLayoutTransition}>
            <OakCommandPaletteSearch />
            <ContactMorph appearance="header" side="bottom" align="end" />
          </motion.div>

          <Button
            ref={menuButton}
            className="mobile-menu-button"
            variant="ghost"
            size="icon"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((value) => !value)}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={open ? "close" : "menu"}
                className="mobile-menu-button__icon"
                initial={{ opacity: 0, rotate: open ? -30 : 30, scale: 0.86 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: open ? 30 : -30, scale: 0.86 }}
                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              >
                <Icon name={open ? "cancel" : "menu"} size={open ? 28 : 24} />
              </motion.span>
            </AnimatePresence>
          </Button>
        </motion.div>

        <AnimatePresence>
          {open && workspace.presentation === "human-browse" && (
            <MobileMenuSurface>
              <motion.nav
                aria-label="Mobile navigation"
                variants={mobileNavVariants}
                initial="closed"
                animate="open"
                exit="closed"
              >
                {navItems.map((item) => (
                  item.disabled ? (
                    <motion.span
                      key={item.label}
                      className="mobile-nav-link mobile-nav-link--disabled"
                      aria-disabled="true"
                      variants={mobileItemVariants}
                    >
                      <span>{item.label}</span>
                      {item.badge && (
                        <Badge className="nav-link__badge" variant="outline">
                          {item.badge}
                        </Badge>
                      )}
                    </motion.span>
                  ) : (
                    <motion.a
                      key={item.label}
                      className="mobile-nav-link"
                      href={item.href}
                      aria-current={isNavActive(item.href) ? "page" : undefined}
                      data-active={isNavActive(item.href) ? "true" : undefined}
                      data-astro-prefetch="viewport"
                      onClick={() => setOpen(false)}
                      variants={mobileItemVariants}
                    >
                      {item.label}
                    </motion.a>
                  )
                ))}
              </motion.nav>
              <motion.div
                className="mobile-menu__actions"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={{ ...mobileMenuTransition, delay: 0.16 }}
              >
                <ContactMorph appearance="mobile" side="top" align="center" />
              </motion.div>
            </MobileMenuSurface>
          )}
        </AnimatePresence>
      </motion.header>
    </LayoutGroup>
  );
}

function MobileMenuSurface({ children }: { children: React.ReactNode }) {
  const isPresent = useIsPresent();
  return (
    <motion.div
      id="mobile-menu"
      className="mobile-menu"
      data-open={isPresent ? "true" : "false"}
      inert={!isPresent}
      aria-hidden={!isPresent}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={mobileMenuTransition}
    >
      {children}
    </motion.div>
  );
}

function normalizePath(path: string) {
  const pathname = path.split("?")[0]?.split("#")[0] || "/";
  if (pathname === "/") return "/";
  return pathname.replace(/\/+$/, "");
}
