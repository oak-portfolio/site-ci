import type { AnswerClaim, OakAnswer } from "../../packages/oak-agent-contracts/src/types";

export type GalleryTone = "mint" | "peach" | "lavender" | "sky" | "lemon" | "coral" | "aqua" | "pink"
  | "lime" | "tangerine" | "orchid" | "cyan" | "rose" | "ice" | "apricot" | "teal";
export type GalleryPreviewShape = "numbers" | "metric" | "timeline" | "compare" | "steps" | "points" | "callout" | "gap"
  | "diagram" | "table" | "board" | "wall" | "stack" | "screens" | "profile" | "pages";
export type GalleryReplay = {
  id: string;
  kind: string;
  label: string;
  tone: GalleryTone;
  question: string;
  answer: Readonly<{ kind: "sourced" | "gap"; acknowledgment: string | null; claims: readonly AnswerClaim[] }>;
  /** The settled OpenUI program for this answer, as the Worker would send it; null for a plain answer such as the gap. */
  program: string | null;
};
export type GalleryPreview = { shape: GalleryPreviewShape; items: string[] };
export type GalleryFrame = { status: "streaming" | "done"; program: string };

/**
 * Hand-built reference answers, not recordings of the live model: cited answers from reviewed fixtures
 * (tests/agent/work-answers.v1.json, the dev gallery and tests/agent/premium/stored-openui-programs/), each drawn by the
 * live renderer from its stored program with no model call. Record blocks read the site's own record facts.
 */
export const galleryKnowledgeRevision = "oak-7de137a393006ca5e8f1e3e100cb775bb201e3f5ba013a0bf863f3872ef0718f";

