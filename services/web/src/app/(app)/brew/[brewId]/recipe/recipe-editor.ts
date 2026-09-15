"use client";

import type { RecipeV2, RecipeV2Edit, RecipeV2Reorder } from "@expresso/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { useSaveState, type SaveState } from "@/components/shell/SaveState";

import { editRecipeAction, loadRecipeAction, reorderRecipeAction, type RecipeResult } from "./recipe-actions";

/**
 * 02 레시피 편집기의 상태.
 *
 * 세 가지 일을 한다.
 *
 * 1. **화면이 먼저 반영한다.** 서버가 할 일을 `applyLocally`가 미리 한다. 새 id가
 *    필요한 연산(`add_*` · `duplicate_item`)만 서버를 기다린다.
 * 2. **저장은 한 줄로 선다.** 서버의 낙관적 잠금(`editVersion`)은 요청이 겹치면
 *    409를 낸다. 큐가 요청을 차례로 보내고, 마지막 응답의 판만 화면에 얹는다 —
 *    앞선 응답을 얹으면 그 사이에 화면이 먼저 반영한 편집이 지워진다.
 * 3. **실행 취소는 판을 되돌린다.** 편집 전 판을 스택에 두고, 되돌릴 때 그 판을
 *    `restore`로 보낸다. 서버는 id를 유지하므로 화면의 선택과 목차가 그대로 선다.
 *
 * 실패하면 서버가 아는 판을 다시 받아 그대로 그리고 스택을 비운다. 화면이 서버와
 * 다른 것을 보여 주는 시간을 여기서 끝낸다.
 */

type Section = RecipeV2["sections"][number];
type Item = Section["items"][number];

function renumber<T extends { order: number }>(list: T[]): T[] {
  return list.map((entry, order) => (entry.order === order ? entry : { ...entry, order }));
}

/**
 * 서버가 할 일을 화면에서 미리 한다. 새 id가 필요한 연산은 `null` — 기다린다.
 *
 * 계약(`RecipeV2EditSchema`)의 연산마다 한 분기다. 서버 `#apply`와 같은 규칙을
 * 지킨다 — 중심 근거는 하나, 지운 뒤 자리 번호는 0부터.
 */
export function applyLocally(recipe: RecipeV2, edit: RecipeV2Edit): RecipeV2 | null {
  switch (edit.operation) {
    case "add_section":
    case "add_item":
    case "duplicate_item":
      return null;
    case "update_title":
      return { ...recipe, title: edit.title };
    case "update_intent":
      return {
        ...recipe,
        intent: edit.intent,
        // 공고를 비우면 바로 비운다. 새 공고의 이름은 서버가 안다 — 그때까지 이전 것을 둔다.
        jobPosting: edit.intent.jobPostingId === null ? null : recipe.jobPosting,
      };
    case "update_section":
      return {
        ...recipe,
        sections: recipe.sections.map((section) => section.id !== edit.sectionId ? section : {
          ...section,
          ...(edit.title !== undefined ? { title: edit.title } : {}),
          ...(edit.purpose !== undefined ? { purpose: edit.purpose } : {}),
          ...(edit.takeaway !== undefined ? { takeaway: edit.takeaway } : {}),
        }),
      };
    case "delete_section":
      return { ...recipe, sections: renumber(recipe.sections.filter(({ id }) => id !== edit.sectionId)) };
    case "update_item":
      return mapItem(recipe, edit.itemId, (item) => ({ ...item, text: edit.text }));
    case "delete_item":
      return {
        ...recipe,
        sections: recipe.sections.map((section) =>
          section.items.some(({ id }) => id === edit.itemId)
            ? { ...section, items: renumber(section.items.filter(({ id }) => id !== edit.itemId)) }
            : section),
      };
    case "bind_source":
      return mapItem(recipe, edit.itemId, (item) => {
        if (item.sourceBindings.some(({ sourceId }) => sourceId === edit.sourceId)) return item;
        const demoted = edit.role === "primary"
          ? item.sourceBindings.map((binding) => binding.role === "primary" ? { ...binding, role: "supporting" as const } : binding)
          : item.sourceBindings;
        return {
          ...item,
          sourceBindings: [...demoted, { sourceType: edit.sourceType, sourceId: edit.sourceId, role: edit.role, order: demoted.length }],
        };
      });
    case "unbind_source":
      return mapItem(recipe, edit.itemId, (item) => ({
        ...item,
        sourceBindings: renumber(item.sourceBindings.filter(({ sourceId }) => sourceId !== edit.sourceId)),
      }));
    case "restore":
      return {
        ...recipe,
        title: edit.title,
        intent: edit.intent,
        jobPosting: edit.intent.jobPostingId === null ? null : recipe.jobPosting,
        sections: edit.sections,
      };
    case "confirm":
      return { ...recipe, status: "confirmed" };
  }
}

function mapItem(recipe: RecipeV2, itemId: string, map: (item: Item) => Item): RecipeV2 {
  return {
    ...recipe,
    sections: recipe.sections.map((section) =>
      section.items.some(({ id }) => id === itemId)
        ? { ...section, items: section.items.map((item) => item.id === itemId ? map(item) : item) }
        : section),
  };
}

/** 순서 요청(`RecipeV2Reorder`)을 화면에 미리 반영한다. 모르는 id는 무시한다. */
export function reorderLocally(recipe: RecipeV2, input: RecipeV2Reorder): RecipeV2 {
  const sectionById = new Map(recipe.sections.map((section) => [section.id, section]));
  const itemById = new Map(recipe.sections.flatMap(({ items }) => items.map((item) => [item.id, item] as const)));
  const sections = input.sections.flatMap(({ sectionId, itemIds }, order) => {
    const section = sectionById.get(sectionId);
    if (!section) return [];
    const items = renumber(itemIds.flatMap((id) => { const item = itemById.get(id); return item ? [item] : []; }));
    return [{ ...section, order, items }];
  });
  return { ...recipe, sections };
}

