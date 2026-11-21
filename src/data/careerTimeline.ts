export type CareerTimelineId =
  | "oaklabs"
  | "hyperskalers"
  | "sanfranciscobayuniversity"
  | "uhttention"
  | "globaledtechorganization"
  | "pnppsolutions";

export type CareerTimelineContext =
  | {
      type: "employment";
      title: string;
      engagement: "self-employed" | "contract" | "part-time" | "full-time";
    }
  | {
      type: "education";
      title: string;
      status: "completed";
    };

export type CareerTimelineGroup = {
  label?: string;
  items: string[];
};

export type CareerTimelineItem = {
  id: CareerTimelineId;
  aliases: string[];
  label: string;
  date: string;
  place: string;
  contexts: [CareerTimelineContext, ...CareerTimelineContext[]];
  badges: [string, string, string];
  title: string;
  summary: string;
  media: {
    alt: string;
    width: number;
    height: number;
    avifSrcSet: string;
    webpSrcSet: string;
    fallbackSrc: string;
    sizes: string;
  };
  highlights: CareerTimelineGroup[];
  stack: CareerTimelineGroup[];
};

export function careerContextMetadata(context: CareerTimelineContext) {
  if (context.type === "education") return "Completed";

  return {
    "self-employed": "Self-employed",
    contract: "Contract",
    "part-time": "Part-time",
    "full-time": "Full-time",
  }[context.engagement];
}

export const careerTimelineIntro = {
  title: "Career timeline",
  subtitle:
    "Since 2018, my work has moved from enterprise software and design systems into applied AI, graduate computer science, and independent AI delivery.",
  machineSubtitle:
    "Since 2018, Steve Oak's work has moved from enterprise software and design systems into applied AI, graduate computer science, and independent AI delivery.",
};

const timelineMediaSizes =
  "(max-width: 760px) calc(100vw - 116px), (max-width: 1120px) calc(100vw - 220px), 812px";

