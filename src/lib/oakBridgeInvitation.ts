import { oakBridgeTopicFor } from "@/data/oakBridgeTopics";
import { oakRecordFactsState, type OakRecordFact, type OakWorkFacts } from "@/lib/oakRecordFacts";
import { oakBridgeOpen } from "@/lib/oakBridgeOnce";

export const isWork = (facts: OakRecordFact): facts is OakWorkFacts => facts.kind === "work" && typeof (facts as OakWorkFacts).dek === "string";

/** The one rule for a bridge Quote's invitation: a topic match whose record facts are loaded as Work, an allowed proposal, none from a Proposal block, and the slot not spent. */
export function oakBridgeInvitationDraws(text: string, knowledgeRevision: string, messageId: string, proposal: unknown, blockProposes: boolean) {
  const topic = oakBridgeTopicFor(text);
  if (!topic || !proposal || blockProposes || !oakBridgeOpen("invitation", messageId)) return false;
  const state = oakRecordFactsState(topic.documentId, knowledgeRevision);
  return state.status === "loaded" && isWork(state.facts);
}
