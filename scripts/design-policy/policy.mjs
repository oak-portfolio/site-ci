/** Reviewed contracts for the approved CSS-first portfolio. No generated baseline. */
export const sourceGlobs = ["src/**/*.{ts,tsx,astro,mdx}"];
export const cssGlobs = ["src/**/*.css", "src/**/*.astro"];
export const iconOwner = "src/components/ui/Icon.tsx";
export const uiModules = {
  "Icon.tsx": { contract: "portfolio/import-boundary", fixture: "runtime", reason: "Owns the sole Solid Rounded renderer and approved Reddit art." },
  "button.tsx": { contract: "shadcn/no-restyle", fixture: "button", reason: "Variants/sizes own appearance; exact consumer classes are registered below." },
  "badge.tsx": { contract: "portfolio/token-contract", fixture: "css", reason: "CVA semantic variants own CSS. No caller restyle contract added in this bounded pass." },
  "chart.tsx": { contract: "portfolio/runtime-style", fixture: "runtime", reason: "Recharts data colors require exact generated-style/swatch exceptions." },
  "tooltip.tsx": { contract: "portfolio/token-contract", fixture: "css", reason: "Portal/positioner wrapper has intentional class forwarding. Consumer restyle enforcement is explicitly held." },
  "input.tsx": { contract: "shadcn/no-restyle", fixture: "ui-primitive", reason: "Base UI Input on ui.css tokens; callers style through Field layout, not className." },
  "textarea.tsx": { contract: "shadcn/no-restyle", fixture: "ui-primitive", reason: "Owns the only raw textarea; default and bare variants on ui.css tokens." },
  "field.tsx": { contract: "shadcn/no-restyle", fixture: "ui-primitive", reason: "Base UI Field label, control, description and error with shared ids." },
  "checkbox.tsx": { contract: "shadcn/no-restyle", fixture: "ui-primitive", reason: "Base UI Checkbox with the Solid Rounded check indicator." },
  "select.tsx": { contract: "shadcn/no-restyle", fixture: "ui-primitive", reason: "Base UI Select parts with a container-scoped portal for the modal workspace." },
  "dialog.tsx": { contract: "shadcn/no-restyle", fixture: "ui-primitive", reason: "Base UI Dialog parts with backdrop and a container-scoped portal." },
  "menu.tsx": { contract: "shadcn/no-restyle", fixture: "ui-primitive", reason: "Base UI Menu parts with 44px items and a container-scoped portal." },
  "popover.tsx": { contract: "shadcn/no-restyle", fixture: "ui-primitive", reason: "Base UI Popover parts with a container-scoped portal." },
  "preview-card.tsx": { contract: "shadcn/no-restyle", fixture: "ui-primitive", reason: "Base UI Preview Card for link previews opened by hover or focus." },
  "spinner.tsx": { contract: "shadcn/no-restyle", fixture: "ui-primitive", reason: "Loading glyph through the Icon wrapper; static under reduced motion." },
  "callout.tsx": { contract: "shadcn/no-restyle", fixture: "ui-primitive", reason: "Framed note for disclosures and errors with default and destructive variants." },
  "message.tsx": { contract: "shadcn/no-restyle", fixture: "ui-primitive", reason: "shadcn Message row, group, header, footer and the headless scroller's latest button." },
  "bubble.tsx": { contract: "shadcn/no-restyle", fixture: "ui-primitive", reason: "shadcn Bubble with default, secondary, ghost and destructive variants." },
  "marker.tsx": { contract: "shadcn/no-restyle", fixture: "ui-primitive", reason: "shadcn Marker for inline status, notes and separators." },
  "chain-of-thought.tsx": { contract: "portfolio/token-contract", fixture: "ui-primitive", reason: "AI Elements Chain of Thought on Base UI Collapsible: caller-owned open state, a toggling header and steps that fold with Motion. The agent supplies its rail classes." },
  "stream-text.tsx": { contract: "portfolio/token-contract", fixture: "ui-primitive", reason: "Beautiful UI StreamText: live text types in from its reached edge with a blurred tail and caret; static under reduced motion. Callers may tint the caret through a scoped class." },
  "reveal-text.tsx": { contract: "portfolio/token-contract", fixture: "ui-primitive", reason: "Beautiful UI StreamingText for whole text: words resolve out of a soft blur on a CSS stagger, only inside a caller's live scope; full text in the DOM from the first frame." },
  "rolling-number.tsx": { contract: "portfolio/token-contract", fixture: "ui-primitive", reason: "Beautiful UI RollingDigits on Motion: changed digits roll up or down in clipped slots; assistive tech reads the plain value; reduced motion swaps at once." },
  "questionnaire.tsx": { contract: "shadcn/no-restyle", fixture: "ui-primitive", reason: "shadcn Questionnaire: one structured question at a time with progress, letter shortcuts and navigation." },
  "suggestion.tsx": { contract: "shadcn/no-restyle", fixture: "ui-primitive", reason: "Wrapping question chips emit their text without starting a model call." },
  "radio-group.tsx": { contract: "shadcn/no-restyle", fixture: "ui-primitive", reason: "Base UI RadioGroup with labeled card options for a one-of-few choice." },
  "attachment.tsx": { contract: "shadcn/no-restyle", fixture: "ui-primitive", reason: "shadcn chat Attachment with real upload state, remove action, group and the drop zone that owns the only native file input." },
  "collapsible.tsx": { contract: "portfolio/token-contract", fixture: "ui-primitive", reason: "Base UI Collapsible parts; callers own the trigger, panel and height transition classes." },
  "disclosure.tsx": { contract: "shadcn/no-restyle", fixture: "ui-primitive", reason: "Native details/summary that keeps long disclosure copy verbatim behind one click." },
  "kbd.tsx": { contract: "shadcn/no-restyle", fixture: "ui-primitive", reason: "shadcn Kbd: one key shown inside a tooltip shortcut hint." },
  "skeleton.tsx": { contract: "shadcn/no-restyle", fixture: "ui-primitive", reason: "shadcn Skeleton bar for loading rows; decorative and static under reduced motion." },
  "toast.tsx": { contract: "shadcn/no-restyle", fixture: "ui-primitive", reason: "Base UI Toast viewport and root for quiet action confirmations from one shared manager." },
  "meter.tsx": { contract: "shadcn/no-restyle", fixture: "ui-primitive", reason: "Base UI Meter drawn as a small ring or a thin bar for remaining allowance; the caller names it." },
  "toolbar.tsx": { contract: "shadcn/no-restyle", fixture: "ui-primitive", reason: "Base UI Toolbar: one tab stop with arrow-key focus between its buttons and separators; the caller names it." },
  "item.tsx": { contract: "shadcn/no-restyle", fixture: "ui-primitive", reason: "shadcn Item (Base UI render): one row of media, title, description and actions; ItemGroup lists rows." },
  "empty.tsx": { contract: "shadcn/no-restyle", fixture: "ui-primitive", reason: "shadcn Empty: media, title, description and an action for an empty or waiting state." },
  "input-group.tsx": { contract: "shadcn/no-restyle", fixture: "ui-primitive", reason: "shadcn InputGroup: a visible well around one bare input or textarea with a quiet addon such as a counter." },
};
export const agentModules = {
  "OakOcrReview.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "Server-issued OCR scope, separate cost bounds and explicit per-operation consent reuse the document reading area, Field, Base UI Checkbox and Button controls." },
  "OakDocumentsPanel.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "Private normalized preview and explicit real section selection use the existing reading area, Field, Base UI Checkbox and Button controls." },
  "OakDocumentPicker.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "R12: a prepared document's file card, part picker with Select all and Clear, and the reading-room meter use existing Attachment, Base UI Checkbox, Meter and Button controls." },
  "OakDocumentAnswer.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "Exact selected visitor quotations use existing answer typography with private section labels and visible reading coverage." },
  "OakActivitySprite.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "Caller-owned per-state Oak sprite sheets (one authored Oak per state) use a small server image projection with a static reduced-motion frame, without inferred progress or new controls." },
  "OakActivitySprite.css": { contract: "portfolio/token-contract", fixture: "workspace", reason: "Isolated per-state sheet cropping and frame stepping use fixed cue sizes and a static reduced-motion frame for each state." },
  "OakWorkspace.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "Owns one Base UI modal and centered public launcher, independent of mascot mounting." },
  "OakContactMenu.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "Contact popover remains inside the modal and independent of model/funding." },
  "OakContactCard.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "Ticket 49: the Contact card the prepareBrief Proposal draws through the island, and its modal focus state." },
  "OakSelectionActions.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "D95: words selected in an answer get Ask about this and Copy in a small bar under the selection, on ui/button and Motion." },
  "OakQuoteChip.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "D123: one staged quote from an answer as a 32px chip with a labelled remove button and a full-text tooltip, on ui/button, ui/tooltip and Motion." },
  "OakTaskMenu.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "One Base UI menu discloses secondary tasks with scoped 44px items and returns focus without replacing the composer." },
  "OakAccountMenu.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "R11: one Base UI header menu holds identity, saved chats, answers and model, privacy and sign-in or sign-out, with 44px rows and focus returned to its trigger." },
  "OakAccountAvatar.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "R12: one decorative pill avatar (provider photo, tinted initials on error or none, neutral person for a guest) shared by the header trigger, account menu and greeting; always inside a labelled control." },
  "OakTip.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "D126: one inline, one-time tip (TipKit rules) with a tinted tile, title, text, optional actions and a tooltipped dismiss, on ui/button, ui/tooltip and Motion." },
  "OakPausedBanner.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "Ticket 48: one status banner above the starters while the allowance is spent, built from the stopped card's own classes and words; shown only behind its constant." },
  "OakAnswerOrnament.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "Ticket 58: one frosted capsule (Copy, Open page, Ask a follow-up) on the answer in focus, and the receded layer helper for the Sources sheet; shown only behind its constant." },
  "OakShowMeAs.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "Ticket 19: a settled arranged answer reordered for the visitor purpose, with a quiet capsule and Undo or a three-audience switch built on the radio-group wrapper; shown only behind its constant." },
  "OakTurnstile.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "P03-G1: hosts Cloudflare's managed Turnstile widget (dark theme) above the composer for a guest's first send; no own visuals beyond one container class." },
  "OakConversation.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "Renders validated application-owned output and explicit submission." },
  "OakComposer.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "One prompt bar owns explicit submission, Stop, document chips and answer suggestions." },
  "OakTranscript.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "Renders the validated transcript, kept position and polite output announcements." },
  "OakTurn.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "One transcript turn: visible reasoning, validated answer arriving in order, actions and one stopped-turn treatment." },
  "OakChainOfThought.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "Oak's visible reasoning per turn: Worker phases and tool calls as timed steps on one rail, folding to a summary once the validated answer lands." },
  "OakStepPeek.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "Ticket 26: under a finished search or read step, a closed disclosure listing the passages it read (record section or web page with its fetch day)." },
  "OakWhatChanged.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "Ticket 56: after Edit or Ask again, the app's note above the new answer naming the blocks kept, dropped or added." },
  "OakWelcomePresence.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "Crossfades the welcome into the transcript on the first question and back on a new conversation." },
  "OakCitations.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "The one citations component: a favicon cell per distinct URL for Steve's pages and web sources, a stacked-favicon Sources pill, never numbered discs." },
  "OakSourceChip.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "D122: one capsule chip per answer point (short name and +N) whose ui/popover lists that point's sources with a Portfolio or Web label." },
  "OakSourcesPanel.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "D122: every cited source of one answer in a ui/dialog sheet inside the workspace, numbered like Copy with sources." },
  "OakEmptyState.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "First-run Oak sprite and starter prompts before any message." },
  "OakWorkflowPanels.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "Question, advice, voice, funding and conversation panels, each one WorkflowPanel." },
  "WorkflowPanel.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "One panel frame: sprite, title that takes focus on open, and one return action." },
  "OakAccountContinuation.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "T13 keeps explicit sign-in and purpose intake separate from chat submission and saved history." },
  "OakSavedConversations.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "T14 keeps explicit Save and owned history reads in the canonical workspace, separate from generation." },
  "OakSavedLifecycleControls.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "T15 exposes owned export and confirmed versioned deletion inside Save and history with existing field and Button primitives." },
  "OakFundingControl.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "T16 keeps explicit session funding and masked ordinary-key entry behind Tools using the existing field and Button primitives." },
  "OakGrantRedeem.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "P09-G1: one folded grant-code field in the funding sheet, reusing the funding key row, Field, Input and Button without new tokens or layout." },
  "OakOpenUIAnswer.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "Q17: lays a validated sourced answer out with OpenUI over its own claims, and falls back to the plain answer on any parse, coverage or render failure." },
  "OakWorkAnswer.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "T10 binds each validated public claim to its adjacent trusted source links." },
  "OakRecordOnlyBlocks.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "46a: builds a record-only plan's layout from the cited records' facts by app rules, drawn by OakOpenUIAnswer with no layout call." },
  "OakRoleFitReview.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "T11 distinguishes visitor requirements from validated evidence, gaps and questions." },
  "OakAdviceAnswer.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "T12 separates conditional visitor suggestions from cited public facts and explicit contact choice." },
  "OakRelated.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "v3 review: the newest answer's follow-ups as full-width Related rows under it (Perplexity), on ui/suggestion; a row asks its question or fills the box while a turn runs." },
  "OakNextStep.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "D128: at most one full-width card after an answer that opens the matching tool, prefilled with the visitor's own question, and never sends." },
  "OakContactBriefEditor.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "T12 owns visitor-entered local brief fields, explicit source selection and copy/email draft controls." },
  "OakPublicResearch.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "T17 previews exact public query consent and renders external excerpts separately from portfolio evidence." },
  "OakVoiceCapture.tsx": { contract: "portfolio/token-contract", fixture: "workspace", reason: "T21 uses explicit bounded recording, transcription review and transfer into the unsent composer." },
  "useOakWorkspaceSize.ts": { contract: "portfolio/runtime-style", fixture: "workspace-size", reason: "Measures the visible viewport and returns the full-screen frame that fills it." },
  "useEscapeCollapse.ts": { contract: "portfolio/runtime-style", fixture: "workspace", reason: "PR gate 4: Escape collapses an open disclosure and returns focus to its trigger, so the chat stays open." },
};
export const buttonCallerClasses = [
  // D124: Answer ready takes the Latest arrow's place when an answer lands while the reader is elsewhere.
  "oak-conversation__latest", "oak-conversation__ready", "mobile-menu-button", "contact-trigger",
  "contact-trigger--mobile", "contact-trigger--footer",
  "contact-trigger--placeholder", "pill-link", "pill-link--light", "kusala-support-contact",
  "oak-saved__toggle",
];
// D116: a saved conversation is one ui/item row; these classes own its stretched tap target and skeleton in oakAgent.css.
export const itemCallerClasses = ["oak-saved__row", "oak-saved__row--skeleton"];
// Workspace overlays on the ui dialog/popover wrappers. These classes own docked placement and the
// workspace-specific popover sizes in oakAgent.css; the wrappers own focus, portals and motion.
export const overlayCallerClasses = [
  "oak-workspace", "oak-workspace__layer", "oak-workspace__backdrop",
  "oak-contact__popup", "oak-contact__title", "oak-contact__description",
  "oak-source-preview", "oak-usage-card",
  // D122: the source chip's trigger and popover, and the Sources sheet docked inside the workspace.
  "oak-source-chip__trigger", "oak-source-popover",
  "oak-sources-panel", "oak-sources-panel__backdrop", "oak-sources-panel__title",
  // Review v4: the answer row's More menu (copy with sources and the open-in links) and a saved row's red Delete item.
  "oak-turn__more-menu", "oak-turn__more-link", "oak-saved__menu-delete",
  // R19: the role-fit row's Collapsible (item, chevron trigger, height-animated panel).
  "oak-role-review__item", "oak-role-review__toggle", "oak-role-review__panel",
  // R21: an answer card's "n more" fold (the claims after its lead).
  "oak-openui-card__more", "oak-openui-card__more-trigger", "oak-openui-card__more-panel",
  // Ticket 32: a StackMap tool tile is a Collapsible (mark, name and count as the trigger, the pages that use it as the panel).
  "oak-stack-map__trigger", "oak-stack-map__panel",
  "oak-page-card__head", "oak-page-card__panel",
  // PR 1b: the next-step card's "Other ways to continue" Collapsible (behind oakRelatedDrawer).
  "oak-other-ways__trigger", "oak-other-ways__panel",
  // Ticket 49: the Contact card focus state (a modal Dialog) and its About Steve fold.
  "oak-contact-focus", "oak-contact-focus__portal", "oak-contact-focus__backdrop", "oak-contact-focus__title", "oak-contact-card__subline", "oak-contact-card__decline",
  "oak-contact-focus__about", "oak-contact-focus__about-trigger", "oak-contact-focus__about-panel",
];

