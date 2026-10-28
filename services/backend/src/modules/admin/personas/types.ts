import type { CareerGoalSchema, CareerRecordStatusSchema, TargetRoleSchema } from "@expresso/contracts";
import type { CareerTemplateKey } from "@expresso/database";
import type { z } from "zod";

/**
 * 가상 인물 원본의 형식. 실제 인물 · 회사가 아니다. 회사 · 학교 · 행사 이름은 지어낸 것이고,
 * 기술 이름(React, Kafka 등)만 실제 이름을 쓴다.
 *
 * 속성은 기본 카테고리 템플릿(`CAREER_CATEGORY_TEMPLATES`)에 있는 키만 쓴다. 사용자가 화면에서
 * 만드는 기록과 같은 모양이어야 생성 시험이 실제 사용을 닮는다. STAR 같은 서술은 본문에 쓴다.
 *
 * 속성 값은 정의의 타입에 따라 읽는다.
 * - text · url: 문자열
 * - select: 선택지 이름 하나. 템플릿에 없으면 선택지로 더한다
 * - multi_select: 선택지 이름 목록. 없는 이름은 선택지로 더한다
 * - date: `"2023-03"`(한 달) · `"2021-03/2023-02"`(기간) · `"2023-03/"`(지금까지)
 * - relation: `{ refs: [...] }` — 같은 인물의 다른 기록 `ref`
 */
export type PersonaPropertyValue = string | readonly string[] | { readonly refs: readonly string[] };

export interface PersonaRecord {
  /** 관계 속성이 가리킬 때만 붙인다. 인물 안에서 겹치지 않는다. */
  ref?: string;
  category: CareerTemplateKey;
  title: string;
  /** 생략하면 `organized`. */
  status?: z.infer<typeof CareerRecordStatusSchema>;
  body: string;
  props?: Readonly<Record<string, PersonaPropertyValue>>;
}

export interface Persona {
  /** `users.dummyKey`이자 이메일 앞부분(`<key>@expresso.test`). */
  key: string;
  displayName: string;
  /** 관리 화면에 보이는 직군 · 경력 한 줄. */
  headline: string;
  profile: {
    targetRoles: readonly z.infer<typeof TargetRoleSchema>[];
    experienceYears: number;
    primaryGoal: z.infer<typeof CareerGoalSchema>;
  };
  records: readonly PersonaRecord[];
}

export const personaEmail = (persona: Pick<Persona, "key">) => `${persona.key}@expresso.test`;
