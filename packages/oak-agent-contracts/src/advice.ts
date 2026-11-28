import type { AdviceProposal } from './types.ts';

export const adviceProposalLabel = 'Proposal for your project';
export const adviceCurrentUncertainty = 'This advice covers prototype interfaces and source-grounded agent workflows only. These are conditional suggestions grounded in dated public work. Current platform features, prices, resources, and project conditions have not been verified.';
export const advicePlanKeys = ['product-interface', 'agent-workflow', 'clarify-scope'] as const;
export type AdvicePlanKey = typeof advicePlanKeys[number];

// Keep generated candidate facts out of advisory prose. This intentionally small
// plan catalogue supplies conditional visitor actions, not Steve commitments.
export const advicePlans = {
  'product-interface': {
    // R22 live: agent and retrieval questions route here too (Q16-D9), so the wording fits any result people act on.
    recommendation: 'If people will act on what a model or agent returns, prototype one end-to-end flow around that result before adding dashboards or more sources.',
    assumptions: ['The immediate decision is how a user acts on what the model or agent returns.', 'You can test a small prototype with representative users.'],
    tradeoffs: ['A narrow prototype reveals interaction risks early but leaves broader features untested.'],
    nextStep: 'List one user decision, the result it depends on, and a way to check whether the next action is clear.',
  },
  'agent-workflow': {
    recommendation: 'If repeat agent sessions lose context, separate working context from durable memory and retrieve source material before changing it.',
    assumptions: ['You have permission to use the project material.', 'The task benefits from reusable context across sessions.'],
    tradeoffs: ['Durable notes reduce rediscovery, but stale notes need review and source checks.'],
    nextStep: 'Choose one recurring task, record its constraints, and compare a source-grounded run with your current workflow.',
  },
  'clarify-scope': {
    recommendation: 'Clarify the decision and seek a source or specialist with direct evidence before acting.',
    assumptions: ['The available public work does not establish a supported advice plan for this request.'],
    tradeoffs: ['Acting without relevant evidence can produce a misleading recommendation; clarification takes another step.'],
    nextStep: 'What decision do you need to make, and which constraints or current facts must be checked?',
  },
} as const satisfies Record<AdvicePlanKey, AdviceProposal>;

export function approvedAdvicePlan(proposal: AdviceProposal): AdvicePlanKey | undefined {
  const same = (plan: AdviceProposal) =>
    proposal.recommendation === plan.recommendation && proposal.nextStep === plan.nextStep &&
      proposal.assumptions.length === plan.assumptions.length && proposal.assumptions.every((value, index) => value === plan.assumptions[index]) &&
      proposal.tradeoffs.length === plan.tradeoffs.length && proposal.tradeoffs.every((value, index) => value === plan.tradeoffs[index]);
  return advicePlanKeys.find(key => same(advicePlans[key])) ?? legacyAdvicePlans.find(entry => same(entry.plan))?.key;
}

/**
 * R23 review H1: saved chats keep the wording an answer was given in. A plan's earlier text is still recognised when a
 * saved answer is read back, and is never sent in a new answer (the Worker builds proposals from advicePlans only).
 */
const legacyAdvicePlans: ReadonlyArray<{ key: AdvicePlanKey; plan: AdviceProposal }> = [
  { key: 'product-interface', plan: {
    recommendation: 'If your project needs a usable interface around an uncertain model result, prototype one end-to-end user flow before adding dashboards.',
    assumptions: ['The immediate decision is how a user acts on a model result.', 'You can test a small prototype with representative users.'],
    tradeoffs: ['A narrow prototype reveals interaction risks early but leaves broader features untested.'],
    nextStep: 'List one user decision, the uncertain result, and a way to check whether the next action is clear.',
  } },
];
