export { JobCareerMatchError } from "./public.js";

export { JobCareerMatchInputLoader } from "./input-loader.js";
export type {
  JobCareerMatchInput,
  MatchCareerInput,
} from "./input-loader.js";

export {
  JobCareerMatchAnalyzer,
  JOB_CAREER_MATCH_PROMPT_VERSION,
  validateJobCareerMatchEvidence,
} from "./analyzer.js";

export {
  createJobCareerMatchInputFingerprint,
} from "./input-fingerprint.js";

export { JobCareerMatchService } from "./service.js";

export type JobCareerMatchApi = Pick<
  import("./service.js").JobCareerMatchService,
  "analyze" | "getLatest"
>;