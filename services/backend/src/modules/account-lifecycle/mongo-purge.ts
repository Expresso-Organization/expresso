import { randomUUID } from "node:crypto";

import { mongoCollections } from "@expresso/database";

import type { MongoTransaction } from "../../platform/mongo-transaction.js";

const RAW_COLLECTIONS = ["analytics_event_receipts", "visit_events", "conversion_events", "section_views"] as const;
const AGGREGATE_COLLECTIONS = ["metrics_daily", "insights", "analytics_rate_limits"] as const;
const DOMAIN_COLLECTIONS = [
  "annotations", "interview_sessions", "questions", "career_categories", "career_records", "answers",
  "answer_record_changes", "recipes", "recipe_sections", "portfolio_sections", "blocks", "brew_jobs",
  "brew_sources", "career_views", "company_research_items", "consents", "dashboard_views", "deployment_slug_redirects",
  "derived_metrics", "export_assets", "export_jobs", "generated_pages", "generation_jobs", "recipe_items",
  "recipe_evidence_paths", "generation_sentence_evidence", "usage_counters", "generation_usage_ledger",
  "identity_oauth_accounts", "identity_sessions", "interests", "layout_specs", "match_scores", "media_assets",
  "media_variants", "notifications", "outbox_events", "portfolio_edit_proposals", "portfolio_snapshots",
  "recent_searches", "recipe_revisions", "recipe_unused_sources", "record_links", "record_usages",
  "requirement_coverages", "revisions", "saved_searches", "skills", "skill_evidence", "snapshot_chunks",
  "brews", "job_analyses", "portfolios", "deployments",
] as const;

async function erase(tx: MongoTransaction, names: readonly string[], userId: string) {
  let affected = 0;
  for (const name of names) affected += (await tx.db.collection(name).deleteMany({ userId }, { session: tx.session })).deletedCount;
  return affected;
}

export async function purgePhase(tx: MongoTransaction, requestId: string, userId: string, phase: string, at: Date) {
  let affected = 0;
  if (phase === "access_revoked") affected = await erase(tx, RAW_COLLECTIONS, userId);
  else if (phase === "analytics_raw_purged") affected = await erase(tx, AGGREGATE_COLLECTIONS, userId);
  else if (phase === "analytics_aggregate_purged") affected = await erase(tx, DOMAIN_COLLECTIONS, userId);
  else if (phase === "domain_data_purged") affected = (await mongoCollections(tx.db).users.deleteOne({ _id: userId }, { session: tx.session })).deletedCount;
  else return false;
  const next = phase === "access_revoked" ? "analytics_raw_purged" : phase === "analytics_raw_purged" ? "analytics_aggregate_purged" : phase === "analytics_aggregate_purged" ? "domain_data_purged" : "complete";
  // complete는 재시작을 위한 내부 cursor일 뿐 사용자 데이터 처리 사건이 아니다.
  // 마지막 실제 사건은 request를 닫는 account_purged에서 한 번만 남긴다.
  if (next !== "complete") {
    await mongoCollections(tx.db).accountDeletionEvents.updateOne(
      { requestId, phase: next },
      { $setOnInsert: { _id: randomUUID(), requestId, phase: next, affectedRows: affected, occurredAt: at } },
      { session: tx.session, upsert: true },
    );
  }
  await mongoCollections(tx.db).accountDeletionRequests.updateOne({ _id: requestId, status: "pending", phase }, { $set: { phase: next } }, { session: tx.session });
  return true;
}
