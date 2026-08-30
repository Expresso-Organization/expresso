import type { CompanyResearchService as LegacyCompanyResearchService } from "./legacy-mysql-service.js";
export { CompanyResearchService } from "./service.js";
export { MongoCompanyResearchService } from "./service.js";
export type CompanyResearchApi = Pick<LegacyCompanyResearchService, keyof LegacyCompanyResearchService>;
export { CompanyResearchError } from "./public.js";
