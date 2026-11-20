import { randomUUID } from "node:crypto";
import { CONSULTANT_PREFERENCE_LIMIT, type AgentMemoryUpdateInput, type ConsultantPreference, type ConsultantStage } from "@expresso/contracts";
import { mongoCollections, type ConsultantProfileDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";

/** 사용자의 프로필 가운데 화면과 에이전트가 읽는 것. 문서가 없는 사용자는 비어 있다. */
export interface ConsultantProfile {
  stage: ConsultantStage | null;
  stageSource: "agent" | "user" | null;
  stageUpdatedAt: string | null;
  preferences: ConsultantPreference[];
}

/** 조건을 더 기억할 수 없다. 에이전트는 사용자에게 알리고, 지울 조건을 묻는다. */
export class ConsultantLimitError extends Error {
  constructor() { super(`기억하는 조건이 ${CONSULTANT_PREFERENCE_LIMIT}개입니다. 더 기억하려면 쓰지 않는 조건을 지워야 합니다.`); }
}

const EMPTY: ConsultantProfile = { stage: null, stageSource: null, stageUpdatedAt: null, preferences: [] };
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
const view = (row: ConsultantProfileDoc | null): ConsultantProfile => row ? {
  stage: row.stage, stageSource: row.stageSource, stageUpdatedAt: row.stageUpdatedAt?.toISOString() ?? null,
  preferences: row.preferences.map(item => ({ id: item.id, kind: item.kind, text: item.text, source: item.source, createdAt: item.createdAt.toISOString() })),
} : EMPTY;

/**
 * 컨설턴트 프로필 — 구직 단계와, 사용자가 원하거나 피하는 조건.
 *
 * 문서는 처음 고칠 때 만든다. 읽기 · 쓰기는 모두 `userId`로 거른다.
 */
export class ConsultantService {
  constructor(private readonly db: MongoContext) {}
  private get rows() { return mongoCollections(this.db.db).consultantProfiles; }

  async profile(userId: string): Promise<ConsultantProfile> {
    return view(await this.rows.findOne({ _id: userId, userId }));
  }

  /** 문서가 없으면 빈 프로필로 만든다. 동시에 두 번 불려도 하나만 생긴다. */
  private async ensure(userId: string, at: Date) {
    await this.rows.updateOne({ _id: userId, userId }, { $setOnInsert: { stage: null, stageSource: null, stageUpdatedAt: null, preferences: [], createdAt: at }, $set: { updatedAt: at } }, { upsert: true });
  }

  async setStage(userId: string, stage: ConsultantStage, source: "agent" | "user", at = new Date()): Promise<ConsultantProfile> {
    await this.ensure(userId, at);
    await this.rows.updateOne({ _id: userId, userId }, { $set: { stage, stageSource: source, stageUpdatedAt: at, updatedAt: at } });
    return this.profile(userId);
  }

  async removePreference(userId: string, preferenceId: string, at = new Date()): Promise<ConsultantProfile> {
    await this.rows.updateOne({ _id: userId, userId }, { $pull: { preferences: { id: preferenceId } }, $set: { updatedAt: at } });
    return this.profile(userId);
  }

  /**
   * 에이전트가 대화에서 알게 된 것을 적는다. 단계 · 새 조건 · 거둔 조건을 한 번에 받는다.
   *
   * 글이 같은 조건(공백 차이는 무시)은 다시 넣지 않는다. 지운 뒤 더했을 때 한도를 넘으면 아무것도 바꾸지 않고 던진다.
   * `changed`는 실제로 바뀐 것만 센다 — 이미 그 단계였거나 이미 기억하는 조건이면 0이다.
   */
  async applyUpdate(userId: string, update: AgentMemoryUpdateInput, at = new Date()): Promise<{ profile: ConsultantProfile; changed: { stage: ConsultantStage | null; remembered: number; forgotten: number } }> {
    await this.ensure(userId, at);
    const row = (await this.rows.findOne({ _id: userId, userId }))!;
    const forget = new Set(update.forget ?? []);
    const kept = row.preferences.filter(item => !forget.has(item.id));
    const known = new Set(kept.map(item => `${item.kind}:${normalize(item.text)}`));
    const added: ConsultantProfileDoc["preferences"] = [];
    for (const item of update.remember ?? []) {
      const key = `${item.kind}:${normalize(item.text)}`;
      if (known.has(key)) continue;
      known.add(key);
      added.push({ id: randomUUID(), kind: item.kind, text: normalize(item.text), source: "chat", createdAt: at });
    }
    if (kept.length + added.length > CONSULTANT_PREFERENCE_LIMIT) throw new ConsultantLimitError();
    const stage = update.stage && update.stage !== row.stage ? update.stage : null;
    await this.rows.updateOne({ _id: userId, userId }, { $set: { preferences: [...kept, ...added], ...(stage ? { stage, stageSource: "agent" as const, stageUpdatedAt: at } : {}), updatedAt: at } });
    return { profile: await this.profile(userId), changed: { stage, remembered: added.length, forgotten: row.preferences.length - kept.length } };
  }
}
