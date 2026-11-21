/**
 * Reviewed map from a case study's artifact label to an image that page already shows, with the page's own alt text.
 * Only images already public on that record's page; an artifact with no entry draws no picture.
 */
export const oakArtifactImages: Readonly<Record<string, Readonly<Record<string, Readonly<{ src: string; alt: string; preserveAnimation?: true }>>>>> = {
  "agentic-brain": {
    "Memory cover": { src: "/assets/work/agentic-brain/agentic-brain-cover.png", alt: "Agentic Brain cover art for reliable AI memory systems" },
    "Legacy memory and hallucination case study": {
      src: "/assets/work/agentic-brain/agentic-brain-legacy-memory-hallucination-cover.png", alt: "Legacy AI memory and hallucination case study cover" },
  },
  ecosmartloop: {
    "Orbi guidance UI": { src: "/assets/work/ecosmartloop/orbi-guidance-actions-combined.avif",
      alt: "Orbi AI assistant screens showing cited guidance, sources, related prompts, and product-aware tool actions" },
    "Behavior-loop media": { src: "/assets/work/ecosmartloop/rewards-behavior-loop.webp", alt: "EcoSmartLoop rewards behavior loop shown across app cards and dashboard" },
    "Organization analytics": { src: "/assets/work/ecosmartloop/organization-analytics.webp", alt: "EcoSmartLoop organization analytics dashboard" },
    "Capstone poster and flyer": { src: "/assets/work/ecosmartloop/capstone-poster-board.webp",
      alt: "EcoSmartLoop capstone poster showing vision, intelligence, growth loop, and architecture" },
    "Team-origin grid": { src: "/assets/work/ecosmartloop/team-capstone-origin.webp",
      alt: "EcoSmartLoop teammates at an SFBU Startup Grind event with public role labels for Glenn, Frank, and Oak" },
    "B2B direction context": { src: "/assets/work/ecosmartloop/b2b-career-fair-context.webp",
      alt: "LinkedIn building and rooftop context from the career-fair moment that shaped EcoSmartLoop's B2B direction" },
    "Challenge-resolution animation": { src: "/assets/work/ecosmartloop/challenge-resolution-loop.webp",
      alt: "Animated EcoSmartLoop challenge-resolution visual showing a celebration moment", preserveAnimation: true },
    "Tech stack visual": { src: "/assets/work/ecosmartloop/tech-stack-visual.avif",
      alt: "EcoSmartLoop tech stack visual showing the frontend, backend, database, AI, infrastructure, mobile, authentication, and payment tools used in the capstone" },
  },
  "linkedin-growth-loop": {
    "AI Agent Reality image": { src: "/assets/work/linkedin-growth-loop/ai-agent-reality.png",
      alt: "AI agent reality diagram showing why one-off task completion is not enough without state, recovery, evaluation, and next-step ownership" },
    "LinkedIn Networking image": { src: "/assets/work/linkedin-growth-loop/linkedin-networking.png",
      alt: "LinkedIn networking workflow scene showing professional relationship building as a repeatable agent-supported workflow" },
    "Telegram control room": { src: "/assets/work/linkedin-growth-loop/telegram-report-1.png", alt: "Telegram agent report glance showing the control room report surface" },
    "Browser-control calibration": { src: "/assets/work/linkedin-growth-loop/browser-control.png",
      alt: "Browser control workflow visual showing programmatic browser steps, checks, recovery, and selective model judgment" },
    "OpenClaw vs Hermes visual": { src: "/assets/work/linkedin-growth-loop/openclaw-vs-hermes.png",
      alt: "OpenClaw and Hermes comparison visual showing orchestrator and advisor responsibilities in the LinkedIn Growth Loop agent team" },
    "First-success animated WebP": { src: "/assets/work/linkedin-growth-loop/first-success-reaction.webp",
      alt: "Animated reaction GIF representing the moment the LinkedIn Growth Loop started working against real feedback", preserveAnimation: true },
    "Reviewer-shift animated WebP": { src: "/assets/work/linkedin-growth-loop/reviewer-shift-reaction.webp",
      alt: "Animated reaction GIF representing the shift from manually operating each run to reviewing an agent team", preserveAnimation: true },
    "Self-improvement report": { src: "/assets/work/linkedin-growth-loop/self-improving-report.png",
      alt: "Self-improving agent report showing a proposed improvement, evidence, risk, and next action" },
  },
  oakminder: {
    "Onboarding screenshot grid": { src: "/assets/work/oakminder/onboarding-grid/intro.png", alt: "Oakminder onboarding intro screen" },
    "Creative studio": { src: "/assets/work/oakminder/creative-studio/slideshow-editor.png",
      alt: "Oakminder distribution studio slideshow carousel editor with shortcuts, tools, and AI features." },
  },
  omnisocial: {
    "Content Creation cover": { src: "/assets/work/omnisocial/omnisocial-cover.png", alt: "OmniSocial cover showing Browser greater than API with social platform icons" },
  },
};
