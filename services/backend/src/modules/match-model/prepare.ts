import { BSON } from "mongodb";
import type { MatchModelService } from "./service.js";

/** 준비 중 다른 Worker가 변경을 확정했으면 원천을 다시 읽어 늦은 스냅샷을 남기지 않습니다. */
export async function prepareMatchEmbeddings(model: MatchModelService, signal: AbortSignal) {
  let reconciliations = 0;
  for (;;) {
    signal.throwIfAborted();
    const previous = await model.embeddingCheckpoint();
    const hello = await model.context.db.command({ hello: 1 });
    const time = hello.operationTime ?? hello.$clusterTime?.clusterTime;
    if (!time) throw new Error("Embedding sync requires a MongoDB replica set");
    await model.backfillEmbeddings(signal);
    const token = BSON.EJSON.stringify({ startAtOperationTime: time });
    if (await model.embeddingCheckpoint(token, previous) === token) return { token, reconciliations };
    // 직전 backfill이 변경 스트림보다 늦게 쓴 벡터를 다음 대조에서 바로잡습니다.
    reconciliations++;
  }
}
