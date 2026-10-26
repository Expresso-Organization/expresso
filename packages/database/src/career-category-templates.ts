import { createHash } from "node:crypto";

import type * as Contracts from "@expresso/contracts";

import type { CareerCategoryDoc } from "./documents/career.js";

/**
 * 가입할 때 사용자마다 복사하는 기본 카테고리 7종.
 *
 * 속성은 화면 정의서 05–05e를 따른다. 정의서에 화면이 없는 자격증 · 수상과
 * 활동 · 리더십은 이전 기본 정의를 그대로 옮겼다. 선택지는 정의서 화면에 나온
 * 값만 넣는다 — 나머지는 사용자가 칩을 추가해 늘린다.
 * 이 목록을 바꿔도 이미 만든 사용자 카테고리는 바뀌지 않는다.
 */
type TemplateProperty =
  | { key: string; name: string; type: "text" | "date" | "url" }
  | { key: string; name: string; type: "select" | "multi_select"; options: readonly string[] }
  | { key: string; name: string; type: "relation"; targetKey: CareerTemplateKey };

export type CareerTemplateKey =
  | "experience" | "project" | "education_history" | "certification_award"
  | "academic_writing" | "activity_leadership" | "skill_tool";

interface CareerCategoryTemplate {
  key: CareerTemplateKey;
  name: string;
  icon: string;
  defaultView: Contracts.CareerViewType;
  properties: readonly TemplateProperty[];
}

export const CAREER_CATEGORY_TEMPLATES: readonly CareerCategoryTemplate[] = [
  { key: "experience", name: "경험", icon: "briefcase", defaultView: "table", properties: [
    { key: "competencies", name: "역량", type: "multi_select", options: [] },
    { key: "period", name: "시기", type: "date" },
  ] },
  { key: "project", name: "프로젝트", icon: "folder-kanban", defaultView: "gallery", properties: [
    { key: "role", name: "역할", type: "text" },
    { key: "technologies", name: "기술", type: "multi_select", options: [] },
    { key: "period", name: "기간", type: "date" },
    { key: "outcome", name: "성과", type: "text" },
    { key: "experiences", name: "연결된 경험", type: "relation", targetKey: "experience" },
  ] },
  { key: "education_history", name: "학력 · 이력", icon: "graduation-cap", defaultView: "timeline", properties: [
    { key: "employmentType", name: "고용 형태", type: "select", options: ["정규직"] },
    { key: "period", name: "기간", type: "date" },
    { key: "organization", name: "소속", type: "text" },
    { key: "projects", name: "연결된 프로젝트", type: "relation", targetKey: "project" },
    { key: "experiences", name: "연결된 경험", type: "relation", targetKey: "experience" },
  ] },
  { key: "certification_award", name: "자격증 · 수상", icon: "award", defaultView: "table", properties: [
    { key: "issuer", name: "발급·수여 기관", type: "text" },
    { key: "issuedMonth", name: "취득 월", type: "date" },
  ] },
  { key: "academic_writing", name: "학술 · 집필", icon: "book-open", defaultView: "list", properties: [
    { key: "kind", name: "유형", type: "select", options: ["기술 글", "논문"] },
    { key: "publication", name: "게재처", type: "text" },
    { key: "publishedMonth", name: "게재 월", type: "date" },
    { key: "url", name: "원문 링크", type: "url" },
  ] },
  { key: "activity_leadership", name: "활동 · 리더십", icon: "users", defaultView: "table", properties: [
    { key: "role", name: "역할", type: "text" },
    { key: "outcome", name: "성과", type: "text" },
    { key: "organization", name: "조직", type: "text" },
  ] },
  { key: "skill_tool", name: "스킬 · 도구", icon: "wrench", defaultView: "board", properties: [
    { key: "group", name: "분류", type: "select", options: ["언어 · 쿼리", "데이터 · 파이프라인", "인프라 · 운영"] },
    { key: "firstUsedMonth", name: "처음 사용", type: "date" },
    { key: "lastUsedMonth", name: "최근 사용", type: "date" },
    { key: "projects", name: "연결된 프로젝트", type: "relation", targetKey: "project" },
    { key: "experiences", name: "연결된 경험", type: "relation", targetKey: "experience" },
  ] },
];

/** RFC 4122 v5(DNS 이름공간). 같은 입력이면 같은 ID라 가입 재시도와 마이그레이션 재실행이 같은 문서를 만든다. */
export function stableCareerId(name: string): string {
  const bytes = createHash("sha1").update(Buffer.from("6ba7b8109dad11d180b400c04fd430c8", "hex")).update(name).digest();
  bytes[6] = (bytes[6]! & 15) | 80;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const careerCategoryId = (userId: string, key: string) => stableCareerId(`${userId}:category:${key}`);
export const careerPropertyId = (categoryId: string, key: string) => stableCareerId(`${categoryId}:${key}`);
export const careerOptionId = (propertyId: string, name: string) => stableCareerId(`${propertyId}:option:${name}`);

/** 사용자 한 명의 기본 카테고리 문서. 관계 속성은 같은 사용자의 대상 카테고리를 가리킨다. */
export function defaultCareerCategories(userId: string, now: Date): CareerCategoryDoc[] {
  return CAREER_CATEGORY_TEMPLATES.map((template, sortOrder) => {
    const categoryId = careerCategoryId(userId, template.key);
    const propertySchemaV2 = template.properties.map((property, order): Contracts.CareerPropertyDefinitionV2 => {
      const id = careerPropertyId(categoryId, property.key);
      const config = property.type === "select" || property.type === "multi_select"
        ? { options: property.options.map((name) => ({ id: careerOptionId(id, name), name })) }
        : property.type === "relation"
          ? { targetCategoryId: careerCategoryId(userId, property.targetKey), inversePropertyId: null, cardinality: "multiple", deletePolicy: "nullify" }
          : {};
      return { id, key: property.key, name: property.name, type: property.type, required: false, system: false, config, order, version: 1, deletedAt: null };
    });
    return { _id: categoryId, userId, key: template.key, name: template.name, icon: template.icon, defaultView: template.defaultView, sortOrder, propertySchemaV2, schemaVersion: 1, version: 1, updatedAt: now };
  });
}