export const protectedTokens = {
  "--bg": "#050505", "--panel": "#0c0c0c", "--panel-soft": "#111111", "--text": "#ffffff",
  "--muted": "rgba(255, 255, 255, 0.68)", "--quiet": "rgba(255, 255, 255, 0.48)",
  "--line": "rgba(255, 255, 255, 0.2)", "--line-soft": "rgba(255, 255, 255, 0.12)",
  "--button-dark": "rgba(255, 255, 255, 0.12)", "--container": "1376px", "--gutter": "32px",
  "--audience-dock-safe-area": "112px", "--motion-standard": "cubic-bezier(0.22, 1, 0.36, 1)",
  "--motion-quick": "160ms", "--motion-mode": "240ms", "--motion-page": "320ms",
  "--work-chart-blue-1": "#bcd5f8", "--work-chart-blue-2": "#5476c9", "--work-chart-peach": "#eeb198",
  "--work-chart-orange": "#c96e40", "--work-chart-green": "#9ad9b0", "--work-chart-amber": "#d8c2a7",
  "--work-chart-muted": "rgba(255, 255, 255, 0.52)",
  "--font-body": '"Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  "--font-heading": '"GT Walsheim Pro", var(--font-body)',
  "--font-machine": '"Menlo Web", Menlo, "SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", monospace',
};