/** 지금 판을 순서 요청으로 적는다. 서버는 모든 섹션과 문장을 빠짐없이 요구한다. */
export function orderOf(sections: Section[]): RecipeV2Reorder {
  return { sections: sections.map((section) => ({ sectionId: section.id, itemIds: section.items.map(({ id }) => id) })) };
}

/** 되돌릴 때 보내는 판. 화면이 들고 있던 것 그대로다. */
function snapshotOf(recipe: RecipeV2): RecipeV2Edit {
  return { operation: "restore", title: recipe.title, intent: recipe.intent, sections: recipe.sections };
}

export interface RecipeEditor {
  recipe: RecipeV2;
  /** 편집 하나. 화면에 먼저 반영하고 저장을 줄에 세운다. 그 저장이 됐는지로 풀린다. */
  apply: (edit: RecipeV2Edit) => Promise<boolean>;
  /** 순서 전체. drop 한 번에 한 번이다. */
  reorder: (sections: Section[]) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  saveState: SaveState;
  error: string | null;
  /** 실패 문구를 닫는다. */
  dismissError: () => void;
}

export function useRecipeEditor(initial: RecipeV2): RecipeEditor {
  const [recipe, setRecipe] = useState(initial);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [, bump] = useState(0);
  const raise = useSaveState();

  /** 화면이 지금 보여 주는 판. 콜백이 닫힌 값 대신 이것을 본다. */
  const current = useRef(initial);
  const past = useRef<RecipeV2[]>([]);
  const future = useRef<RecipeV2[]>([]);
  /** 줄 서 있는 저장 요청 수. 0이 되는 응답만 화면에 얹는다. */
  const pending = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => { raise(saveState); }, [raise, saveState]);

  const show = useCallback((next: RecipeV2) => {
    current.current = next;
    setRecipe(next);
  }, []);

  /** 저장 요청 하나를 줄에 세운다. 응답은 줄이 빌 때만 화면에 얹는다. */
  const enqueue = useCallback((request: () => Promise<RecipeResult>, adopt: boolean): Promise<boolean> => {
    pending.current += 1;
    setSaveState("saving");
    const turn = queue.current.then(async () => {
      const result = await request();
      pending.current -= 1;
      if (result.ok) {
        if (pending.current === 0 || adopt) show(mergeServer(current.current, result.recipe, pending.current === 0));
        if (pending.current === 0) setSaveState("saved");
        return true;
      }
      // 서버가 아는 판으로 돌아간다. 그 사이의 낙관적 반영은 여기서 끝난다.
      setError(result.error);
      setSaveState("failed");
      past.current = [];
      future.current = [];
      bump((n) => n + 1);
      const latest = await loadRecipeAction(current.current.id);
      if (latest.ok) show(latest.recipe);
      return false;
    });
    queue.current = turn.then(() => undefined);
    return turn;
  }, [show]);

  const remember = useCallback((before: RecipeV2) => {
    past.current.push(before);
    if (past.current.length > 100) past.current.shift();
    future.current = [];
    bump((n) => n + 1);
  }, []);

  const apply = useCallback((edit: RecipeV2Edit) => {
    const before = current.current;
    const after = applyLocally(before, edit);
    if (edit.operation !== "confirm") remember(before);
    if (after) show(after);
    return enqueue(() => editRecipeAction(before.id, edit), after === null);
  }, [enqueue, remember, show]);

  const reorder = useCallback((sections: Section[]) => {
    const before = current.current;
    const input = orderOf(sections);
    remember(before);
    show(reorderLocally(before, input));
    enqueue(() => reorderRecipeAction(before.id, input), false);
  }, [enqueue, remember, show]);

  const undo = useCallback(() => {
    const before = past.current.pop();
    if (!before) return;
    future.current.push(current.current);
    bump((n) => n + 1);
    show(before);
    enqueue(() => editRecipeAction(before.id, snapshotOf(before)), false);
  }, [enqueue, show]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(current.current);
    bump((n) => n + 1);
    show(next);
    enqueue(() => editRecipeAction(next.id, snapshotOf(next)), false);
  }, [enqueue, show]);

  return {
    recipe,
    apply,
    reorder,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    saveState,
    error,
    dismissError: () => setError(null),
  };
}

/**
 * 서버 판을 화면에 얹는다.
 *
 * 줄이 비었으면 서버 판이 곧 진실이다. 아직 요청이 남아 있는데 새 id가 필요해
 * 얹는 경우(`add_*`)에는 서버 판의 **구조**만 받고, 화면이 먼저 반영해 둔 글은
 * 화면 것을 지킨다 — 그 글의 저장 요청이 뒤에 서 있다.
 */
function mergeServer(local: RecipeV2, server: RecipeV2, settled: boolean): RecipeV2 {
  if (settled) return server;
  const localItems = new Map(local.sections.flatMap(({ items }) => items.map((item) => [item.id, item] as const)));
  const localSections = new Map(local.sections.map((section) => [section.id, section]));
  return {
    ...server,
    title: local.title,
    intent: local.intent,
    sections: server.sections.map((section) => {
      const mine = localSections.get(section.id);
      return {
        ...section,
        ...(mine ? { title: mine.title, purpose: mine.purpose, takeaway: mine.takeaway } : {}),
        items: section.items.map((item) => {
          const own = localItems.get(item.id);
          return own ? { ...item, text: own.text } : item;
        }),
      };
    }),
  };
}
