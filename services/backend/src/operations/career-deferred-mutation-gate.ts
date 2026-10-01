import { pathToFileURL } from "node:url";

import type { Job, JobType, Queue } from "bullmq";
import type { Document } from "mongodb";

import { loadRuntimeConfig } from "../config/runtime-config.js";
import { createMongoResource } from "../platform/mongodb.js";
import { createReliableQueue, type DeadLetterJob } from "../platform/queue.js";

export const CAREER_DEFERRED_MUTATION_TOPICS = [
  "career.property-conversion",
  "career.property-default",
  "career.property-deletion",
  "career.property-restoration",
] as const;

type DeferredMutationTopic = (typeof CAREER_DEFERRED_MUTATION_TOPICS)[number];
type GateSource = "mongo_outbox" | "bullmq" | "bullmq_dead_letter";

export interface DeferredMutationGateEntry {
  id: string;
  topic: string;
  state: string;
}

export interface DeferredMutationRisk extends DeferredMutationGateEntry {
  source: GateSource;
}

export interface DeferredMutationGateReaders {
  listOutboxEvents(): Promise<DeferredMutationGateEntry[]>;
  listQueueJobs(): Promise<DeferredMutationGateEntry[]>;
  listDeadLetterJobs(): Promise<DeferredMutationGateEntry[]>;
}

const topicSet = new Set<string>(CAREER_DEFERRED_MUTATION_TOPICS);

export async function checkCareerDeferredMutationDrain(readers: DeferredMutationGateReaders): Promise<{
  safe: boolean;
  risks: DeferredMutationRisk[];
}> {
  const [outboxEvents, queueJobs, deadLetterJobs] = await Promise.all([
    readers.listOutboxEvents(),
    readers.listQueueJobs(),
    readers.listDeadLetterJobs(),
  ]);
  const risks = [
    ...outboxEvents.map((entry) => ({ source: "mongo_outbox" as const, ...entry })),
    ...queueJobs.map((entry) => ({ source: "bullmq" as const, ...entry })),
    ...deadLetterJobs.map((entry) => ({ source: "bullmq_dead_letter" as const, ...entry })),
  ].filter((entry) => topicSet.has(entry.topic));
  return { safe: risks.length === 0, risks };
}

const mainQueueStates: ReadonlyArray<{ query: JobType; report: string }> = [
  { query: "wait", report: "waiting" },
  { query: "delayed", report: "delayed" },
  { query: "active", report: "active" },
  { query: "prioritized", report: "prioritized" },
  { query: "waiting-children", report: "waiting-children" },
  { query: "failed", report: "failed" },
];

const deadLetterQueueStates: ReadonlyArray<{ query: JobType; report: string }> = [
  ...mainQueueStates,
  { query: "completed", report: "completed" },
];

async function listMainQueueJobs(queue: Queue<Record<string, unknown>>): Promise<DeferredMutationGateEntry[]> {
  const entries: DeferredMutationGateEntry[] = [];
  for (const state of mainQueueStates) {
    const jobs = await queue.getJobs([state.query], 0, -1, true);
    entries.push(...jobs.map((job) => ({ id: job.id ?? "unknown", topic: job.name, state: state.report })));
  }
  return entries;
}

async function listDeadLetterQueueJobs(queue: Queue<DeadLetterJob>): Promise<DeferredMutationGateEntry[]> {
  const entries: DeferredMutationGateEntry[] = [];
  for (const state of deadLetterQueueStates) {
    const jobs: Array<Job<DeadLetterJob>> = await queue.getJobs([state.query], 0, -1, true);
    entries.push(...jobs.map((job) => ({
      id: job.id ?? "unknown",
      topic: job.data.originalName,
      state: "dead_letter",
    })));
  }
  return entries;
}

async function main(): Promise<void> {
  const config = loadRuntimeConfig();
  if (!config.mongodbUrl || !config.mongodbDatabase) throw new Error("MongoDB runtime configuration is missing");
  const database = createMongoResource(config.mongodbUrl, { databaseName: config.mongodbDatabase });
  const jobs = createReliableQueue<Record<string, unknown>>("domain-jobs", config.redisUrl, config.queuePrefix);
  try {
    const result = await checkCareerDeferredMutationDrain({
      async listOutboxEvents() {
        const documents = await database.db.collection<Document>("outbox_events").find({
          topic: { $in: [...CAREER_DEFERRED_MUTATION_TOPICS] },
          state: { $in: ["pending", "publishing", "dead_letter"] },
        }, { projection: { _id: 1, topic: 1, state: 1 } }).toArray();
        return documents.map((document) => ({
          id: String(document["_id"]),
          topic: String(document["topic"]),
          state: String(document["state"]),
        }));
      },
      listQueueJobs: () => listMainQueueJobs(jobs.queue),
      listDeadLetterJobs: () => listDeadLetterQueueJobs(jobs.deadLetterQueue),
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.safe) process.exitCode = 2;
  } finally {
    await Promise.all([jobs.close(), database.close()]);
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  await main();
}