// Existing responsive root overrides remain approved, with exact media/value pairs.
export const responsiveTokens = {
  "--gutter": { "(max-width: 1024px)": "24px", "(max-width: 640px)": "18px" },
  "--audience-dock-safe-area": { "(max-width: 1024px)": "124px", "(max-width: 640px)": "132px" },
  // R20 (HIG Increase Contrast; Exa Ultra brief rule 7): secondary text and hairlines step up when the visitor asks.
  "--muted": { "(prefers-contrast: more)": "rgba(255, 255, 255, 0.86)" },
  "--quiet": { "(prefers-contrast: more)": "rgba(255, 255, 255, 0.74)" },
  "--line": { "(prefers-contrast: more)": "rgba(255, 255, 255, 0.44)" },
  "--line-soft": { "(prefers-contrast: more)": "rgba(255, 255, 255, 0.32)" },
};

// Variables supplied by Base UI or the existing runtime style sites, not missing CSS definitions.
export const runtimeVariables = [
  "--active-tab-height", "--active-tab-left", "--active-tab-top", "--active-tab-width",
  "--collapsible-panel-height", "--route-exit-offset-y", "--work-chart-aspect", "--work-chart-min-width",
  "--work-grid-bg", "--work-image-max-width", "--work-video-aspect-ratio", "--dev-hero-bg",
  "--available-width", "--available-height",
  "--anchor-width", "--transform-origin",
  "--toast-swipe-movement-y", "--oak-sprite-image", "--oak-sprite-image-compact",
  "--ui-meter-fraction",
  "--oak-launcher-center", "--oak-launcher-bottom-offset", "--oak-launcher-max-width",
  // D71: RevealText's shared word clock, a point's pill and stack delays, and a found chip's place in line.
  // D95: where the selection bar attaches, under the selection's last line.
  "--oak-pick-x", "--oak-pick-y",
  // Review v6: where Full's opening reveal and glow start, the launcher's centre (or the bottom centre).
  "--oak-open-x", "--oak-open-y",
  "--ui-reveal-start", "--ui-reveal-step", "--ui-word", "--oak-pill-delay", "--oak-stack-delay", "--oak-openui-share", "--oak-openui-step-from", "--oak-reveal-base", "--oak-part",
  // R19: the role-fit ring's conic arcs, computed from the three counts.
  "--oak-role-arcs",
  // R20: an answer card picture's own width over height, so it is drawn whole.
  "--oak-art-ratio",
  // Ticket 31: a ProjectWall tile's one accent, the cover tint from its reviewed record (a checked hex, or unset).
  "--oak-wall-tint",
  // Ticket 57: a result Metric's glow and the Timeline lanes' month axis, bar spans and cover tints.
  "--oak-metric-tint", "--oak-lanes-months", "--oak-lanes-at", "--oak-lanes-from", "--oak-lanes-span", "--oak-lanes-cut", "--oak-lanes-tint",
  // Ticket 44: a Diagram stage, node or edge box from the dagre layout (unitless px).
  "--oak-diagram-x", "--oak-diagram-y", "--oak-diagram-w", "--oak-diagram-h",
  "--oc-actual", "--oc-held", "--oc-at",
];

