export type OakMascotAnimation =
  | "idle"
  | "pageLoad"
  | "sectionEnter"
  | "targetHover"
  | "homeHeroIntro"
  | "homeFeatureTechnology"
  | "homeFeatureDesign"
  | "homeFeatureBayArea"
  | "homeProofAgenticLobster"
  | "homeProofDesignWizard"
  | "homeWorkGymBro"
  | "homeWorkspacePlanning"
  | "homeContactPhone"
  | "oakminderSleepAlarm"
  | "oakminderAlarmCollapsed"
  | "ecosmartloopOrbiGuide"
  | "ecosmartloopOrbiCapCollapsed"
  | "clawLinkedinGrowthControl"
  | "clawLinkedinGrowthCollapsedClaw"
  | "contact"
  | "wave"
  | "attention"
  | "click"
  | "copySuccess"
  | "point"
  | "think"
  | "review"
  | "proofReview"
  | "happy"
  | "success"
  | "notFound"
  | "error"
  | "loading"
  | "waiting"
  | "navigateNext"
  | "navigateBack"
  | "move"
  | "sleep"
  | "crownCollapsed";

export type OakMascotTrigger = "page-load" | "section-enter" | "target-hover" | "event";

/** Every note is the visible character talking straight to the visitor, so a note carries no speaker label. */
export type OakMascotMessage =
  | string
  | {
      text: string;
      triggers?: readonly OakMascotTrigger[];
    };

export type OakMascotEntry = {
  id: string;
  messages: readonly OakMascotMessage[];
  animation?: OakMascotAnimation;
  cooldownMs?: number;
  priority?: number;
};

export type OakMascotSection = {
  id: string;
  label: string;
  page: "/" | "/work" | "/work/oakminder" | "/work/ecosmartloop" | "/work/linkedin-growth-loop" | "/404";
};

export type OakMascotSpriteFrame = {
  row: number;
  frames: number;
  fps: number;
  src?: string;
  frameWidth?: number;
  frameHeight?: number;
  columns?: number;
  rows?: number;
  role?: "common" | "section";
  contextId?: string;
  sourceState?: string;
};

export const oakMascotSprite = {
  src: "/assets/mascot/oak-web-spritesheet.webp",
  frameWidth: 192,
  frameHeight: 208,
  columns: 8,
  rows: 9,
  animations: {
    idle: { row: 0, frames: 6, fps: 5 },
    pageLoad: { row: 3, frames: 4, fps: 7, role: "common", sourceState: "waving" },
    sectionEnter: { row: 4, frames: 5, fps: 6, role: "common", sourceState: "jumping" },
    targetHover: { row: 4, frames: 5, fps: 6, role: "common", sourceState: "jumping" },
    homeHeroIntro: {
      src: "/assets/mascot/oak-home-hero-intro.webp",
      row: 0,
      frames: 8,
      fps: 7,
      frameWidth: 192,
      frameHeight: 208,
      columns: 8,
      rows: 1,
      role: "section",
      contextId: "home.hero",
      sourceState: "generated-intro-wave",
    },
    homeFeatureTechnology: {
      src: "/assets/mascot/oak-home-feature-technology.webp",
      row: 0,
      frames: 8,
      fps: 6,
      frameWidth: 192,
      frameHeight: 208,
      columns: 8,
      rows: 1,
      role: "section",
      contextId: "home.feature.technology",
      sourceState: "generated-technology-feature-row",
    },
    homeFeatureDesign: {
      src: "/assets/mascot/oak-home-feature-design.webp",
      row: 0,
      frames: 8,
      fps: 6,
      frameWidth: 192,
      frameHeight: 208,
      columns: 8,
      rows: 1,
      role: "section",
      contextId: "home.feature.design",
      sourceState: "generated-design-feature-row",
    },
    homeFeatureBayArea: {
      src: "/assets/mascot/oak-home-feature-bay-area.webp",
      row: 0,
      frames: 8,
      fps: 6,
      frameWidth: 192,
      frameHeight: 208,
      columns: 8,
      rows: 1,
      role: "section",
      contextId: "home.feature.bay-area",
      sourceState: "generated-bay-area-feature-row",
    },
    homeProofAgenticLobster: {
      src: "/assets/mascot/oak-home-proof-agentic-lobster.webp",
      row: 0,
      frames: 8,
      fps: 6,
      frameWidth: 192,
      frameHeight: 208,
      columns: 8,
      rows: 1,
      role: "section",
      contextId: "home.proof.agentic",
      sourceState: "generated-agentic-lobster-proof-row",
    },
    homeProofDesignWizard: {
      src: "/assets/mascot/oak-home-proof-design-wizard.webp",
      row: 0,
      frames: 8,
      fps: 6,
      frameWidth: 192,
      frameHeight: 208,
      columns: 8,
      rows: 1,
      role: "section",
      contextId: "home.proof.design",
      sourceState: "generated-design-wizard-proof-row",
    },
    homeWorkGymBro: {
      src: "/assets/mascot/oak-home-work-gym-bro-side-dumbbell-padded.webp",
      row: 0,
      frames: 8,
      fps: 6,
      frameWidth: 192,
      frameHeight: 208,
      columns: 8,
      rows: 1,
      role: "section",
      contextId: "home.work",
      sourceState: "generated-side-view-dumbbell-workout-row-padded",
    },
    homeWorkspacePlanning: {
      src: "/assets/mascot/oak-home-workspace-calendar-spreadsheet.webp",
      row: 0,
      frames: 8,
      fps: 6,
      frameWidth: 192,
      frameHeight: 208,
      columns: 8,
      rows: 1,
      role: "section",
      contextId: "home.workspace",
      sourceState: "candidate_salvage",
    },
    homeContactPhone: {
      src: "/assets/mascot/oak-home-contact-phone.webp",
      row: 0,
      frames: 8,
      fps: 6,
      frameWidth: 192,
      frameHeight: 208,
      columns: 8,
      rows: 1,
      role: "section",
      contextId: "home.contact",
      sourceState: "candidate_salvage",
    },
    oakminderSleepAlarm: {
      src: "/assets/mascot/oak-oakminder-clock-hold-v2.webp",
      row: 0,
      frames: 8,
      fps: 6,
      frameWidth: 192,
      frameHeight: 208,
      columns: 8,
      rows: 1,
      role: "section",
      contextId: "oakminder.hero",
      sourceState: "candidate_salvage",
    },
    oakminderAlarmCollapsed: {
      src: "/assets/mascot/oak-oakminder-alarm-collapsed.webp",
      row: 0,
      frames: 8,
      fps: 7,
      frameWidth: 192,
      frameHeight: 208,
      columns: 8,
      rows: 1,
      role: "section",
      contextId: "oakminder.hero",
      sourceState: "candidate_salvage",
    },
    ecosmartloopOrbiGuide: {
      src: "/assets/mascot/orbi-ecosmartloop-guide.webp",
      row: 0,
      frames: 8,
      fps: 6,
      frameWidth: 192,
      frameHeight: 208,
      columns: 8,
      rows: 1,
      role: "section",
      contextId: "ecosmartloop.hero",
      sourceState: "candidate_salvage",
    },
    ecosmartloopOrbiCapCollapsed: {
      src: "/assets/mascot/orbi-ecosmartloop-cap-rotation.webp",
      row: 0,
      frames: 8,
      fps: 7,
      frameWidth: 192,
      frameHeight: 208,
      columns: 8,
      rows: 1,
      role: "common",
      sourceState: "candidate-salvage-orbi-cap-rotation",
    },
    clawLinkedinGrowthControl: {
      src: "/assets/mascot/claw-linkedin-growth-control-room.webp",
      row: 0,
      frames: 8,
      fps: 6,
      frameWidth: 192,
      frameHeight: 208,
      columns: 8,
      rows: 1,
      role: "section",
      contextId: "linkedin-growth.hero",
      sourceState: "website_integrated",
    },
    clawLinkedinGrowthCollapsedClaw: {
      src: "/assets/mascot/claw-linkedin-growth-collapsed-claw.webp",
      row: 0,
      frames: 8,
      fps: 6,
      frameWidth: 192,
      frameHeight: 208,
      columns: 8,
      rows: 1,
      role: "section",
      contextId: "linkedin-growth.hero",
      sourceState: "candidate_salvage",
    },
    contact: { row: 3, frames: 4, fps: 7, role: "common", sourceState: "waving" },
    wave: { row: 3, frames: 4, fps: 7 },
    attention: { row: 4, frames: 5, fps: 6, role: "common", sourceState: "jumping" },
    click: { row: 4, frames: 5, fps: 7, role: "common", sourceState: "jumping" },
    copySuccess: { row: 4, frames: 5, fps: 7, role: "common", sourceState: "jumping" },
    point: { row: 4, frames: 5, fps: 6, role: "common", sourceState: "jumping" },
    think: { row: 8, frames: 6, fps: 5, role: "common", sourceState: "review" },
    review: { row: 8, frames: 6, fps: 5, role: "common", sourceState: "review" },
    proofReview: { row: 8, frames: 6, fps: 5, role: "common", sourceState: "review" },
    happy: { row: 4, frames: 5, fps: 7, role: "common", sourceState: "jumping" },
    success: { row: 4, frames: 5, fps: 7, role: "common", sourceState: "jumping" },
    notFound: { row: 5, frames: 8, fps: 5, role: "common", sourceState: "failed" },
    error: { row: 5, frames: 8, fps: 5, role: "common", sourceState: "failed" },
    loading: { row: 6, frames: 6, fps: 5, role: "common", sourceState: "waiting" },
    waiting: { row: 6, frames: 6, fps: 5, role: "common", sourceState: "waiting" },
    navigateNext: { row: 1, frames: 8, fps: 8, role: "common", sourceState: "running-right" },
    navigateBack: { row: 2, frames: 8, fps: 8, role: "common", sourceState: "running-left" },
    move: { row: 7, frames: 6, fps: 8, role: "common", sourceState: "running" },
    sleep: { row: 6, frames: 6, fps: 4, role: "common", sourceState: "waiting" },
    crownCollapsed: {
      src: "/assets/mascot/oak-crown-collapsed.webp",
      row: 0,
      frames: 8,
      fps: 7,
      frameWidth: 192,
      frameHeight: 208,
      columns: 8,
      rows: 1,
      role: "common",
      sourceState: "generated-crown-hover",
    },
  } satisfies Record<OakMascotAnimation, OakMascotSpriteFrame>,
} as const;

