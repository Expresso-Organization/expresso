"use client";

import { MEDIA_MAX_BYTES, MEDIA_MIME_TYPES, type RecipeV2 } from "@expresso/contracts";

import { Icon } from "@/components/ui/Icon";
import { MediaUploader } from "@/components/ui/MediaUploader";

import styles from "./SourceRail.module.css";
import type { RecordCard, RequirementCard } from "./Workbench";

/**
 * 왼쪽 — 내용을 고른다.
 *
 * 세 탭이다: 이 제작에 고른 **기록**, 올린 **미디어**, 공고의 **요건**. 항목마다
 * 어느 섹션에 쓰였는지가 붙고, 안 쓴 것은 그렇다고 보인다. 문장을 고른 채로
 * 누르면 그 문장에 붙는다 — 기록 · 요건은 근거로, 미디어는 그림으로.
 *
 * 어디에 무엇을 붙일지는 `Workbench` 가 정한다. 여기는 목록과 쓴 곳만 안다.
 */

export type SourceTab = "records" | "media" | "requirements";

/** 올린 그림 한 장. 주소는 화면이 미리 만든다 — 여기는 API 를 모른다. */
export type MediaCard = { id: string; url: string; width: number; height: number };

type Section = RecipeV2["sections"][number];
type Item = Section["items"][number];

export const SOURCE_TAB_LABEL: Record<SourceTab, string> = { records: "기록", media: "미디어", requirements: "공고 요건" };

function no(order: number): string {
  return String(order + 1).padStart(2, "0");
}

/** 어느 섹션이 이것을 쓰는가. 번호 순서다. */
function usedIn(sections: Section[], test: (item: Item) => boolean): Section[] {
  return sections.filter(({ items }) => items.some(test));
}

export function SourceRail({
  tab,
  onTab,
  sections,
  records,
  requirements,
  media,
  unusedReasons,
  selected,
  onBindRecord,
  onBindRequirement,
  onPickMedia,
  onUpload,
  onReveal,
}: {
  tab: SourceTab;
  onTab: (tab: SourceTab) => void;
  sections: Section[];
  records: RecordCard[];
  requirements: RequirementCard[];
  media: MediaCard[];
  /** 초안이 이 기록을 안 쓴 이유. 쓴 곳이 없을 때만 보인다. */
  unusedReasons: Map<string, string>;
  selected: Item | null;
  onBindRecord: (recordId: string) => void;
  onBindRequirement: (requirementId: string) => void;
  onPickMedia: (assetId: string) => void;
  onUpload: (file: File) => Promise<string | null>;
  onReveal: (sectionId: string) => void;
}) {
  const boundToSelected = new Set(selected?.sourceBindings.map(({ sourceId }) => sourceId) ?? []);

  function Where({ used }: { used: Section[] }) {
    if (used.length === 0) return <span className={styles.unused}>안 씀</span>;
    return (
      <span className={styles.where}>
        {used.map((section) => (
          <button key={section.id} type="button" onClick={() => onReveal(section.id)} title={section.title || "이름 없는 섹션"}>
            {no(section.order)}
          </button>
        ))}
      </span>
    );
  }

  return (
    <div className={styles.rail}>
      <div className={styles.tabs} role="tablist" aria-label="내용">
        {(Object.keys(SOURCE_TAB_LABEL) as SourceTab[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={styles.tab}
            onClick={() => onTab(key)}
          >
            {SOURCE_TAB_LABEL[key]}
            <i>{key === "records" ? records.length : key === "media" ? media.length : requirements.length}</i>
          </button>
        ))}
      </div>

      {tab === "records" ? (
        <div className={styles.list} role="tabpanel">
          {records.length === 0 ? <p className={styles.empty}>이 제작에 고른 기록이 없습니다.</p> : null}
          {records.map((record) => {
            const used = usedIn(sections, ({ sourceBindings }) => sourceBindings.some(({ sourceId }) => sourceId === record.recordId));
            const reason = used.length === 0 ? unusedReasons.get(record.recordId) : undefined;
            const already = boundToSelected.has(record.recordId);
            return (
              <div key={record.recordId} className={styles.row} data-unused={used.length === 0 ? "1" : undefined}>
                <span className={styles.rowHead}>
                  <Icon name={record.categoryIcon} size={13} />
                  <b>{record.title}</b>
                  {selected ? (
                    <button type="button" className={styles.attach} disabled={already} onClick={() => onBindRecord(record.recordId)} aria-label={`${record.title}을(를) 고른 문장의 근거로`}>
                      <Icon name={already ? "check" : "plus"} size={12} /> {already ? "붙음" : "붙이기"}
                    </button>
                  ) : null}
                </span>
                <span className={styles.rowMeta}>
                  <em>{record.categoryName}</em>
                  <Where used={used} />
                </span>
                {reason ? <span className={styles.reason}>{reason}</span> : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {tab === "media" ? (
        <div className={styles.list} role="tabpanel">
          <MediaUploader accept={MEDIA_MIME_TYPES} maxBytes={MEDIA_MAX_BYTES} onFile={onUpload} compact label="이미지 올리기" />
          {media.length === 0 ? <p className={styles.empty}>올린 이미지가 없습니다. 화면 캡처 · 로고 · 사진을 올리면 문장에 놓을 수 있습니다.</p> : null}
          <div className={styles.grid}>
            {media.map((asset) => {
              const used = usedIn(sections, ({ media: own }) => own?.assetId === asset.id);
              return (
                <div key={asset.id} className={styles.tile} data-unused={used.length === 0 ? "1" : undefined}>
                  <button
                    type="button"
                    className={styles.thumb}
                    disabled={!selected}
                    onClick={() => onPickMedia(asset.id)}
                    title={selected ? (selected.kind === "media" ? "고른 문장의 그림으로" : "고른 문장 다음에 놓기") : "문장을 고르면 놓을 수 있습니다"}
                  >
                    {/* 목록 축소판 — 640 계단이면 충분하다. */}
                    <img src={asset.url} alt="" width={asset.width} height={asset.height} loading="lazy" />
                  </button>
                  <span className={styles.tileMeta}>
                    <em>{asset.width}×{asset.height}</em>
                    <Where used={used} />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {tab === "requirements" ? (
        <div className={styles.list} role="tabpanel">
          {requirements.length === 0 ? <p className={styles.empty}>고른 공고가 없거나 요건을 읽지 못했습니다.</p> : null}
          {requirements.map((requirement) => {
            const used = usedIn(sections, ({ sourceBindings }) => sourceBindings.some(({ sourceId }) => sourceId === requirement.id));
            const already = boundToSelected.has(requirement.id);
            return (
              <div key={requirement.id} className={styles.row} data-unused={used.length === 0 ? "1" : undefined}>
                <span className={styles.rowHead}>
                  <Icon name="target" size={13} />
                  <b className={styles.wrap}>{requirement.label}</b>
                  {selected ? (
                    <button type="button" className={styles.attach} disabled={already} onClick={() => onBindRequirement(requirement.id)} aria-label="고른 문장의 근거로">
                      <Icon name={already ? "check" : "plus"} size={12} /> {already ? "붙음" : "붙이기"}
                    </button>
                  ) : null}
                </span>
                <span className={styles.rowMeta}><Where used={used} /></span>
              </div>
            );
          })}
        </div>
      ) : null}

      {!selected ? (
        <p className={styles.hint}>문장을 고르면 여기서 바로 붙일 수 있습니다.</p>
      ) : null}
    </div>
  );
}
