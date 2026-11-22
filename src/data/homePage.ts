export const figmaSource = {
  fileKey: "PL4jnApYjXxfTYmNSGTvaD",
  nodeId: "1:106",
  url: "https://www.figma.com/design/PL4jnApYjXxfTYmNSGTvaD/Claude-Design-Convert?node-id=1-106",
};

export const media = {
  logo: "/assets/brand/steve-oak-logo.svg",
  oakProfile: "/assets/brand/oak-profile.png",
  welcomePortrait: "/assets/brand/welcome-v2.webp",
  conclusionBackground: "/assets/figma/conclusion-background.webp",
  sitePreview: "/assets/brand/steve-oak-open-graph.webp",
  openGraph: "/assets/brand/steve-oak-open-graph.png",
  agenticSystems: "/assets/figma/agentic-ai-systems.webp",
  agenticSystems2x: "/assets/figma/agentic-ai-systems@2x.webp",
  actionPanel: "/assets/figma/action-panel-edge-fill.webp",
  designSystem: "/assets/figma/design-system.webp",
  designSystem2x: "/assets/figma/design-system@2x.webp",
  cardTechnology: "/assets/cards/technology-habit.png",
  cardDesign: "/assets/cards/design-childhood.png",
  cardBayArea: "/assets/cards/bay-area-energy.png",
  listContentCreation: "/assets/list/content-creation.png",
  listMeditation: "/assets/list/meditation.png",
  listNetworking: "/assets/list/networking.png",
  listLifeTracking: "/assets/list/life-tracking.png",
  listIdeas: "/assets/list/seeking-ideas.png",
  listTechUpdates: "/assets/list/tech-updates.png",
  listAgentSystems: "/assets/list/agent-systems.png",
  listFounders: "/assets/list/listening-founders.png",
  listDesigningSoftware: "/assets/list/designing-software.png",
  listOpenSource: "/assets/list/open-source.png",
  workEcoSmartLoop: "/assets/work/ecosmartloop/ecosmartloop-cover.png",
  workOakminder: "/assets/work/oakminder-cover.png",
  workContextEngineering: "/assets/work/context-engineering-cover.png",
  workClientAiWorkflows: "/assets/work/client-ai-workflows-cover.png",
};

export const upcomingNavItems = [
  { label: "Posts", href: undefined, disabled: true, badge: "Soon" },
  { label: "Open-source", href: undefined, disabled: true, badge: "Soon" },
] as const;

export const navItems = [
  { label: "Work", href: "/work", disabled: false, badge: undefined },
  ...upcomingNavItems,
];

