import { createHash } from "node:crypto";

import { JOB_CAREER_MATCH_PROMPT_VERSION } from "./analyzer.js";
import type { JobCareerMatchInput } from "./input-loader.js";

export function createJobCareerMatchInputFingerprint(
  input: JobCareerMatchInput,
): string {
  // AI에 전달하는 정보와 같은 구조를 사용합니다.
  const source = {
    promptVersion: JOB_CAREER_MATCH_PROMPT_VERSION,
    job: input.job,
    records: input.records,
    inputTruncated: input.inputSnapshot.inputTruncated,
  };

  return createHash("sha256")
    .update(JSON.stringify(source))
    .digest("hex");
}