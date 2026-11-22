import { z } from 'zod';

const version = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const deleteSavedConversationRequestSchema = z.strictObject({
  intent: z.literal('explicit-delete'), conversationId: z.uuid(), expectedVersion: version, operationId: z.uuid(),
});
export type DeleteSavedConversationRequest = z.infer<typeof deleteSavedConversationRequestSchema>;
export const savedConversationRemovalSchema = z.strictObject({
  conversationId: z.uuid(), operationId: z.uuid(), removedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  lastVersion: version, reason: z.enum(['deleted', 'expired']),
  applicationHistory: z.literal('removed'), cleanup: z.literal('complete'), result: z.enum(['removed', 'already-removed']),
});
export type SavedConversationRemoval = z.infer<typeof savedConversationRemovalSchema>;