/** Stylesheet that owns a registered selector: agent rules live in oakAgent.css, everything else in global.css. */
export const declarationStylesheet = (selector) => /\.oak-(?!mascot|browse-chrome)/.test(selector) ? "src/styles/oakAgent.css" : "src/styles/global.css";
export const tokenSheets = (file) => file.startsWith("src/styles/openui/") ? ["src/styles/oakAgent.css", "src/styles/openui/shared.css"]
  : file.startsWith("src/styles/agent/") ? ["src/styles/oakAgent.css"] : [];
export const componentDeclarations = {
  "html": { "min-width": "min(320px, 100%)" },
  ".oak-workspace-launcher": { left: "var(--oak-launcher-center, 50%)", bottom: "calc(var(--oak-launcher-bottom-offset, 0px) + var(--audience-dock-bottom))", transform: "translateX(-50%)", "max-width": "var(--oak-launcher-max-width, min(220px, calc(100vw - 32px)))" },
  ".oak-workspace": { overflow: "clip", "--muted": "#b1b1b1" },
  // Review v5: the see-through full window lifts quiet text a step so it still reads over the page behind (4.7:1 measured).
  // Layered glass at full screen: --panel clears and --panel-soft is a 4% white veil, so every surface derived from them
  // (well, raised, bubble, tints, cards, the composer) is a translucent layer stacked on the see-through window.
  ".oak-workspace[data-full-screen=\"true\"]": { "--quiet": "rgba(255, 255, 255, 0.6)", "--panel": "rgba(12, 12, 12, 0)", "--panel-soft": "rgba(255, 255, 255, 0.04)" },
  // R17 (Oak, review v14): a text control insets its glyph as far as a 44px icon button does (13px), so visible gaps match.
  ".oak-workspace__header-actions .ui-button": { "padding-inline": "calc(var(--space-xs) + var(--space-micro) + 1px)" },
  ".oak-workspace__header .ui-button--icon": { width: "44px", height: "44px" },
  ".oak-conversation": { display: "flex", "flex-direction": "column", flex: "1", "min-height": "0" },
  ".oak-workspace__reading": { display: "flex", "overflow-y": "auto" },
  ".oak-workspace__reading .oak-conversation": { "min-height": "96px" },
  ".oak-workspace__reading[data-panel-open=\"false\"] .oak-conversation[data-empty=\"true\"]": { "min-height": "0" },
  ".oak-workspace__reading[data-panel-open=\"true\"]": { display: "block" },
  ".oak-conversation__viewport": { flex: "1", "min-height": "0", "overflow-anchor": "none" },
  // D44: Latest floats over the transcript's bottom edge and fades out idle, still inert and out of the tab order.
  ".oak-conversation__latest": { position: "absolute", "min-height": "44px" },
  ".oak-conversation__latest[data-active=\"false\"]": { visibility: "hidden", "pointer-events": "none" },
  ".oak-conversation__content": { "min-height": "0" },
  ".oak-conversation[data-empty=\"true\"] .oak-conversation__content": { "min-height": "100%" },
  ".oak-task-menu__item": { "min-height": "44px" },
  ".oak-account-menu__item": { "min-height": "44px" },
  ".oak-workflow__heading .ui-button": { "padding-inline": "var(--space-xs)" },
  ".oak-workspace[data-short-viewport=\"true\"] .oak-composer__surface .ui-textarea": { height: "44px", "min-height": "44px", "max-height": "44px" },
  ".oak-workspace[data-short-viewport=\"true\"] .oak-composer__actions": { "margin-top": "0" },
  ".oak-workspace[data-inline-controls=\"true\"]": { "flex-direction": "row", "align-items": "flex-start", "border-radius": "var(--radius-md)", "padding-block": "var(--space-micro)" },
  ".oak-workspace[data-inline-controls=\"true\"] [data-oak-contact-trigger]": { width: "44px", height: "44px", padding: "0" },
  ".oak-workspace[data-inline-controls=\"true\"] .oak-workspace__body": { "min-width": "0", height: "48px" },
  ".oak-workspace[data-inline-controls=\"true\"] .oak-composer .oak-composer__surface": { "grid-template-columns": "minmax(44px, 1fr) auto", "align-items": "start" },
  ".oak-workspace[data-inline-controls=\"true\"] .oak-workspace__body:has(.oak-workspace__reading[data-panel-open=\"true\"], .oak-workspace__workflow, .oak-workspace__status, .oak-account-intake)": { "flex-direction": "row" },
  ".oak-workspace[data-inline-controls=\"true\"] .oak-workspace__body:has(.oak-workspace__reading[data-panel-open=\"true\"], .oak-workspace__workflow, .oak-workspace__status, .oak-account-intake) > .oak-composer": { "min-width": "min-content", "flex-shrink": "1" },
  ".oak-workspace[data-inline-controls=\"true\"] .oak-composer__field": { "min-width": "0" },
  ".oak-workspace[data-inline-controls=\"true\"] .oak-composer__surface > .oak-composer__field": { "line-height": "0" },
  ".oak-workspace[data-inline-controls=\"true\"] .oak-account-intake": { "max-height": "none", overflow: "visible" },
  ".oak-mascot[hidden]": { display: "none" },
  ".oak-mascot[data-paused=\"true\"] .oak-mascot__bubble::before": { "animation-play-state": "paused" },
  ".oak-mascot__bubble[data-transitioning=\"true\"]::before": { animation: "oak-mascot-scroll-sheen var(--motion-quick) ease-out" },
  ".ui-button--primary": { background: "#ffffff", color: "#050505" },
  ".ui-button--secondary": { background: "var(--button-dark)", color: "#ffffff" },
  ".ui-button--ghost": { background: "transparent", color: "#ffffff" },
  ".ui-button--sm": { "min-height": "44px", "padding-inline": "28px" },
  ".ui-button--md": { "min-height": "44px", "padding-inline": "30px" },
  ".ui-button--icon": { width: "40px", height: "40px", padding: "0" },
};