export const oakMascotBehaviorPatterns = {
  pageLoad: { animation: "pageLoad", use: "first Human-mode page note and general greeting" },
  sectionEnter: { animation: "sectionEnter", use: "new visible section, light attention, or scroll-triggered note" },
  targetHover: { animation: "targetHover", use: "hover or focus on important cards, links, and controls" },
  click: { animation: "click", use: "button/card click acknowledgement" },
  copySuccess: { animation: "copySuccess", use: "copy-to-clipboard success" },
  copyError: { animation: "error", use: "copy failure or blocked browser action" },
  loading: { animation: "loading", use: "waiting, delayed state, or patient fallback" },
  idle: { animation: "idle", use: "normal reading and quiet owner-presence" },
  contact: { animation: "contact", use: "contact areas, hello moments, and lightweight outreach prompts" },
  navigateNext: { animation: "navigateNext", use: "go read/open a page, forward route, or primary recovery link" },
  navigateBack: { animation: "navigateBack", use: "return home, back out, or reset path" },
  move: { animation: "move", use: "fast movement, route transition, or energetic browsing state" },
  review: { animation: "review", use: "thinking, staged proof, design judgment, or context explanation" },
  proofReview: { animation: "proofReview", use: "claims, metrics, evidence packets, and proof-sensitive sections" },
  success: { animation: "success", use: "completed action, readable case study, or positive confirmation" },
  notFound: { animation: "notFound", use: "404 and missing-path recovery" },
  error: { animation: "error", use: "generic error, failed interaction, or blocked action" },
  homeHeroIntro: { animation: "homeHeroIntro", use: "personalized Steve Oak hero introduction" },
  homeFeatureTechnology: { animation: "homeFeatureTechnology", use: "Technology as a habit card: focused laptop Oak" },
  homeFeatureDesign: { animation: "homeFeatureDesign", use: "Design since childhood card: painting and canvas Oak" },
  homeFeatureBayArea: { animation: "homeFeatureBayArea", use: "Bay Area energy card: picnic and nature Oak" },
  homeProofAgenticLobster: { animation: "homeProofAgenticLobster", use: "Agentic applied AI systems proof row: Oak with lobster claw gloves" },
  homeProofDesignWizard: { animation: "homeProofDesignWizard", use: "Design engineering proof row: Oak with wizard hat and wand" },
  homeWorkGymBro: { animation: "homeWorkGymBro", use: "Work section row: Oak working out with a dumbbell and flex pose" },
  homeWorkspacePlanning: {
    animation: "homeWorkspacePlanning",
    use: "Recurring interests row: Oak marking a calendar book and filling a spreadsheet",
  },
  homeContactPhone: {
    animation: "homeContactPhone",
    use: "Contact CTA and footer row: Oak holding an old-school red telephone",
  },
  oakminderSleepAlarm: {
    animation: "oakminderSleepAlarm",
    use: "Oakminder case study row: Oak holds and shakes a small twin-bell alarm clock",
  },
  oakminderAlarmCollapsed: {
    animation: "oakminderAlarmCollapsed",
    use: "collapsed Oakminder state: twin-bell alarm clock rotating above the Human/Machine toggle",
  },
  ecosmartloopOrbiGuide: {
    animation: "ecosmartloopOrbiGuide",
    use: "EcoSmartLoop case study row: Orbi explains sorting decisions",
  },
  ecosmartloopOrbiCapCollapsed: {
    animation: "ecosmartloopOrbiCapCollapsed",
    use: "collapsed EcoSmartLoop state: Orbi ranger cap rotating above the Human/Machine toggle",
  },
  clawLinkedinGrowthControl: {
    animation: "clawLinkedinGrowthControl",
    use: "LinkedIn Growth Loop route row: Claw monitors reports, handoffs, and guarded agent autonomy",
  },
  clawLinkedinGrowthCollapsedClaw: {
    animation: "clawLinkedinGrowthCollapsedClaw",
    use: "collapsed LinkedIn Growth Loop state: Claw's approval claw rotates above the Human/Machine toggle",
  },
  crownCollapsed: { animation: "crownCollapsed", use: "collapsed Human-mode Oak state above the mode toggle" },
} as const satisfies Record<string, { animation: OakMascotAnimation; use: string }>;

