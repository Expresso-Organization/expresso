import { createHmac } from "node:crypto";

/**
 * 따로 정하지 않은 서명 비밀값을 ASSET_SIGNING_SECRET에서 용도별로 파생합니다.
 * 저장소에 적힌 고정 문자열을 운영에서 그대로 쓰면 누구나 커서 · 미리보기 토큰을 만들 수 있습니다.
 * ASSET_SIGNING_SECRET도 없으면(로컬 개발) 용도 이름을 담은 개발용 값을 씁니다.
 */
export function derivedSecret(purpose: string, environment: NodeJS.ProcessEnv = process.env): string {
  const base = environment.ASSET_SIGNING_SECRET;
  return base ? createHmac("sha256", base).update(`expresso:${purpose}`).digest("hex") : `expresso-local-${purpose}`;
}
