---
version: alpha
name: SteveOak.com Design Foundation
description: Dark-only SteveOak.com portfolio design contract for coding agents.
colors:
  primary: "#050505"
  surface: "#0C0C0C"
  surface-soft: "#111111"
  on-surface: "#FFFFFF"
  muted: "#AFAFAF"
  quiet: "#7D7D7D"
  line: "#373737"
  line-soft: "#232323"
  action-light: "#FFFFFF"
  action-dark: "#050505"
  button-dark: "#232323"
  hero-blue: "#12347F"
  danger: "#EF4444"
  oak-blue: "#4B6FFF"
  oak-violet: "#8B5CF6"
  oak-pink: "#EC4899"
  oak-gold: "#F5B942"
  oak-leaf: "#6FD394"
typography:
  display-hero:
    fontFamily: "GT Walsheim Pro"
    fontSize: 64px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0px
  display-hero-mobile:
    fontFamily: "GT Walsheim Pro"
    fontSize: 44px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0px
  section-title:
    fontFamily: "GT Walsheim Pro"
    fontSize: 48px
    fontWeight: 500
    lineHeight: 56px
    letterSpacing: 0px
  section-title-small:
    fontFamily: "GT Walsheim Pro"
    fontSize: 30px
    fontWeight: 500
    lineHeight: 40px
    letterSpacing: 0px
  card-title:
    fontFamily: "GT Walsheim Pro"
    fontSize: 22px
    fontWeight: 500
    lineHeight: 28px
    letterSpacing: 0px
  body-lg:
    fontFamily: "Inter"
    fontSize: 17px
    fontWeight: 400
    lineHeight: 28px
    letterSpacing: 0px
  body-md:
    fontFamily: "Inter"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 0px
  ui-md:
    fontFamily: "Inter"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 14px
    letterSpacing: 0px
  ui-sm:
    fontFamily: "Inter"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: 0px
  machine-display:
    fontFamily: "Menlo Web"
    fontSize: 64px
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: 0px
  machine-body:
    fontFamily: "Menlo Web"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 24px
    letterSpacing: 0px
  machine-label:
    fontFamily: "Menlo Web"
    fontSize: 11px
    fontWeight: 400
    lineHeight: 15px
    letterSpacing: 0px
spacing:
  micro: 4px
  xs: 8px
  sm: 16px
  md: 24px
  gutter: 32px
  lg: 40px
  section: 60px
  section-deep: 120px
  container: 1376px
rounded:
  card-fallback: 32px
  card-squircle: 56px
  proof-fallback: 48px
  proof-squircle: 72px
  contact-fallback: 40px
  contact-squircle: 56px
  work-media-fallback: 40px
  work-media-squircle: 56px
  work-preview-card-fallback: 24px
  work-preview-card-squircle: 36px
  app-icon: 24px
  small-art: 6px
  pill: 999px
  sm: 6px
  md: 24px
  lg: 32px
  agent-window: 32px
  agent-frame: 48px
  agent-sheet: 48px
  agent-card: 24px
  agent-row: 16px
leading:
  ui: 20px
  body: 24px
  title: 28px
shadows:
  popover: "0 8px 24px -4px rgba(0, 0, 0, 0.5)"
  workspace: "0 24px 80px rgba(0, 0, 0, 0.5)"
layers:
  under: -1
  sticky: 2
  launcher: 55
  overlay: 100
media:
  stillImagePolicy: "AVIF-first with WebP fallback"
  sourceRetention: "Retain original source media before generating runtime variants"
  socialFallback: "Open Graph and social images stay PNG/JPEG fallback, not AVIF-only"
  screenshotFidelity: "Keep PNG or lossless WebP when AVIF visibly blurs proof text"
  workCardRatio: "1200:630"
  workCardShape: "Open Graph safe thumbnail frame"
content:
  voice: "story-first, direct-to-reader, specific, public-safe, and human"
  avoid: "AI-ish scaffolding, proof-ledger copy, implementation notes, vague SaaS claims, and AI slop UI"
  artifactRhythm: "prose before and after each artifact; no artifact dumps"
  seoAeoPolicy: "public source-aligned reader content only; no hidden crawler-only copy"
  machineProviderSource: "markdownApiHref, then markdownHref, then canonical page URL"
  machineActionMenu: "exactly Copy Markdown, Ask ChatGPT, Ask Claude, Ask Perplexity"
  workTocActions: "desktop full-article TOC only; mobile TOC remains section navigation"
  workPreviewMetadata: "title, one primary tag pill, plain date or Soon text, and source-derived context"
  workPreviewContext: "live cards reuse case-study title context; staged cards use staged category context"
  workDeepLinkBehavior: "compact Career Timeline hashes, legacy aliases, direct-load reveal, normal browsing unchanged"
  articleHeaderMetadata: "published date plus one quiet text tag; no breadcrumb, status badge, or header tag pills"
  articleFooterTags: "all source tags shown as generous borderless soft pills"
  secondaryTextAction: "dim text by default, no underline, brighten on hover/focus and press"
  workPreviewSource: "Astro Work content collection plus staged Work data"
  workRecommendationLayout: "3 columns desktop, 2 columns tablet, 1 column mobile"
  workInProgressCaseStudy: "cover, quick description, centered Draft notice, concise system summary, and recommendations only"
  keywordBadgeDensity: "selective first-use emphasis only"
  sourceLinkEmphasis: "bold visible blue link treatment, not subtle white underline"
  workDiagramTaste: "dark-mode readable, user-friendly, sparse emoji/favicons/logos, not checklist-heavy"