export const oakMascotDefaultContextId = "site.idle";

export const oakMascotSections = [
  { id: "home.hero", label: "Home hero", page: "/" },
  { id: "home.proof", label: "Home proof", page: "/" },
  { id: "home.work", label: "Home work cards", page: "/" },
  { id: "home.workspace", label: "Home recurring interests", page: "/" },
  { id: "home.contact", label: "Home contact", page: "/" },
  { id: "site.footer", label: "Site footer contact", page: "/" },
  { id: "work.hero", label: "Work hero", page: "/work" },
  { id: "work.live", label: "Readable work", page: "/work" },
  { id: "work.staged", label: "Staged work", page: "/work" },
  { id: "work.timeline", label: "Work timeline", page: "/work" },
  { id: "oakminder.hero", label: "Oakminder hero", page: "/work/oakminder" },
  { id: "oakminder.problem", label: "Oakminder reminder problem", page: "/work/oakminder" },
  { id: "oakminder.tap-to-voice", label: "Oakminder tap flow to voice", page: "/work/oakminder" },
  { id: "oakminder.notification-actions", label: "Oakminder notification actions", page: "/work/oakminder" },
  { id: "oakminder.architecture", label: "Oakminder architecture", page: "/work/oakminder" },
  { id: "oakminder.voice-agent", label: "Oakminder voice agent", page: "/work/oakminder" },
  { id: "oakminder.onboarding", label: "Oakminder onboarding trust", page: "/work/oakminder" },
  { id: "oakminder.docs", label: "Oakminder docs distribution", page: "/work/oakminder" },
  { id: "oakminder.distribution-start", label: "Oakminder distribution start", page: "/work/oakminder" },
  { id: "oakminder.distribution-studio", label: "Oakminder distribution studio", page: "/work/oakminder" },
  { id: "oakminder.mobile-bridge", label: "Oakminder mobile bridge", page: "/work/oakminder" },
  { id: "oakminder.visual-extraction", label: "Oakminder visual extraction", page: "/work/oakminder" },
  { id: "oakminder.creative-studio", label: "Oakminder creative studio", page: "/work/oakminder" },
  { id: "oakminder.ugc-drafts", label: "Oakminder UGC drafts", page: "/work/oakminder" },
  { id: "oakminder.publishing-feedback", label: "Oakminder publishing feedback", page: "/work/oakminder" },
  { id: "oakminder.learning", label: "Oakminder reusable learning", page: "/work/oakminder" },
  { id: "ecosmartloop.hero", label: "EcoSmartLoop hero", page: "/work/ecosmartloop" },
  { id: "ecosmartloop.problem", label: "EcoSmartLoop problem", page: "/work/ecosmartloop" },
  { id: "ecosmartloop.origin", label: "EcoSmartLoop origin", page: "/work/ecosmartloop" },
  { id: "ecosmartloop.stakes", label: "EcoSmartLoop stakes", page: "/work/ecosmartloop" },
  { id: "ecosmartloop.ownership", label: "EcoSmartLoop ownership", page: "/work/ecosmartloop" },
  { id: "ecosmartloop.ai-system", label: "EcoSmartLoop AI system", page: "/work/ecosmartloop" },
  { id: "ecosmartloop.behavior-loop", label: "EcoSmartLoop behavior loop", page: "/work/ecosmartloop" },
  { id: "ecosmartloop.tradeoffs", label: "EcoSmartLoop tradeoffs", page: "/work/ecosmartloop" },
  { id: "ecosmartloop.evidence", label: "EcoSmartLoop evidence", page: "/work/ecosmartloop" },
  { id: "ecosmartloop.learning", label: "EcoSmartLoop learning", page: "/work/ecosmartloop" },
  { id: "linkedin-growth.hero", label: "LinkedIn Growth Loop hero", page: "/work/linkedin-growth-loop" },
  { id: "linkedin-growth.in-house", label: "LinkedIn Growth Loop in-house need", page: "/work/linkedin-growth-loop" },
  { id: "linkedin-growth.first-success", label: "LinkedIn Growth Loop first success", page: "/work/linkedin-growth-loop" },
  { id: "linkedin-growth.first-loop", label: "LinkedIn Growth Loop first loop", page: "/work/linkedin-growth-loop" },
  { id: "linkedin-growth.operators", label: "LinkedIn Growth Loop operators and validators", page: "/work/linkedin-growth-loop" },
  { id: "linkedin-growth.harness", label: "LinkedIn Growth Loop harness choice", page: "/work/linkedin-growth-loop" },
  { id: "linkedin-growth.telegram", label: "LinkedIn Growth Loop Telegram report", page: "/work/linkedin-growth-loop" },
  { id: "linkedin-growth.architecture", label: "LinkedIn Growth Loop agent architecture", page: "/work/linkedin-growth-loop" },
  { id: "linkedin-growth.guardrails", label: "LinkedIn Growth Loop guardrails", page: "/work/linkedin-growth-loop" },
  { id: "linkedin-growth.browser-control", label: "LinkedIn Growth Loop browser control", page: "/work/linkedin-growth-loop" },
  { id: "linkedin-growth.evaluation", label: "LinkedIn Growth Loop evaluation", page: "/work/linkedin-growth-loop" },
  { id: "linkedin-growth.failure-loop", label: "LinkedIn Growth Loop failure loop", page: "/work/linkedin-growth-loop" },
  { id: "linkedin-growth.learning", label: "LinkedIn Growth Loop learning loop", page: "/work/linkedin-growth-loop" },
  { id: "linkedin-growth.enterprise", label: "LinkedIn Growth Loop enterprise pattern", page: "/work/linkedin-growth-loop" },
  { id: "linkedin-growth.evidence", label: "LinkedIn Growth Loop evidence", page: "/work/linkedin-growth-loop" },
  { id: "404.hero", label: "404 recovery", page: "/404" },
] as const satisfies readonly OakMascotSection[];

