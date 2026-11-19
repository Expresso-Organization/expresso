import { setTimeout as delay } from "node:timers/promises";
import {
  BSON,
  MongoServerError,
  type ChangeStreamDocument,
  type Document,
  type ChangeStreamOptions,
} from "mongodb";
import { mongoCollections } from "@expresso/database";
import type { MatchModelService } from "../modules/match-model/service.js";

const inputs: Record<string, string[]> = {
  users: ["profile", "deletionRequestedAt"],
  career_records: [
    "userId",
    "title",
    "bodyMd",
    "properties",
    "categoryId",
    "deletedAt",
    "status",
  ],
  career_categories: ["propertySchemaV2", "userId"],
  job_postings: [
    "title",
    "descriptionRaw",
    "jobFamily",
    "source",
    "requirements",
    "duties",
    "preferred",
  ],
  job_posting_requirements: ["jobPostingId", "kind", "label", "orderNo"],
};

async function applyChange(
  model: MatchModelService,
  event: ChangeStreamDocument,
  signal: AbortSignal,
) {
  if (!("documentKey" in event) || !("ns" in event))
    return model.backfillEmbeddings(signal);
  const coll = event.ns.coll;
  if (event.operationType === "update") {
    const { updatedFields, removedFields, truncatedArrays } =
      event.updateDescription;
    const paths = [
      ...Object.keys(updatedFields ?? {}),
      ...(removedFields ?? []),
      ...(truncatedArrays ?? []).map((x) => x.field),
    ];
    if (!paths.some((p) => inputs[coll]?.includes(p.split(".")[0]!))) return;
  }
  const id = String(event.documentKey._id);
  if (coll === "users") return model.warmUser(id);
  if (coll === "job_postings") return model.warmPosting(id);
  const doc = "fullDocument" in event ? event.fullDocument : undefined;
  if (coll === "career_categories") {
    const owners = new Set(
      await mongoCollections(model.context.db).careerRecords.distinct(
        "userId",
        { categoryId: id, deletedAt: null },
      ),
    );
    if (typeof doc?.userId === "string") owners.add(doc.userId);
    for (const owner of owners) await model.warmUser(owner);
    return;
  }
  const requirement = coll === "job_posting_requirements";
  const field = requirement ? "jobPostingId" : "userId";
  const current = doc?.[field];
  const ids = new Set<string>();
  if (typeof current === "string") ids.add(current);
  if (
    !doc ||
    event.operationType === "replace" ||
    (event.operationType === "update" &&
      field in (event.updateDescription.updatedFields ?? {}))
  ) {
    // 삭제 이벤트에는 본문이 없어 마지막으로 저장한 소유자를 조회한다.
    const previous = await model.embeddingOwners(
      (requirement ? "requirement/" : "record/") + id,
    );
    for (const owner of previous) ids.add(owner.slice(owner.indexOf("/") + 1));
  }
  for (const owner of ids) {
    if (requirement) await model.warmPosting(owner);
    else await model.warmUser(owner);
  }
}

/** 벡터를 디스크에 반영한 뒤에만 재개 위치를 옮긴다. */
export async function syncMatchEmbeddings(
  model: MatchModelService,
  signal: AbortSignal,
  onError: (error: unknown) => void,
) {
  if (!model.url) return;
  const db = model.context.db;
  while (!signal.aborted) {
    let token: string | null = null;
    try {
      token = await model.embeddingCheckpoint();
      if (!token) {
        const hello = await db.command({ hello: 1 });
        const time = hello.operationTime ?? hello.$clusterTime?.clusterTime;
        if (!time)
          throw new Error("Embedding sync requires a MongoDB replica set");
        await model.backfillEmbeddings(signal);
        token = BSON.EJSON.stringify({ startAtOperationTime: time });
        if ((await model.embeddingCheckpoint(token, null)) !== token) continue;
      }
      const stream = db.watch<Document, ChangeStreamDocument>(
        [
          {
            $match: {
              $or: [
                {
                  "ns.coll": { $in: Object.keys(inputs) },
                  operationType: {
                    $in: [
                      "insert",
                      "update",
                      "replace",
                      "delete",
                      "drop",
                      "rename",
                    ],
                  },
                },
                { operationType: { $in: ["invalidate", "dropDatabase"] } },
              ],
            },
          },
        ],
        {
          ...(BSON.EJSON.parse(token) as ChangeStreamOptions),
          fullDocument: "updateLookup",
          maxAwaitTimeMS: 1000,
        },
      );
      const close = () => {
        void stream.close().catch(() => undefined);
      };
      signal.addEventListener("abort", close, { once: true });
      let lastCheck = Date.now();
      try {
        while (!signal.aborted) {
          const change = await stream.tryNext();
          if (change) await applyChange(model, change, signal);
          if (!change && Date.now() - lastCheck < 30000) continue;
          // 인코더 교체 또는 볼륨 복원으로 재개 위치가 바뀌었으면 새 상태에서 시작한다.
          const next: string = stream.resumeToken
            ? BSON.EJSON.stringify({ resumeAfter: stream.resumeToken })
            : token;
          if ((await model.embeddingCheckpoint(next, token)) !== next) {
            if (change) await applyChange(model, change, signal);
            break;
          }
          token = next;
          lastCheck = Date.now();
        }
      } finally {
        signal.removeEventListener("abort", close);
        await stream.close();
      }
    } catch (error) {
      if (signal.aborted) return;
      onError(error);
      if (
        error instanceof MongoServerError &&
        [260, 280, 286].includes(Number(error.code))
      ) {
        await model.embeddingCheckpoint(null, token).catch(onError);
      }
      await delay(2000, undefined, { signal }).catch(() => undefined);
    }
  }
}
