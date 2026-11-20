import type { ConsultantService } from "./service.js";
export { ConsultantLimitError, ConsultantService, type ConsultantProfile } from "./service.js";
export { registerConsultantRoutes } from "./routes.js";
export type ConsultantApi = Pick<ConsultantService, "profile" | "setStage" | "removePreference" | "applyUpdate">;
