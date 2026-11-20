import type { ConsultantStage } from "@expresso/contracts";

/**
 * 컨설턴트가 한 사용자에 대해 이어 가는 기억. 사용자당 한 문서이고 `_id`가 사용자 id다.
 *
 * - `stage`는 구직 단계다. 아직 모르면 null. `stageSource`는 마지막으로 정한 쪽이다.
 * - `preferences`는 사용자가 원하거나 피하는 조건이다. 30개까지.
 *
 * 처음 고칠 때 만든다. 문서가 없는 사용자의 기억은 비어 있다.
 */
export interface ConsultantProfileDoc {
  _id: string;
  userId: string;
  stage: ConsultantStage | null;
  stageSource: "agent" | "user" | null;
  stageUpdatedAt: Date | null;
  preferences: { id: string; kind: "prefer" | "avoid"; text: string; source: "chat" | "user"; createdAt: Date }[];
  createdAt: Date;
  updatedAt: Date;
}
