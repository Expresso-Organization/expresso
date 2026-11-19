import type { CareerRecordListItem } from "@expresso/contracts";

import { rawValue } from "./view-types";

/**
 * 채울 것이 남은 기록인가. 분류 화면의 「비어 있음」 필터와 홈의 제안이 같은 판정을 쓴다.
 * 프로젝트는 성과 속성이 비어 있으면, 그 밖의 분류는 제목 · 본문 · 속성이 모두 비어 있으면 참이다.
 */
export function isIncompleteRecord(record: CareerRecordListItem, categoryKey: string): boolean {
  if (categoryKey === "project") {
    const outcome = rawValue(record, "outcome");
    return !(typeof outcome === "string" ? outcome.trim() : outcome);
  }
  return record.isEmpty;
}