export const socialLinks = [
  { label: "X", href: "https://x.com/ForbiddenSteve", icon: "x" },
  { label: "YouTube", href: "https://www.youtube.com/@notforbiddensteve", icon: "youtube" },
  { label: "Instagram", href: "https://www.instagram.com/notforbiddensteve/", icon: "instagram" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/whoisoak/", icon: "linkedin" },
  { label: "Reddit", href: "https://www.reddit.com/user/Top_Structure_1805/", icon: "reddit" },
  { label: "Github", href: "https://github.com/Absorber97", icon: "github" },
] as const;

export const featureCards = [
  {
    icon: "technology",
    image: media.cardTechnology,
    imageAlt: "Technology habit artwork",
    title: "Technology as a habit",
    description:
      "Since the iPhone era, new technology has always pulled me in. The habit is simple: track what is changing, test fast, and turn the signal into something useful.",
    machineDescription:
      "Steve Oak has followed new technology since the iPhone era: tracking what changes, testing quickly, and turning useful signals into product work.",
  },
  {
    icon: "visualDesign",
    image: media.cardDesign,
    imageAlt: "Design childhood artwork",
    title: "Design since childhood",
    description:
      "Art, drawing, and visual systems came early, around age 3. Design is still where taste, structure, and emotion turn into a product people can feel.",
    machineDescription:
      "Steve Oak's design interest started early, and his work still treats taste, structure, and emotion as part of building products people can feel.",
  },
  {
    icon: "bayArea",
    image: media.cardBayArea,
    imageAlt: "Bay Area energy artwork",
    title: "Bay Area energy",
    description:
      "Being close to people building what comes next still feels special: product ambition, technical depth, and a rare mix of nature and technology in the same place.",
    machineDescription:
      "Steve Oak's Bay Area context connects the portfolio to product ambition, technical depth, and a mix of nature and technology in the same place.",
  },
] as const;

export const heroCopy = {
  title: "Hi, I'm Steve Oak",
  description:
    "Also call me Oak or Okkar Kyaw. I design and build useful AI products: workflows, eval loops, tool systems, and interfaces that make automated work easier to inspect and trust.",
} as const;

export const profileSummary = {
  heading: "About Steve Oak",
  description:
    "Steve Oak is Okkar Kyaw: a Bay Area AI/design engineer building applied AI systems, retrieval and tool workflows, evaluation loops, and product surfaces that make model behavior easier to inspect and trust.",
  facts: [
    {
      label: "Name",
      value: "Steve Oak / Okkar Kyaw",
      description:
        "Oak is the working name on SteveOak.com. Okkar Kyaw is the real name used where identity needs to be explicit.",
    },
    {
      label: "Based",
      value: "Bay Area",
      description:
        "The portfolio is aimed at Bay Area AI teams, founders, design/product leaders, and collaborators who care about useful systems.",
    },
    {
      label: "Focus",
      value: "Applied AI systems",
      description:
        "The work centers on agent workflows, retrieval, tools, memory, eval loops, cost/token optimization, feedback routing, and product surfaces for real use.",
    },
    {
      label: "Taste",
      value: "Design engineering",
      description:
        "The product layer matters: interfaces should show what the system is doing, what is uncertain, and why someone should trust the next step.",
    },
  ],
} as const;

export const machineProfile = {
  title: "Steve Oak / Okkar Kyaw",
  summary:
    "Bay Area AI/design engineer focused on applied agent workflows, RAG and tool systems, evaluation loops, cost/token optimization, memory, and product surfaces that make AI behavior inspectable.",
  sections: [
    {
      label: "Identity",
      value: "Steve Oak is the public working name. Okkar Kyaw is the legal/name-search identity.",
    },
    {
      label: "Location",
      value: "Bay Area, California. Relevant to AI teams, product/design leaders, founders, and technical collaborators.",
    },
    {
      label: "Work",
      value: "Applied AI systems, design engineering, agent orchestration, context engineering, retrieval, tools, memory, eval loops, and cost/token optimization.",
    },
    {
      label: "Proof",
      value: "Context engineering and client AI workflow pages are staged next. Live Work pages include EcoSmartLoop, LinkedIn Growth Loop, and Oakminder.",
    },
    {
      label: "Current availability",
      value: "The portfolio is public for review while final copy and proof are still being tightened.",
    },
  ],
  links: [
    { label: "llms.txt", href: "/llms.txt" },
    { label: "profile.json", href: "/profile.json" },
    { label: "public profile JSON", href: "/.well-known/agent-profile.json" },
    { label: "skill.md", href: "/skill.md" },
  ],
} as const;

export const proofSections = [
  {
    title: "Agentic applied AI systems",
    description:
      "Autonomy needs judgment. AI makes people faster when the workflow makes trust, checks, and next actions clear. I keep coming back to memory, tools, retrieval, evals, cost/token optimization, skills, and feedback routing because those pieces turn model output into usable work.",
    machineDescription:
      "Steve Oak focuses on memory, tools, retrieval, evals, cost/token optimization, skills, and feedback routing because those pieces turn model output into usable work.",
    image: media.agenticSystems2x,
    imageSrcSet: `${media.agenticSystems} 821w, ${media.agenticSystems2x} 1642w`,
    imageAlt: "Layered agentic AI workflow cards on a blue gradient background",
    imageFirst: false,
  },
  {
    title: "Design engineering for AI products",
    description:
      "Systems beat prompts, but taste is still part of the system. The interface is where teams see what the model is doing, where it is uncertain, and whether to trust it. I use design and UI/UX craft to make complex AI behavior clear, inspectable, and usable.",
    machineDescription:
      "Steve Oak uses design and UI/UX craft to make complex AI behavior clear, inspectable, and usable, with interfaces that show what the model is doing, where it is uncertain, and whether to trust it.",
    image: media.designSystem2x,
    imageSrcSet: `${media.designSystem} 821w, ${media.designSystem2x} 1642w`,
    imageAlt: "Agent harness meeting transcript interface on a blue gradient background",
    imageFirst: true,
  },
] as const;

export const platformCards = [
  {
    title: "EcoSmartLoop",
    category: "Computer vision, cited AI guidance, SB 1383 context",
    href: "/work/ecosmartloop",
    disabled: false,
    badge: undefined,
    image: media.workEcoSmartLoop,
    imageAlt: "EcoSmartLoop Orbi AI cover with waste-item examples and 8000 plus training context",
  },
  {
    title: "Oakminder",
    category: "iOS app, AI workflow, distribution system",
    href: "/work/oakminder",
    disabled: false,
    badge: "Product loop",
    image: media.workOakminder,
    imageAlt: "Wide abstract Oakminder voice AI artwork",
  },
] as const;

export const workspaceRows = [
  [
    { icon: "contentCreation", image: media.listContentCreation, label: "Content creation" },
    { icon: "meditation", image: media.listMeditation, label: "Meditation" },
  ],
  [
    { icon: "networking", image: media.listNetworking, label: "Networking" },
    { icon: "lifeTracking", image: media.listLifeTracking, label: "Life tracking" },
  ],
  [
    { icon: "ideas", image: media.listIdeas, label: "Seeking new ideas" },
    { icon: "rss", image: media.listTechUpdates, label: "Keeping up with tech updates" },
  ],
  [
    { icon: "agentSystems", image: media.listAgentSystems, label: "Building and managing agent systems" },
    { icon: "podcast", image: media.listFounders, label: "Listening to founders" },
  ],
  [
    { icon: "webDesign", image: media.listDesigningSoftware, label: "Designing with software, GenAI, agents" },
    { icon: "openSource", image: media.listOpenSource, label: "Exploring open-source projects" },
  ],
] as const;
