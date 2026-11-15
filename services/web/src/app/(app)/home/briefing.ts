import type { Activity, CareerRecordListItem, JobPostingSummary, PortfolioSummary } from "@expresso/contracts";

import { isIncompleteRecord } from "@/features/career-editor/views/record-completeness";
import { rawValue } from "@/features/career-editor/views/view-types";

import type { StartAction } from "./HomeStart";
import { biggestDrop, type ActiveBrew, type SiteInsight } from "./home-model";

/**
 * 홈의 에이전트 제안. 저장된 데이터를 집계해서 만든다 — AI를 부르지 않는다.
 *
 * 제안 하나는 근거 한 문장과 동작 하나다. 동작이 대화면(`chat`) 그 자료와 요청문을 홈의
 * 입력창에 채운다. AI 실행은 사용자가 보내기를 눌러야 시작된다.
 */
export type BriefingAction = StartAction;

export type BriefingItem = { label: string; href: string; external?: boolean };

export type BriefingFinding = {
  id: string;
  text: string;
  items: BriefingItem[];
  action: BriefingAction;
};

/** 서비스가 확인한 것 하나와 거기서 찾은 제안. 순서는 기록 → 포트폴리오 → 기회다. */
export type BriefingStep = {
  key: "records" | "portfolios" | "opportunities";
  icon: string;
  title: string;
  findings: BriefingFinding[];
};

/** 마감 임박의 기준. 공고 목록의 `deadline=urgent`와 같은 7일이다. */
const URGENT_DAYS = 7;
/** 제안 한 줄에 세우는 항목 수. */
const ITEMS = 3;
/** 성과를 숫자로 적는 분류 — 경험 · 프로젝트 · 활동. 학력 · 자격 · 스킬은 숫자가 없어도 된다. */
const OUTCOME_CATEGORIES = new Set(["experience", "project", "activity_leadership"]);

function recordItem(record: CareerRecordListItem): BriefingItem {
  return { label: record.title || "제목 없음", href: `/career/records/${record.id}` };
}

/** 성과를 적는 분류인데 본문과 성과 속성 어디에도 숫자가 없는 기록. */
export function lacksNumbers(record: CareerRecordListItem): boolean {
  if (!OUTCOME_CATEGORIES.has(record.categoryKey)) return false;
  const outcome = rawValue(record, "outcome");
  return !/\d/.test(`${record.bodyMd} ${typeof outcome === "string" ? outcome : ""}`);
}

