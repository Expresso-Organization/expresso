// @vitest-environment jsdom
import type { CareerCategory, CareerPropertyDefinitionV2, CareerRecord } from "@expresso/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { GalleryView } from "./GalleryView";
import { ListView } from "./ListView";
import { defaultViewDraft } from "./view-logic";
import type { CareerViewRendererProps } from "./view-types";

afterEach(cleanup);

const id = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const options = [{ id: id(90), name: "React · Next.js" }, { id: id(91), name: "TypeScript" }];
function definition(index: number, key: string, type: CareerPropertyDefinitionV2["type"], config: Record<string, unknown> = {}): CareerPropertyDefinitionV2 {
  return { id: id(index), key, name: key, type, required: false, system: key === "title", config, order: index, version: 1, deletedAt: null };
}
const definitions = [definition(1, "title", "title"), definition(2, "technologies", "multi_select", { options })];

function props(key: "project" | "experience"): CareerViewRendererProps {
  const category: CareerCategory = { id: id(100), key, name: key === "project" ? "프로젝트" : "경험", icon: "folder", defaultView: "gallery", propertySchemaV2: definitions, schemaVersion: 1, sortOrder: 0, recordCount: 1, version: 1, archivedAt: null, builtIn: false };
  // 지운 옵션을 가리키는 ID(99)가 섞여 있다.
  const record: CareerRecord = { id: id(200), categoryId: category.id, title: "상품 상세 App Router 전환", status: "organized", origin: "manual", properties: { technologies: { type: "multi_select", value: [id(90), id(91), id(99)] } }, bodyMd: "", version: 1, updatedAt: "2026-09-01T00:00:00.000Z" };
  const view = { ...defaultViewDraft(category, "gallery", "갤러리"), id: id(300), categoryId: category.id, version: 1, order: 0, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", visiblePropertyIds: [id(2)] };
  return { records: [record], view, category, activeId: null, openId: null, selectedIds: new Set(), onActivate: () => {}, onCreate: () => {}, onFillMissing: () => {}, onToggle: () => {}, onViewChange: () => {} };
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

it("프로젝트 갤러리 카드의 기술 칩은 옵션 이름이고 UUID가 없다", () => {
  const { container } = render(<GalleryView {...props("project")} />);
  expect(screen.getByText("React · Next.js")).toBeTruthy();
  expect(screen.getByText("TypeScript")).toBeTruthy();
  expect(container.textContent).not.toMatch(UUID);
});

it("일반 갤러리와 목록 보기의 속성 미리보기도 옵션 이름이다", () => {
  const gallery = render(<GalleryView {...props("experience")} />);
  expect(gallery.container.textContent).toContain("React · Next.js, TypeScript");
  expect(gallery.container.textContent).not.toMatch(UUID);
  cleanup();
  const list = render(<ListView {...props("experience")} />);
  expect(list.container.textContent).toContain("React · Next.js, TypeScript");
  expect(list.container.textContent).not.toMatch(UUID);
});