export const responsiveComponentDeclarations = {
  // R20: Increase Contrast lifts the workspace's own secondary text tone as well.
  "(prefers-contrast: more)": {
    ".oak-workspace": { "--muted": "rgba(255, 255, 255, 0.86)" },
    ".oak-workspace[data-full-screen=\"true\"]": { "--quiet": "rgba(255, 255, 255, 0.74)" },
  },
  "(hover: none) and (pointer: coarse)": {
    ".oak-workspace :is(.ui-input, .ui-textarea, .ui-questionnaire__input)": { "font-size": "var(--text-body-md)" },
  },
  "(max-width: 640px)": {
    ".oak-workspace-launcher .ui-button": { "padding-inline": "var(--space-sm)", "white-space": "normal", "line-height": "var(--leading-ui)" },
    ".oak-workspace__header [data-oak-contact-trigger]": { width: "44px", height: "44px", padding: "0" },
  },
};

// Chromatic colors retain exact authored contexts. Neutral surfaces are checked separately.
export const colorExceptions = [
  ["src/styles/global.css", [":root"], Object.entries(protectedTokens).filter(([name]) => name.startsWith("--work-chart-")).map(([, value]) => value)],
  ["src/styles/global.css", [":root"], ["#ef4444"]],
  ["src/styles/oakAgent.css", [".oak-workspace"], ["#b1b1b1"]],
  // The Oak palette, defined once on the workspace; every other workspace rule uses var() or color-mix() over these.
  ["src/styles/oakAgent.css", [".oak-workspace"], ["#4b6fff", "#8b5cf6", "#ec4899", "#f5b942", "#6fd394"]],
  // The launcher ring: hero aurora blue, violet and pink plus Oak's crown gold, scoped to the launcher only.
  ["src/styles/oakAgent.css", [".oak-workspace-launcher"], ["#4b6fff", "#8b5cf6", "#ec4899", "#f5b942"]],
  ["src/styles/global.css", [".contact-card"], ["rgba(7, 8, 13, 0.96)"]],
  ["src/styles/global.css", [".ui-badge--destructive"], ["#ef4444"]],
  ["src/styles/global.css", [".brand-icon-link", ".work-article-body a:not(.brand-icon-link)"], ["#94c8ff"]],
  ["src/styles/global.css", [".brand-icon-link:hover", ".work-article-body a:not(.brand-icon-link):hover"], ["#bfddff"]],
  ["src/styles/global.css", [".brand-icon-link:focus-visible", ".work-article-body a:not(.brand-icon-link):focus-visible"], ["rgba(148, 200, 255, 0.78)"]],
  ["src/styles/global.css", [".hero-stage"], ["#12347f"]],
  ["src/styles/global.css", [".work-preview-card__status"], ["rgba(10, 12, 18, 0.72)"]],
  ["src/styles/global.css", [".work-index-page", ".not-found-page"], ["rgba(75, 111, 255, 0.16)"]],
  ["src/styles/global.css", [".case-study-page"], ["rgba(75, 111, 255, 0.18)"]],
  ["src/styles/global.css", ['.case-metric span[data-status="verified"]', '.case-artifact-list small[data-status="verified"]'], ["rgba(113, 214, 162, 0.42)", "#a9e7c4"]],
  ["src/styles/global.css", ['.case-metric span[data-status="needs-oak"]', '.case-artifact-list small[data-status="needs-oak"]'], ["rgba(255, 211, 120, 0.42)", "#ffe1a3"]],
  ["src/styles/global.css", [".work-mdx-callout__icon"], ["rgba(132, 255, 184, 0.42)", "rgba(113, 240, 166, 0.16)", "#84ffb8"]],
  ["src/styles/global.css", [".work-mdx-callout__title", ".work-mdx-callout--proof .work-mdx-callout__title"], ["#84ffb8"]],
  ["src/styles/global.css", [".work-mdx-callout--warning"], ["rgba(255, 211, 120, 0.28)", "rgba(255, 211, 120, 0.06)"]],
  ["src/styles/global.css", [".work-mdx-callout--proof"], ["rgba(113, 214, 162, 0.28)", "rgba(113, 214, 162, 0.06)"]],
  ["src/styles/global.css", [".work-mdx-architecture header > span"], ["rgba(174, 207, 255, 0.82)"]],
  ["src/dev/hero-variants.astro", [".dev-hero-variant--custom-bg"], ["#12347f"]],
  ["src/dev/hero-variants.astro", [".dev-contact-placeholder"], ["#dceeff"]],
  ["src/layouts/KusalaDailyAppLayout.astro", [".kusala-page"], ["rgba(232, 177, 57, 0.12)"]],
  ["src/layouts/KusalaDailyAppLayout.astro", [".kusala-eyebrow", ".kusala-local-nav a[aria-current=\"page\"]", ".kusala-content :global(.kusala-status)"], ["#e8b139"]],
  ["src/layouts/KusalaDailyAppLayout.astro", [".kusala-local-nav a[aria-current=\"page\"]"], ["rgba(232, 177, 57, 0.36)"]],
  ["src/layouts/KusalaDailyAppLayout.astro", [".kusala-local-nav a:hover", ".kusala-local-nav a:focus-visible"], ["rgba(232, 177, 57, 0.7)"]],
  ["src/layouts/KusalaDailyAppLayout.astro", [".kusala-local-nav a[aria-current=\"page\"]:hover", ".kusala-local-nav a[aria-current=\"page\"]:focus-visible"], ["#f3ca70"]],
];