export const galleryReplays: readonly GalleryReplay[] = [
  {
    "id": "numbers",
    "kind": "numbers",
    "label": "Numbers",
    "tone": "mint",
    "question": "How big was the EcoSmartLoop model?",
    "answer": {
      "kind": "sourced",
      "acknowledgment": null,
      "claims": [
        {
          "id": "claim-1",
          "text": "In EcoSmartLoop, LEAF Engine looked at each uploaded waste image, with 8K+ images of training context, and returned one of 4 outcomes; Orbi AI handled what happened after the label.",
          "citations": [
            {
              "documentId": "work:ecosmartloop",
              "passageId": "work:ecosmartloop:section-007:passage-003",
              "sectionId": "work:ecosmartloop:section-007",
              "url": "https://steveoak.com/work/ecosmartloop/#leaf-engine-classified-orbi-explained"
            }
          ]
        },
        {
          "id": "claim-2",
          "text": "LEAF Engine had 8K+ images of training context.",
          "citations": [
            {
              "documentId": "work:ecosmartloop",
              "passageId": "work:ecosmartloop:section-007:passage-003",
              "sectionId": "work:ecosmartloop:section-007",
              "url": "https://steveoak.com/work/ecosmartloop/#leaf-engine-classified-orbi-explained"
            }
          ]
        },
        {
          "id": "claim-3",
          "text": "It sorted each photo into 4 classes: compost, recycle, landfill, or unknown.",
          "citations": [
            {
              "documentId": "work:ecosmartloop",
              "passageId": "work:ecosmartloop:section-007:passage-003",
              "sectionId": "work:ecosmartloop:section-007",
              "url": "https://steveoak.com/work/ecosmartloop/#leaf-engine-classified-orbi-explained"
            }
          ]
        }
      ]
    },
    "program": "root = Answer([lead, nums, src])\nlead = Prose(\"claim-1\")\nnums = Stats([a, b])\na = Metric(\"Training images\", \"8K+\", \"claim-2\")\nb = Metric(\"Outcomes\", \"4\", \"claim-3\")\nsrc = Sources()"
  },
  {
    "id": "metric",
    "kind": "metric",
    "label": "One number",
    "tone": "sky",
    "question": "How many people used the chatbot?",
    "answer": {
      "kind": "sourced",
      "acknowledgment": null,
      "claims": [
        {
          "id": "claim-1",
          "text": "The San Francisco Bay University chatbot reached 1,000+ users, with a reported 60% reduction in response time.",
          "citations": [
            {
              "documentId": "experience:sanfranciscobayuniversity",
              "passageId": "experience:sanfranciscobayuniversity:passage-005",
              "sectionId": "experience:sanfranciscobayuniversity",
              "url": "https://steveoak.com/work#sanfranciscobayuniversity"
            }
          ]
        },
        {
          "id": "claim-2",
          "text": "The chatbot had 1,000+ users.",
          "citations": [
            {
              "documentId": "experience:sanfranciscobayuniversity",
              "passageId": "experience:sanfranciscobayuniversity:passage-005",
              "sectionId": "experience:sanfranciscobayuniversity",
              "url": "https://steveoak.com/work#sanfranciscobayuniversity"
            }
          ]
        }
      ]
    },
    "program": "root = Answer([lead, num, src])\nlead = Prose(\"claim-1\")\nnum = Metric(\"Users reached\", \"1,000+\", \"claim-2\")\nsrc = Sources()"
  },
  {
    "id": "timeline",
    "kind": "timeline",
    "label": "Timeline",
    "tone": "peach",
    "question": "How do EcoSmartLoop and Agentic Brain fit in Steve's timeline?",
    "answer": {
      "kind": "sourced",
      "acknowledgment": null,
      "claims": [
        {
          "id": "claim-1",
          "text": "From September to December 2025, Steve contributed to EcoSmartLoop, a team prototype, while completing his M.S. in Computer Science.",
          "citations": [
            {
              "documentId": "experience:sanfranciscobayuniversity",
              "passageId": "experience:sanfranciscobayuniversity:passage-001",
              "sectionId": "experience:sanfranciscobayuniversity",
              "url": "https://steveoak.com/work#sanfranciscobayuniversity"
            },
            {
              "documentId": "experience:sanfranciscobayuniversity",
              "passageId": "experience:sanfranciscobayuniversity:passage-006",
              "sectionId": "experience:sanfranciscobayuniversity",
              "url": "https://steveoak.com/work#sanfranciscobayuniversity"
            }
          ]
        },
        {
          "id": "claim-2",
          "text": "Agentic Brain is the newer memory-systems workstream that followed Steve's January 2026 memory and hallucination experiment.",
          "citations": [
            {
              "documentId": "work:agentic-brain",
              "passageId": "work:agentic-brain:section-001:passage-001",
              "sectionId": "work:agentic-brain:section-001",
              "url": "https://steveoak.com/work/agentic-brain/#work-in-progress-panel-title"
            }
          ]
        }
      ]
    },
    "program": "root = Answer([t, src, next])\nt = Timeline([a, b])\na = TimelineItem(\"September to December 2025\", \"claim-1\")\nb = TimelineItem(\"After January 2026\", \"claim-2\")\nsrc = Sources()\nnext = Pills([\"What did EcoSmartLoop ship?\", \"What is Agentic Brain about?\"])"
  },
  {
    "id": "compare",
    "kind": "compare",
    "label": "Side by side",
    "tone": "lavender",
    "question": "How do Oakminder and EcoSmartLoop compare?",
    "answer": {
      "kind": "sourced",
      "acknowledgment": null,
      "claims": [
        {
          "id": "claim-1",
          "text": "Oakminder is Steve's Productivity AI agent for reminders, while EcoSmartLoop starts at the bin, where signage and memory are not enough.",
          "citations": [
            {
              "documentId": "work:oakminder",
              "passageId": "work:oakminder:section-001:passage-006",
              "sectionId": "work:oakminder:section-001",
              "url": "https://steveoak.com/work/oakminder/#why-i-built-another-reminder-app"
            },
            {
              "documentId": "work:ecosmartloop",
              "passageId": "work:ecosmartloop:section-001:passage-008",
              "sectionId": "work:ecosmartloop:section-001",
              "url": "https://steveoak.com/work/ecosmartloop/#the-three-bin-pause"
            }
          ]
        },
        {
          "id": "claim-2",
          "text": "Oakminder started from the friction of snoozing, completing and bulk-managing reminders.",
          "citations": [
            {
              "documentId": "work:oakminder",
              "passageId": "work:oakminder:section-001:passage-006",
              "sectionId": "work:oakminder:section-001",
              "url": "https://steveoak.com/work/oakminder/#why-i-built-another-reminder-app"
            }
          ]
        },
        {
          "id": "claim-3",
          "text": "EcoSmartLoop started from the few seconds of hesitation at the bin, where signage and memory are not enough.",
          "citations": [
            {
              "documentId": "work:ecosmartloop",
              "passageId": "work:ecosmartloop:section-001:passage-008",
              "sectionId": "work:ecosmartloop:section-001",
              "url": "https://steveoak.com/work/ecosmartloop/#the-three-bin-pause"
            }
          ]
        },
        {
          "id": "claim-4",
          "text": "Oakminder turns a typed, tapped or spoken request into a real reminder with its title, time and category.",
          "citations": [
            {
              "documentId": "work:oakminder",
              "passageId": "work:oakminder:section-002:passage-004",
              "sectionId": "work:oakminder:section-002",
              "url": "https://steveoak.com/work/oakminder/#from-tap-flow-to-voice-agent"
            }
          ]
        },
        {
          "id": "claim-5",
          "text": "EcoSmartLoop had to explain the scan's answer, save it and make the next decision easier.",
          "citations": [
            {
              "documentId": "work:ecosmartloop",
              "passageId": "work:ecosmartloop:section-001:passage-010",
              "sectionId": "work:ecosmartloop:section-001",
              "url": "https://steveoak.com/work/ecosmartloop/#the-three-bin-pause"
            }
          ]
        }
      ]
    },
    "program": "root = Answer([lead, cmp, src])\nlead = Prose(\"claim-1\")\ncmp = Compare([why, how])\nwhy = CompareRow(\"Problem\", \"claim-2\", \"claim-3\")\nhow = CompareRow(\"What it does\", \"claim-4\", \"claim-5\")\nsrc = Sources()"
  },
  {
    "id": "steps",
    "kind": "steps",
    "label": "Steps",
    "tone": "lemon",
    "question": "How did Steve build the LinkedIn Growth Loop, step by step?",
    "answer": {
      "kind": "sourced",
      "acknowledgment": null,
      "claims": [
        {
          "id": "claim-1",
          "text": "LinkedIn Growth Loop began as one small daily job: review a list of people, understand why each belonged there, write a personalized connection note, send or skip, then record what happened.",
          "citations": [
            {
              "documentId": "work:linkedin-growth-loop",
              "passageId": "work:linkedin-growth-loop:section-004:passage-002",
              "sectionId": "work:linkedin-growth-loop:section-004",
              "url": "https://steveoak.com/work/linkedin-growth-loop/#the-first-daily-loop"
            }
          ]
        },
        {
          "id": "claim-2",
          "text": "Target review gave the loop a real starting point: who this person is, why they fit, and whether the next action should happen.",
          "citations": [
            {
              "documentId": "work:linkedin-growth-loop",
              "passageId": "work:linkedin-growth-loop:section-004:passage-005",
              "sectionId": "work:linkedin-growth-loop:section-004",
              "url": "https://steveoak.com/work/linkedin-growth-loop/#the-first-daily-loop"
            }
          ]
        },
        {
          "id": "claim-3",
          "text": "Response tracking made the next run smarter: the system could keep the outcome, compare it with prior choices, and decide what changed.",
          "citations": [
            {
              "documentId": "work:linkedin-growth-loop",
              "passageId": "work:linkedin-growth-loop:section-004:passage-006",
              "sectionId": "work:linkedin-growth-loop:section-004",
              "url": "https://steveoak.com/work/linkedin-growth-loop/#the-first-daily-loop"
            }
          ]
        },
        {
          "id": "claim-4",
          "text": "Later, the scope widened into target discovery, feed interaction, response tracking, follow-up state, and outcome comparison.",
          "citations": [
            {
              "documentId": "work:linkedin-growth-loop",
              "passageId": "work:linkedin-growth-loop:section-004:passage-004",
              "sectionId": "work:linkedin-growth-loop:section-004",
              "url": "https://steveoak.com/work/linkedin-growth-loop/#the-first-daily-loop"
            }
          ]
        },
        {
          "id": "claim-5",
          "text": "Steve then stopped treating the workflow as one agent and split it into two operating groups: people work, and public interaction.",
          "citations": [
            {
              "documentId": "work:linkedin-growth-loop",
              "passageId": "work:linkedin-growth-loop:section-005:passage-001",
              "sectionId": "work:linkedin-growth-loop:section-005",
              "url": "https://steveoak.com/work/linkedin-growth-loop/#orchestrator-workers-validators"
            },
            {
              "documentId": "work:linkedin-growth-loop",
              "passageId": "work:linkedin-growth-loop:section-005:passage-002",
              "sectionId": "work:linkedin-growth-loop:section-005",
              "url": "https://steveoak.com/work/linkedin-growth-loop/#orchestrator-workers-validators"
            }
          ]
        }
      ]
    },
    "program": "root = Answer([lead, how, src])\nlead = Prose(\"claim-1\")\nhow = Steps([\"claim-2\", \"claim-3\", \"claim-4\", \"claim-5\"])\nsrc = Sources()"
  },
  {
    "id": "points",
    "kind": "points",
    "label": "Key points",
    "tone": "aqua",
    "question": "What is Agentic Brain?",
    "answer": {
      "kind": "sourced",
      "acknowledgment": null,
      "claims": [
        {
          "id": "claim-1",
          "text": "Agentic Brain is Steve's memory-systems workstream: it connects short-term context, long-term memory, retrieval, codebase search, context engines, memory graphs, instruction files, MCP collections, skills, and plugins so future agent sessions can recover the right project context.",
          "citations": [
            {
              "documentId": "work:agentic-brain",
              "passageId": "work:agentic-brain:section-001:passage-001",
              "sectionId": "work:agentic-brain:section-001",
              "url": "https://steveoak.com/work/agentic-brain/#work-in-progress-panel-title"
            }
          ]
        },
        {
          "id": "claim-2",
          "text": "It separates short-term working context from durable project memory, so future agent sessions do not need to rediscover the same constraints.",
          "citations": [
            {
              "documentId": "work:agentic-brain",
              "passageId": "work:agentic-brain:section-001:passage-002",
              "sectionId": "work:agentic-brain:section-001",
              "url": "https://steveoak.com/work/agentic-brain/#work-in-progress-panel-title"
            }
          ]
        },
        {
          "id": "claim-3",
          "text": "It uses RAG, contextual codebase search, and direct source reads when the next step needs grounded project context.",
          "citations": [
            {
              "documentId": "work:agentic-brain",
              "passageId": "work:agentic-brain:section-001:passage-003",
              "sectionId": "work:agentic-brain:section-001",
              "url": "https://steveoak.com/work/agentic-brain/#work-in-progress-panel-title"
            }
          ]
        }
      ]
    },
    "program": "root = Answer([lead, how, src])\nlead = Prose(\"claim-1\")\nhow = Points([\"claim-2\", \"claim-3\"])\nsrc = Sources()"
  },
  {
    "id": "callout",
    "kind": "callout",
    "label": "Worth knowing",
    "tone": "pink",
    "question": "How big is the problem EcoSmartLoop goes after?",
    "answer": {
      "kind": "sourced",
      "acknowledgment": null,
      "claims": [
        {
          "id": "claim-1",
          "text": "A CalRecycle SB 1383 cost scenario uses 450,000 California businesses with at least five employees, which is what made EcoSmartLoop feel large without pretending it had reached them.",
          "citations": [
            {
              "documentId": "work:ecosmartloop",
              "passageId": "work:ecosmartloop:section-004:passage-003",
              "sectionId": "work:ecosmartloop:section-004",
              "url": "https://steveoak.com/work/ecosmartloop/#why-a-california-waste-sorting-prototype-was-worth-building"
            }
          ]
        },
        {
          "id": "claim-2",
          "text": "SB 1383 gave the prototype a concrete operating context: education, collection, inspection, and contamination monitoring.",
          "citations": [
            {
              "documentId": "work:ecosmartloop",
              "passageId": "work:ecosmartloop:section-004:passage-006",
              "sectionId": "work:ecosmartloop:section-004",
              "url": "https://steveoak.com/work/ecosmartloop/#why-a-california-waste-sorting-prototype-was-worth-building"
            }
          ]
        },
        {
          "id": "claim-3",
          "text": "The CalRecycle figures are external targets and requirements, not EcoSmartLoop outcomes.",
          "citations": [
            {
              "documentId": "work:ecosmartloop",
              "passageId": "work:ecosmartloop:section-004:passage-009",
              "sectionId": "work:ecosmartloop:section-004",
              "url": "https://steveoak.com/work/ecosmartloop/#why-a-california-waste-sorting-prototype-was-worth-building"
            }
          ]
        }
      ]
    },
    "program": "root = Answer([lead, ctx, note, src])\nlead = Prose(\"claim-1\")\nctx = Prose(\"claim-2\")\nnote = Callout(\"claim-3\")\nsrc = Sources()"
  },
  {
    "id": "gap",
    "kind": "gap",
    "label": "Not on the record",
    "tone": "coral",
    "question": "What accuracy did LEAF achieve?",
    "answer": {
      "kind": "gap",
      "acknowledgment": null,
      "claims": [
        {
          "id": "leaf-evaluation-gap",
          "text": "Stronger LEAF model-quality numbers should come from the next evaluation run. Before a stronger claim, Steve would want the exact split, thresholds, confusion matrix, precision, recall, and failure examples. That run would test unaided human guesses, LEAF-only output, and LEAF plus Orbi guidance.",
          "citations": [
            {
              "documentId": "work:ecosmartloop",
              "passageId": "work:ecosmartloop:section-011:passage-003",
              "sectionId": "work:ecosmartloop:section-011",
              "url": "https://steveoak.com/work/ecosmartloop/#what-the-evidence-actually-showed"
            },
            {
              "documentId": "work:ecosmartloop",
              "passageId": "work:ecosmartloop:section-011:passage-005",
              "sectionId": "work:ecosmartloop:section-011",
              "url": "https://steveoak.com/work/ecosmartloop/#what-the-evidence-actually-showed"
            },
            {
              "documentId": "work:ecosmartloop",
              "passageId": "work:ecosmartloop:section-011:passage-010",
              "sectionId": "work:ecosmartloop:section-011",
              "url": "https://steveoak.com/work/ecosmartloop/#what-the-evidence-actually-showed"
            }
          ]
        }
      ]
    },
    "program": null
  },
  {
    "id": "diagram",
    "kind": "diagram",
    "label": "Diagram",
    "tone": "lime",
    "question": "How does Oakminder work?",
    "answer": {
      "kind": "sourced",
      "acknowledgment": null,
      "claims": [
        {
          "id": "claim-1",
          "text": "Oakminder's architecture decision: the backend has to know what happened, and the phone has to make the action feel light.",
          "citations": [
            {
              "documentId": "work:oakminder",
              "passageId": "work:oakminder:section-004:passage-004",
              "sectionId": "work:oakminder:section-004",
              "url": "https://steveoak.com/work/oakminder/#the-architecture-behind-a-simple-tap"
            }
          ]
        }
      ]
    },
    "program": "root = Answer([d])\nd = Diagram(\"claim-1\", \"flow\")"
  },
  {
    "id": "table",
    "kind": "table",
    "label": "Table",
    "tone": "tangerine",
    "question": "How do EcoSmartLoop and Oakminder line up?",
    "answer": {
      "kind": "sourced",
      "acknowledgment": null,
      "claims": [
        {
          "id": "claim-1",
          "text": "EcoSmartLoop, an AI agent platform for business waste, ran LEAF Engine for image classification and Orbi for explanation and product actions.",
          "citations": [
            {
              "documentId": "work:ecosmartloop",
              "passageId": "work:ecosmartloop:section-007:passage-007",
              "sectionId": "work:ecosmartloop:section-007",
              "url": "https://steveoak.com/work/ecosmartloop/#leaf-engine-classified-orbi-explained"
            }
          ]
        },
        {
          "id": "claim-2",
          "text": "Oakminder, a Productivity AI agent, turns a typed, tapped, or spoken request into a real reminder.",
          "citations": [
            {
              "documentId": "work:oakminder",
              "passageId": "work:oakminder:section-002:passage-004",
              "sectionId": "work:oakminder:section-002",
              "url": "https://steveoak.com/work/oakminder/#from-tap-flow-to-voice-agent"
            }
          ]
        }
      ]
    },
    "program": "root = Answer([t])\nt = Table([\"claim-1\", \"claim-2\"], \"matrix\")"
  },
  {
    "id": "board",
    "kind": "board",
    "label": "Board",
    "tone": "orchid",
    "question": "Which case studies are finished?",
    "answer": {
      "kind": "sourced",
      "acknowledgment": null,
      "claims": [
        {
          "id": "claim-1",
          "text": "EcoSmartLoop starts at the bin, where signage, memory, and social pressure are not enough.",
          "citations": [
            {
              "documentId": "work:ecosmartloop",
              "passageId": "work:ecosmartloop:section-001:passage-008",
              "sectionId": "work:ecosmartloop:section-001",
              "url": "https://steveoak.com/work/ecosmartloop/#the-three-bin-pause"
            }
          ]
        },
        {
          "id": "claim-2",
          "text": "Agentic Brain separates short-term working context from durable project memory.",
          "citations": [
            {
              "documentId": "work:agentic-brain",
              "passageId": "work:agentic-brain:section-001:passage-002",
              "sectionId": "work:agentic-brain:section-001",
              "url": "https://steveoak.com/work/agentic-brain/#work-in-progress-panel-title"
            }
          ]
        },
        {
          "id": "claim-3",
          "text": "Oakminder's App Store graphics show the product story across voice, agenda, snooze, alarms, and notification actions.",
          "citations": [
            {
              "documentId": "work:oakminder",
              "passageId": "work:oakminder:section-001:passage-003",
              "sectionId": "work:oakminder:section-001",
              "url": "https://steveoak.com/work/oakminder/#why-i-built-another-reminder-app"
            }
          ]
        },
        {
          "id": "claim-4",
          "text": "LinkedIn Growth Loop's daily job was simple: review the list, write a personalized connection note, send or skip, then record what happened.",
          "citations": [
            {
              "documentId": "work:linkedin-growth-loop",
              "passageId": "work:linkedin-growth-loop:section-004:passage-002",
              "sectionId": "work:linkedin-growth-loop:section-004",
              "url": "https://steveoak.com/work/linkedin-growth-loop/#the-first-daily-loop"
            }
          ]
        },
        {
          "id": "claim-5",
          "text": "OmniSocial is an agentic content-production system, described on a public in-progress page.",
          "citations": [
            {
              "documentId": "work:omnisocial",
              "passageId": "work:omnisocial:section-001:passage-001",
              "sectionId": "work:omnisocial:section-001",
              "url": "https://steveoak.com/work/omnisocial/#work-in-progress-panel-title"
            }
          ]
        }
      ]
    },
    "program": "root = Answer([board])\nboard = Board([\"claim-1\", \"claim-2\", \"claim-3\", \"claim-4\", \"claim-5\"])"
  },
  {
    "id": "project-wall",
    "kind": "project-wall",
    "label": "Project wall",
    "tone": "cyan",
    "question": "What has Steve built?",
    "answer": {
      "kind": "sourced",
      "acknowledgment": null,
      "claims": [
        {
          "id": "claim-1",
          "text": "In EcoSmartLoop, LEAF Engine read each waste photo and sorted it into one of 4 classes.",
          "citations": [
            {
              "documentId": "work:ecosmartloop",
              "passageId": "work:ecosmartloop:section-007:passage-003",
              "sectionId": "work:ecosmartloop:section-007",
              "url": "https://steveoak.com/work/ecosmartloop/#leaf-engine-classified-orbi-explained"
            }
          ]
        },
        {
          "id": "claim-2",
          "text": "Oakminder is a Productivity AI agent with a Voice agent that does the real reminder work.",
          "citations": [
            {
              "documentId": "work:oakminder",
              "passageId": "work:oakminder:section-002:passage-002",
              "sectionId": "work:oakminder:section-002",
              "url": "https://steveoak.com/work/oakminder/#from-tap-flow-to-voice-agent"
            }
          ]
        },
        {
          "id": "claim-3",
          "text": "LinkedIn Growth Loop's daily job: review the list, write a personalized connection note, then record what happened.",
          "citations": [
            {
              "documentId": "work:linkedin-growth-loop",
              "passageId": "work:linkedin-growth-loop:section-004:passage-002",
              "sectionId": "work:linkedin-growth-loop:section-004",
              "url": "https://steveoak.com/work/linkedin-growth-loop/#the-first-daily-loop"
            }
          ]
        }
      ]
    },
    "program": "root = Answer([wall])\nwall = ProjectWall([\"claim-1\", \"claim-2\", \"claim-3\"])"
  },
  {
    "id": "stack-map",
    "kind": "stack-map",
    "label": "Stack map",
    "tone": "rose",
    "question": "What tools does Steve use?",
    "answer": {
      "kind": "sourced",
      "acknowledgment": null,
      "claims": [
        {
          "id": "claim-1",
          "text": "EcoSmartLoop's app is Next.js and TypeScript, put into an iOS shell by Capacitor.",
          "citations": [
            {
              "documentId": "work:ecosmartloop",
              "passageId": "work:ecosmartloop:section-010:passage-003",
              "sectionId": "work:ecosmartloop:section-010",
              "url": "https://steveoak.com/work/ecosmartloop/#the-stack-behind-the-scan"
            }
          ]
        },
        {
          "id": "claim-2",
          "text": "In the LinkedIn Growth Loop, browser control becomes part of the agent stack when API paths are limited or too narrow.",
          "citations": [
            {
              "documentId": "work:linkedin-growth-loop",
              "passageId": "work:linkedin-growth-loop:section-008:passage-002",
              "sectionId": "work:linkedin-growth-loop:section-008",
              "url": "https://steveoak.com/work/linkedin-growth-loop/#browser-control-kept-the-cost-honest"
            }
          ]
        }
      ]
    },
    "program": "root = Answer([map])\nmap = StackMap([\"claim-1\", \"claim-2\"])"
  },
  {
    "id": "screens",
    "kind": "screens",
    "label": "Screens",
    "tone": "ice",
    "question": "What does EcoSmartLoop look like?",
    "answer": {
      "kind": "sourced",
      "acknowledgment": null,
      "claims": [
        {
          "id": "claim-1",
          "text": "In EcoSmartLoop, LEAF Engine read each waste photo and sorted it into one of 4 classes.",
          "citations": [
            {
              "documentId": "work:ecosmartloop",
              "passageId": "work:ecosmartloop:section-007:passage-003",
              "sectionId": "work:ecosmartloop:section-007",
              "url": "https://steveoak.com/work/ecosmartloop/#leaf-engine-classified-orbi-explained"
            }
          ]
        }
      ]
    },
    "program": "root = Answer([shots])\nshots = Screens(\"claim-1\")"
  },
  {
    "id": "profile",
    "kind": "profile",
    "label": "Profile",
    "tone": "apricot",
    "question": "Who is Steve?",
    "answer": {
      "kind": "sourced",
      "acknowledgment": null,
      "claims": [
        {
          "id": "claim-1",
          "text": "Steve Oak, also called Oak or Okkar Kyaw, designs and builds useful AI products: workflows, eval loops, tool systems, and interfaces that make automated work easier to inspect and trust.",
          "citations": [
            {
              "documentId": "profile:steve-oak",
              "passageId": "profile:steve-oak:section-001:passage-001",
              "sectionId": "profile:steve-oak:section-001",
              "url": "https://steveoak.com/#hero-title"
            }
          ]
        }
      ]
    },
    "program": "root = Answer([who])\nwho = Profile(\"claim-1\")"
  },
  {
    "id": "page-cards",
    "kind": "page-cards",
    "label": "Page cards",
    "tone": "teal",
    "question": "Where can I read about his agent projects?",
    "answer": {
      "kind": "sourced",
      "acknowledgment": null,
      "claims": [
        {
          "id": "claim-1",
          "text": "EcoSmartLoop kept two jobs separate: LEAF Engine handled image classification, and Orbi handled explanation and product actions.",
          "citations": [
            {
              "documentId": "work:ecosmartloop",
              "passageId": "work:ecosmartloop:section-007:passage-007",
              "sectionId": "work:ecosmartloop:section-007",
              "url": "https://steveoak.com/work/ecosmartloop/#leaf-engine-classified-orbi-explained"
            }
          ]
        },
        {
          "id": "claim-2",
          "text": "Oakminder's voice agent had to do real reminder work: create, edit, complete, snooze, and delete reminders.",
          "citations": [
            {
              "documentId": "work:oakminder",
              "passageId": "work:oakminder:section-005:passage-005",
              "sectionId": "work:oakminder:section-005",
              "url": "https://steveoak.com/work/oakminder/#voice-became-the-action-layer"
            }
          ]
        }
      ]
    },
    "program": "root = Answer([pages])\npages = PageCards([\"claim-1\", \"claim-2\"])"
  }
];