components:
  button-primary:
    backgroundColor: "{colors.action-light}"
    textColor: "{colors.action-dark}"
    typography: "{typography.ui-md}"
    rounded: "{rounded.pill}"
    padding: 30px
    height: 44px
  button-primary-small:
    backgroundColor: "{colors.action-light}"
    textColor: "{colors.action-dark}"
    typography: "{typography.ui-md}"
    rounded: "{rounded.pill}"
    padding: 28px
    height: 44px
  button-secondary:
    backgroundColor: "{colors.button-dark}"
    textColor: "{colors.on-surface}"
    typography: "{typography.ui-md}"
    rounded: "{rounded.pill}"
    padding: 30px
    height: 44px
  button-icon:
    backgroundColor: transparent
    textColor: "{colors.on-surface}"
    typography: "{typography.ui-md}"
    rounded: "{rounded.pill}"
    width: 40px
    height: 40px
  oak-send-button:
    backgroundColor: "{colors.oak-violet}"
    textColor: "{colors.action-dark}"
    rounded: "{rounded.pill}"
    width: 36px
    height: 36px
  oak-citation-case-study:
    backgroundColor: "{colors.oak-blue}"
    textColor: "{colors.action-dark}"
    rounded: "{rounded.pill}"
  oak-citation-profile:
    backgroundColor: "{colors.oak-violet}"
    textColor: "{colors.action-dark}"
    rounded: "{rounded.pill}"
  oak-citation-article:
    backgroundColor: "{colors.oak-pink}"
    textColor: "{colors.action-dark}"
    rounded: "{rounded.pill}"
  oak-citation-resource:
    backgroundColor: "{colors.oak-gold}"
    textColor: "{colors.action-dark}"
    rounded: "{rounded.pill}"
  oak-citation-experience:
    backgroundColor: "{colors.oak-leaf}"
    textColor: "{colors.action-dark}"
    rounded: "{rounded.pill}"
  feature-card:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-surface}"
    typography: "{typography.card-title}"
    rounded: "{rounded.card-fallback}"
    padding: 40px
  proof-media:
    backgroundColor: "{colors.primary}"
    rounded: "{rounded.proof-fallback}"
    width: 821px
  contact-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.ui-md}"
    rounded: "{rounded.contact-fallback}"
    padding: 24px
    width: 468px
  surface-panel:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.card-fallback}"
    padding: 32px
  work-article:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: 8px
    width: 820px
  work-callout:
    backgroundColor: "rgba(113, 214, 162, 0.06)"
    textColor: "#84FFB8"
    rounded: "32px fallback / 40px squircle"
    padding: 24px
  work-media:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.quiet}"
    rounded: "{rounded.work-media-fallback}"
    width: 1040px
  work-image-carousel:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.muted}"
    rounded: 0px
    width: 1040px
  work-image-grid-lightbox:
    backgroundColor: "rgba(0, 0, 0, 0.92)"
    textColor: "{colors.muted}"
    rounded: 0px
    size: "fullscreen overlay"
  work-preview-card:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-surface}"
    typography: "{typography.card-title}"
    rounded: "{rounded.work-preview-card-fallback}"
    width: 1200px
    height: 630px
  work-preview-section:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-surface}"
    typography: "{typography.card-title}"
    padding: 0px
  work-chart:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: 8px
    width: 1040px
  work-diagram:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: 8px
    width: 1040px
  work-in-progress-panel:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: 8px
    width: 820px
  machine-page:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-surface}"
    typography: "{typography.machine-body}"
    width: 720px
    padding: 92px
  machine-tag:
    backgroundColor: "rgba(255, 255, 255, 0.065)"
    textColor: "rgba(255, 255, 255, 0.46)"
    typography: "{typography.machine-label}"
    rounded: "{rounded.pill}"
    padding: 10px
    height: 30px
  machine-copy-action:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.machine-body}"
    rounded: "{rounded.pill}"
    height: 44px
  machine-copy-menu-item:
    backgroundColor: transparent
    textColor: "{colors.on-surface}"
    typography: "{typography.machine-body}"
    padding: 13px
  machine-link-row:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-surface}"
    typography: "{typography.machine-body}"
    padding: 13px
  machine-link-arrow:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.quiet}"
    typography: "{typography.machine-label}"
    size: 13px
  keyword-badge:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: 999px
    padding: 8px
  lobe-icon-link:
    backgroundColor: transparent
    textColor: "#94C8FF"
    typography: "{typography.body-md}"
    rounded: 6px
  source-link:
    backgroundColor: transparent
    textColor: "#94C8FF"
    typography: "{typography.body-md}"
  oak-agent-launcher:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.pill}"
    height: 56px
  oak-mascot-bubble:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.on-surface}"
    typography: "{typography.ui-md}"
    rounded: "{rounded.pill}"
    height: 58px
  muted-text:
    textColor: "{colors.muted}"
    typography: "{typography.body-md}"
  quiet-label:
    textColor: "{colors.quiet}"
    typography: "{typography.ui-sm}"
  soft-divider:
    backgroundColor: "{colors.line-soft}"
    height: 1px
  divider:
    backgroundColor: "{colors.line}"
    height: 1px
  hero-art:
    backgroundColor: "{colors.hero-blue}"
    rounded: "{rounded.proof-squircle}"
  danger-state:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.action-dark}"
    typography: "{typography.ui-sm}"
    rounded: "{rounded.pill}"
---

# SteveOak.com Design Foundation

## Overview

SteveOak.com is a dark-only personal product surface for Steve Oak / Okkar Kyaw. It should feel spacious, precise, and alive without turning into a generic AI SaaS landing page. The current visual source is the SteveOak.com dark portfolio redesign draft, but the long-term design language is Oak: product taste, agent systems, design engineering, Bay Area energy, and clear human judgment around AI.

The site should feel like a calm launch surface for a builder who cares about taste. Use generous space, high-contrast dark surfaces, controlled motion, solid rounded iconography, and large squircle shapes. Do not fill gaps with decorative gradients, generic bento-card filler, random icon sets, or vague hero copy.

New surfaces should feel like Oak talking directly to the reader. Prefer specific build moments, tradeoffs, artifacts, and public-safe evidence over neat marketing patterns. Avoid AI-ish scaffolding, proof-ledger phrasing, implementation notes in reader-facing copy, same-looking AI slop, and empty claims that sound like a startup landing page without the work behind it.

Astro owns the public shell. React islands are only for real interaction such as the header motion and `ContactMorph`. Visible text and crawler-facing scaffolding should stay static HTML whenever possible. Indexing follows the current site visibility stage and each page's publication gate. The site is currently in its launch stage; `/404` remains noindex. Approved in-progress Work stubs may be public and index-ready. Their progress label alone does not change indexability.

## Colors

The palette is dark-only. Hierarchy comes from tonal layers, borders, type contrast, image content, and measured white actions.

