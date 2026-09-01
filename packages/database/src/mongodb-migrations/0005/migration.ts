import type { Document } from "mongodb";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

/**
 * 공고 출처를 다섯 갈래 더 받는다.
 *
 * 국내 스타트업이 가장 많이 쓰는 ATS는 그리팅(`greeting`)이고, Workable도 같은
 * 성격의 공개 보드다. `work24web`은 고용24 채용정보 화면을 직접 읽는 출처로,
 * 기존 `work24`(공공기관 채용정보 API)와 가져오는 것이 다르다 — 한 이름 아래
 * 두면 어느 쪽이 무엇을 모았는지 `job_sources`에서 구분할 수 없다.
 *
 * 0001의 `schema.json`을 고치지 않는다. 그 파일은 체크섬에 묶여 있어 손대면
 * 이미 적용된 마이그레이션이 어긋난다 — 살아 있는 검증기만 바꾼다.
 */
const PROVIDERS = [
  "greenhouse", "lever", "ashby", "workable", "greeting", "work24", "work24web",
];

export async function jobSourceProviderSteps(): Promise<MongoMigrationStep[]> {
  return [{
    id: "job_sources:provider_enum",
    async run(db) {
      const name = "job_sources";
      const info = await db.listCollections({ name }, { nameOnly: false }).next() as Document | null;
      if (!info) throw new Error(`${name} collection is missing`);
      const validator = structuredClone((info.options.validator ?? {}) as Document);
      const properties = (validator["$jsonSchema"] as Document | undefined)?.["properties"] as Document | undefined;
      const provider = properties?.["provider"] as Document | undefined;
      if (!provider) throw new Error(`${name} validator has no provider`);
      provider["enum"] = PROVIDERS;
      await db.command({
        collMod: name, validator, validationLevel: "strict", validationAction: "error",
      });
    },
  }];
}
