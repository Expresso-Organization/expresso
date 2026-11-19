import { randomUUID } from "node:crypto";
import { CONSULTANT_COMMITMENT_LIMIT, type AgentCommitmentInput, type CommitmentCheckinAnswer, type ConsultantCommitment } from "@expresso/contracts";
import { mongoCollections, type ConsultantCommitmentDoc, type ConsultantProfileDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";

/** 서울 날짜(`YYYY-MM-DD`). 약속의 날짜와 「오늘」은 사용자가 사는 날을 기준으로 한다. */
export const seoulDay = (at: Date) => new Date(at.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
/** 그 날에서 `days`일 뒤의 날짜. */
export const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** 첫 확인 뒤 답이 없을 때 한 번 더 묻기까지의 날 수. 두 번 묻고 답이 없으면 더 묻지 않는다. */
export const REMINDER_DAYS = 3;
/** 대화가 이만큼 없으면 한 번 연락한다. 같은 일로 다시 연락하기까지의 간격이기도 하다. */
export const QUIET_DAYS = 14;

/** 약속을 받을 수 없는 입력. 에이전트는 사유를 보고 고쳐 다시 부르고, 화면은 그 문장을 보인다. */
export class ConsultantInputError extends Error { readonly statusCode = 409; get publicMessage() { return this.message; } }
export class ConsultantNotFoundError extends Error { readonly statusCode = 404; readonly publicMessage = "약속을 찾을 수 없습니다."; constructor() { super("약속을 찾을 수 없습니다."); } }

const view = (row: ConsultantCommitmentDoc): ConsultantCommitment => ({ id: row._id, title: row.title, detail: row.detail, dueOn: row.dueOn, status: row.status, awaiting: row.awaiting, conversationId: row.conversationId, createdAt: row.createdAt.toISOString() });

/**
 * 이 날짜로는 첫 확인인가. 날짜를 미루면 새 날짜에 다시 한 번 묻고 3일 뒤에 한 번 더 묻는다 —
 * 앞선 날짜에 물은 것은 세지 않는다.
 */
const firstCheck = (row: Pick<ConsultantCommitmentDoc, "checks" | "dueOn">) => !row.checks.some(check => check.on >= row.dueOn);

/** 확인 작업이 바깥에서 받는 것. 마지막 대화 시각은 대화를 가진 모듈이, 알림은 알림 모듈이 준다. */
export interface CheckinDependencies {
  lastConversationAt(userId: string): Promise<Date | null>;
  notify(userId: string, subject: string | null, dedupeKey: string, at: Date): Promise<unknown>;
}

/**
 * 약속과 먼저 연락하기.
 *
 * 약속은 사용자가 하겠다고 한 일이다. 컨설턴트는 약속한 날에 한 번 묻고, 답이 없으면 3일 뒤에 한 번 더 묻고 멈춘다.
 * 먼저 연락하기를 켠 사용자에게만 묻는다. 읽기 · 쓰기는 모두 `userId`로 거른다.
 */
export class ConsultantCommitments {
  constructor(private readonly db: MongoContext) {}
  private get rows() { return mongoCollections(this.db.db).consultantCommitments; }
  private get profiles() { return mongoCollections(this.db.db).consultantProfiles; }

  /** 열린 약속. 날짜가 이른 순서. */
  async open(userId: string): Promise<ConsultantCommitment[]> {
    return (await this.rows.find({ userId, status: "open" }).sort({ dueOn: 1, createdAt: 1 }).limit(CONSULTANT_COMMITMENT_LIMIT).toArray()).map(view);
  }

  /** 약속 하나. 닫힌 약속도 돌려준다 — 대화의 약속 카드가 지금 상태를 읽는다. */
  async get(userId: string, id: string): Promise<ConsultantCommitment> {
    const row = await this.rows.findOne({ _id: id, userId });
    if (!row) throw new ConsultantNotFoundError();
    return view(row);
  }

  async create(userId: string, input: AgentCommitmentInput, conversationId: string | null, at = new Date()): Promise<ConsultantCommitment> {
    const today = seoulDay(at);
    if (input.dueOn < today) throw new ConsultantInputError(`dueOn이 오늘(${today})보다 앞입니다. 오늘이나 그 뒤의 날짜로 넣으십시오.`);
    if (await this.rows.countDocuments({ userId, status: "open" }) >= CONSULTANT_COMMITMENT_LIMIT) throw new ConsultantInputError(`열린 약속이 ${CONSULTANT_COMMITMENT_LIMIT}개입니다. 끝난 약속을 닫은 뒤 새로 잡으십시오.`);
    const row: ConsultantCommitmentDoc = { _id: randomUUID(), userId, title: input.title, detail: input.detail ?? "", dueOn: input.dueOn, status: "open", awaiting: false, nextCheckOn: input.dueOn, checks: [], conversationId, createdAt: at, updatedAt: at };
    await this.rows.insertOne(row);
    return view(row);
  }

  /**
   * 약속을 고친다. 날짜를 바꾸면 그날 다시 묻고, 닫으면(했음 · 하지 않기로 함) 더 묻지 않는다.
   * 닫힌 약속은 고치지 않는다 — 같은 값으로 닫는 요청은 그대로 돌려준다.
   */
  async update(userId: string, id: string, change: { dueOn?: string | undefined; status?: "done" | "dropped" | undefined }, at = new Date()): Promise<ConsultantCommitment> {
    const row = await this.rows.findOne({ _id: id, userId });
    if (!row) throw new ConsultantNotFoundError();
    if (row.status !== "open") { if (change.status === row.status && !change.dueOn) return view(row); throw new ConsultantInputError("이미 닫힌 약속입니다."); }
    if (change.status) {
      await this.rows.updateOne({ _id: id, userId }, { $set: { status: change.status, awaiting: false, nextCheckOn: null, updatedAt: at } });
    } else if (change.dueOn) {
      const today = seoulDay(at);
      if (change.dueOn < today) throw new ConsultantInputError(`오늘(${today})이나 그 뒤의 날짜로 정해 주세요.`);
      await this.rows.updateOne({ _id: id, userId }, { $set: { dueOn: change.dueOn, nextCheckOn: change.dueOn, awaiting: false, updatedAt: at } });
    }
    return view((await this.rows.findOne({ _id: id, userId }))!);
  }

  /** 확인 카드에서 한 답. 「아직이에요」는 새 날짜로 미루고, 나머지는 약속을 닫는다. 대화를 여는 일은 부른 쪽이 한다. */
  async answer(userId: string, id: string, answer: CommitmentCheckinAnswer, at = new Date()): Promise<ConsultantCommitment> {
    if (answer.answer === "not_yet") return this.update(userId, id, { dueOn: answer.dueOn }, at);
    return this.update(userId, id, { status: answer.answer }, at);
  }

  /** 홈이 읽는 연락 — 답을 기다리는 약속과, 대화가 없어 건넨 연락. */
  async checkins(userId: string, at = new Date()) {
    const profile = await this.profiles.findOne({ _id: userId, userId }, { projection: { outreach: 1 } });
    const awaiting = profile?.outreach?.enabled ? await this.rows.find({ userId, status: "open", awaiting: true }).sort({ dueOn: 1 }).limit(CONSULTANT_COMMITMENT_LIMIT).toArray() : [];
    return { outreach: profile?.outreach?.enabled ?? null, today: seoulDay(at), commitments: awaiting.map(view), quiet: !!profile?.outreach?.enabled && !!profile.outreach.quiet };
  }

  /** 대화가 없어 건넨 연락을 사용자가 봤다. 다음 연락은 2주 뒤다. */
  async dismissQuiet(userId: string, at = new Date()) {
    await this.profiles.updateOne({ _id: userId, userId, "outreach.quiet": true }, { $set: { "outreach.quiet": false, updatedAt: at } });
  }

  /**
   * 하루 한 번 도는 확인 작업. 먼저 연락하기를 켠 사용자마다:
   * 물을 날이 된 약속을 답 대기로 표시하고(첫 확인이면 3일 뒤에 한 번 더, 두 번째면 그만),
   * 대화가 2주 넘게 없으면 연락을 남기고, 알림은 하루에 한 건만 만든다.
   * 한 사용자가 실패해도 나머지는 계속한다.
   */
  async runCheckins(dependencies: CheckinDependencies, at = new Date()) {
    const today = seoulDay(at);
    const profiles = await this.profiles.find({ "outreach.enabled": true }).project<Pick<ConsultantProfileDoc, "_id" | "userId" | "outreach">>({ userId: 1, outreach: 1 }).toArray();
    let asked = 0; let quiet = 0; let notified = 0; let failed = 0;
    for (const profile of profiles) {
      try {
        const outreach = profile.outreach!;
        const due = await this.rows.find({ userId: profile.userId, status: "open", nextCheckOn: { $ne: null, $lte: today } }).sort({ dueOn: 1 }).toArray();
        for (const row of due) {
          await this.rows.updateOne({ _id: row._id, userId: profile.userId, status: "open" }, { $set: { awaiting: true, nextCheckOn: firstCheck(row) ? addDays(today, REMINDER_DAYS) : null, updatedAt: at }, $push: { checks: { on: today, at } } });
          asked += 1;
        }
        // 대화가 없을 때의 연락. 한 번도 대화하지 않았으면 먼저 연락하기를 정한 날부터 센다.
        const last = (await dependencies.lastConversationAt(profile.userId)) ?? outreach.decidedAt;
        const silentSince = seoulDay(last);
        const nudge = !outreach.quiet && addDays(silentSince, QUIET_DAYS) <= today && (!outreach.lastQuietOn || addDays(outreach.lastQuietOn, QUIET_DAYS) <= today);
        if (nudge) quiet += 1;
        const notify = (due.length > 0 || nudge) && outreach.lastNotifiedOn !== today;
        if (nudge || notify) await this.profiles.updateOne({ _id: profile._id, userId: profile.userId }, { $set: { ...(nudge ? { "outreach.quiet": true, "outreach.lastQuietOn": today } : {}), ...(notify ? { "outreach.lastNotifiedOn": today } : {}), updatedAt: at } });
        if (notify) { await dependencies.notify(profile.userId, due[0]?.title ?? null, `consultant:${today}`, at); notified += 1; }
      } catch (error) {
        failed += 1;
        console.error(JSON.stringify({ level: "warn", event: "consultant_checkin.failed", userId: profile.userId, message: error instanceof Error ? error.message : String(error) }));
      }
    }
    return { users: profiles.length, asked, quiet, notified, failed };
  }
}
