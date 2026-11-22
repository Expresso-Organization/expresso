import { loadRuntimeConfig } from "../config/runtime-config.js";
import { createMongoResource } from "../platform/mongodb.js";
import { MatchModelService, prepareMatchEmbeddings } from "../modules/match-model/index.js";
import { ConsentService } from "../modules/consent/index.js";

// 배포 전 준비 전용입니다. 기존 Worker와 겹쳐도 체크포인트를 덮어쓰지 않습니다.
const config = loadRuntimeConfig();
if (!config.matchModelUrl) throw new Error("MATCH_MODEL_URL is required");
if (!config.mongodbUrl || !config.mongodbDatabase) throw new Error("MongoDB runtime configuration is missing");
const resource = createMongoResource(config.mongodbUrl, { databaseName: config.mongodbDatabase });
try {
  await resource.client.connect();
  const model = new MatchModelService(resource, config.matchModelUrl, new ConsentService(resource));
  if (!(await model.access()).available) throw new Error("Inference service is unavailable");
  const signal = new AbortController();
  for (const name of ["SIGINT", "SIGTERM"] as const) process.once(name, () => signal.abort());
  const result = await prepareMatchEmbeddings(model, signal.signal);
  console.log(JSON.stringify({ prepared: true, reconciliations: result.reconciliations }));
} finally {
  await resource.close();
}