export const careerTimelineItems: CareerTimelineItem[] = [
  {
    id: "oaklabs",
    aliases: ["career-oak-labs"],
    label: "2026",
    date: "May 2026 - Present",
    place: "Oak Labs",
    contexts: [{ type: "employment", title: "AI Solutions Engineer", engagement: "self-employed" }],
    badges: ["Client AI", "WebMCP", "Agent Systems"],
    title: "Client AI apps and integrations",
    summary:
      "Independent consulting for teams building AI into their websites, apps, and day-to-day workflows.",
    media: {
      alt: "Oak Labs career timeline artwork for independent client AI delivery and agent systems.",
      width: 2000,
      height: 1050,
      avifSrcSet:
        "/assets/generated/work/career-timeline/oak-labs-480.avif 480w, /assets/generated/work/career-timeline/oak-labs-900.avif 900w, /assets/generated/work/career-timeline/oak-labs-1200.avif 1200w, /assets/generated/work/career-timeline/oak-labs-1600.avif 1600w, /assets/generated/work/career-timeline/oak-labs-2000.avif 2000w",
      webpSrcSet:
        "/assets/generated/work/career-timeline/oak-labs-480.webp 480w, /assets/generated/work/career-timeline/oak-labs-900.webp 900w, /assets/generated/work/career-timeline/oak-labs-1200.webp 1200w, /assets/generated/work/career-timeline/oak-labs-1600.webp 1600w, /assets/generated/work/career-timeline/oak-labs-2000.webp 2000w",
      fallbackSrc: "/assets/work/career-timeline/oak-labs.png",
      sizes: timelineMediaSizes,
    },
    highlights: [
      {
        items: [
          "Build and maintain client AI solutions, from web and CMS delivery and SEO/AEO workflows to agentic iOS and web apps and internal automation.",
          "Integrate WebMCP into existing pages and build custom agent skills and plugins for client and internal workflows.",
          "Patch browser and computer-use harnesses and configure agentic coding environments for application delivery and maintenance.",
        ],
      },
    ],
    stack: [
      { label: "Technologies", items: ["React Native", "WebMCP", "MCP", "Anthropic Claude", "Google Gemini", "GCP"] },
      { label: "Applications", items: ["Web applications", "CMS", "Agent skills", "Plugins"] },
      { label: "Methods", items: ["RAG", "Multi-agent systems", "APIs", "Browser automation", "Computer use", "SEO/AEO", "Design engineering"] },
    ],
  },
  {
    id: "hyperskalers",
    aliases: ["career-hyperskalers"],
    label: "2026",
    date: "Feb 2026 - May 2026",
    place: "HyperSkalers",
    contexts: [
      {
        type: "employment",
        title: "Agentic AI Engineer, Design Engineer, Forward Deployed",
        engagement: "contract",
      },
    ],
    badges: ["Agent Evaluation", "Forward Deployed AI", "Client Systems"],
    title: "Agent evaluation and client AI systems",
    summary:
      "Contract AI engineering for a growth partner serving home-service businesses.",
    media: {
      alt: "HyperSkalers career timeline artwork for agent evaluation and client AI systems.",
      width: 2000,
      height: 1050,
      avifSrcSet:
        "/assets/generated/work/career-timeline/hyperskalers-480.avif 480w, /assets/generated/work/career-timeline/hyperskalers-900.avif 900w, /assets/generated/work/career-timeline/hyperskalers-1200.avif 1200w, /assets/generated/work/career-timeline/hyperskalers-1600.avif 1600w, /assets/generated/work/career-timeline/hyperskalers-2000.avif 2000w",
      webpSrcSet:
        "/assets/generated/work/career-timeline/hyperskalers-480.webp 480w, /assets/generated/work/career-timeline/hyperskalers-900.webp 900w, /assets/generated/work/career-timeline/hyperskalers-1200.webp 1200w, /assets/generated/work/career-timeline/hyperskalers-1600.webp 1600w, /assets/generated/work/career-timeline/hyperskalers-2000.webp 2000w",
      fallbackSrc: "/assets/work/career-timeline/hyperskalers.png",
      sizes: timelineMediaSizes,
    },
    highlights: [
      {
        items: [
          "Owned the evaluation layer for agent decisions, creative and offer variants, and human-review outcomes. Worked with the team on one home-service client's first-month campaign, which generated roughly $600K attributed sales on $60K ad spend.",
          "Built and deployed Python and TypeScript support and sales-call pipelines on client systems for a $5M+ ARR home-service client base, alongside multi-agent workflows for media buying, landing pages, SEO/AEO, lead research, and offer modeling.",
          "Built autonomous, long-running agent-team reporting and coordination, plus recovery and escalation with human guidance.",
          "Connected CRM, advertising, and home-service APIs through client-specific adapters, using SQL, NoSQL, and vector search for customer-data workflows, tracking, and reporting.",
          "Built meeting assistants for transcripts, wiki material, documentation, and handoffs. Presented demos and updates, gathered stakeholder feedback, and delivered SOPs and training for technical and non-technical teams.",
        ],
      },
    ],
    stack: [
      { label: "Technologies", items: ["Python", "TypeScript", "SQL", "NoSQL", "Vector search", "LLM APIs"] },
      { label: "Client integrations and tools", items: ["CRM", "Advertising", "Home-service systems", "Framer", "Figma", "APIs"] },
      { label: "Methods", items: ["LLM evaluation", "Multi-agent systems", "Human review", "Browser automation", "Recovery", "Escalation", "SEO/AEO", "Landing-page UX"] },
    ],
  },
  {
    id: "sanfranciscobayuniversity",
    aliases: ["career-san-francisco-bay-university"],
    label: "2024-2025",
    date: "May 2024 - Dec 2025",
    place: "San Francisco Bay University",
    contexts: [
      { type: "education", title: "M.S. Computer Science", status: "completed" },
      { type: "employment", title: "GenAI Engineer, Student Assistant", engagement: "part-time" },
    ],
    badges: ["Graduate CS", "Student Support", "EcoSmartLoop"],
    title: "Graduate computer science and applied AI work",
    summary:
      "Completed an M.S. in Computer Science while working part-time on student support and contributing to EcoSmartLoop, a team-built AI waste-sorting capstone.",
    media: {
      alt: "San Francisco Bay University career timeline artwork for graduate computer science, student support, and EcoSmartLoop.",
      width: 2000,
      height: 1050,
      avifSrcSet:
        "/assets/generated/work/career-timeline/sfbu-480.avif 480w, /assets/generated/work/career-timeline/sfbu-900.avif 900w, /assets/generated/work/career-timeline/sfbu-1200.avif 1200w, /assets/generated/work/career-timeline/sfbu-1600.avif 1600w, /assets/generated/work/career-timeline/sfbu-2000.avif 2000w",
      webpSrcSet:
        "/assets/generated/work/career-timeline/sfbu-480.webp 480w, /assets/generated/work/career-timeline/sfbu-900.webp 900w, /assets/generated/work/career-timeline/sfbu-1200.webp 1200w, /assets/generated/work/career-timeline/sfbu-1600.webp 1600w, /assets/generated/work/career-timeline/sfbu-2000.webp 2000w",
      fallbackSrc: "/assets/work/career-timeline/sfbu.png",
      sizes: timelineMediaSizes,
    },
    highlights: [
      {
        label: "Education",
        items: [
          "Completed an M.S. in Computer Science with a 3.89 / 4.0 GPA and a 100% Presidential Scholarship.",
          "Studied machine learning, generative AI, data structures and algorithms, and cloud computing.",
        ],
      },
      {
        label: "Student support",
        items: [
          "Built a Python, Flask, and JavaScript support chatbot using OpenAI APIs for student and IT questions.",
          "The chatbot reached 1,000+ users, with a reported 60% reduction in response time.",
        ],
      },
      {
        label: "EcoSmartLoop capstone",
        items: [
          "Contributed to EcoSmartLoop, a team prototype built from September to December 2025. Connected the team's custom-trained LEAF Engine classifier, hosted on AWS, to a Next.js web and Capacitor iOS experience.",
          "Contributed scanner UX, image and API flows, confidence-based fallback behavior, source-cited Orbi AI guidance and tool calling, quizzes, rewards, records, analytics, admin workflows, and organization-facing feedback.",
        ],
      },
    ],
    stack: [
      { label: "Student support technologies", items: ["Python", "Flask", "JavaScript", "OpenAI API"] },
      { label: "EcoSmartLoop technologies", items: ["Next.js", "React", "TypeScript", "Prisma", "PostgreSQL", "Capacitor", "iOS", "AWS", "Docker", "Figma"] },
      { label: "Capstone methods", items: ["Computer vision", "API integration", "UX/UI"] },
      { label: "Graduate work", items: ["RAG", "Vercel AI SDK"] },
      { label: "Coursework", items: ["Machine learning", "Generative AI", "Cloud computing"] },
    ],
  },
  {
    id: "uhttention",
    aliases: ["career-uhttention"],
    label: "2024-2025",
    date: "Jan 2024 - Jan 2025",
    place: "Uhttention",
    contexts: [
      {
        type: "employment",
        title: "AI Automation Engineer, Lead Designer, Forward Deployed",
        engagement: "part-time",
      },
    ],
    badges: ["AI Automation", "Conversion UX", "Client Handoff"],
    title: "AI automation and conversion UX",
    summary:
      "Worked with founders to build AI products and improve how customers found and used them.",
    media: {
      alt: "Uhttention career timeline artwork for AI automation, conversion UX, and client handoff.",
      width: 2000,
      height: 1050,
      avifSrcSet:
        "/assets/generated/work/career-timeline/uhttention-480.avif 480w, /assets/generated/work/career-timeline/uhttention-900.avif 900w, /assets/generated/work/career-timeline/uhttention-1200.avif 1200w, /assets/generated/work/career-timeline/uhttention-1600.avif 1600w, /assets/generated/work/career-timeline/uhttention-2000.avif 2000w",
      webpSrcSet:
        "/assets/generated/work/career-timeline/uhttention-480.webp 480w, /assets/generated/work/career-timeline/uhttention-900.webp 900w, /assets/generated/work/career-timeline/uhttention-1200.webp 1200w, /assets/generated/work/career-timeline/uhttention-1600.webp 1600w, /assets/generated/work/career-timeline/uhttention-2000.webp 2000w",
      fallbackSrc: "/assets/work/career-timeline/uhttention.png",
      sizes: timelineMediaSizes,
    },
    highlights: [
      {
        items: [
          "Worked with founders and product teams to build AI-powered products, automation workflows, landing pages, and growth systems.",
          "Led AI automation, conversion UX, and handoff work that helped deliver a 900% revenue increase in 150 days across client products.",
          "Shipped AI-driven SEO, chatbot routing, lead-generation funnels, affiliate and community loops, and content systems that grew organic traffic about 200% and cut cost per lead about 40%.",
          "Built the initial Agentic Brain context layer around RAG, memory, and reusable workflows for client AI products and automation.",
          "Explained product decisions, AI integration, and implementation tradeoffs to stakeholders, then supported demos, documentation, and delivery handoff.",
        ],
      },
    ],
    stack: [
      { label: "Technologies", items: ["Webflow", "Figma", "OpenAI API"] },
      { label: "Product and AI methods", items: ["Conversion UX", "Landing pages", "Full-stack development", "RAG", "Memory", "AI chatbots", "SEO", "Marketing automation"] },
      { label: "Delivery methods", items: ["APIs", "Lead-generation funnels", "Stakeholder demos", "Documentation", "Handoff"] },
    ],
  },
  {
    id: "globaledtechorganization",
    aliases: ["career-global-edtech-organization"],
    label: "2022-2024",
    date: "Nov 2022 - Feb 2024",
    place: "Global EdTech Organization",
    contexts: [
      {
        type: "employment",
        title: "AI Workflow Engineer, Organic Funnel Marketing",
        engagement: "part-time",
      },
    ],
    badges: ["Creative AI", "Audience Routing", "Organic Funnels"],
    title: "Creative AI and audience workflows",
    summary:
      "Joined an organic content team that was adopting generative AI for creative production and audience routing.",
    media: {
      alt: "Global EdTech Org career timeline artwork for creative AI, audience routing, and organic funnel workflows.",
      width: 2000,
      height: 1050,
      avifSrcSet:
        "/assets/generated/work/career-timeline/global-ed-org-480.avif 480w, /assets/generated/work/career-timeline/global-ed-org-900.avif 900w, /assets/generated/work/career-timeline/global-ed-org-1200.avif 1200w, /assets/generated/work/career-timeline/global-ed-org-1600.avif 1600w, /assets/generated/work/career-timeline/global-ed-org-2000.avif 2000w",
      webpSrcSet:
        "/assets/generated/work/career-timeline/global-ed-org-480.webp 480w, /assets/generated/work/career-timeline/global-ed-org-900.webp 900w, /assets/generated/work/career-timeline/global-ed-org-1200.webp 1200w, /assets/generated/work/career-timeline/global-ed-org-1600.webp 1600w, /assets/generated/work/career-timeline/global-ed-org-2000.webp 2000w",
      fallbackSrc: "/assets/work/career-timeline/global-ed-org.png",
      sizes: timelineMediaSizes,
    },
    highlights: [
      {
        items: [
          "Partnered with the organic content team on generative-AI creative, audience-routing, and funnel workflows. The organization reached about $100M MRR during peak months and averaged 250K+ paying subscribers. The team's workflows supported that operating scale.",
          "Built Stable Diffusion and LLM-assisted hook-generation and content-repurposing workflows for YouTube, TikTok, Instagram, and X. Helped scale team content to 50-100M organic views per month.",
          "Improved hook click-through rate about 30% and reduced creative cost about 5x through reusable AI-assisted content workflows.",
          "Built audience-routed chatbots and newsletter automation that connected user intent to funnel paths, improving conversion about 30%. Collaborated on early AI-chat and customer-support workflows across the shared education platform.",
          "Worked with marketing leadership on audience strategy, creative testing, and funnel decisions, connecting AI implementation with editorial and business needs.",
        ],
      },
    ],
    stack: [
      { label: "Creative tools", items: ["Stable Diffusion", "LLMs", "ChatGPT", "Adobe Photoshop", "Adobe Creative Cloud", "CapCut"] },
      { label: "Web tools", items: ["Webflow", "Figma"] },
      { label: "Audience methods", items: ["AI chatbots", "Newsletter automation", "Audience routing", "Social media", "Funnel optimization"] },
      { label: "Delivery methods", items: ["APIs", "Content systems", "Content creation automation", "Creative testing", "Marketing automation"] },
    ],
  },
  {
    id: "pnppsolutions",
    aliases: ["career-pnpp-solutions"],
    label: "2018-2024",
    date: "Nov 2018 - Jan 2024",
    place: "PNPP Solutions",
    contexts: [
      {
        type: "employment",
        title: "Full-Stack Engineer, AI ML & Design Systems",
        engagement: "full-time",
      },
    ],
    badges: ["Full-Stack", "Classical ML", "Design Systems"],
    title: "Enterprise software, applied ML, and design systems",
    summary:
      "Full-stack engineering and design across business software, institutional systems, and early applied-ML projects.",
    media: {
      alt: "PNPP Solutions career timeline artwork for enterprise software, applied ML, and design systems.",
      width: 2000,
      height: 1050,
      avifSrcSet:
        "/assets/generated/work/career-timeline/pnpp-480.avif 480w, /assets/generated/work/career-timeline/pnpp-900.avif 900w, /assets/generated/work/career-timeline/pnpp-1200.avif 1200w, /assets/generated/work/career-timeline/pnpp-1600.avif 1600w, /assets/generated/work/career-timeline/pnpp-2000.avif 2000w",
      webpSrcSet:
        "/assets/generated/work/career-timeline/pnpp-480.webp 480w, /assets/generated/work/career-timeline/pnpp-900.webp 900w, /assets/generated/work/career-timeline/pnpp-1200.webp 1200w, /assets/generated/work/career-timeline/pnpp-1600.webp 1600w, /assets/generated/work/career-timeline/pnpp-2000.webp 2000w",
      fallbackSrc: "/assets/work/career-timeline/pnpp.png",
      sizes: timelineMediaSizes,
    },
    highlights: [
      {
        items: [
          "Architected and shipped apps, APIs, portals, dashboards, and a 300+ component design system that helped the team close a seven-figure B2B deal.",
          "Moved one institutional registration workflow from paper to a custom system on company-run Linux servers with Docker. Built portals, data workflows, and reporting for institutional users.",
          "Developed OpenCV and classical-ML workflows, food-delivery recommendations and routing, and telecom applications. Contributed to identity and social-security projects for local government, and to product and e-commerce systems for international clients.",
          "Built seasonal and local engagement and onboarding tools that supported about 30% year-over-year participation growth and about 40% faster onboarding.",
          "Worked with the team on government-project tenders, client demos, education, onboarding, and design-to-delivery handoffs for company clients and government stakeholders.",
        ],
      },
    ],
    stack: [
      { label: "Engineering technologies", items: ["React", "TypeScript", "Python", "JavaScript", "Java", "PHP", "MySQL", "Linux", "Docker", "OpenCV"] },
      { label: "Web technologies", items: ["HTML", "CSS", "WordPress", "Shopify", "Webflow"] },
      { label: "Product methods", items: ["APIs", "Portals", "Dashboards", "Data visualization", "Design systems"] },
      { label: "ML methods", items: ["Classical ML", "Recommendations", "Routing"] },
    ],
  },
];
