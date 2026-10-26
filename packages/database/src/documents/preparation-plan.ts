import type { PreparationPlan } from "@expresso/contracts";
export type PreparationPlanDoc = Omit<PreparationPlan, "id" | "createdAt" | "updatedAt"> & { _id: string; userId: string; createdAt: Date; updatedAt: Date };
