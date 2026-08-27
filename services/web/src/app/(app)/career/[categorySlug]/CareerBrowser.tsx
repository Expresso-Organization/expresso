"use client";

import type {
  CareerCategory,
  CareerRecordListItem,
  CareerRecordSummary,
  CareerViewType,
} from "@expresso/contracts";
import { useState } from "react";

import { Icon } from "@/components/ui/Icon";

import { DocumentPanel } from "./DocumentPanel";
import styles from "./page.module.css";

/** 05–05e 카테고리별 1–2문장 설명 (화면 정의서). */
const CATEGORY_BLURB: Record<string, string> = {
  experience:
    "대화로 꺼낸 순간들을 문서로 관리합니다. 직접 쓰거나, 바리스타에게 질문을 받아 채울 수 있습니다.",
  project:
    "만든 것과 그 결과를 모읍니다. 성과 수치가 있으면 포트폴리오에 그대로 쓰입니다.",
  education_history:
    "시간 순서가 중요한 기록입니다. 재직 중인 이력은 타임라인에서 진행 중으로 표시됩니다.",
  certification_award: "발급 기관과 취득일, 증빙까지 한 곳에 둡니다.",
  academic_writing:
    "논문과 글은 외부 지표까지 함께 봅니다. 어떤 문단이 포트폴리오로 갔는지도 남습니다.",
  activity_leadership: "조직에서 맡은 역할과 규모를 남깁니다.",
  skill_tool:
    "직접 고르지 않아도 됩니다. 기록에 등장한 도구를 세어 자동으로 채웠습니다.",
};

const VIEW_LABEL: Record<CareerViewType, string> = {
  table: "테이블",
  gallery: "갤러리",
  timeline: "타임라인",
  board: "보드",
  list: "목록",
};

/** §6.3 카테고리마다 기본 뷰와 제공 뷰가 다르다. */
const OFFERED_VIEWS: Record<string, readonly CareerViewType[]> = {
  experience: ["table", "board", "timeline"],
  project: ["gallery", "table", "timeline"],
  education_history: ["timeline", "table", "gallery"],
  certification_award: ["table", "gallery"],
  academic_writing: ["list", "timeline"],
  activity_leadership: ["table", "timeline"],
  skill_tool: ["board", "table"],
};

const CATEGORY_ICONS: Record<string, string> = {
  experience: "chat-circle-dots",
  project: "briefcase",
  education_history: "graduation-cap",
  certification_award: "certificate",
  academic_writing: "article",
  activity_leadership: "users-three",
  skill_tool: "code",
};

function periodText(record: CareerRecordListItem): string {
  if (!record.periodFrom) return "—";
  return record.periodFrom.slice(0, 7).replace("-", ".");
}

/** 화면 정의서의 "비어 있음"은 DB status가 아니라 본문·속성이 모두 빈 상태다. */
function statusOf(record: CareerRecordListItem): {
  label: string;
  signature: boolean;
} {
  if (record.isEmpty) return { label: "비어 있음", signature: false };
  if (record.status === "draft") return { label: "초안", signature: false };
  if (record.status === "verified") return { label: "검증됨", signature: true };
  return { label: "정리됨", signature: true };
}

function competencies(record: CareerRecordListItem): string[] {
  const values = Object.values(record.properties).flatMap((value) =>
    Array.isArray(value) ? value : [],
  );
  return values.slice(0, 2);
}

