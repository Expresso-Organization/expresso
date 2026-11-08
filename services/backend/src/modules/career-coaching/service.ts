import type { CareerCoachingDoc as StateDoc } from "@expresso/database";
import { randomUUID } from "node:crypto";
import { CoachingStateSchema, type CoachingState, type ExplorationInput, type CoachingFeedback } from "@expresso/contracts";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { requireActiveUser } from "../identity/index.js";
import type { AgentChatService } from "../agent-chat/index.js";
import { AnalyticsError, type AnalyticsApi } from "../analytics/index.js";
import { dashboardHash, explore, improvementDrafts } from "./logic.js";
export class CoachingError extends Error {
 constructor(readonly statusCode: number, message: string) { super(message); }
 /** 공통 오류 봉투에는 이 모듈이 정한 안내만 공개합니다. 내부 오류 원문은 노출하지 않습니다. */
 get publicDetails() { return { coachingMessage: this.message }; }
}
export const emptyCoaching = (): CoachingState => ({ version: 0, profile: null, candidates: [], feedback: [], appliedFeedback: [], improvements: [] });

export async function readCoaching(db: MongoContext, userId: string): Promise<CoachingState> {
 const row = await db.db.collection<StateDoc>("career_coaching").findOne({ _id: userId, userId });
 return row ? CoachingStateSchema.parse(row.state) : emptyCoaching();
}
export class CareerCoachingService {
 constructor(private readonly db: MongoContext, private readonly agent: Pick<AgentChatService,"get">, private readonly analytics: Pick<AnalyticsApi,"dashboard">) {}
 async get(userId: string, conversationId: string) { await this.agent.get(userId, conversationId); return readCoaching(this.db,userId); }
 private async save(userId: string, expectedVersion: number, state: CoachingState) {
 const next = CoachingStateSchema.parse({ ...state, version: expectedVersion + 1 });
 return inTransaction(this.db, async tx => {
 await requireActiveUser(tx,userId);
 const rows = tx.db.collection<StateDoc>("career_coaching");
 try {
 const result = await rows.updateOne({ _id: userId, userId, "state.version": expectedVersion }, { $set: { state: next }, $setOnInsert: { userId } }, { session: tx.session, upsert: expectedVersion === 0 });
 if (!result.matchedCount && !result.upsertedCount) throw new CoachingError(409,"설정이 바뀌었습니다. 다시 불러오세요.");
 } catch(error) { if ((error as {code?:number}).code === 11000) throw new CoachingError(409,"다른 화면에서 설정이 바뀌었습니다. 다시 불러오세요."); throw error; }
 return next;
 });
 }
 async explore(userId: string, conversationId: string, version: number, profile: ExplorationInput) {
 const state=await this.get(userId,conversationId);
 return this.save(userId,version,{...state,profile,candidates:explore(profile,state.feedback),appliedFeedback:state.feedback.filter(f=>f.active).map(f=>`${f.kind}: ${f.label || f.target} — ${f.reason}`)});
 }
 async feedback(userId: string, conversationId: string, version: number, value: CoachingFeedback) {
 const state=await this.get(userId,conversationId);
 const feedback=[...state.feedback.filter(f=>f.id!==value.id),value];
 if(feedback.length>50) throw new CoachingError(409,"피드백은 최대 50개입니다. 기존 항목을 수정하세요.");
 return this.save(userId,version,{...state,feedback,candidates:state.profile?explore(state.profile,feedback):[],appliedFeedback:feedback.filter(f=>f.active).map(f=>`${f.kind}: ${f.label || f.target} — ${f.reason}`)});
 }
 private async dashboard(userId: string, portfolioId: string, period: "7d"|"30d"|"all") {
 try { return await this.analytics.dashboard(userId,portfolioId,period); }
 catch(error) {
 if(error instanceof AnalyticsError && error.statusCode===409 && error.message==="portfolio has never been published") throw new CoachingError(409,"아직 배포 이력이 없는 포트폴리오입니다. 방문 분석은 배포 이력과 방문 집계가 준비된 뒤 사용할 수 있습니다.");
 throw error;
 }
 }
 async analyticsDraft(userId: string, conversationId: string, version: number, portfolioId: string, period: "7d"|"30d"|"all") {
 const state=await this.get(userId,conversationId);
 const dashboard=await this.dashboard(userId,portfolioId,period);
 const drafts=improvementDrafts(dashboard,[randomUUID(),randomUUID(),randomUUID()]);
 if(!drafts.length) throw new CoachingError(409,"집계 완료와 충분한 방문 표본이 필요합니다. 기존 Analytics에서 확인하세요.");
 const existing=state.improvements.filter(p=>p.portfolioId!==portfolioId);
 return this.save(userId,version,{...state,improvements:[...drafts,...existing].slice(0,20)});
 }
 async decide(userId: string, conversationId: string, version: number, id: string, decision: "approved"|"rejected") {
 const state=await this.get(userId,conversationId);const draft=state.improvements.find(p=>p.id===id);
 if(!draft || draft.status!=="pending") throw new CoachingError(409,"승인 대기 중인 초안을 다시 확인하세요.");
 // 승인 직전 소유권과 지표 최신성을 기존 Analytics 서비스에서 재확인합니다.
 const current=await this.dashboard(userId,draft.portfolioId,draft.period);
 if(decision==="approved" && dashboardHash(current)!==draft.sourceHash) throw new CoachingError(409,"분석 기간 또는 지표가 바뀌었습니다. 초안을 다시 만드세요.");
 return this.save(userId,version,{...state,improvements:state.improvements.map(p=>p.id===id?{...p,status:decision}:p)});
 }
}