/** Exact file, class anchor, properties and expression grammar for established runtime styles. */
export const runtimeStyles = [
  { file: "src/components/agent/OakWorkspace.tsx", class: "oak-workspace-launcher", element: "div", expression: "launcherViewport?.style" },
  { file: "src/components/agent/OakWorkspace.tsx", class: "oak-workspace", element: "DialogContent", expression: "{ top: sizing.frame.top, left: sizing.frame.left, right: sizing.frame.right, width: sizing.size.width, height: sizing.size.height,\n              [\"--oak-open-x\" as string]: `${openOrigin.current?.x ?? sizing.size.width / 2}px`,\n              [\"--oak-open-y\" as string]: `${openOrigin.current?.y ?? sizing.size.height - 48}px` }" },
  { file: "src/components/ui/chart.tsx", class: "ui-chart-tooltip__indicator", element: "span", values: { backgroundColor: ["indicatorColor"], borderColor: ["indicatorColor"] } },
  { file: "src/components/ui/chart.tsx", class: "ui-chart-legend__swatch", element: "span", values: { backgroundColor: ["item.color ?? itemConfig?.color"] } },
  { file: "src/components/work/WorkChartGraphic.tsx", class: "ui-chart-tooltip__indicator", element: "span", values: { backgroundColor: ["indicatorColor"], borderColor: ["indicatorColor"] } },
  { file: "src/components/work/WorkChartGraphic.tsx", class: "work-chart-graphic__legend-swatch", element: "span", count: 2, values: { backgroundColor: ["item.color", "getSeriesColor(item, index)"] } },
  { file: "src/components/OakMascot.tsx", class: "oak-mascot__crown", element: "span", values: { "--oak-sprite-image": ["spriteImage"], "--oak-sprite-image-compact": ["spriteImageCompact"], backgroundPosition: ["backgroundPosition"], backgroundSize: ["backgroundSize"] } },
  { file: "src/components/OakMascot.tsx", class: "oak-mascot__sprite", element: "span", values: { "--oak-sprite-image": ["spriteImage"], "--oak-sprite-image-compact": ["spriteImageCompact"], backgroundPosition: ["backgroundPosition"], backgroundSize: ["backgroundSize"] } },
  { file: "src/components/ContactMorph.tsx", class: "contact-morph", element: "motion.div", values: { "--contact-card-viewport-offset": ["`${cardViewportOffset}px`"] } },
  { file: "src/components/ui/meter.tsx", class: "ui-meter-ring", element: "BaseMeter.Root", values: { "--ui-meter-fraction": ["fraction"] } },
  // D71: the answer's shared word clock and each found chip's place in line.
  { file: "src/components/ui/reveal-text.tsx", class: "ui-reveal-text", element: "span", values: { "--ui-reveal-start": ["startMs"], "--ui-reveal-step": ["stepMs"] } },
  { file: "src/components/ui/reveal-text.tsx", class: "ui-reveal-text__word", element: "span", values: { "--ui-word": ["word++"] } },
  { file: "src/components/agent/OakWorkAnswer.tsx", class: "oak-answer__point", element: "section", values: { "--oak-pill-delay": ["pillDelays[index]"] } },
  { file: "src/components/agent/OakRoleFitReview.tsx", class: "oak-role-review__ring", element: "span", values: { "--oak-role-arcs": ['stops.join(", ")'] } },
  { file: "src/components/agent/OakWorkAnswer.tsx", class: "oak-answer__sources", element: "div", values: { "--oak-stack-delay": ["delay"] } },
  // Q17: a Meter's filled share, only when its claim states that percentage.
  { file: "src/lib/openui/components/Meter.tsx", class: "oak-openui__meter-fill", element: "span", values: { "--oak-openui-share": ["share / 100"] } },
  { file: "src/lib/openui/components/Steps.tsx", class: "oak-openui__steps", element: "ol", values: { "--oak-openui-step-from": ["(from ?? 1) - 1"] } },
  // R20: an answer card picture (role artwork, project cover) at its own ratio.
  { file: "src/lib/openui/cards.tsx", class: "oak-openui-art", element: "span", values: { "--oak-art-ratio": ["ratio ?? OAK_ART_RATIO"] } },
  { file: "src/lib/openui/components/ProjectWallView.tsx", class: "oak-wall__tile", element: "li", values: { "--oak-wall-tint": ["tile.tint"] } },
  { file: "src/lib/openui/components/Metric.tsx", class: "oak-openui__metric", element: "div", expression: 'tint ? { "--oak-metric-tint": tint } as React.CSSProperties : undefined' },
  { file: "src/lib/openui/components/Timeline.tsx", class: "oak-lanes", element: "div", values: { "--oak-lanes-months": ["months.length"] } },
  { file: "src/lib/openui/components/Timeline.tsx", class: "oak-lanes__today", element: "span", values: { "--oak-lanes-at": ["at"] } },
  { file: "src/lib/openui/components/Timeline.tsx", class: "oak-lanes__lane", element: "li", expression: 'lane.tint ? { "--oak-lanes-tint": lane.tint } as React.CSSProperties : undefined' },
  { file: "src/lib/openui/components/Timeline.tsx", class: "oak-lanes__bar", element: "span", values: { "--oak-lanes-from": ["lane.from - first + 1"], "--oak-lanes-span": ["lane.to - lane.from + 1"], "--oak-lanes-cut": ["lane.open && lane.to === now ? 1 - day : undefined"] } },
  { file: "src/lib/openui/components/diagram/DiagramFigure.tsx", class: "oak-diagram__stage", element: "div", values: { "--oak-diagram-x": ["box.x"], "--oak-diagram-y": ["box.y"], "--oak-diagram-w": ["box.w"], "--oak-diagram-h": ["box.h"] } },
  { file: "src/lib/openui/components/diagram/DiagramFigure.tsx", class: "oak-diagram__node", element: "div", values: { "--oak-diagram-x": ["box.x"], "--oak-diagram-y": ["box.y"], "--oak-diagram-w": ["box.w"], "--oak-diagram-h": ["box.h"] } },
  { file: "src/lib/openui/components/diagram/DiagramFigure.tsx", class: "oak-diagram__edge", element: "span", values: { "--oak-diagram-x": ["box.x"], "--oak-diagram-y": ["box.y"], "--oak-diagram-w": ["box.w"], "--oak-diagram-h": ["box.h"] } },
  // D95: the selection bar attaches under the selection's last line.
  { file: "src/components/agent/OakSelectionActions.tsx", class: "oak-pick", element: "Toolbar", values: { "--oak-pick-x": ["`${picked.x}px`"], "--oak-pick-y": ["`${picked.y}px`"] } },
  { file: "src/components/owner/console/tabs/Usage.tsx", class: "oc-bar", element: "span", values: { "--oc-actual": ["row.actual"], "--oc-held": ["row.held"] } },
  { file: "src/components/owner/console/tabs/Usage.tsx", class: "oc-bars__pace", element: "li", values: { "--oc-at": ["data.pacePct"] } },
  { file: "src/components/ContactMorph.tsx", class: "contact-trigger__closed-fill", element: "motion.span", values: { backgroundColor: ["CLOSED_TRIGGER_FILL_BACKGROUND"] } },
  { file: "src/components/work/WorkImageCarousel.tsx", class: "work-image-carousel__phone", element: "div", values: { aspectRatio: ["image.aspectRatio"] } },
  { file: "src/components/work/ChartFigure.astro", class: "work-mdx-chart__viewport", element: "div", expression: "chartStyle || undefined" },
  { file: "src/components/work/ImageFigure.astro", class: "work-mdx-image", element: "figure", expression: "figureStyle" },
  { file: "src/components/work/VideoFigure.astro", class: "work-mdx-video", element: "figure", expression: "mediaAspectRatio ? `--work-video-aspect-ratio: ${mediaAspectRatio};` : undefined" },
  { file: "src/components/work/ExcalidrawFigure.astro", class: "work-mdx-excalidraw__stage", element: "div", expression: "`aspect-ratio: ${aspectRatio};`" },
  { file: "src/dev/hero-variants.astro", class: "dev-hero-variant", element: "section", expression: 'variant.background ? `--dev-hero-bg: url("${variant.background}")` : undefined' },
];

