import type { CareerCategory, CareerPropertyDefinitionV2, CareerPropertySchemaChange } from "@expresso/contracts";

import { propertyOptions } from "./property-editors";

export interface CreatedPropertyOption {
  optionId: string;
  /** 옵션을 더한 뒤의 카테고리. 이미 있는 이름이면 null이다. */
  category: CareerCategory | null;
}

/**
 * 선택 · 다중 선택 속성에 옵션을 더한다. 같은 이름(대소문자 무시)이 있으면 그 옵션을 쓴다.
 * 서버는 `configure` 변경으로 받고, 기존 옵션 ID를 지우는 변경은 거절한다.
 */
export async function createPropertyOption(categoryId: string, definition: CareerPropertyDefinitionV2, rawName: string): Promise<CreatedPropertyOption> {
  const name = rawName.trim();
  if (!name) throw new Error("항목 이름을 입력해 주세요.");
  const options = propertyOptions(definition);
  const existing = options.find((option) => option.name.trim().toLocaleLowerCase("ko-KR") === name.toLocaleLowerCase("ko-KR"));
  if (existing) return { optionId: existing.id, category: null };
  const optionId = crypto.randomUUID();
  const change: CareerPropertySchemaChange = { kind: "configure", propertyId: definition.id, config: { ...definition.config, options: [...options, { id: optionId, name }] } };
  const previewResponse = await fetch(`/api/career/categories/${categoryId}/property-schema/preview`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(change) });
  if (!previewResponse.ok) throw new Error("항목을 추가하지 못했습니다.");
  const preview = (await previewResponse.json() as { data: { categoryVersion: number; previewToken: string } }).data;
  const applyResponse = await fetch(`/api/career/categories/${categoryId}/property-schema/apply`, {
    method: "POST",
    headers: { "content-type": "application/json", "if-match": `"v${preview.categoryVersion}"`, "idempotency-key": crypto.randomUUID() },
    body: JSON.stringify({ change, previewToken: preview.previewToken, confirmLossy: false }),
  });
  if (applyResponse.status === 409 || applyResponse.status === 412) throw new Error("다른 곳에서 바뀌었습니다. 새로 불러와 주세요.");
  if (!applyResponse.ok) throw new Error("항목을 추가하지 못했습니다.");
  return { optionId, category: (await applyResponse.json() as { data: CareerCategory }).data };
}
