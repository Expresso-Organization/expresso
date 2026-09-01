import type { RuntimeConfig } from "../../../config/runtime-config.js";
import type { JobSourceAdapter } from "./adapter.js";
import { GreenhouseAdapter } from "./greenhouse.js";
import { GreetingAdapter } from "./greeting.js";
import { LeverAdapter } from "./lever.js";
import { WorkableAdapter } from "./workable.js";
import { Work24Adapter } from "./work24.js";
import { Work24WebAdapter } from "./work24-web.js";

export { JobIngestService } from "./service.js";
export { MongoJobIngestService } from "./service.js";
export { JobUrlImporter } from "./url-import.js";
export { AiFactsReader } from "./facts.js";
export { BundledMarkReader, SiteMarkReader } from "./logo.js";
export type { JobSourceAdapter, RawPosting } from "./adapter.js";

/**
 * 이 설정으로 쓸 수 있는 어댑터.
 *
 * 키가 없는 프로바이더는 **목록에서 빠진다.** 켜져 있는 척하면 수집이 매일
 * 조용히 0건을 모으고 성공했다고 적는다 — 없는 것은 없다고 말해야 한다.
 */
export function createJobSourceAdapters(config: RuntimeConfig): JobSourceAdapter[] {
  // ATS 공개 보드와 고용24 목록은 인증이 없다 — 설정과 무관하게 늘 선다.
  const adapters: JobSourceAdapter[] = [
    new GreenhouseAdapter(),
    new GreetingAdapter(),
    new LeverAdapter(),
    new WorkableAdapter(),
    new Work24WebAdapter(),
  ];
  if (config.work24ApiKey) adapters.push(new Work24Adapter(config.work24ApiKey));
  return adapters;
}

import type { JobIngestService as LegacyJobIngestService } from "./legacy-mysql-service.js";
export type JobIngestApi = Pick<LegacyJobIngestService, keyof LegacyJobIngestService>;