export const runtimeDefinitions = {
  "src/components/agent/OakWorkspace.tsx": { launcherViewport: "useOakLauncherViewport()" },
  "src/components/agent/useOakWorkspaceSize.ts": { layoutWidth: "document.documentElement.getBoundingClientRect().width" },
  "src/components/ContactMorph.tsx": { CLOSED_TRIGGER_FILL_BACKGROUND: '"#ffffff"' },
  "src/components/OakMascot.tsx": {
    backgroundPosition: '`-${frame * spriteFrameWidth}px -${animation.row * spriteFrameHeight}px`',
    backgroundSize: '`${spriteFrameWidth * spriteColumns}px ${spriteFrameHeight * spriteRows}px`',
    spriteImage: "getMascotImageSet(spriteSrc)",
    spriteImageCompact: "getCompactMascotImageSet(spriteSrc)",
  },
  "src/components/work/ChartFigure.astro": { chartStyle: '[aspectRatio ? `--work-chart-aspect: ${aspectRatio};` : "", minWidthValue ? `--work-chart-min-width: ${minWidthValue};` : "",].filter(Boolean).join(" ")' },
  "src/components/work/ImageFigure.astro": { figureStyle: 'maxWidth ? `--work-image-max-width: ${maxWidth}px;` : undefined' },
};

export const chartStylesheetExpression = 'colorConfig.map(([key, itemConfig]) => `  --color-${key}: ${itemConfig.theme?.dark ?? itemConfig.color};`).join("\\n")';

