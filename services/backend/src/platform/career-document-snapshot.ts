import type { CareerDocumentSnapshotDoc } from "@expresso/database";
import { encodeDocumentAsYUpdate, parseCareerDocument } from "@expresso/editor";

/** 이전 JSON 전용 스냅샷도 읽되 새 스냅샷의 실제 인과 상태를 우선 사용합니다. */
export function readCareerSnapshotUpdate(snapshot: Pick<CareerDocumentSnapshotDoc, "content" | "stateUpdate">): Uint8Array {
  return snapshot.stateUpdate
    ? new Uint8Array(snapshot.stateUpdate.value())
    : encodeDocumentAsYUpdate(parseCareerDocument(snapshot.content));
}
