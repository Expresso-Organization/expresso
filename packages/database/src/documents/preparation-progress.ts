import type { PreparationProgress, PreparationReplan } from "@expresso/contracts";
export interface PreparationProgressDoc { _id: string; userId: string; conversationId: string; version: number; result: PreparationProgress }
export interface PreparationProgressEventDoc { _id: string; userId: string; conversationId: string; planId: string; requestId: string; fingerprint: string; taskId: string; resultVersion: number; createdAt: Date }
export interface PreparationReplanDoc { _id: string; userId: string; conversationId: string; planId: string; requestId: string; fingerprint: string; version: number; status: PreparationReplan["status"]; createdAt: Date; result: PreparationReplan }
