import type { ConsultantDiagnosis, DiagnosisItem, GoalDemand } from "@expresso/contracts";
import { mongoCollections, type ConsultantDiagnosisDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { ConsultantInputError } from "./commitments.js";

/** 대조 결과 한 줄. 근거에는 서버가 확인한 기록 제목이 붙어 온다. */
export interface DiagnosisAssessment { itemId: string; status: DiagnosisItem["status"]; evidence: DiagnosisItem["evidence"]; note: string }
/** 다시 진단이 필요한지 가를 때 견주는 지금의 상태. 목표는 `career`가, 기록이 마지막으로 바뀐 때는 기록을 가진 쪽이 준다. */
export interface DiagnosisNow { work: string | null; recordsChangedAt: Date | null }

const same = (left: string, right: string) => left.normalize("NFKC").replace(/\s+/g, " ").trim() === right.normalize("NFKC").replace(/\s+/g, " ").trim();

function view(row: ConsultantDiagnosisDoc, now?: DiagnosisNow): ConsultantDiagnosis {
  // 목표가 바뀌었으면 이 진단은 다른 목표의 것이다. 목표가 같고 대조한 뒤에 기록이 바뀌었으면 상태가 낡았을 수 있다.
  const stale = !now ? null : now.work === null || !same(now.work, row.work) ? "goal" as const : row.assessedAt && now.recordsChangedAt && now.recordsChangedAt > row.assessedAt ? "records" as const : null;
  return {
    work: row.work, family: row.family, basis: row.basis, focus: row.focus, level: row.level, sampleSize: row.sampleSize, companyCount: row.companyCount, interestedCount: row.interestedCount, small: row.small,
    summary: row.summary, items: row.items, demandAt: row.demandAt.toISOString(), assessedAt: row.assessedAt?.toISOString() ?? null, stale,
  };
}

/**
 * 진단의 저장 — 사용자마다 하나.
 *
 * 집계(`saveDemand`)가 표본과 항목을 정하고, 대조(`assess`)가 항목의 상태와 근거를 채운다.
 * 근거 인용이 기록에 있는지는 부르는 쪽(대화 서비스)이 확인한 뒤에 넘긴다. 읽기 · 쓰기는 모두 `userId`로 거른다.
 */
export class ConsultantDiagnoses {
  constructor(private readonly db: MongoContext) {}
  private get rows() { return mongoCollections(this.db.db).consultantDiagnoses; }

  /** 저장된 진단. 없으면 null. `now`를 주면 다시 진단이 필요한지를 함께 낸다. */
  async current(userId: string, now?: DiagnosisNow): Promise<ConsultantDiagnosis | null> {
    const row = await this.rows.findOne({ _id: userId, userId });
    return row ? view(row, now) : null;
  }

  /**
   * 새 집계를 저장한다. 같은 목표의 앞선 진단에 같은 항목이 있으면 그 상태 · 근거 · 메모를 이어받는다 —
   * 사용자가 「해 본 적 없다」고 답한 항목을 다시 묻지 않기 위해서다. 목표가 바뀌었으면 이어받지 않는다.
   */
  async saveDemand(userId: string, demand: GoalDemand, at = new Date()): Promise<ConsultantDiagnosis> {
    const before = await this.rows.findOne({ _id: userId, userId });
    const carry = before && same(before.work, demand.work) ? new Map(before.items.map(item => [item.id, item])) : new Map<string, ConsultantDiagnosisDoc["items"][number]>();
    const items = demand.items.map(item => { const kept = carry.get(item.id); return { ...item, status: kept?.status ?? "unconfirmed" as const, evidence: kept?.evidence ?? [], note: kept?.note ?? "" }; });
    const carried = items.some(item => item.status !== "unconfirmed");
    const row: ConsultantDiagnosisDoc = {
      _id: userId, userId, work: demand.work, family: demand.family, basis: demand.basis, focus: demand.focus, level: demand.level,
      sampleSize: demand.sampleSize, companyCount: demand.companyCount, interestedCount: demand.interestedCount, small: demand.small,
      summary: carried ? before!.summary : "", items, demandAt: at, assessedAt: carried ? before!.assessedAt : null, updatedAt: at,
    };
    await this.rows.replaceOne({ _id: userId, userId }, row, { upsert: true });
    return view(row);
  }

  /** 대조 결과를 반영한다. 적지 않은 항목은 앞선 상태를 둔다. 집계가 없거나 모르는 항목이면 받지 않는다. */
  async assess(userId: string, summary: string, assessments: readonly DiagnosisAssessment[], at = new Date()): Promise<ConsultantDiagnosis> {
    const row = await this.rows.findOne({ _id: userId, userId });
    if (!row) throw new ConsultantInputError("아직 집계가 없습니다. read_goal_demand를 먼저 부르십시오.");
    const known = new Set(row.items.map(item => item.id));
    const unknown = assessments.filter(item => !known.has(item.itemId)).map(item => item.itemId);
    if (unknown.length) throw new ConsultantInputError(`집계에 없는 항목입니다: ${unknown.join(", ")}. read_goal_demand가 돌려준 id만 쓰십시오.`);
    const by = new Map(assessments.map(item => [item.itemId, item]));
    const items = row.items.map(item => { const next = by.get(item.id); return next ? { ...item, status: next.status, evidence: next.evidence, note: next.note } : item; });
    await this.rows.updateOne({ _id: userId, userId }, { $set: { summary, items, assessedAt: at, updatedAt: at } });
    return view({ ...row, summary, items, assessedAt: at, updatedAt: at });
  }
}