export function CareerBrowser({
  category,
  records,
  summary,
}: {
  category: CareerCategory;
  records: readonly CareerRecordListItem[];
  summary: CareerRecordSummary;
}) {
  const views = OFFERED_VIEWS[category.key] ?? ["table"];
  const [view, setView] = useState<CareerViewType>(
    views.includes(category.defaultView) ? category.defaultView : views[0]!,
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    records[0]?.id ?? null,
  );

  const selected = records.find((record) => record.id === selectedId) ?? null;

  const summaryParts = [
    `${summary.total}개`,
    ...(summary.draft > 0 ? [`초안 ${summary.draft}`] : []),
    ...(summary.empty > 0 ? [`비어 있음 ${summary.empty}`] : []),
  ];

  return (
    <>
      <div className={styles.list}>
        <div className={styles.categoryHead}>
          <span className={styles.categoryIcon}>
            <Icon
              name={CATEGORY_ICONS[category.key] ?? "file-text"}
              weight="fill"
              size={18}
              color="var(--ex-accent-text)"
            />
          </span>
          <span className={styles.categoryName}>{category.name}</span>
          <span className={`${styles.caret} ex-anim-caret`} aria-hidden="true" />
        </div>
        <p className={styles.categoryBlurb}>
          {CATEGORY_BLURB[category.key] ?? "이 카테고리의 기록입니다."}
        </p>

        <div className={styles.viewBar}>
          {views.map((key) => (
            <button
              key={key}
              type="button"
              className={`${styles.viewTab} ${
                key === view ? styles.viewTabActive : ""
              }`}
              aria-current={key === view ? "true" : undefined}
              onClick={() => setView(key)}
            >
              {VIEW_LABEL[key]}
            </button>
          ))}
          <button type="button" className={styles.viewTab}>
            ＋ 뷰 추가
          </button>
          <div className={styles.viewBarRight}>
            <button type="button" className={styles.viewBarAction}>
              필터
            </button>
            <button type="button" className={styles.viewBarAction}>
              정렬
            </button>
            <button type="button" className={styles.viewBarAction}>
              속성
            </button>
            <div className={styles.splitButton}>
              <button type="button" className={styles.splitPrimary}>
                새로 만들기
              </button>
              <span className={styles.splitDivider} />
              <button type="button" className={styles.splitAi}>
                <Icon name="coffee" weight="fill" size={12} />
                AI로 만들기
              </button>
            </div>
          </div>
        </div>

        {records.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>아직 기록이 없습니다</p>
            <p className={styles.emptyBody}>
              기록 3건만 있으면 공고 추천이 시작됩니다.
              <br />
              하나만 먼저 적거나, 바리스타에게 질문을 받아 채울 수 있습니다.
            </p>
            <button type="button" className={styles.emptyAction}>
              바리스타에게 질문받기
            </button>
          </div>
        ) : (
          <>
            {view === "table" ? (
              <TableView
                records={records}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            ) : null}
            {view === "gallery" ? (
              <GalleryView records={records} onSelect={setSelectedId} />
            ) : null}
            {view === "timeline" ? (
              <TimelineView records={records} onSelect={setSelectedId} />
            ) : null}
            {view === "board" ? (
              <BoardView records={records} onSelect={setSelectedId} />
            ) : null}
            {view === "list" ? (
              <ListView records={records} onSelect={setSelectedId} />
            ) : null}

            <div className={styles.summary}>
              <span className={styles.summaryText}>
                {summaryParts.join(" · ")}
              </span>
              <span className={`${styles.summaryText} ${styles.summaryRight}`}>
                합계 계산
              </span>
            </div>
          </>
        )}
      </div>

      <DocumentPanel
        record={selected}
        categoryKey={category.key}
        categoryName={category.name}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}

function TableView({
  records,
  selectedId,
  onSelect,
}: {
  records: readonly CareerRecordListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className={styles.table}>
      <div className={`${styles.row} ${styles.headRow}`}>
        <div className={styles.headCell}>
          <Icon name="text-aa" size={12} color="var(--ex-fg-muted)" />
          <span className={styles.headLabel}>제목</span>
        </div>
        <div className={styles.headCell}>
          <Icon name="circle-half" size={12} color="var(--ex-fg-muted)" />
          <span className={styles.headLabel}>상태</span>
        </div>
        <div className={styles.headCell}>
          <Icon name="tag" size={12} color="var(--ex-fg-muted)" />
          <span className={styles.headLabel}>역량</span>
        </div>
        <div className={styles.headCell}>
          <Icon name="calendar-blank" size={12} color="var(--ex-fg-muted)" />
          <span className={styles.headLabel}>시기</span>
        </div>
        <div className={styles.headCell}>
          <Icon name="link-simple" size={12} color="var(--ex-fg-muted)" />
          <span className={styles.headLabel}>사용처</span>
        </div>
        <div className={styles.headCellAction}>
          <Icon name="plus" size={13} color="var(--ex-fg-muted)" />
        </div>
      </div>

      {records.map((record) => {
        const status = statusOf(record);
        const tags = competencies(record);
        const isAi = record.origin === "ai" || record.origin === "interview";
        return (
          <div
            key={record.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(record.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(record.id);
              }
            }}
            className={`${styles.row} ${styles.bodyRow} ${
              record.id === selectedId ? styles.bodyRowSelected : ""
            }`}
          >
            <div className={styles.titleCell}>
              <Icon
                name="dots-six-vertical"
                size={13}
                className={styles.rowOnly}
              />
              <Icon name="file-text" size={14} color="var(--ex-fg-muted)" />
              <span className={styles.recordTitle}>
                {record.title || "제목 없음"}
              </span>
              {isAi ? <span className={styles.aiBadge}>AI</span> : null}
            </div>
            <div className={styles.cell}>
              <span
                className={
                  status.signature ? styles.statusOrganized : styles.statusPlain
                }
              >
                {status.label}
              </span>
            </div>
            <div className={`${styles.cell} ${styles.cellTags}`}>
              {tags.map((tag) => (
                <span key={tag} className={styles.tag}>
                  {tag}
                </span>
              ))}
            </div>
            <div className={styles.cell}>{periodText(record)}</div>
            <div
              className={`${styles.cell} ${
                record.usedInCount > 0 ? styles.cellStrong : ""
              }`}
            >
              {record.usedInCount > 0 ? `${record.usedInCount}곳` : "—"}
            </div>
            <div className={styles.cellAction}>
              <Icon
                name="dots-three"
                size={15}
                className={`${styles.rowOnly} ${styles.rowMenu}`}
              />
            </div>
          </div>
        );
      })}

      <button type="button" className={styles.newRow}>
        <Icon name="plus" size={13} color="var(--ex-fg-muted)" />
        <span className={styles.newRowLabel}>새로 만들기</span>
        <span className={styles.newRowOr}>또는</span>
        <span className={styles.newRowAi}>바리스타에게 질문받기</span>
      </button>
    </div>
  );
}