/** The six tiles the Ask home shows as its empty-state cards. */
export const galleryHomeCards: readonly string[] = ["numbers", "timeline", "compare", "steps", "points", "gap"];

const quoted = (args: string) => [...args.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(match => match[1]);
const calls = (program: string, block: string) => [...program.matchAll(new RegExp(`\\b${block}\\(([^\\n]*)\\)`, "g"))].map(match => quoted(match[1]));
const counted = (program: string, block: string) => (calls(program, block)[0] ?? []).map((_, index) => String(index + 1));
const claimCount = (program: string, block: string) =>
  (program.match(new RegExp(`\\b${block}\\(\\[([^\\]]*)\\]`))?.[1].match(/"claim-[^"]*"/g) ?? []).map((_, index) => String(index + 1));

const RECORD_SHAPES: ReadonlyArray<[string, GalleryPreviewShape]> = [
  ["Diagram", "diagram"], ["Table", "table"], ["Board", "board"], ["ProjectWall", "wall"], ["StackMap", "stack"], ["Screens", "screens"],
  ["PageCards", "pages"],
];

/** What a tile draws on its surface, read from its own stored program. */
export function galleryPreviewOf(replay: GalleryReplay): GalleryPreview {
  const program = replay.program ?? "";
  if (replay.answer.kind === "gap" || !program) return { shape: "gap", items: [replay.answer.claims[0]?.text.split(/(?<=\.)\s/)[0] ?? ""] };
  if (/\bProfile\(/.test(program)) return { shape: "profile", items: [] };
  for (const [block, shape] of RECORD_SHAPES)
    if (new RegExp(`\\b${block}\\(`).test(program)) return { shape, items: claimCount(program, block) };
  if (/\bTimeline\(/.test(program)) return { shape: "timeline", items: calls(program, "TimelineItem").map(args => args[0]) };
  if (/\bCompare\(/.test(program)) return { shape: "compare", items: calls(program, "CompareRow").map(args => args[0]) };
  if (/\bSteps\(/.test(program)) return { shape: "steps", items: counted(program, "Steps") };
  if (/\bPoints\(/.test(program)) return { shape: "points", items: counted(program, "Points") };
  if (/\bCallout\(/.test(program)) return { shape: "callout", items: [] };
  return { shape: /\bStats\(/.test(program) ? "numbers" : "metric", items: calls(program, "Metric").map(args => args[1]) };
}

/** A replay streams its program one line at a time, as the Worker sent it, then settles on the whole program. */
export function galleryReplayFrames(program: string): GalleryFrame[] {
  const lines = program.split("\n");
  return [...lines.slice(0, -1).map((_, index) => ({ status: "streaming" as const, program: lines.slice(0, index + 1).join("\n") })),
    { status: "done" as const, program }];
}

type WorkAnswer = Extract<OakAnswer, { kind: "sourced" | "gap" }>;

/** The reference answer as the Worker would send it, read against the page's knowledge revision so its source labels resolve. */
export function galleryAnswerOf(replay: GalleryReplay, knowledgeRevision = galleryKnowledgeRevision): WorkAnswer {
  return { schema: "oak.answer.v1", speaker: "oak-ai-host", operations: [], characterVersion: "oak-character-2026-10-03-v1",
    hardPolicyVersion: "oak-hard-policy-2026-10-03-v1", knowledgeRevision, ...replay.answer } as unknown as WorkAnswer;
}