export function briefingSteps(input: {
  records: readonly CareerRecordListItem[];
  recordTotal: number;
  brews: readonly ActiveBrew[];
  portfolios: readonly PortfolioSummary[];
  sites: readonly SiteInsight[];
  watched: readonly JobPostingSummary[];
  jobTotal: number;
  contests: readonly Activity[];
  brewHref: (brew: ActiveBrew) => string;
}): BriefingStep[] {
  const { records, brews, portfolios, sites, watched, contests } = input;

  // ── 기록 ──
  const empty = records.filter((record) => isIncompleteRecord(record, record.categoryKey));
  const numberless = records.filter((record) => !empty.includes(record) && lacksNumbers(record));
  const recordFindings: BriefingFinding[] = [];
  if (input.recordTotal === 0) {
    recordFindings.push({
      id: "first-record",
      text: "아직 기록이 없습니다",
      items: [],
      action: {
        kind: "chat",
        label: "질문받으며 첫 기록 남기기",
        prompt: "내 경험을 기록으로 남기고 싶어. 한 번에 하나씩 질문해 주고, 답을 모아 새 기록 초안을 만들어 줘.",
        contexts: [],
        contextLabels: [],
      },
    });
  }
  if (numberless[0]) {
    recordFindings.push({
      id: "numberless",
      text: `성과에 숫자가 없는 기록 ${numberless.length}건`,
      items: numberless.slice(0, ITEMS).map(recordItem),
      action: {
        kind: "chat",
        label: "질문받고 채우기",
        prompt: "이 기록에서 성과를 숫자로 적을 수 있는 부분을 한 번에 하나씩 질문해 줘. 답을 받으면 기록 변경 제안을 만들어 줘. 내가 말하지 않은 수치는 넣지 마.",
        contexts: [{ kind: "record", id: numberless[0].id }],
        contextLabels: [{ key: `record:${numberless[0].id}`, label: numberless[0].title || "제목 없음" }],      },
    });
  }
  if (empty[0]) {
    recordFindings.push({
      id: "empty",
      text: `채울 것이 남은 기록 ${empty.length}건`,
      items: empty.slice(0, ITEMS).map(recordItem),
      action: {
        kind: "chat",
        label: "질문받고 채우기",
        prompt: "이 기록에 비어 있는 내용을 한 번에 하나씩 질문해 줘. 답을 받으면 기록 변경 제안을 만들어 줘.",
        contexts: [{ kind: "record", id: empty[0].id }],
        contextLabels: [{ key: `record:${empty[0].id}`, label: empty[0].title || "제목 없음" }],      },
    });
  }

  // ── 포트폴리오 ──
  const built = new Set(portfolios.map(({ brewId }) => brewId));
  const unfinished = brews.filter(({ id }) => !built.has(id));
  const portfolioFindings: BriefingFinding[] = [];
  if (unfinished[0]) {
    portfolioFindings.push({
      id: "unfinished",
      text: `만들다 만 포트폴리오 ${unfinished.length}개`,
      items: unfinished.slice(0, ITEMS).map((brew) => ({ label: brew.title ?? "제목 없는 제작", href: input.brewHref(brew) })),
      action: { kind: "link", label: "이어서 만들기", href: input.brewHref(unfinished[0]) },
    });
  }
  for (const site of sites) {
    const portfolio = portfolios.find(({ id }) => id === site.portfolioId);
    const drop = biggestDrop(site.visits, site.sections.map((section) => section.views));
    const section = drop >= 0 ? site.sections[drop] : undefined;
    if (!portfolio || site.visits === 0) continue;
    portfolioFindings.push({
      id: `site-${site.portfolioId}`,
      text: section
        ? `${site.subdomain} 30일 방문 ${site.visits}회 · 「${section.title}」에서 읽은 수가 가장 많이 줄었습니다`
        : `${site.subdomain} 30일 방문 ${site.visits}회 · 연락처 클릭 ${site.contactClicks}회`,
      items: [{ label: portfolio.title, href: `/analytics?portfolio=${portfolio.id}` }],
      action: {
        kind: "chat",
        label: section ? "이 섹션 함께 고치기" : "구성 함께 검토하기",
        prompt: section
          ? `이 포트폴리오의 「${section.title}」 섹션에서 방문자가 가장 많이 떠났어. 이 섹션을 어떻게 고치면 좋을지 제안해 줘. 지표만으로 원인을 단정하지는 마.`
          : "이 포트폴리오의 방문 지표를 보고 구성에서 손볼 곳을 제안해 줘. 지표만으로 원인을 단정하지는 마.",
        contexts: [{ kind: "portfolio", id: portfolio.id }],
        contextLabels: [{ key: `portfolio:${portfolio.id}`, label: portfolio.title }],      },
    });
  }
  const latest = portfolios[0];
  if (sites.length === 0 && latest) {
    portfolioFindings.push({
      id: "no-site",
      text: "공개 중인 포트폴리오가 없습니다",
      items: [{ label: latest.title, href: `/edit/${latest.id}` }],
      action: { kind: "link", label: "최근 초안 열기", href: `/edit/${latest.id}` },
    });
  }

  // ── 기회 ──
  const closing = watched.filter((job) => job.daysLeft !== null && job.daysLeft >= 0 && job.daysLeft <= URGENT_DAYS);
  const closingContests = contests.filter((contest) => contest.daysLeft <= URGENT_DAYS);
  const opportunityFindings: BriefingFinding[] = [];
  if (closing[0]) {
    opportunityFindings.push({
      id: "closing-jobs",
      text: `관심 공고 ${closing.length}건이 ${URGENT_DAYS}일 안에 마감됩니다`,
      items: closing.slice(0, ITEMS).map((job) => ({ label: `${job.company.name} · ${job.title}`, href: `/jobs/${job.id}` })),
      action: {
        kind: "chat",
        label: "요건 대조하기",
        prompt: "이 공고의 자격 요건을 내 커리어 기록과 비교해 줘. 근거가 있는 요건과 근거가 약하거나 없는 요건을 나눠서 알려 줘.",
        contexts: [{ kind: "job", id: closing[0].id }],
        contextLabels: [{ key: `job:${closing[0].id}`, label: closing[0].title }],      },
    });
  }
  if (closingContests[0]) {
    opportunityFindings.push({
      id: "closing-contests",
      text: `IT 공모전 ${closingContests.length}건이 ${URGENT_DAYS}일 안에 접수를 마감합니다`,
      items: closingContests.slice(0, ITEMS).map((contest) => ({ label: contest.title, href: contest.url, external: true })),
      action: { kind: "link", label: "공모전 보기", href: "/jobs?kind=contest" },
    });
  }

  return [
    { key: "records", icon: "notebook", title: `커리어 기록 ${input.recordTotal}건 확인`, findings: recordFindings },
    {
      key: "portfolios",
      icon: "browsers",
      title: `포트폴리오 ${portfolios.length}개${unfinished.length ? ` · 만드는 중 ${unfinished.length}개` : ""} 확인`,
      findings: portfolioFindings,
    },
    {
      key: "opportunities",
      icon: "compass",
      title: `채용 공고 ${input.jobTotal}건 · 공모전 ${contests.length}건 확인`,
      findings: opportunityFindings,
    },
  ];
}