function GalleryView({
  records,
  onSelect,
}: {
  records: readonly CareerRecordListItem[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className={styles.gallery}>
      {records.map((record) => (
        <button
          key={record.id}
          type="button"
          className={styles.galleryCard}
          onClick={() => onSelect(record.id)}
        >
          <div className={styles.galleryBody}>
            <div className={styles.galleryTitle}>
              {record.title || "제목 없음"}
            </div>
            <div className={styles.galleryMeta}>{periodText(record)}</div>
            {record.isEmpty ? (
              <div className={styles.galleryMissing}>성과 수치 없음</div>
            ) : null}
          </div>
        </button>
      ))}
    </div>
  );
}

function TimelineView({
  records,
  onSelect,
}: {
  records: readonly CareerRecordListItem[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className={styles.timeline}>
      {records.map((record) => {
        const ongoing = Boolean(record.periodFrom) && !record.periodTo;
        return (
          <div key={record.id} className={styles.timelineRow}>
            <span className={styles.timelinePeriod}>
              {record.periodFrom
                ? `${record.periodFrom.slice(0, 7).replace("-", ".")}${
                    ongoing
                      ? " – 현재"
                      : record.periodTo
                        ? ` – ${record.periodTo.slice(0, 7).replace("-", ".")}`
                        : ""
                  }`
                : "—"}
            </span>
            <span className={styles.timelineAxis} aria-hidden="true">
              <span
                className={`${styles.timelineDot} ${
                  ongoing ? styles.timelineDotOngoing : ""
                }`}
              />
            </span>
            <button
              type="button"
              className={styles.timelineCard}
              onClick={() => onSelect(record.id)}
            >
              <span className={styles.recordTitle}>
                {record.title || "제목 없음"}
              </span>
              {record.linkCount > 0 ? (
                <div className={styles.galleryMeta}>
                  연결 {record.linkCount}건
                </div>
              ) : null}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function BoardView({
  records,
  onSelect,
}: {
  records: readonly CareerRecordListItem[];
  onSelect: (id: string) => void;
}) {
  const groups = new Map<string, CareerRecordListItem[]>();
  for (const record of records) {
    const key =
      typeof record.properties.group === "string"
        ? record.properties.group
        : "분류 없음";
    const bucket = groups.get(key) ?? [];
    bucket.push(record);
    groups.set(key, bucket);
  }

  return (
    <div className={styles.board}>
      {[...groups.entries()].map(([group, items]) => (
        <div key={group} className={styles.boardColumn}>
          <span className={styles.boardLabel}>
            {group} {items.length}
          </span>
          {items.map((record) => (
            <button
              key={record.id}
              type="button"
              className={styles.boardCard}
              onClick={() => onSelect(record.id)}
            >
              {record.title || "제목 없음"}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function ListView({
  records,
  onSelect,
}: {
  records: readonly CareerRecordListItem[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className={styles.listView}>
      {records.map((record) => (
        <button
          key={record.id}
          type="button"
          className={styles.listRow}
          onClick={() => onSelect(record.id)}
        >
          <Icon name="file-text" size={14} color="var(--ex-fg-muted)" />
          <span className={styles.recordTitle}>
            {record.title || "제목 없음"}
          </span>
          <span className={styles.galleryMeta}>{periodText(record)}</span>
        </button>
      ))}
    </div>
  );
}