- **Primary `#050505`**: page canvas, deep surfaces, and the dominant background.
- **Surface `#0C0C0C` / surface-soft `#111111`**: elevated dark layers when a component needs containment.
- **On-surface `#FFFFFF`**: headings, primary action surfaces, and the strongest UI text.
- **Muted `rgba(255, 255, 255, 0.68)` / quiet `rgba(255, 255, 255, 0.48)`**: body copy, metadata, disabled or lower-emphasis text.
- **Line `rgba(255, 255, 255, 0.2)` / line-soft `rgba(255, 255, 255, 0.12)`**: subtle dividers and component outlines.
- **Dark button `rgba(255, 255, 255, 0.12)`**: secondary action fill.
- The design-markdown linter accepts six-digit hex colors only. The YAML values are the corresponding colors composited over the `#050505` canvas; the exact reusable tokens retain alpha and are defined by the `rgba()` values above in `src/styles/global.css`.
- **Hero blue `#12347F`**: only for the current Oak hero art and related media atmosphere, not a default UI accent.
- **Oak palette (agent workspace only)**: `--oak-blue #4B6FFF`, `--oak-violet #8B5CF6`, `--oak-pink #EC4899`, `--oak-gold #F5B942` (the launcher ring) and `--oak-leaf #6FD394` (Oak's leaf). They are defined once on `.oak-workspace` in `src/styles/oakAgent.css` and registered once in `colorExceptions` in `scripts/design-policy/policy.mjs`. Every other rule uses `var()` or `color-mix()`.
- **Palette on the chat-first home (ruling 89, ticket 289)**: the home thread renders outside the workspace, so the one palette block's selector list is exactly `.oak-workspace, .home-chat__thread`. It is still one block with no second copy of any value, and D32-G1 fails on a duplicate.
- **The ring for what matters, white and gray for the rest (October 13, D69, replaces the D52 gradient tiers)**: the launcher's multicolour ring, `--oak-ring`, is the only gradient in the workspace, and it appears in five places. On the page it is the launcher's turning ring and glow. In the workspace it is the message box's edge, drawn on a masked layer so it fades in: hidden at rest, half-lit on focus, fully lit with a soft glow once there is something to send. It is also the edge of a focused field or inset group, and it turns around the reasoning header while Oak thinks. The fifth is the Contact card, the one block in an answer allowed an accent glow (Q31 A, ticket 49): the ring is its masked edge with a soft outer glow and the ring around Steve's portrait; under forced colors it is a plain border. Two-colour fills are gone from buttons, bubbles and titles. Everything else follows a white and gray hierarchy, like ChatGPT and Claude on iOS. The one forward action is `--oak-primary` white with `--oak-primary-ink` near-black and no glow, a shade dimmer on hover. Send is a gray disc at rest that turns white and springs to full size when there is text. The gray steps on the panel are `--oak-well` 4%, `--oak-raised` 7% and `--oak-bubble` 11% white, each about 1.618 times the lift of the step before. The visitor's bubble is `--oak-bubble` with white ink and about 1:1.618 vertical to horizontal padding (12 by 20px). Chosen options, the chosen window size and questionnaire picks use a light edge and a filled white mark. The workspace title is plain white. Keyboard focus outlines use `--oak-focus`, a soft white.
- **Colour carries meaning, nothing else**: a source's kind (case study blue, profile violet, article pink, resource gold, experience leaf) colours only its small icon, through `--oak-kind`; citations are one component with favicons (Steve's pages and web sources), never numbered discs. Done checks are leaf, connection states a faint blue, and elapsed-time pills and ordinary waits are neutral gray. Gold is reserved for the allowance ring (answers left) and a real budget limit. A downgrade the answer survives (research unavailable, step skipped) is a neutral note with an icon; danger red marks only a failed turn or data at risk. Accent fills that carry numbers use dark ink `#050505` (4.75:1 or better). No decorative orbs or blobs.
- **Candy tiles (ticket 50, the one exception to the line above)**: the public gallery page and its six Ask home cards give each replay tile its own flat candy fill, scoped to `src/components/gallery/gallery.css` and registered once in `colorExceptions`; ink on every fill is `#050505` at 4.5:1 or better, and forced colors drop the fills to Canvas.
- **Motion in the workspace (D69)**: every change of state moves, and nothing snaps. Global tokens `--motion-spring` (Motion's generated spring, 320ms perceived, 0.15 bounce, settling at `--motion-spring-duration` 600ms) and `--motion-settle` (200ms perceived, no bounce, 400ms) carry popups and presses. The held fold (a Motion spring, 950ms visual duration, no bounce, started on the first normal frame after the heavy settle commit, at most 600ms later, so that commit cannot make its first frame jump) folds a planned turn's trail in flow, because its answer already sits under the trail and must move less than a line and a half a frame (ticket 127). Tooltips, menus, selects and popovers grow from their trigger (`--transform-origin`) on the spring and leave on the quick token. Disclosures unfold to their height where the browser can size to `auto`. Primaries, Send and chosen marks settle on the spring. Follow-up and starter chips rise in one after another, 50ms apart. React surfaces keep `src/lib/oakMotion.ts` presets on the DESIGN tokens. Reduced motion keeps fades only and drops every transform, stagger and loop.

## Inline Article Signals

Work articles may use two inline signal treatments when they improve scanning without turning the copy into a checklist.

- Keyword badges are rounded inline boxes for concepts, proof terms, and policy terms such as context engineering, low-confidence path, model-card path, and California SB 1383.
- Brand icon links are inline brand/tool links with an official icon mark and blue linked text. Use LobeHub first for AI/provider matches, then SVGL for broader software, design, and tool brands. They must not use a badge box, avatar shell, or locally drawn icon background. Use color icons when the source exposes them and plain mono marks for black/white providers such as GitHub, Vercel, v0, or OpenAI.
- Source links should be visibly blue and slightly stronger than body copy. Avoid subtle white-underlined links in Work prose when the link is a source, standard, tool, or public reference.
- Keep density low: one to three inline signals per dense paragraph, only on meaningful first occurrences.
- **Danger `#EF4444`**: destructive or failed states only.

## Article Surface Defaults

Future blog, post, article, Work, and case-study pages share one design contract. Work MDX is the active article-like surface today; `/posts` stays deferred until Oak explicitly opens that product surface. Any future route should inherit these rules instead of inventing a separate blog shell.

- The canonical reader page leads with readable article structure, strong local media, useful source-backed claims, and restrained inline emphasis.
- Generated public Markdown and JSON remain source-driven, copyable and readable. They can organize denser evidence, with the same public facts and disclosure as the page.
- Add no hidden SEO-only, crawler-only, bot-only, or cloaked article text. Search and AEO value must come from source-aligned public reader content.
- Use `KeywordBadge` only for meaningful concepts, product/system names, proof terms, and policy terms. Use `BrandIconLink` or `LobeIconLink` only for exact real brand/tool matches from LobeHub or SVGL.
- Keep Product Thesis and other high-level callout blocks plain by default. Do not put badge clutter inside the highlight block.
- Keep article covers, Work cards, homepage thumbnails, and social previews on a `1200:630`-safe composition when one image is meant to travel across all four surfaces.
- Draft article-like pages stay `noindex-draft` until launch proof and `portfolio-launch-indexing-gate` clear them.
- In-progress case-study stubs are a lighter draft state than full articles: show the cover, quick description, centered `Draft notice`, concise system summary, and recommendations only. Hide the sticky TOC, article footer tags, proof/body scaffolding, and mascot until the full story is ready. The agent launcher remains independent of those restrictions.
- Human copy should read like a case-study story, not like a schema outline. Use first-person judgment when natural, explain why each decision mattered, and put proof boundaries in linked public resources or concise article caveats.
- Proof-first means source-backed, inspectable, and public-safe; it does not mean proof-jargon-led Human copy. Lead with the recommendation, product truth, or reader takeaway, then let public resources, artifacts, wiki, Serena, and Graphify carry denser proof.

## Case Study Storytelling

Case studies should be article-first. Artifacts exist to move the story forward, not to prove every internal note.

- Start from a concrete human moment, then widen into scale, product direction, architecture, behavior, tradeoffs, evidence, and learning.
- Put setup prose before an artifact and consequence prose after it. Do not stack multiple artifacts without text between them.
- Captions should tell the reader what to notice or why the artifact mattered. Avoid captions that sound like internal proof bookkeeping, implementation notes, or "this image shows the section."
- When a case-study page feels generic, meta, or over-explained, remove, merge, or write one sharper project-specific sentence before adding new sections.
- Keep claims ambitious but public-safe. It is fine to explain a market scale, startup hypothesis, or behavior-change bet. Do not imply production adoption, exact model accuracy, compliance savings, guaranteed tax benefits, or measured impact without evidence.
- Behavior-change stories should explain the product mechanism, such as incentives, gift cards, leaderboards, quizzes, history, admin views, and feedback loops, instead of only saying the app "educates users."
- Generated reading resources can carry denser answer structure based on the same public facts as the canonical reader page.
- Diagram artifacts should teach one idea at a time. Prefer friendly architecture/process maps with clear grouping, readable dark-mode contrast, and a small number of helpful emoji, favicons, or tool logos as scan anchors. Avoid checklist-box layouts, logo walls, redundant captions, or dense internal-system maps that require the reader to already understand the app.

Avoid a one-note monochrome page. Dark mode does not mean every area is pure black, and premium does not mean unreadably low contrast. Primary actions may be white on dark, but verify dark text stays legible on every white button.

## Typography

GT Walsheim Pro is the heading and display face. Inter is the body and UI face. The current Inter file is effectively static 400 despite the filename, so do not rely on Inter 500 until a real font is provided.

- **Hero display**: GT Walsheim Pro, 64px desktop, 44px mobile, weight 500, line-height 1.
- **Section titles**: GT Walsheim Pro, 48px / 56px desktop, 32px mobile where needed.
- **Card titles**: GT Walsheim Pro, 22px / 28px, weight 500.
- **Body copy**: Inter, 17px / 28px for homepage narrative; 16px / 1.6 for case-study body.
- **UI labels**: Inter, 13-14px, regular weight, no negative tracking.
- **Oak AI Agent titles** (panel, card, answer-card and document titles): GT Walsheim Pro 700; each agent screen uses at most 2 weights and 4 sizes (premium QA round 2, 2026-10-17).

Letter spacing is `0`. Do not scale font sizes with viewport width. Keep line lengths readable and prefer wrapping over truncation unless a component has a deliberate constrained label.

## Layout

Desktop follows the SteveOak.com dark portfolio redesign rhythm first. Tablet and mobile should derive from the same visual system instead of becoming separate designs.

- Max content width is `1376px`; default gutter is `32px`.
- Homepage section padding is generally `60px`; deep proof/story spacing can reach `120px`.
- Cards use stable grids and fixed-format media dimensions so hover states, labels, icons, and image loading do not shift layout.
- Work preview cards use the shared `1200:630` frame and a CMS-driven source model. The card text is title, one primary-tag pill, plain date/status text, and one source-derived context line.
- Resume/public-document Work anchors are part of the reader experience. Career Timeline hashes should be compact, stable, and readable; direct hash entry should land with the target visible below sticky navigation and any needed details already open, while plain `/work` and normal browsing stay unchanged.
- Proof rows alternate copy and media, but mobile collapses to one column.
- Keep primary content visible and scannable. Do not create a marketing-only hero that hides the actual portfolio surface.
- No horizontal overflow at common viewports: `1530x713`, `1440x900`, `1262x713`, `768x1024`, `457x831`, and `390x844`.

Images and proof media should be local assets under `public/assets`. Do not depend on temporary Figma, Google storage, or generated remote asset URLs.

CSS tokens mirror these scales in `src/styles/global.css`: `--space-*` (spacing), `--text-*` and `--leading-*` (typography and `leading`), `--radius-*` (`rounded`), `--shadow-*` (`shadows`) and `--z-*` (`layers`). Oak AI Agent rules live in `src/styles/oakAgent.css` and use only these tokens for type, spacing, radius, shadow and stacking; an off-scale value moves to the nearest step.

Oak AI Agent corners follow Apple's concentric rule (WWDC25 "Get to know the new design system"): a capsule's radius is half its height, and a nested shape's radius is its parent's radius less the padding between them. R14 surface roles carry the scale in `src/styles/oakAgent.css`: `--oak-r-window` 32px (the workspace window), `--oak-r-frame` 48px (every top-level surface in the reading column: the composer, answer cards, alerts and limit cards, panels and their groups, dropzones, lists, dialogs, popovers and menus; `--oak-r-sheet`, `--oak-r-shell` and `--oak-card-radius` alias it), `--oak-r-card` 24px (a block one 24px inset inside a frame: menu rows, quote wells, contact rows, research cards), `--oak-r-row` 16px floor (rows inside a card), and `--oak-r-control` / `--radius-pill` for every control, chip, icon tile and single-line row. Copy inside a frame sits one `--oak-frame-inset` (32px) from its edge, so text clears the curve. R15 padding follows the same step, by role: a frame that holds copy directly pads `--oak-pad-frame` (32px); a frame that holds cards or menu rows pads `--oak-pad-nest` (frame less card, 24px), so the card corner stays concentric with the frame; a row inside a frame pads inline by `--oak-pad-frame`. One phone exception: under 560px the answer's next-step row keeps that pad but closes its gap to 8px (`--space-xs`), and its hint wraps to two lines instead of ending in an ellipsis. Content clears a frame corner arc by at least 8px (the arc probe in `tests/agent/premium/arc-probe.mjs`). Menus draw hover and keyboard focus as one shape: the glide, inset by `--oak-pad-nest`, carries the focus ring. Gray on gray carries no border: an elevated well inside a filled frame is told apart by its fill; frames side by side share one corner and one edge rule. Write a derived corner as a step less a `--space-*` token, never a new literal. Small fixed corners (`--radius-sm`) stay only for real objects: keycaps, checkboxes, favicons and pictograms. The agent stylesheet lint (`portfolio/agent-tokens`) rejects anything else, and `tests/agent/premium/r14-surfaces.test.mjs` measures all 95 gallery states against these rules.

Liquid Glass (R14, `evidence/r14-liquid-glass-research.md`): floating controls across the site and the agent (the compact header, the message box, popovers, menus, the mascot bubble, the case-study page menu) share one material from `:root` in `global.css`: `--glass-fill` or `--glass-fill-overlay`, `--glass-sheen` (white light running dark at the top to lighter at the bottom, like Spotlight and the Apple Intelligence composer), `--glass-edge`, `--glass-blur` and `--shadow-glass`. Never glass on glass, never glass behind body copy, and under reduced transparency the fill turns solid (`--glass-fill-solid`). Color in glass stays with meaning; the launcher ring keeps the multicolor gradient.

Answer cards (R16, `src/lib/openui.tsx`): an arranged answer can hold Project, Role and Source cards, Stack chips and a Stats row. The model only names claims; every title, cover, role, period, place, stack item and metric comes from the cited page's own labels (`oakCitationLabelsWithCovers`), and a card without them reads as the plain Points or Prose block it stands for. A card is a top-level frame (`--oak-r-frame`, `--oak-pad-nest` around its cover, `--oak-pad-frame` around its copy); its cover is inset and takes the card radius less that inset, at 1.91:1 for a case study and 2:1 for a Source page. A card holds only the claims citing its own page. Chips and a Role's artwork are capsules or rounded tiles on the row floor; Stats tiles are frames, at most four in a row. Two cards sit side by side when the panel's container is wide enough and stack below 640px. While a program streams, a card whose claims have not arrived is a skeleton that reserves its cover's ratio, with no shimmer under reduced motion. A link to another site carries the up-right arrow and "(new tab)" for screen readers.

Answer items (R18, review v15, `evidence/Q24-G16-r18-refs.md`): an answer that opens on cards or numbers leads with a written overview, claim 1, of 20 or more words citing two or more pages (`oakOpenUIOverviewClaim`); only an answer without one falls back to the app's framing line, and a move that would empty a Project or Role card never happens. Inside an item the first claim is its lead line in full white and the rest are quieter points. A Project row is thumbnail (the 480px cover), title and `role · period`, then its lead claim, then up to two page metrics as label-over-value cells told apart by one fill step, then its stack on a line of its own. Consecutive Role rows join into one grouped list (square joins, inset hairline) with title and dates on one head line. Stats is a grid of number tiles, two across (one under 520px), the number at the card-title step. A Source is its claim, then one borderless capsule row (round tile, title, site). Role fit is one prose column: a verdict sentence, a segmented Met/Partial/Gap bar with a labelled legend, rows ordered Met, Partial, Gap with proof as muted prose (no wells), and gaps grouped under "Not found in what Oak read".

Arranged answer blocks (genui merge 13 to 16, #420 to #425; shipped, switches retired by ticket 38): Steps is a real `<ol start>` whose number discs are joined by a 2px violet rail, `CanvasText` in forced colors. Each Stats tile, and a lone Metric or Meter, is a raised frame (`--oak-r-frame`, `--line-soft`) led by a 28px round glyph tile; in a Stats row tiles 2 to 4 take leaf, gold and blue tints so the numbers read as separate facts. A plain Points list is one raised group of rows, each with a leaf tick tile and a hairline between rows; a card's own list keeps bullets. A Heading is a 24px tinted icon tile, its words, then a hairline border filling the rest of the line. A Callout is one flat warm wash (gold mixed into `--panel-soft`) with no shadow, gradient or second color. Stack and Project tool chips lead with the tool's bundled brand mark (`/assets/...` only, `alt=""`) when the registry has one. A Source picture sits whole in its 2:1 frame over a blurred copy of itself, and its skeleton reserves the same frame. A web research row with no site date shows "Checked YYYY-MM-DD". While a layout streams, a Stats, Compare or Timeline whose children have not arrived holds their place with skeletons of the settled item's own shape and height, with no shimmer under reduced motion. The contact-brief proposal names the pages the brief can attach as quiet tags under "Pages from this answer". In the thinking trail, Steve's own search counts passages ("5 passages", "1 passage") so it never reads against the shorter "Sources found" list below it; the web research step keeps "N found", the web results returned.

Tint in tint (R18): a row or block never paints a fill inside a parent that already paints one (gray on gray); its state shows on its control and text instead. `tintProbe` in `tests/agent/premium/arc-probe.mjs` checks every gallery state at 1280.

## Media Optimization

SteveOak.com uses AVIF-first media intake for runtime still images. Retain the original source media first, then run the responsive image generator so runtime variants and manifest entries stay reproducible.

- Photos, large art, Work proof images, mascot sprites, and background stills should ship as AVIF first with WebP fallback.
- Use `OptimizedPicture.astro` for visible image markup and AVIF/WebP `image-set()` for CSS backgrounds.
- Keep PNG/JPEG for Open Graph/social images, favicons, app icons, and proof screenshots where AVIF review softens text or UI details.
- Prefer SVG for logos, icons, and diagrams when the source is vector.
- Prefer MP4/WebM for motion demos. Do not use animated AVIF/WebP unless the loop is tiny and intentionally decorative.
- AVIF-only runtime media is not allowed; WebP fallback stays mandatory.

## Elevation & Depth

Dark-mode depth should be tonal and structural, not shadow-heavy. Use borders, subtle translucent surfaces, blur only for overlays that need separation, and real stacking rules.

- Header compact state can use translucent black and backdrop blur.
- `ContactMorph` must render above page art, badge icons, hero media, and the docked portrait.
- Proof media and feature cards rely on border, shape, and image content more than drop shadows.
- Heavy shadows are acceptable only for top-layer overlays such as `ContactMorph`, where they clarify focus and spatial hierarchy.

## Shapes

The SteveOak.com shape language is spacious and soft, with real fallbacks first and squircle support as progressive enhancement.

- Feature cards: `32px` fallback; `56px` plus `corner-shape: squircle` when supported.
- Proof media: `48px` fallback; `72px` plus `corner-shape: squircle` when supported.
- Contact card: `40px` fallback; `56px` plus `corner-shape: squircle` when supported.
- Work preview thumbnails: `24px` fallback; `36px` plus `corner-shape: squircle` when supported.
- Buttons and small pills: `999px`.
- Small square artwork: `6px` unless the surrounding pattern needs a documented larger shape.

Always define normal `border-radius` outside `@supports`. Because `corner-shape` is experimental, never make it the only shape contract. Wrappers own clipping and radius for proof media; child images should fill the wrapper and keep `border-radius: 0`.

## Components

**Astro shell**: Prefer static Astro markup for page structure, SEO/AEO scaffolding, and visible text. Use React islands only when a component needs browser state, measurement, clipboard, or animation.

**Buttons**: Primary buttons are white pills with dark text. Secondary buttons use the dark translucent token with white text. Base UI button sizes `sm` and `md` both have a `44px` minimum height; icon buttons are `40×40px`. Button text must never overflow the pill, and hover should be subtle: a small vertical lift or opacity shift.

**Header**: The header starts transparent, becomes compact after scroll/menu state, and shows the docked Oak portrait when the hero portrait crosses the header. Active desktop navigation uses brighter text only, not an underline or active rail. Disabled or coming-soon nav badges should be borderless, softly filled, and dimmer than the nav label. Do not replace this with a hardcoded scroll threshold unless browser proof shows the measurement path fails.

**ContactMorph**: `Say Hi` must morph through the current shared-surface architecture: `MotionConfig`, `LayoutGroup`, `AnimatePresence mode="popLayout"`, scoped shared `layoutId`, footer invisible ghost pill origin, `borderRadius` animation, viewport-aware placement, outside click, Escape close, and Email/LinkedIn in a row. Older no-shared-layout or clip-path-only guidance is historical.

**Cards**: Feature cards should feel quiet and substantial, not decorative. Use current padding `clamp(32px, 2.4vw, 40px)`, soft borders, large squircle support, and a clear icon/media badge.

**Work preview cards**: Homepage Work rows, the `/work` index, and case-study `Keep reading` recommendations use one shared preview model. Live cards come from the Astro Work content collection through the Work adapter. Staged cards may follow after live entries through the staged Work data, but they must normalize through the same preview model and show `Soon` in the date/status slot. Real entries link to `/work/<slug>`; staged previews are not clickable. The visual treatment is OpenAI-style editorial cards: large `1200:630` image, `24px` fallback radius, `36px` squircle support, a `28px` gap before text, title, one dim borderless primary-tag pill, plain dim date/status text, and a short context line. Live card context should reuse the case-study page title context instead of inventing new summaries. Staged card context may use the staged category line. Do not show implementation copy such as "sourced from MDX frontmatter" to readers.

**Work recommendation sections**: Case-study pages should show a `Keep reading` section below article details. Exclude the current article, show three recommendations when available, and mix live then staged Work previews until more live case studies exist. The section should feel like editorial continuation, not a footer utility block. Section actions such as "View all" are dim text by default, no underline, and brighten on hover/focus/press.

**Work Career Timeline deep links**: Career Timeline items on `/work` should support compact public hashes such as `#hyperskalers` and `#pnppsolutions`, with legacy `#career-*` aliases kept for existing external links. Direct hash loads and hash changes may expand the full timeline and open the targeted `Show details` panel, but normal `/work` page loads, scroll behavior, Work card navigation, and `View Latest` / `View All` should not auto-open details. Use enough `scroll-margin-top` or equivalent offset for sticky header clearance on desktop and mobile.

**Proof media**: Wrapper owns aspect ratio, overflow, background, radius, and squircle support. The image fills the wrapper using current edge-filled assets and should not be rounded itself.

**Icons**: Product UI uses Hugeicons Solid Rounded through `src/components/ui/Icon.tsx`. Do not import icon libraries directly at call sites. Do not add lucide, MUI icons, Radix icons, emoji-as-icons, or one-off SVGs unless there is a documented exception.

**Base UI / shadcn primitives**: Base UI is allowed as the headless primitive foundation for shadcn-style components. Do not introduce Radix primitives, MUI, lucide, or lucide-react.

**Work MDX articles**: Work detail pages use Astro content collections and MDX as the source of truth. Keep the article header centered with no visible breadcrumb, a compact metadata row, a softer article title, and strong local hero media. The header metadata row is date first plus one quiet text tag, with the date brighter than the tag; do not make header tags into pills or status badges. The article footer is the only place that shows the full tag set, using generous borderless soft pills. Then use a readable `760px` article column with a desktop sticky TOC generated from MDX headings. Rich MDX components (`TLDR`, callouts, metrics, process steps, outcome tables, image figures, link cards, proof grids, and Q/A) are static Astro components first, with `8px` radius and neutral dark surfaces. Diagrams/process architecture are diagram surfaces, charts are for quantitative data only, and comparison tables may span the full media rail like images and video. The article should flow like a human story: text, one artifact, text, one artifact. Do not use remote OpenAI assets, OpenAI Sans, Radix, MUI, lucide, glass gradients, hidden crawler-only text, or visible implementation notes.

**Work article TOC actions**: Full Work article desktop TOCs may include a small copy/provider action menu under `On this page`. It should feel like restrained reader utility, not a second toolbar: neutral dark pill, compact icon/text trigger, and the four approved copy/provider actions. Mobile TOC remains a section picker only, with enough width for the active heading and no copy/provider rows when space is tight. In-progress Work stubs do not show TOC actions because they intentionally hide full article chrome.

**Work in-progress case-study panels**: When a Work case study is visible but not ready for a full article, use a centered dotted/grid panel rather than partial article scaffolding. The eyebrow should read `Draft notice`; the headline may be `Case study in progress`; the body should say `Full case study coming soon` at most once and summarize the system in direct public language. Do not add separate redundant headings, proof caveats, private/public gating language, capability grids that read like product marketing, or a right-side TOC when the panel is the only body content.

**Work legacy case-study cards**: A legacy external case-study link below an in-progress stub should look like a compact editorial Work card: HD cover image in a rounded wrapper, quiet pill labels, explicit date, title, short summary, short follow-up note, and one external CTA. Keep visible copy short; move richer old/new chronology into frontmatter, wiki, Serena, and Graphify.

**Work image carousel**: `WorkImageCarousel` is the article artifact for app-store graphics, mobile screenshots, or other sequential visual proof where the reader benefits from click, swipe, and autoplay. It should feel like screenshots moving across the black page, not a framed blue widget: no title block inside the carousel, no item labels, no visible loading/progress bar, no gradient panel background, and no text Prev/Next controls. The active item should align to the center of the carousel viewport on autoplay, click, and swipe. On larger screens, multiple neighboring screenshots may remain visible through overflow; on smaller screens, item radius tightens and the spacing stays generous enough that screenshots do not touch. Use black side fades only to soften edge clipping. Captions sit centered below the controls and should describe the source, such as Oakminder App Store graphics, rather than restating the article section.

**Work image grid lightbox**: Dense Work image grids may stay compact in the article only when each item remains inspectable. Each grid group owns its own fullscreen lightbox; opening works from both the image tile and the floating icon trigger. The trigger should be quiet and secondary: about 25% smaller than the earlier large circle treatment, black at 50% opacity, with a low-opacity border. On hover, scale the image slightly to signal interactivity without shifting the grid. In the lightbox, the top header shows only the counter, not the group title; the bottom caption is centered because it is the reader-facing label. On small screens, align previous/next controls to the visible image center instead of the viewport midpoint. Fullscreen media must use the source-quality image set, not a thumbnail asset.

**Work charts**: Portfolio charts use the local shadcn-style Recharts primitives through a Work chart wrapper. They should feel like publication graphics on the black page canvas, not blue card panels: article text-width by default, no decorative container, subtle white grid/axis lines, dot legends, strong concise titles, useful tooltips, captions for claim boundaries, and horizontal overflow protection only when a small viewport needs it. Use line charts with restrained under-line gradients for benchmark/score trends, protocol ladders, or source-backed sequences; area charts for trends or stacked contribution; bar charts for category comparison or proof coverage; donut/pie only for small composition sets; radar for shared-dimension profile comparisons; and radial for one progress/status value. Charts must count or compare source-backed data only and must be labeled as external context, protocol/planned evaluation coverage, or measured evidence; do not imply model accuracy, product impact, adoption, or business outcome without the corresponding evidence packet.

**Work diagrams and Excalidraw**: Excalidraw/global diagrams are for process, architecture, system agreement, and product flows that need visual explanation rather than numeric measurement. They should be easy to understand in the dark Work article context: black-page compatible, high-contrast text, simple lanes or clusters, short labels, and enough spacing that screenshots or icons remain inspectable. Sparse emoji, favicons, and tool logos are acceptable when they help scanning or make a phone-to-desktop/product-tool flow friendlier, but they should never become decoration, a logo wall, or a substitute for explanation. Use Oak's manually edited Excalidraw scenes as taste evidence, compare against the stronger EcoSmartLoop and LinkedIn Growth Loop diagrams before publishing, and browser-proof readonly embeds because MCP screenshots may omit text.

**Canonical reader experience**: The October 5 version-3 target has one public portfolio page and no Human/Machine toggle or alternate Machine reading view. Migration readiness is recorded in the current execution state and gates. Keep public HTML readable without chat or JavaScript, with accurate metadata and structured data. Keep Markdown, JSON, profile, llms and skill endpoints generated by the existing shared factories. Removing a client presentation does not remove those resources or permit hidden crawler-only copy.

**Centered agent launcher**: Place one persistent `Oak AI Agent` button directly beneath the mascot at the existing central browsing anchor. Preserve the mascot's vertical location, existing speech spacing and the reserved 56px control row. Use the existing neutral pill, full readable label and at least 44px target. Its opaque surface token (`--panel`, `#0C0C0C`) keeps the white label readable over bright covers. Center relative to the visible viewport, with safe-area clearance at narrow widths, zoom and panning. `--oak-launcher-center` follows the visible horizontal midpoint, `--oak-launcher-bottom-offset` follows its safe bottom edge, and `--oak-launcher-max-width` bounds the button within that viewport. Keep the full label at compact widths instead of preserving the former 100px corner footprint. Remove the two-corner allocation and audience tabs. Existing header, hero and menu Say Hi entries can open the same conversation. They are not a second persistent launcher. Opening the workspace immediately hides and disables the browsing launcher and mascot. The mobile menu retains its interaction priority. Exiting controls become inert and hidden from assistive technology while their visual fade finishes.

**Full-screen chat home**: The home on `/` is the one decided exception to the centered launcher ([ADR 0007](docs/adr/0007-the-home-opens-on-the-chat.md)). With `oakChatFirstHome` on, `/` opens on the chat, and the home composer takes the launcher's place. Close shows the Classic home from the same DOM, with the mascot and the centered launcher. Every other page keeps the centered launcher. `oakChatFirstHome` stays `false` until the chat-first flip (ticket 70), so today `/` keeps the launcher too.

**Oak mascot**: Preserve the current central position, character registry, authored speech and grapheme-aware typewriter. Oak remains visibly distinct from Steve. Attribute Steve's authored words as quotations. Character expression grants no data access, tools or spending. Preserve approved Orbi, Claw and Oakminder route behavior. Mascot-free public stubs stay mascot-free and still offer the centered launcher. Private utility pages do not gain a public launcher. Keep the mascot mounted but hidden and paused while the workspace or a competing overlay owns interaction. On the Full-screen chat home, the mascot is hidden while the chat fills the first screen, and it returns on the Classic home. Closing restores the eligible retained note, context and collapse state without a repeated greeting. Motion owns sprite and crown transforms, using the 160ms quick timing and existing easing. Crown hover and focus lift by 2px and scale to 1.04. Reduced motion suppresses those transforms. CSS retains opacity, filter and focus cues.

**Public reading resources**: Page-specific Markdown and JSON, full LLM context, profiles and skill resources remain available independently of the launcher. Their facts and disclosure match the canonical page. Public agent context uses third person and reader-facing labels. Never expose private notes, workpads, credential paths, account settings or debug language. Keep useful article-level Copy Markdown, Ask ChatGPT, Ask Claude and Ask Perplexity actions where they already help. Provider prompts prefer `markdownApiHref`, then `markdownHref`, then the canonical page URL. Do not add a replacement Machine tab or an endpoint inventory to the launcher. When a visitor asks about one of the site's AI files, such as `/llms.txt` or `/profile.json`, the answer may show that file as one compact source card. The workspace still holds no endpoint lists, and the full review views stay in the Owner console. Public CLI, plugin, MCP and WebMCP distribution remains later T27 work.

### Agent copy

- **Voice**: Plain and calm. Speak to the visitor as "you" and about Steve in the third person. One idea per sentence, no exclamation marks, no internal jargon.
- **One return label**: Every workflow panel returns through `WorkflowPanel` with `Return to chat`. Panels do not add their own back, return or "write my own" buttons.
- **Status lines name no vendor**: `role="status"` lines, `*__status` rows and store `error`, `phase` and `notice` messages say what happened and what the visitor can do next. Point to the workspace place instead of the provider, such as `Model funding`.
- **Vendors stay where the visitor decides**: Consent and disclosure copy keeps the recipient named: the voice footnote (Deepgram), and funding cards and the model-reading disclosure (OpenRouter). Public research asks nothing (v3 review, 2026-10-18): it runs on its own and shows as a step in the reasoning trail. The three fixed topics send only their fixed public query; the open web topic (R19) sends a query built from allowlisted work words in the visitor's question (`openWebResearchQuery`), never names, document text or history.
- **No system strings**: Labels never show internal ids, raw paths, section ids or route strings. A visitor's document is named by its file name, and a part of it by its page or its opening words, never `Document 1` or `Block 3`.
- **Errors reassure**: An error names what was kept ("Your draft is still here") and the next step, without blame. `tests/agent/design-rework/d11-copy.test.mjs` enforces the vendor rule.

## Do's and Don'ts

- Do read this file before frontend, motion, visual polish, component, or copy-layout work.
- Do treat YAML tokens above as the normative values and prose as the application guide.
- Do update this file when reusable colors, typography, spacing, radii, motion policy, or component visual rules change.
- Do keep dark-mode contrast readable and verify it with screenshots or computed checks when a surface changes.
- Do use motion to explain state and spatial continuity.
- Do respect reduced-motion preferences for new Motion interactions.
- Do make new case-study and Work surfaces feel story-first, specific, artifact-supported, and public-safe.
- Do keep in-progress Work case studies sparse and centered: cover, quick description, Draft notice, concise summary, and recommendations.
- Do keep legacy case-study cards concise and visually aligned with Work cards when they bridge old and new case studies.
- Do make Work diagrams dark-mode readable, friendly, and educational, with sparse emoji/favicons/tool logos only where they help scanning.
- Do make dense Work image grids inspectable with group-local lightboxes and centered reader captions.
- Do use CMS-driven Work preview cards for homepage rows, `/work`, and case-study recommendations.
- Do keep the single Oak AI Agent launcher centered beneath the original mascot and below the open mobile nav layer on every page. The one exception is the Full-screen chat home on `/`, which hides it while the chat fills the first screen and shows it again on the Classic home.
- Do keep canonical HTML and generated reading resources public, source-driven, crawlable, copyable and readable.
- Do keep article provider prompts pointed at Markdown API URLs when available, with restrained copy/provider actions.
- Do preserve the current token values and responsive overrides in `scripts/design-policy/policy.mjs`; update policy and exact fixtures when a shared design change is approved.
- Do keep full Work article TOC actions desktop-only when mobile space is constrained.
- Do attach actual proof media to Linear for meaningful visual work.
- Do run `npx --yes @google/design.md@0.1.1 lint DESIGN.md` after changing this file.
- Do run `npm run lint`, `npm run audit:design`, and `npm run test:quality` for design-policy changes; use `npm run validate` and targeted browser proof for shared UI or rendered behavior changes.
- Don't create new palette, font, radius, icon, or section patterns without updating this file.
- Don't recreate a Machine reading mode or add a replacement tab inside the agent.
- Don't crowd the launcher or workspace with resource endpoint lists. A question about one of the site's AI files gets one compact source card, not a list.
- Don't put copy/provider actions inside the mobile Work TOC when they crowd the section picker.
- Don't show raw destination URLs in reader utility rows unless useful or explicitly requested.
- Don't add delayed reveal animation that makes visitors wait to read content.
- Don't use generic AI SaaS patterns: vague hero promises, decorative purple/blue gradients, over-symmetric bento filler, random card grids, same-looking AI screens, or proof text that reads like internal notes.
- Don't hardcode Work recommendation lists in page templates when the content collection or staged Work data can provide the same cards.
- Don't expose mascot, TOC, or proof-heavy article scaffolding on in-progress case-study stubs before the full story is ready.
- Don't turn a legacy case-study card into a long explanatory paragraph on the public page.
- Don't put repeated titles in Work grid lightbox headers when the bottom caption already labels the image.
- Don't ship checklist-heavy, logo-wall, or overly complex Excalidraw diagrams that repeat surrounding prose instead of clarifying the section.
- Don't reintroduce placeholder news content into live HTML until real SteveOak.com posts exist.
- Don't change site-wide or page-specific indexing gates as a design-only edit; preserve the launch stage, page proof requirements, and `/404` noindex contract.


**Agent supported viewport, R55**: Desktop and laptop are the primary agent design target. Initial supported chat/task interaction requires a stable layout viewport at least360px wide and600px high in CSS pixels. Below either limit show the concise accessible message `Use a larger window to open Oak AI Agent.` rather than a cramped task form. Preserve the conversation and ordinary reading/contact; an already open workspace keeps a reachable Close control and recovers its session when space returns. A transient software-keyboard visual viewport does not decide unsupported state or remove its focused field. Existing very-short-height rules are defensive rendering, not a promise of full agent interaction below these limits. Verify with Browser first, using limited compact portrait coverage; Swift/XCTest is reserved for a specific genuine keyboard gap. The guard is implemented with narrow supported-boundary and recovery Browser proof; whole T09 acceptance remains open.

**Window sizes are removed, R28 (Oak, review v26)**: the workspace always opens Full, edge to edge, at every viewport. The window options menu, the size presets, the edge and corner grips, header drag, the move handle, Restore and the saved window size were deleted from the code (genui merge ticket 10); there is no flag to turn them back on, and a size a visitor saved earlier is never read. The 360 by 600 larger-window notice and the 60px keyboard strip still apply.

**Agent workspace**: The persistent `OakWorkspace` owner is independent of the browsing mascot owner. It opens a named Base UI modal over the unchanged reader page from both Say Hi and Oak AI Agent. Its CSS-first portal owns the overlay layer at 100 and mounts in an unstyled host inside the persisted React island, so Astro body swaps retain the dialog and its controls. The host adds no hidden state or stacking context. Base UI owns modal focus containment. After an Astro swap and page-load, the active persisted workspace retains valid focus already inside it, or restores its last available focused control with Close as the fallback, without scrolling. Recovery reads the current presentation and never moves focus into a closed workspace. The canonical presentation owner makes the route surface and site header inert while the agent workspace is open, including the incoming document before an Astro swap, and releases them for browsing. The popup host stays outside those inert surfaces. The workspace opens full screen, edge to edge, at every viewport (R28). Numeric top/right/width/height have one sizing owner and an exact runtime-style policy. Geometry is clamped to visual viewport offsets and dimensions, including scrollbar and safe areas, without resizing the underlying page. A shortened visual viewport already excludes the keyboard and bottom display area, so it uses the compact bottom gutter without reserving the display inset again. Coarse touch pointers use 16px composer text to avoid native focus zoom while retaining the existing line height and control targets. When the remaining height is below 120px and the available width is at least 540px, the workspace uses a 60px strip at least 540px wide with header actions and the composer in one row. The dialog title remains available to assistive technology, Contact uses its named icon, and the controls retain 44px targets. Active workflow fields, Return actions and feedback retain an independently scrollable reading pane beside the footer controls. The inline composer row takes precedence over portrait stacking. Reading fields retain normal label line height, and account intake uses the outer reading scroll without a nested height cap.

The header is one compact row: Oak AI Agent, a quiet Contact Steve action, New conversation, the account menu, and Close. Its description remains available to assistive technology. Header icon targets are 44px within the workspace, independently of the global 40px icon primitive. Contact Steve becomes a labeled 44px icon target on mobile. At short heights, keep the compact header and omit secondary context from the main canvas. When the viewport itself is short, keep Close and contact in the fixed header, and keep the core message field and Send or Stop in a nonshrinking footer, with a flexible reading area above it. The reading area scrolls transcript, error feedback, saved controls and workflow fields without covering the footer. Role and question fields retain their native association with the footer form; the account form stays separate. In a short viewport, the composer uses one grid row with a flexible 44px input and nonshrinking actions. On narrow portrait screens, put the 44px input above the 44px action row and preserve at least 220px of input width when the viewport allows it. Keep a 4px column gap, 1px surface padding above and below, and no extra action-row margin or padding. The header has no vertical padding. Use an 8px outer gutter when the viewport is at most 640px wide or 480px high. These short-height rules win over compact sizing. Measure the rendered html bounding width because modal scroll lock can preserve a narrower fixed containing block than clientWidth reports. Contact, Tools and account popups are mutually exclusive, portal inside the modal, and consume Escape before the parent dialog. Tools uses the existing Base UI Menu for keyboard movement, type navigation and dismissal. Selecting a workflow preserves application-owned intake focus; dismissing the menu returns to Tools. Preserve the visible message and its offset through viewport changes and reopening; follow new content only when the reader stays at the live edge. The scroller owns transcript anchoring, so disable native overflow anchoring on its viewport. Real transcript content has a natural height with zero minimum; only empty starter content keeps a 100% minimum height. Latest messages belongs only to actual message transcripts and sits in its own nonshrinking 44px flow lane below the transcript viewport. It never overlays a message or citation, and its lane is absent when the headless control is inactive and inert. Empty conversations use a plain keyboard-scrollable starter region with no live-edge action or transcript restoration. At every viewport height, the empty region and real transcript share the flexible available reading height. Do not restore a fixed 96px transcript height. The real transcript has a 96px minimum only to prevent feedback or an advice intake from collapsing it to zero; it grows to use the available reading height. Empty starters retain a zero minimum. Active intakes and real feedback retain scroll access, and the short composer stays 44px. Its heading starts at the top, and starters are one-line chips (two short rows at most) under Oak's note, chosen by the visitor's purpose and page and written as the visitor's own words. Follow-up chips wrap to two rows. Full starter labels wrap within the viewport. The reading canvas takes the available height above a single framed footer composer, which groups the message field, quiet Tools controls and the primary Send or Stop action. Fields and controls use existing type, spacing, color and shape tokens. No duplicate visible host description, empty status row, disabled Save block or account-preparation paragraph belongs on the default canvas. Tools exposes Compare a role, project advice, contact brief, dictation and Save and history. Unrelated starters and Tools hide while an intake is active. Active role, question, brief, voice and conversation panels use the reading area and an explicit Return action; field ownership and submission stay with the existing footer form. Advice answers remain readable while its next-question mode is active. Conversation saving, history and remaining allowance are shown on deliberate entry to Save and history, while required account continuation and real errors remain visible without that entry. Opening Tools or conversation controls does not send, sign in, load history or start recording.

Human text stays opaque on the neutral 94% panel surface with blur, with a solid dark fallback and reduced-transparency override. Workspace muted text uses opaque `#B1B1B1`, inherited by placeholders and contact popovers inside the modal. The popup shell uses `overflow: clip` so native focus scrolling cannot move the fixed header out of view. While the agent workspace is active, CSS locks overflow on html and body using the canonical presentation attribute, so the lock follows Astro body swaps and releases when the workspace closes. The active root reserves a stable scrollbar gutter to retain the existing width on scrolling pages with classic scrollbars; overlay scrollbars reserve no gutter. Native width proof remains required for classic-scrollbar pages that did not overflow before opening. The transcript and flexible reading area retain their own scrolling. Size changes are immediate, with no width/height tween, and reduced motion removes popup translation/fade. There is no automatic greeting, model call, opening, or send. Footer and Kusala support keep direct contact. Closing cancels owned work, preserves draft/completed messages, and restores an eligible visible focus target. A paused mascot's retained DOM is explicitly hidden; its scroll sheen pauses and uses the 160ms quick token. T08 owns mascot pause/restoration behavior. Runtime gates remain open until browser proof.

Workspace activity sprites are separate from the browsing mascot. Use one authored Oak per state (empty, reading, searching, weighing, writing, slow, error, paused, limit, success), once within the active reading flow, as a sprite sheet where motion helps. Each state has a static reduced-motion frame. The compact header keeps the branded text without duplicating the active flow’s sprite. The launcher may show a wave on pointer hover or keyboard focus; it keeps its existing action and accessible name. At mobile widths its sprite hides to preserve the existing launcher footprint. Decorative cues stay out of the accessibility tree. Only the five image fields selected on the server reach the React island, with AVIF, WebP and the original PNG as fallback. Sheets carry no fabricated progress or extra control. Reduced motion retains the state's static frame. Keep the browsing mascot paused and hidden while the workspace is open.

Workspace status icons use the shared Hugeicons Solid Rounded wrapper. Fixed actions keep stable glyphs for Send, Stop, dictation and history. Tool glyphs follow validated reading, search, navigation or draft events; a checkmark means the tool returned, not that the whole answer finished. Failure, interruption and provisional usage remain paired with their readable status text. These glyphs are decorative, with an 8px gap from the text and no shrink or extra announcement. A slow step (no progress for 2 s) gets a named wait with a way forward (Stop); never fabricate progress or expose private tool/provider identifiers in status labels. Explicit recipient disclosures remain in consent flows.

**Answer surface (premium round v3 review)**: The newest answer ends with a Related list: a titled column of full-width rows, each one question with a plus at its end, divided by hairlines (Perplexity). Rows wrap to two lines inside themselves; follow-ups never sit over the composer. The footer keeps copy, copy with sources, ask again and open-in; there are no thumbs, report button or usage receipt. A cited page of Steve's that has a cover shows that cover as its face (chip, Sources stack and popover header); other hosts show a bundled brand icon or their initial, and the page never asks another site or a favicon service for an icon. Inline source chips centre on the text line. Public research sources are a sideways row of cards (host, title, three-line excerpt, checked and site dates) that each open the page. One Oak per turn: when the reasoning trail shows him, the answer's eyebrow keeps its glyph. The loader is a ring (R17), so it sits in its round wrapper with one shape; the earlier square pixel grid in a rounded square still read as a circle on a 24px or 36px tile. Checkboxes fill white with a centred dark tick. The composer shows a small memory meter (the last 12 messages go back to the model), and the transcript marks where older messages drop out. A signed-in visitor sees a Signed in badge on the greeting.

**Narrowing, proposals and stopped turns (premium round Q03, Q04)**: an ambiguous question gets Oak's one-line question and 2 to 4 wrapping pills (the shared Suggestion primitive), with a quiet "Pick one, or type your own." line; a pill asks it as the visitor's next question, and an older turn's pills stay readable but inactive (Perplexity `f721480e`). A request Oak cannot carry out ("email Steve for me") is a proposal card at the sheet radius: a tile, a bold title, one quiet line, one primary action that opens the brief with the visitor's words, and a receipt line once it ran ("Nothing is sent until you send it"). Every stopped turn (interrupted, failed, connection lost, model busy, paused, a limit) is one neutral notice: tile, what happened, what next, one action row; only a real limit tints its tile gold. When the answer lands, the reasoning steps fade where they are and leave the flow, so the answer arrives in its final place under "Thought for Ns". The transcript's one polite live region announces a turn starting, each tool it runs, the answer, and a stop or failure, never streaming words.

**Account continuation**: After two completed guest answers, a compact account prompt stays separate from the transcript and composer. Purpose is required; company and referral are optional. The scrollable intake uses the existing field, type and color tokens, and never moves the fixed Close/contact controls. Sign-in loads only after explicit intent. A bounded, expiring browser-tab handoff retains validated completed conversation and drafts across an auth redirect. It contains no session tokens, usage, voice recordings or account authority. Successful continuation clears that handoff; Close and New conversation cancel its reopening intent. Continuing does not send a question or save account history. Actual account and redirect proof remain separate release gates.

**Saved conversations**: Tools exposes Save and history without loading it. Its dedicated reading-area panel preserves the existing explicit Save and Saved conversations actions, readable status and optional sign-in. The default chat canvas has no disabled saving controls or configuration paragraph. History opens only after explicit selection of Saved conversations, and keeps its 240px scroll limit. The panel and active account intake can use the available reading height; they do not share that height with a compressed background transcript. Return to chat restores composer focus after the panel closes. Disabled account saving explains unavailable configuration inside the panel. The history list uses dated summaries with explicit Open conversation controls. Save confirmation appears only after acknowledgement, and only then do subsequent terminal messages append automatically. Reopened completed answers retain their historical citations, cards and versioned output. Interrupted turns show a marker with an explicit retry instruction, without restoring partial answer text or inventing missing role requirements. Read or save failure keeps the visible conversation and unsent draft. New clears the active workspace and history cache without remote deletion. Account/session changes invalidate private cached history and pending callbacks. Actual account, native layout and redirect proof remain release gates.


**Private document reading**: Tools opens Documents in the scrollable reading area while the compact header and fixed composer keep their existing layout. Native file selection stages multiple TXT, DOCX and digital PDF handles in memory. Nothing uploads until explicit Prepare selected files. TXT, paste, locally extracted DOCX body text and a limited image-free digital PDF subset are available. Unsupported PDFs retain a paste/TXT fallback. A genuine image-present PDF receipt can enter Scanned PDF review without an extracted preview. Scanned pages are read by Gemini on Steve's Vertex credit (ADR 0004); the Scanned PDF review names the pages it will read and the daily page allowance before the visitor confirms.

**Private service utility pages**: The owner service page is a sparse 960px column using the existing heading, field, Button, neutral color and spacing tokens. Recorded model spend, reserved funds, effective limit and available bound lead the page. One keyboard-scrollable table groups the selected service observations. Unknown balances remain unknown; local bounds are not provider credits. Monitoring starts and changes only through explicit owner controls. Delivery acceptance, provider delivery and inbox receipt are separate readable states. Private data is loaded through the authenticated no-store API and cleared on account changes, never included in static HTML, public generated resources, URLs or browser storage. The owner and funding callback shells are explicit noindex utility routes outside the sitemap. They do not mount the portfolio workspace or audience controls. The callback strips all query and fragment data before other scripts or UI, sends its one connection result only to the exact originating popup flow, and does not confirm a payment.