/** Existing rest-prop forwarding sites. Names alone do not exempt arbitrary consumer spreads. */
export const forwardedProps = [
  ["src/components/ui/button.tsx", "Button", "BaseButton", "props"],
  ["src/components/ui/badge.tsx", "Badge", "span", "props"],
  ["src/components/ui/chart.tsx", "ChartContainer", "div", "props"],
  ["src/components/ui/chart.tsx", "ChartLegendContent", "div", "props"],
  ["src/components/ui/tooltip.tsx", "TooltipContent", "BaseTooltip.Popup", "props"],
  ...[
    ["input", "Input", "BaseInput"], ["textarea", "Textarea", "textarea"], ["checkbox", "Checkbox", "BaseCheckbox.Root"],
    ["field", "Field", "BaseField.Root"], ["field", "FieldLabel", "BaseField.Label"], ["field", "FieldDescription", "BaseField.Description"], ["field", "FieldError", "BaseField.Error"],
    ["select", "SelectTrigger", "BaseSelect.Trigger"], ["select", "SelectValue", "BaseSelect.Value"], ["select", "SelectContent", "BaseSelect.Popup"], ["select", "SelectItem", "BaseSelect.Item"],
    ["dialog", "DialogContent", "BaseDialog.Popup"], ["dialog", "DialogTitle", "BaseDialog.Title"], ["dialog", "DialogDescription", "BaseDialog.Description"], ["dialog", "DialogFooter", "div"],
    ["menu", "MenuContent", "BaseMenu.Popup"], ["menu", "MenuItem", "BaseMenu.Item"], ["menu", "MenuGroup", "BaseMenu.Group"], ["menu", "MenuGroupLabel", "BaseMenu.GroupLabel"], ["menu", "MenuSeparator", "BaseMenu.Separator"],
    ["popover", "PopoverContent", "BasePopover.Popup"], ["popover", "PopoverTitle", "BasePopover.Title"], ["popover", "PopoverDescription", "BasePopover.Description"], ["preview-card", "PreviewCardContent", "BasePreviewCard.Popup"],
    ["spinner", "Spinner", "span"], ["callout", "Callout", "div"], ["bubble", "Bubble", "div"], ["marker", "MarkerIcon", "span"], ["marker", "MarkerContent", "span"],
    ["suggestion", "Suggestions", "div"], ["suggestion", "Suggestion", "BaseButton"],
    ["radio-group", "RadioGroup", "BaseRadioGroup"], ["radio-group", "RadioCard", "BaseRadio.Root"], ["radio-group", "RadioSegment", "BaseRadio.Root"],
    ["attachment", "Attachment", "div"], ["attachment", "AttachmentMedia", "span"], ["attachment", "AttachmentContent", "div"], ["attachment", "AttachmentTitle", "p"],
    ["attachment", "AttachmentDescription", "p"], ["attachment", "AttachmentActions", "div"], ["attachment", "AttachmentAction", "Button"], ["attachment", "AttachmentGroup", "ul"],
    ["attachment", "AttachmentDropzone", "div"], ["disclosure", "Disclosure", "details"],
    ["collapsible", "Collapsible", "BaseCollapsible.Root"], ["collapsible", "CollapsibleTrigger", "BaseCollapsible.Trigger"], ["collapsible", "CollapsibleContent", "BaseCollapsible.Panel"],
    ["kbd", "Kbd", "kbd"], ["skeleton", "Skeleton", "span"], ["meter", "MeterRing", "BaseMeter.Root"], ["meter", "MeterBar", "BaseMeter.Root"],
    ["toolbar", "Toolbar", "BaseToolbar.Root"], ["toolbar", "ToolbarButton", "BaseToolbar.Button"], ["toolbar", "ToolbarSeparator", "BaseToolbar.Separator"],
    ["item", "ItemGroup", "div"], ["item", "ItemMedia", "div"], ["item", "ItemContent", "div"], ["item", "ItemTitle", "div"], ["item", "ItemDescription", "p"], ["item", "ItemActions", "div"],
    ["empty", "Empty", "div"], ["empty", "EmptyHeader", "div"], ["empty", "EmptyMedia", "div"], ["empty", "EmptyTitle", "div"], ["empty", "EmptyDescription", "div"], ["empty", "EmptyContent", "div"],
    ["input-group", "InputGroup", "div"], ["input-group", "InputGroupAddon", "div"],
    ["questionnaire", "Questionnaire", "Base.Root"], ["questionnaire", "QuestionnaireProgress", "Base.Progress"], ["questionnaire", "QuestionnaireItem", "Base.Item"], ["questionnaire", "QuestionnaireTitle", "Base.Title"], ["questionnaire", "QuestionnaireDescription", "Base.Description"], ["questionnaire", "QuestionnaireChoices", "Base.Choices"], ["questionnaire", "QuestionnaireChoice", "Base.Choice"], ["questionnaire", "QuestionnaireInput", "Base.Input"], ["questionnaire", "QuestionnaireError", "Base.Error"],
    ["tool", "Tool", "Collapsible.Root"], ["tool", "ToolHeader", "Collapsible.Trigger"], ["tool", "ToolContent", "Collapsible.Panel"], ["tool", "ToolSection", "div"],
    ["chain-of-thought", "ChainOfThought", "Collapsible.Root"], ["chain-of-thought", "ChainOfThoughtHeader", "Collapsible.Trigger"], ["chain-of-thought", "ChainOfThoughtContent", "Collapsible.Panel"],
    ["message", "Message", "div"], ["message", "MessageGroup", "div"], ["message", "MessageAvatar", "div"], ["message", "MessageContent", "div"], ["message", "MessageFooter", "div"],
  ].map(([file, owner, element]) => [`src/components/ui/${file}.tsx`, owner, element, "props"]),
  ["src/components/OptimizedPicture.astro", null, "img", "rest"],
];

export const rules = [
  { id: "portfolio/import-boundary", scope: "TS/TSX/Astro executable scripts and MDX imports", repair: "Use the Base UI wrappers and Solid Rounded Icon wrapper.", fixture: "imports" },
  { id: "shadcn/no-restyle", scope: "Button consumers in TSX/Astro/MDX", repair: "Use Button variants/sizes and the registered caller classes.", fixture: "button" },
  { id: "portfolio/runtime-style", scope: "TSX/Astro/MDX authored style attributes and JSX style elements", repair: "Use a semantic class or register a precise established runtime style.", fixture: "runtime" },
  { id: "portfolio/token-contract", scope: "CSS and static Astro styles", repair: "Use the approved token value/name; update policy and browser proof for an intentional design change.", fixture: "css" },
  { id: "portfolio/color-contract", scope: "CSS and static Astro styles", repair: "Use the approved neutral palette or a scoped chart/brand token.", fixture: "css" },
];
