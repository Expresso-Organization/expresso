import type { CareerWorkflow } from "@expresso/contracts";
export interface CareerWorkflowDoc { _id: string; userId: string; conversationId: string; requestId: string; inputHash: string; version: number; createdAt: Date; result: CareerWorkflow }
