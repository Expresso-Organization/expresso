import type { AgentConversation } from "@expresso/contracts";
export type AgentConversationDoc = Omit<AgentConversation, "id"> & { _id: string; userId: string; heartbeatAt: Date };
