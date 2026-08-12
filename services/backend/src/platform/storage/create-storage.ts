import type { RuntimeConfig } from "../../config/runtime-config.js";
import type { MediaStorage } from "./client.js";
import { LocalMediaStorage } from "./local.js";

/**
 * 설정에서 저장소를 만든다.
 *
 * AI 프로바이더와 같은 모양이다 — 개발용 어댑터가 하나 있고, 운영 어댑터는
 * 자리만 있다. 다른 점은 **끌 수 없다**는 것이다: AI가 없으면 규칙 기반
 * 폴백으로 돌지만, 저장소가 없으면 올린 그림을 둘 곳이 없다.
 */
export function createMediaStorage(config: RuntimeConfig): MediaStorage {
  const provider = config.mediaProvider ?? "local";
  if (provider === "local") return new LocalMediaStorage(config.mediaDir ?? "var/media");
  // `s3`는 객체 저장소 어댑터 자리다. 아직 없다 — 여러 대로 늘리기 전에 채운다.
  throw new Error(`media provider "${provider}" is not implemented yet`);
}
