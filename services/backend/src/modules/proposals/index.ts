import type { ProposalService } from "./service.js";
export { ProposalService } from "./service.js";
export { AiProposalWriter, type ProposalWriter } from "./writer.js";
export { registerProposalRoutes } from "./routes.js";
export type ProposalApi = Omit<ProposalService, "context">;
