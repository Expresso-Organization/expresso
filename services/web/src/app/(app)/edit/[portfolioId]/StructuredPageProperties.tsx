"use client";
import { useActionState, useState } from "react";
import {
  STRUCTURED_CASE_TYPES,
  type GeneratedPage,
  type PageLibraryItem,
  type StructuredPortfolioSpec,
} from "@expresso/contracts";
import { structuredPageAction } from "./edit-actions";
import styles from "./StructuredPageProperties.module.css";

const names: Record<string, string> = {
  editorial: "소개·본문 두 열",
  gallery: "작품 전시",
  dossier: "목차·상세 두 열",
  CaseEssay: "기사형",
  CaseGallery: "이미지 전시형",
  CaseTechnical: "기술 설명형",
  CaseProcess: "과정형",
  ContentPanel: "내용 패널",
};
export function StructuredPageProperties({
  page,
  portfolioId,
  libraryItems = [],
}: {
  page: GeneratedPage;
  portfolioId: string;
  libraryItems?: readonly PageLibraryItem[];
}) {
  const snapshot = page.generationManifest?.structured;
  const [spec, setSpec] = useState<StructuredPortfolioSpec | null>(
    snapshot ? structuredClone(snapshot.spec) : null,
  );
  const [patches, setPatches] = useState<Record<string, string>>({});
  const [state, action, pending] = useActionState(structuredPageAction, {});
  if (!snapshot || !spec) return null;
  const root = spec.elements[spec.root];
  if (root?.type !== "PortfolioPage") return null;
  const update = (change: (next: StructuredPortfolioSpec) => void) =>
    setSpec((previous) => {
      const next = structuredClone(previous!);
      change(next);
      return next;
    });
  const displayKey = (id: string) =>
    libraryItems.find((item) => item.id === id || item.renderKey === id)
      ?.renderKey || id;
  const patch = (path: string, value: string) =>
    setPatches((previous) => ({ ...previous, [path]: value }));
  return (
    <form action={action} className={styles.panel}>
      <input type="hidden" name="portfolioId" value={portfolioId} />
      <input
        type="hidden"
        name="payload"
        value={JSON.stringify({
          expectedRevision: page.revision,
          spec,
          patches: Object.entries(patches).map(([path, value]) => ({
            path,
            value,
          })),
        })}
      />
      <h3>지면 구성</h3>
      <label>
        전체 배치
        <select
          aria-label="전체 배치"
          value={root.props.design.layout}
          onChange={(event) =>
            update((next) => {
              const node = next.elements[next.root];
              if (node?.type === "PortfolioPage")
                node.props.design.layout = event.target.value as
                  | "editorial"
                  | "gallery"
                  | "dossier"
                  | "library";
            })
          }
        >
          {["library", "editorial", "gallery", "dossier"].map((key) => (
            <option key={key} value={key}>
              {key === "library" ? "수집 컴포넌트 배치" : names[key]}
            </option>
          ))}
        </select>
      </label>
      <label>
        이름
        <input
          aria-label="이름"
          defaultValue={snapshot.content.profile.name}
          maxLength={200}
          onChange={(event) => patch("/profile/name", event.target.value)}
        />
      </label>
      <label>
        한 문장 소개
        <textarea
          aria-label="한 문장 소개"
          defaultValue={snapshot.content.profile.headline}
          maxLength={160}
          onChange={(event) => patch("/profile/headline", event.target.value)}
        />
      </label>
      <label>
        첫 화면 원본
        <select
          aria-label="첫 화면 원본"
          value={displayKey(
            spec.elements[root.children[0]!]!.props &&
              (spec.elements[root.children[0]!]!.type === "NameIntro"
                ? (
                    spec.elements[root.children[0]!]!.props as {
                      sourceId?: string;
                    }
                  ).sourceId || ""
                : ""),
          )}
          onChange={(event) =>
            update((next) => {
              const intro = next.elements[root.children[0]!];
              if (intro?.type === "NameIntro") {
                if (event.target.value)
                  intro.props.sourceId = event.target.value;
                else delete intro.props.sourceId;
              }
            })
          }
        >
          <option value="">기본 지면</option>
          {libraryItems
            .filter((item) => item.slot === "intro")
            .map((item) => (
              <option key={item.id} value={item.renderKey || item.id}>
                {item.source} / {item.name}
              </option>
            ))}
        </select>
      </label>
      <ol className={styles.sections}>
        {root.children.map((key, position) => {
          const node = spec.elements[key];
          if (!node || !("section" in node.props)) return null;
          const reference = node.props.section.$state;
          const section = snapshot.content.sections.find(
            (item) => reference === `/sectionById/${item.id}`,
          );
          if (!section) return null;
          return (
            <li key={key}>
              <strong>{section.title}</strong>
              <label>
                사례 지면
                <select
                  aria-label={`${section.title} 지면`}
                  value={node.type}
                  onChange={(event) =>
                    update((next) => {
                      const target = next.elements[key];
                      if (target && "section" in target.props)
                        target.type = event.target
                          .value as (typeof STRUCTURED_CASE_TYPES)[number];
                    })
                  }
                >
                  {STRUCTURED_CASE_TYPES.filter(
                    (type) =>
                      type !== "CaseGallery" || section.media.length > 0,
                  )
                    .filter(
                      (type) =>
                        type !== "CaseProcess" || section.details.length >= 2,
                    )
                    .map((type) => (
                      <option key={type} value={type}>
                        {names[type]}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                사례 원본
                <select
                  aria-label={`${section.title} 사례 원본`}
                  value={displayKey(node.props.sourceId || "")}
                  onChange={(event) =>
                    update((next) => {
                      const target = next.elements[key];
                      if (target && "section" in target.props) {
                        if (event.target.value)
                          target.props.sourceId = event.target.value;
                        else delete target.props.sourceId;
                      }
                    })
                  }
                >
                  <option value="">기본 지면</option>
                  {libraryItems
                    .filter((item) => item.slot === "section")
                    .map((item) => (
                      <option key={item.id} value={item.renderKey || item.id}>
                        {item.source} / {item.name}
                      </option>
                    ))}
                </select>
              </label>
              <div className={styles.order}>
                <button
                  type="button"
                  disabled={position <= 1}
                  onClick={() =>
                    update((next) => {
                      const node = next.elements[next.root];
                      if (node?.type === "PortfolioPage")
                        [node.children[position - 1], node.children[position]] =
                          [
                            node.children[position]!,
                            node.children[position - 1]!,
                          ];
                    })
                  }
                  aria-label={`${section.title} 위로`}
                >
                  ↑ 위로
                </button>
                <button
                  type="button"
                  disabled={
                    position >=
                    root.children.length - (snapshot.content.contact ? 2 : 1)
                  }
                  onClick={() =>
                    update((next) => {
                      const node = next.elements[next.root];
                      if (node?.type === "PortfolioPage")
                        [node.children[position], node.children[position + 1]] =
                          [
                            node.children[position + 1]!,
                            node.children[position]!,
                          ];
                    })
                  }
                  aria-label={`${section.title} 아래로`}
                >
                  ↓ 아래로
                </button>
              </div>
              <label>
                요약
                <textarea
                  aria-label={`${section.title} 요약`}
                  defaultValue={section.summary}
                  onChange={(event) =>
                    patch(`/sections/${section.id}/summary`, event.target.value)
                  }
                />
              </label>
              <details>
                <summary>본문과 설명 편집</summary>
                <label>
                  본문
                  <textarea
                    aria-label={`${section.title} 본문`}
                    defaultValue={section.body}
                    onChange={(event) =>
                      patch(`/sections/${section.id}/body`, event.target.value)
                    }
                  />
                </label>
                {section.details.map((item, index) => (
                  <label key={index}>
                    {item.label}
                    <textarea
                      aria-label={`${section.title} ${item.label}`}
                      defaultValue={item.text}
                      onChange={(event) =>
                        patch(
                          `/sections/${section.id}/details/${index}/text`,
                          event.target.value,
                        )
                      }
                    />
                  </label>
                ))}
              </details>
            </li>
          );
        })}
      </ol>
      {state.error && <p role="alert">{state.error}</p>}
      {state.saved && <p role="status">새 판으로 저장했습니다.</p>}
      <button type="submit" disabled={pending}>
        {pending ? "저장 중…" : "구성·문장 저장"}
      </button>
    </form>
  );
}