export type OakMascotSectionId = (typeof oakMascotSections)[number]["id"];

const homeWorkMessages = [
  "Work is the training log 🏋️ AI, agents, and design engineering getting sharper.",
  "Applied AI is the lane ⚙️ useful workflows over shiny demos.",
  "Agents need memory, tools, evals, and taste 🧠 that mix is my lane.",
  "Design engineering is the lift 🎨 messy AI into clear product surfaces.",
  "The full rep matters 💪 model behavior, interface trust, and the workflow around it.",
  "These projects are not trophies 📌 they show where my judgment came from.",
  "Want to work together? Say Hi and it comes straight to me 🤝",
  "Bring a rough AI idea, weird tool, or half-built workflow 🛠️ that is enough to start.",
  "I like AI that does useful work ✅ not just AI that sounds impressive.",
  "Direction is clear 🏆 now the proof keeps lifting.",
] as const satisfies readonly OakMascotMessage[];

export const oakMascotContexts = {
  "oak.character.note": {
    id: "oak.character.note",
    animation: "wave",
    messages: ["Hi, I’m Oak 👋 I’ll point you to the proof behind each project."],
  },
  // Interleaved between page notes when the Oak AI Agent launcher is on the page.
  "oak.agent-invite": {
    id: "oak.agent-invite",
    animation: "wave",
    messages: [
      "Curious about a project? Ask me in Oak AI Agent below 👇",
      "Want the story behind a project? Tap Oak AI Agent and I’ll walk you through it with sources 📎",
      "Hiring? Paste the role into Oak AI Agent and I’ll show you where my work fits 🧩",
      "Short on time? Ask me for the quick version of any project ⏱️",
      "Want to reach me? Open Oak AI Agent and we’ll draft the note together ✉️",
    ],
  },
  "oak.character.steve-quote": {
    id: "oak.character.steve-quote",
    animation: "proofReview",
    messages: ["EcoSmartLoop changed how I think about AI products."],
  },
  "site.load": {
    id: "site.load",
    animation: "pageLoad",
    cooldownMs: 60000,
    priority: 20,
    messages: [
      "Hi, I’m Oak. If you’re skimming, start with Work.",
      "Quick heads-up 👋 I’m still finishing this site, so proof comes first.",
      "I’ll keep this small. I’m here to point at what matters.",
    ],
  },
  "site.idle": {
    id: "site.idle",
    animation: "idle",
    cooldownMs: 45000,
    messages: [
      "I’ll stay out of the way unless something useful changes.",
      "My rule: no fake certainty, especially about my own work.",
    ],
  },
  "home.hero": {
    id: "home.hero",
    animation: "homeHeroIntro",
    cooldownMs: 18000,
    priority: 12,
    messages: [
      {
        text: "Hey, I’m Steve Oak 👋 but Oak is what people actually call me.",
        triggers: ["page-load"],
      },
      {
        text: "Glad you’re here 🌱 I’ll point out the good parts while you scroll.",
        triggers: ["page-load"],
      },
      {
        text: "Okkar Kyaw is my name from home 🌱 Steve Oak is the site version.",
        triggers: ["page-load"],
      },
      {
        text: "I love design 🎨 and my lane is agentic applied AI plus design engineering.",
        triggers: ["page-load"],
      },
      {
        text: "Let’s get to know each other 👋 me first, then the systems I build.",
        triggers: ["page-load"],
      },
      {
        text: "This is the hello part 🙂 who I am before the projects start.",
        triggers: ["section-enter"],
      },
      {
        text: "The short version: I build AI systems with design taste and real workflow use 🛠️",
        triggers: ["section-enter"],
      },
      {
        text: "Oak is the easy name here 🌱 Okkar Kyaw is the original one.",
        triggers: ["section-enter"],
      },
      {
        text: "Take your time 😄 I’ll keep you company while you look around.",
        triggers: ["section-enter"],
      },
      {
        text: "This is me saying hi 👋 before the page gets into proof, systems, and taste.",
        triggers: ["section-enter"],
      },
      {
        text: "That intro line is literal 🙂 I design the layer between raw AI and useful products.",
        triggers: ["target-hover"],
      },
      {
        text: "If you remember one thing: agentic applied AI + design engineering is my lane 🧠",
        triggers: ["target-hover"],
      },
      {
        text: "The design part is not decoration 🎨 it’s how the AI becomes understandable.",
        triggers: ["target-hover"],
      },
      {
        text: "Plain version: I like useful AI, clear interfaces, and fewer weird demos 🫡",
        triggers: ["target-hover"],
      },
      {
        text: "Say Hi comes straight to me 🙂 Work is where the receipts start.",
        triggers: ["target-hover"],
      },
    ],
  },
  "home.proof": {
    id: "home.proof",
    animation: "proofReview",
    cooldownMs: 22000,
    messages: [
      "This is the bet: systems need taste, evals, and trust layers.",
      "These are not random interests. They explain how I build.",
      "Proof matters here. Pretty without evidence gets weak fast.",
    ],
  },
  "home.feature.technology": {
    id: "home.feature.technology",
    animation: "homeFeatureTechnology",
    cooldownMs: 16000,
    messages: [
      "Technology has always pulled me in 📱 the iPhone era felt unreal, and AI feels like that again.",
      "This card is my habit: YouTube, podcasts, newsletters, X, LinkedIn, always checking the signal ⚡",
      "I get genuinely hyped by new tech 🤓 not every tool matters, but I love finding what becomes useful.",
      "The through-line is simple: keep up, test fast, and turn the hype into something people can use 🛠️",
      "AI feels like another big platform shift 🚀 I’m paying attention because this stuff changes how we build.",
    ],
  },
  "home.feature.design": {
    id: "home.feature.design",
    animation: "homeFeatureDesign",
    cooldownMs: 16000,
    messages: [
      "Design started early for me 🎨 Microsoft Paint, tiny Oak, Mickey Mouse at age 3 energy.",
      "I’ve been drawing and making visual stuff forever, then graphic design really clicked around 2009 ✍️",
      "UX found me around 2020, and it made design feel like behavior, not just pretty screens 🧠",
      "I love designing for AI agents, websites, apps, tools, all of it 🛠️ especially when the system feels clear.",
      "Design is how messy AI becomes understandable ✨ that’s why this part is not just decoration.",
    ],
  },
  "home.feature.bay-area": {
    id: "home.feature.bay-area",
    animation: "homeFeatureBayArea",
    cooldownMs: 16000,
    messages: [
      "Bay Area energy is weird in the best way 🌉 technology, nature, and founder spirit all mixed together.",
      "I like being around people who are building things 🚀 Silicon Valley makes ambition feel normal.",
      "The peaceful part matters too 🌿 green areas, mountains, water, bridges, space to think.",
      "This place keeps both sides alive for me: big technology dreams and calm nature resets 🌁",
      "Founder energy plus trees and mountains is a strong combo 😄 it keeps me inspired without frying my brain.",
    ],
  },
  "home.proof.agentic": {
    id: "home.proof.agentic",
    animation: "homeProofAgenticLobster",
    cooldownMs: 18000,
    messages: [
      "Autonomy needs judgment 🧠 the harness decides what to trust, check, and ship.",
      "Agents are the visible tip 🧊 memory, tools, evals, and routing are underneath.",
      "Chat made AI useful 💬 agents made it active, and orchestration is next.",
      "This is where model output becomes repeatable work 🔁 not just a clever answer.",
      "My lobster rule 🦞 route the task, check the output, then ship it.",
      "The agent is not the whole system 🧰 the harness is what makes it dependable.",
      "Retrieval, tools, skills, feedback loops 🛠️ that is where autonomy gets serious.",
      "AI gets faster when someone knows what deserves trust ✅ human or agent.",
      "The next layer feels Symphony-style 🎼 many agents, one clear conductor.",
      "Do not ship raw model output 🚢 ship the workflow that knows how to verify it.",
    ],
  },
  "home.proof.design": {
    id: "home.proof.design",
    animation: "homeProofDesignWizard",
    cooldownMs: 18000,
    messages: [
      "Prompts can draft UI 🪄 taste decides what ships.",
      "Systems beat prompts 🧱 the interface is where trust becomes visible.",
      "Bare-bones screens are easy now ⚡ polished UX still needs a workflow.",
      "I’m checking spacing, states, hierarchy, and trust 🧙",
      "Good AI UX shows what the model is doing 🔍 and where it is unsure.",
      "The wand helps ✨ but design judgment still does the work.",
      "A serious AI product needs craft around the output 🎨 not just the output.",
      "When everything is a few prompts away 🧠 taste becomes the product difference.",
      "Design systems turn rough AI output into usable product polish 📐",
      "High-fidelity UI is not magic 🪄 it is judgment, workflow, and taste.",
    ],
  },
  "home.work": {
    id: "home.work",
    animation: "homeWorkGymBro",
    cooldownMs: 18000,
    messages: homeWorkMessages,
  },
  "home.work.ecosmartloop": {
    id: "home.work.ecosmartloop",
    animation: "navigateNext",
    cooldownMs: 15000,
    priority: 16,
    messages: [
      "EcoSmartLoop is one of the live case studies.",
      "This one shows the AI layer plus the product judgment.",
      "Good first click if you want a clean applied-AI product story.",
    ],
  },
  "home.work.staged": {
    id: "home.work.staged",
    animation: "review",
    cooldownMs: 18000,
    messages: [
      "Soon means soon. I’m not turning weak proof into a loud card.",
      "These need evidence before they get the full story treatment.",
      "The label is doing real work: don’t over-claim yet.",
    ],
  },
  "home.workspace": {
    id: "home.workspace",
    animation: "homeWorkspacePlanning",
    cooldownMs: 18000,
    messages: [
      "Content creation starts the loop ✍️ notes become drafts, posts, scripts, and sharper product thinking.",
      "Meditation stays on the calendar 🧘 quieter attention makes better design calls later.",
      "Networking is part of the system 🤝 founder and builder conversations keep the signal fresh.",
      "Life tracking is my spreadsheet brain 📊 patterns show up faster when I actually write them down.",
      "New ideas usually begin messy 💡 I collect the rough ones before deciding what deserves reps.",
      "Tech updates are daily inputs ⚡ releases, tools, AI shifts, and platform changes all feed the map.",
      "Agent systems are the main lab 🛠️ memory, tools, routing, evals, and workflows all get checked off.",
      "Founder listening is underrated 🎧 how people describe pain often tells me what software should do.",
      "Designing with software, GenAI, and agents is the fun column 🎨 raw capability becomes usable shape.",
      "Open source keeps me honest 🌐 real code, real constraints, better ways to wire things together.",
    ],
  },
  "home.contact": {
    id: "home.contact",
    animation: "homeContactPhone",
    cooldownMs: 22000,
    messages: [
      "This is the real CTA ☎️ send context, not a pitch.",
      "Say Hi stays literal. Short note, clear ask.",
      "If there’s something to build, send the messy version 🛠️",
      "Contact works best when the ask is specific.",
      "Not a lead form. Just the human door 🙂",
    ],
  },
  "site.footer": {
    id: "site.footer",
    animation: "homeContactPhone",
    cooldownMs: 22000,
    messages: [
      "Last stop. Work on left, contact on right.",
      "Footer stays quiet. Say Hi stays easy 👋",
      "If you skimmed here first, contact still works.",
      "Short note beats polished pitch ✉️",
      "Work, context, message. That’s the path 🧭",
    ],
  },
  "work.hero": {
    id: "work.hero",
    animation: "homeWorkGymBro",
    cooldownMs: 18000,
    messages: homeWorkMessages,
  },
  "work.live": {
    id: "work.live",
    animation: "homeWorkGymBro",
    cooldownMs: 18000,
    messages: homeWorkMessages,
  },
  "work.staged": {
    id: "work.staged",
    animation: "homeWorkGymBro",
    cooldownMs: 22000,
    messages: homeWorkMessages,
  },
  "work.card.ecosmartloop": {
    id: "work.card.ecosmartloop",
    animation: "homeWorkGymBro",
    cooldownMs: 14000,
    priority: 16,
    messages: homeWorkMessages,
  },
  "work.index.ecosmartloop": {
    id: "work.index.ecosmartloop",
    animation: "homeWorkGymBro",
    cooldownMs: 14000,
    priority: 16,
    messages: homeWorkMessages,
  },
  "work.card.staged": {
    id: "work.card.staged",
    animation: "homeWorkGymBro",
    cooldownMs: 16000,
    messages: homeWorkMessages,
  },
  "oakminder.hero": {
    id: "oakminder.hero",
    animation: "oakminderSleepAlarm",
    cooldownMs: 18000,
    messages: [
      "The clock is the point ⏰ catch the moment before the task disappears.",
      "Oakminder is one app plus the studio that learned how to explain it.",
      "This case study follows the loop from reminder friction to distribution feedback 🔁",
      "Snooze is allowed. Losing the context is not.",
    ],
  },
  "oakminder.problem": {
    id: "oakminder.problem",
    animation: "oakminderSleepAlarm",
    cooldownMs: 20000,
    messages: [
      "Busy reminder moments are the product gap ⏰ not a settings screen.",
      "The job was fewer taps when attention is already thin.",
      "Capture is easy. Follow-through is where the reminder earns trust ✅",
    ],
  },
  "oakminder.tap-to-voice": {
    id: "oakminder.tap-to-voice",
    animation: "oakminderSleepAlarm",
    cooldownMs: 20000,
    messages: [
      "The tap flow proved the loop before voice made it faster 👆",
      "Voice became useful only after it could land real reminder actions.",
      "Natural language had to return to app state, not float as chat.",
    ],
  },
  "oakminder.notification-actions": {
    id: "oakminder.notification-actions",
    animation: "oakminderSleepAlarm",
    cooldownMs: 20000,
    messages: [
      "The notification action had to carry snooze, completion, and context 🔔",
      "Custom snooze is small UI with big follow-through pressure.",
      "Reminder control matters most when opening the app is too much 📲",
    ],
  },
  "oakminder.architecture": {
    id: "oakminder.architecture",
    animation: "oakminderSleepAlarm",
    cooldownMs: 20000,
    messages: [
      "The simple tap hides Convex, auth, billing, alarms, credits, and observability 🧱",
      "Architecture stayed useful because every surface kept the same reminder semantics.",
      "Real-time sync made the reminder feel owned across devices.",
    ],
  },
  "oakminder.voice-agent": {
    id: "oakminder.voice-agent",
    animation: "oakminderSleepAlarm",
    cooldownMs: 20000,
    messages: [
      "Voice turns intent into reminder and category actions 🎙️",
      "The agent is only useful when the result changes the agenda.",
      "Water Drops made AI usage visible instead of mysterious 💧",
    ],
  },
  "oakminder.onboarding": {
    id: "oakminder.onboarding",
    animation: "oakminderSleepAlarm",
    cooldownMs: 20000,
    messages: [
      "Onboarding had to explain value before asking for trust 🧭",
      "Permissions matter more when notifications are the product.",
      "The app had to earn the right to interrupt.",
    ],
  },
  "oakminder.docs": {
    id: "oakminder.docs",
    animation: "oakminderSleepAlarm",
    cooldownMs: 20000,
    messages: [
      "Docs became distribution because agents need product context too 📚",
      "llms.txt and MCP made the product easier to explain outside the app.",
      "AI-readable docs are part of the product surface now 🤖",
    ],
  },
  "oakminder.distribution-start": {
    id: "oakminder.distribution-start",
    animation: "oakminderSleepAlarm",
    cooldownMs: 20000,
    messages: [
      "Shipping the app created the next problem: explaining it clearly 🚀",
      "Distribution started when product taste needed market feedback.",
      "The App Store was a milestone, not the end of the loop.",
    ],
  },
  "oakminder.distribution-studio": {
    id: "oakminder.distribution-studio",
    animation: "oakminderSleepAlarm",
    cooldownMs: 20000,
    messages: [
      "The studio connects product context, research, drafts, publishing, and feedback 🧩",
      "This diagram replaced feature blocks with the full learning loop.",
      "Research only helps when it stays attached to the product angle 🎯",
    ],
  },
  "oakminder.mobile-bridge": {
    id: "oakminder.mobile-bridge",
    animation: "oakminderSleepAlarm",
    cooldownMs: 20000,
    messages: [
      "Phone discovery needed a bridge back to desktop production 📱",
      "A saved TikTok link becomes useful only when context travels with it.",
      "Mobile intake turns scrolling into structured source material.",
    ],
  },
  "oakminder.visual-extraction": {
    id: "oakminder.visual-extraction",
    animation: "oakminderSleepAlarm",
    cooldownMs: 20000,
    messages: [
      "The visual pattern is the signal: text, frames, rhythm, and layout 👀",
      "OCR and traces keep source details alive for drafts.",
      "The goal is grounded inspiration, not cloning a post 🧾",
    ],
  },
  "oakminder.creative-studio": {
    id: "oakminder.creative-studio",
    animation: "oakminderSleepAlarm",
    cooldownMs: 20000,
    messages: [
      "Creative work needed an editable surface, not a one-shot generation 🎬",
      "Slideshows, hooks, images, and video all need product memory.",
      "The draft should remember why it exists before it exports.",
    ],
  },
  "oakminder.ugc-drafts": {
    id: "oakminder.ugc-drafts",
    animation: "oakminderSleepAlarm",
    cooldownMs: 20000,
    messages: [
      "UGC briefs work better when creators get the product angle upfront 🤝",
      "GenAI drafts still need audience, source, hook, and CTA context.",
      "OpenClaw-style agents keep niche memory from starting over 🧠",
    ],
  },
  "oakminder.publishing-feedback": {
    id: "oakminder.publishing-feedback",
    animation: "oakminderSleepAlarm",
    cooldownMs: 20000,
    messages: [
      "Export is not the finish; feedback is the next input 📤",
      "Review, retry, handoff, and health checks keep the loop honest.",
      "Publishing matters because it teaches the next product story.",
    ],
  },
  "oakminder.learning": {
    id: "oakminder.learning",
    animation: "oakminderSleepAlarm",
    cooldownMs: 20000,
    messages: [
      "The reusable lesson is the pairing: product build plus distribution loop 🔁",
      "AI helped when it moved the work forward, not when it sounded clever.",
      "Next time, I would keep the app and the studio learning together 🌱",
    ],
  },
  "linkedin-growth.hero": {
    id: "linkedin-growth.hero",
    animation: "clawLinkedinGrowthControl",
    cooldownMs: 18000,
    messages: [
      "🦞 The first real win was the team carrying the loop.",
      "🧭 Autonomy started working when every agent had a job.",
      "Small loop, real reports, better next run 🔁",
      "I watch the handoff, not the hype 🧾",
    ],
  },
  "linkedin-growth.in-house": {
    id: "linkedin-growth.in-house",
    animation: "clawLinkedinGrowthControl",
    cooldownMs: 20000,
    messages: [
      "🤝 Relationship work needed memory, follow-up, and restraint.",
      "The work had to keep moving without turning noisy 🌊",
      "A useful agent team leaves a trail 🧾",
      "🧠 The goal was a team that could operate, not another tool to babysit.",
    ],
  },
  "linkedin-growth.first-success": {
    id: "linkedin-growth.first-success",
    animation: "clawLinkedinGrowthControl",
    cooldownMs: 20000,
    messages: [
      "✅ This was the first bounded loop that actually held.",
      "The win was simple: the system came back with the next move 🔁",
      "Routine work moved out of human hands and into the loop 🦞",
      "I like wins that can be checked 📊",
    ],
  },
  "linkedin-growth.first-loop": {
    id: "linkedin-growth.first-loop",
    animation: "clawLinkedinGrowthControl",
    cooldownMs: 20000,
    messages: [
      "📍 Daily rhythm made the failures visible.",
      "One list, one pass, one report, then the next improvement 🔁",
      "Small scope kept the learning fast 🧪",
      "The loop got stronger because it touched the real world 🌎",
    ],
  },
  "linkedin-growth.operators": {
    id: "linkedin-growth.operators",
    animation: "clawLinkedinGrowthControl",
    cooldownMs: 20000,
    messages: [
      "🧭 Workers moved the task. Validators kept it honest.",
      "The team worked because the jobs were separate 🧩",
      "One role acted. One role checked. One role improved ✅",
      "Nobody had to guess where the run broke 🛠️",
    ],
  },
  "linkedin-growth.harness": {
    id: "linkedin-growth.harness",
    animation: "clawLinkedinGrowthControl",
    cooldownMs: 20000,
    messages: [
      "🧰 The harness was a choice. The operating pattern was the lesson.",
      "OpenClaw moved the work. Hermes kept the learning fresh 🦞",
      "The useful part was cooperation between roles 🤝",
      "One tool did not need to own every job 🎯",
    ],
  },
  "linkedin-growth.telegram": {
    id: "linkedin-growth.telegram",
    animation: "clawLinkedinGrowthControl",
    cooldownMs: 20000,
    messages: [
      "🕹️ The report became the control room.",
      "Human summary first. Machine detail underneath 👀",
      "One report could brief a person or feed the next agent 📩",
      "Readable reports made autonomy easier to trust 🧠",
    ],
  },
  "linkedin-growth.architecture": {
    id: "linkedin-growth.architecture",
    animation: "clawLinkedinGrowthControl",
    cooldownMs: 20000,
    messages: [
      "🧩 A team needs owners for action, review, and memory.",
      "Separate jobs made the misses easier to route 🧭",
      "I like systems where each failure has a home 🦞",
    ],
  },
  "linkedin-growth.guardrails": {
    id: "linkedin-growth.guardrails",
    animation: "clawLinkedinGrowthControl",
    cooldownMs: 20000,
    messages: [
      "🛑 Limits made the autonomy usable.",
      "The loop could move, but only inside the lane ✅",
      "Approval stayed available when the work crossed a line 🔒",
    ],
  },
  "linkedin-growth.browser-control": {
    id: "linkedin-growth.browser-control",
    animation: "clawLinkedinGrowthControl",
    cooldownMs: 20000,
    messages: [
      "🌐 Browser control made the work real and messy.",
      "Known steps stayed cheap. Judgment stayed selective 💸",
      "The page kept changing, so recovery became part of the design 🛠️",
      "I trust systems that can replay the steps 🧾",
    ],
  },
  "linkedin-growth.evaluation": {
    id: "linkedin-growth.evaluation",
    animation: "clawLinkedinGrowthControl",
    cooldownMs: 20000,
    messages: [
      "📊 Evaluation turned runs into learning.",
      "Good runs became examples. Bad runs became fixes ✅",
      "The loop improved because outcomes stayed visible 🔁",
      "Private numbers stayed private, but the scorecard mattered 🔒",
    ],
  },
  "linkedin-growth.failure-loop": {
    id: "linkedin-growth.failure-loop",
    animation: "clawLinkedinGrowthControl",
    cooldownMs: 20000,
    messages: [
      "🛑 If the object was unclear, the claw stayed closed.",
      "The duplicate-risk failure made the rules sharper 🧯",
      "The fix was a stop condition before public action ✅",
      "A better system refuses when it cannot prove the target 🧾",
    ],
  },
  "linkedin-growth.learning": {
    id: "linkedin-growth.learning",
    animation: "clawLinkedinGrowthControl",
    cooldownMs: 20000,
    messages: [
      "The report was not the ending. It fed the next pass 🔁",
      "Research became input for the next run 🧠",
      "The team got better because its own history stayed usable 📚",
      "I only trust changes that can explain themselves ✅",
    ],
  },
  "linkedin-growth.enterprise": {
    id: "linkedin-growth.enterprise",
    animation: "clawLinkedinGrowthControl",
    cooldownMs: 20000,
    messages: [
      "🚀 This is the pattern worth building on.",
      "Agents became useful when they became accountable to the loop 🧭",
      "The work moved out of one head and into the team 🦞",
      "High autonomy needs reports, memory, validators, and brakes 🛡️",
    ],
  },
  "linkedin-growth.evidence": {
    id: "linkedin-growth.evidence",
    animation: "clawLinkedinGrowthControl",
    cooldownMs: 18000,
    priority: 15,
    messages: [
      "🔒 The public page shows the pattern. The raw proof stays redacted.",
      "Real feedback made the loop sharper than a demo 🌎",
      "I keep the receipts close and the private data private 🧾",
    ],
  },
  "ecosmartloop.hero": {
    id: "ecosmartloop.hero",
    animation: "ecosmartloopOrbiGuide",
    cooldownMs: 18000,
    messages: [
      "🌱 The whole case starts with one awkward bin-side guess.",
      "$640B is the backdrop. The product still starts at the bin.",
      "LEAF reads the item. I explain what to do next.",
      "📱 Scan first, then guidance, rewards, and organization feedback.",
    ],
  },
  "ecosmartloop.problem": {
    id: "ecosmartloop.problem",
    animation: "ecosmartloopOrbiGuide",
    cooldownMs: 22000,
    messages: [
      "♻️ Recycling, compost, landfill. The hard part is the pause.",
      "The answer has to arrive before the item hits the wrong bin.",
      "Confidence matters when the line behind you is moving.",
    ],
  },
  "ecosmartloop.origin": {
    id: "ecosmartloop.origin",
    animation: "ecosmartloopOrbiGuide",
    cooldownMs: 22000,
    messages: [
      "🧭 The capstone got sharper when waste sorting became the use case.",
      "The team split got clearer after the product started working.",
      "Institutions could report waste. The gap was before the mistake.",
    ],
  },
  "ecosmartloop.stakes": {
    id: "ecosmartloop.stakes",
    animation: "ecosmartloopOrbiGuide",
    cooldownMs: 22000,
    messages: [
      "📋 SB 1383 made this feel like a real California workflow.",
      "450K businesses is scale context, not a customer claim.",
      "Recordkeeping matters more when behavior changes before the report.",
    ],
  },
  "ecosmartloop.metrics": {
    id: "ecosmartloop.metrics",
    animation: "ecosmartloopOrbiGuide",
    cooldownMs: 16000,
    priority: 15,
    messages: [
      "🧾 8K+ images is the public classifier detail.",
      "Final model scores need their own evaluation packet.",
      "Bigger business claims wait for real pilots.",
    ],
  },
  "ecosmartloop.system": {
    id: "ecosmartloop.system",
    animation: "ecosmartloopOrbiGuide",
    cooldownMs: 20000,
    messages: [
      "🍃 LEAF handles the image read. I handle the next step.",
      "The model label needed a place to become useful.",
      "Sources, memory, and app actions made me feel product-aware.",
    ],
  },
  "ecosmartloop.ownership": {
    id: "ecosmartloop.ownership",
    animation: "ecosmartloopOrbiGuide",
    cooldownMs: 22000,
    messages: [
      "🧩 Oak built the app around the classifier, me included.",
      "Frank and Glenn pushed LEAF. Oak made the result usable.",
      "The product work was the scanner, me, rewards, analytics, and mobile.",
    ],
  },
  "ecosmartloop.ai-system": {
    id: "ecosmartloop.ai-system",
    animation: "ecosmartloopOrbiGuide",
    cooldownMs: 20000,
    messages: [
      "🍃 LEAF classified. I explained and acted.",
      "I used sources, app context, tool calls, and product actions.",
      "The point was not chat. The point was helping the next step happen.",
    ],
  },
  "ecosmartloop.behavior-loop": {
    id: "ecosmartloop.behavior-loop",
    animation: "ecosmartloopOrbiGuide",
    cooldownMs: 20000,
    messages: [
      "🎁 V2 added gift cards, leaderboards, quizzes, and history.",
      "The scan became a learning path, not a one-off answer.",
      "Better user behavior gives organizations cleaner signals later.",
    ],
  },
  "ecosmartloop.tradeoffs": {
    id: "ecosmartloop.tradeoffs",
    animation: "ecosmartloopOrbiGuide",
    cooldownMs: 20000,
    messages: [
      "📱 The product only made sense if it worked at the bin.",
      "Capacitor moved fast, then made device debugging very real.",
      "Claude Code helped more after the project had real context.",
      "Figma and Motion kept the app from feeling like same-looking AI slop.",
    ],
  },
  "ecosmartloop.evidence": {
    id: "ecosmartloop.evidence",
    animation: "ecosmartloopOrbiGuide",
    cooldownMs: 16000,
    priority: 15,
    messages: [
      "🧾 The prototype works; production proof still has to be earned.",
      "No adoption, savings, or accuracy flex without the packet.",
      "The startup version needs pilots, operations, and real institution proof.",
    ],
  },
  "ecosmartloop.learning": {
    id: "ecosmartloop.learning",
    animation: "ecosmartloopOrbiGuide",
    cooldownMs: 22000,
    messages: [
      "💡 This project changed how every AI product after it got built.",
      "Craftie and YouSoul came later, but the workflow started here.",
      "Context packets, logs, tools, and checks became the habit.",
    ],
  },
  "ecosmartloop.sources": {
    id: "ecosmartloop.sources",
    animation: "ecosmartloopOrbiGuide",
    cooldownMs: 22000,
    messages: [
      "📚 UNEP and CalRecycle explain why the problem is worth attention.",
      "Behavior-change sources helped shape the V2 reward story.",
      "Sources keep the big numbers separate from what the prototype proved.",
    ],
  },
  "contact.trigger": {
    id: "contact.trigger",
    animation: "homeContactPhone",
    cooldownMs: 16000,
    messages: [
      "Open it when the ask is real.",
      "One clear sentence is enough ✉️",
      "Don’t over-polish. Send the actual context.",
      "Email for context. LinkedIn for a thread 🔗",
      "Specific beats fancy here 🎯",
    ],
  },
  "contact.open": {
    id: "contact.open",
    animation: "homeContactPhone",
    cooldownMs: 12000,
    priority: 18,
    messages: [
      "Email or LinkedIn. Keep it direct ☎️",
      "Fastest reply path: real ask, short context ✉️",
      "I care more about the real thing than a perfect intro.",
    ],
  },
  "contact.copy.success": {
    id: "contact.copy.success",
    animation: "copySuccess",
    cooldownMs: 6000,
    priority: 30,
    messages: [
      "Copied. Send the simple version.",
      "Email is ready ✉️",
      "That worked. Keep it direct.",
    ],
  },
  "contact.copy.error": {
    id: "contact.copy.error",
    animation: "error",
    cooldownMs: 6000,
    priority: 30,
    messages: [
      "Copy got blocked. The email is still visible.",
      "Browser said no. Manual copy still works.",
      "That one failed, but the path is still clear.",
    ],
  },
  "contact.linkedin": {
    id: "contact.linkedin",
    animation: "homeContactPhone",
    cooldownMs: 12000,
    priority: 20,
    messages: [
      "LinkedIn is good for a light thread 🔗",
      "If it’s role-related, context helps more than polish 🎯",
      "Send the real reason. Easier to answer.",
    ],
  },
  "404.hero": {
    id: "404.hero",
    animation: "notFound",
    cooldownMs: 8000,
    priority: 30,
    messages: [
      "I’m crying a little, but Work and Home still work.",
      "Wrong path, clear exits. Work or Home from here.",
      "This page fell off the map. Use Work or Home.",
      "No mystery page here. Just two recovery routes.",
      "404 mood today. Let’s get you back somewhere useful.",
    ],
  },
  "404.work": {
    id: "404.work",
    animation: "notFound",
    cooldownMs: 10000,
    messages: [
      "Work is the useful recovery route.",
      "Open Work if you came here for proof.",
      "This path gets you back to the portfolio work shelf.",
      "Work is the cleanest next stop from a bad link.",
      "Not found, but the work index is one click away.",
    ],
  },
  "404.home": {
    id: "404.home",
    animation: "notFound",
    cooldownMs: 10000,
    messages: [
      "Home is the front door.",
      "Back Home resets the route.",
      "Use Home if the old link got weird.",
      "Home gets you out of this missing page.",
      "404 over here. Home is safe.",
    ],
  },
  "event.copy.success": {
    id: "event.copy.success",
    animation: "copySuccess",
    cooldownMs: 6000,
    priority: 30,
    messages: [
      "Copied.",
      "That worked.",
      "Good, that one landed.",
    ],
  },
  "event.error": {
    id: "event.error",
    animation: "error",
    cooldownMs: 6000,
    priority: 30,
    messages: [
      "That hit a snag. The page should still give you a manual path.",
      "Something blocked there. I’d rather show the fallback than hide it.",
      "Noted. Useful failure beats silent failure.",
    ],
  },
} as const satisfies Record<string, OakMascotEntry>;

export type OakMascotContextId = keyof typeof oakMascotContexts;

export function getOakMascotEntry(contextId: string | null | undefined): OakMascotEntry | undefined {
  if (!contextId) return undefined;
  return oakMascotContexts[contextId as OakMascotContextId];
}

export function isOakMascotContextId(contextId: string | null | undefined): contextId is OakMascotContextId {
  return getOakMascotEntry(contextId) !== undefined;
}

export const oakMascotContextIds = Object.keys(oakMascotContexts) as OakMascotContextId[];
