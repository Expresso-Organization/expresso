import type {
  JobSource,
  JobPostingCategory,
  JobPostingFacet,
  JobPostingSummary,
  JobSearchCondition,
  RecentJobSearch,
} from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";

import { AppBody, AppHeader } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { jobs as jobsApi } from "@/lib/api/endpoints";
import { BROWSE_QUERY_PLACEHOLDER, SIMILAR_SEARCHES } from "@/lib/sample/jobs";
import { requireSession } from "@/lib/require-session";

import { JobRowList, deadlineLabel } from "./JobRows";
import { ConditionChip } from "./ConditionChip";
import { currentListQuery, detailHref } from "./list-query";
import { Pagination } from "./Pagination";
import { ALL, JobFilter, type FilterSection } from "./JobFilter";
import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import styles from "./page.module.css";

/**
 * §2.1 — `/jobs?q=…`는 00b(AI 검색 결과), q가 없으면 06(공고 탐색).
 * 한 라우트에서 갈라진다.
 *
 * 공고 · 일치도 · 관심 · 카테고리 집계는 `GET /v1/jobs/postings`에서 온다.
 */

/**
 * 아무것도 안 고른 06이 보여주는 나라.
 *
 * 우리가 모으는 곳은 국내 회사인데 그 회사들이 해외 법인 자리도 함께 올린다 —
 * 158건 중 70건이 인도·미국·대만이다. 첫 화면이 그걸 섞어 보여주면 국내에서
 * 일자리를 찾는 사람이 첫 쪽부터 지원할 수 없는 공고를 읽는다.
 *
 * 감추는 것이 아니다. 필터를 열면 `전체`가 맨 위에 있고 나라마다 건수가 적혀
 * 있다. 기본값을 정하는 것과 없는 척하는 것은 다르다.
 */
const DEFAULT_COUNTRY = "한국";

/**
 * 연차 칸막이의 이름과 값. 계약이 내는 라벨과 주소에 실을 숫자를 잇는다.
 *
 * 서버(`board-service`)가 같은 칸막이를 쓴다. 두 곳이 갈리면 필터가 켜져
 * 있는데 아무 줄도 안 켜진 것처럼 보인다.
 */
function experienceLabel(years: number): string {
  return years === 0 ? "신입" : `${years}년`;
}

function experienceValue(label: string): number {
  return label === "신입" ? 0 : Number.parseInt(label, 10);
}

/** 해석 칩에 쓰는 경력 표시. `conditionValue`가 쓰는 "N년 이상" 어투를 맞춘다. */
function experienceChipLabel(years: number): string {
  return years === 0 ? "신입 이상" : `${years}년 이상`;
}

const CONDITION_AXIS: Record<JobSearchCondition["field"], string> = {
  role: "직무",
  experience: "경력",
  work_type: "근무",
  location: "지역",
  salary: "연봉",
  company_size: "규모",
  technology: "기술",
};

/**
 * 축의 이름과 색은 정의서가 고정해 둔 것이고, 나머지는 실제 점수에서 온다.
 *
 * 오른쪽 숫자는 배점이 아니라 **공고가 요구한 건수 대비 충족 건수**다.
 * 축마다 다른 가중치를 주지 않는다 — 그 숫자의 근거를 댈 수 없어서 걷어냈다
 * (§8.1). 요구가 0건인 축은 계산에서 빠지므로 줄도 그리지 않는다.
 */
const AXIS_LABEL = [
  ["technology", "기술 스택", "var(--ex-fg)"],
  ["impact", "규모 · 지표", "var(--ex-fg-body)"],
  ["role", "역할 · 연차", "var(--ex-fg-muted)"],
  ["conditions", "근무 조건", "var(--ex-border-firm)"],
] as const;

function matchAxes(postings: readonly JobPostingSummary[]) {
  const axes = postings.find((posting) => posting.match)?.match?.axes;
  if (!axes) return [];
  return AXIS_LABEL.flatMap(([key, label, color]) => {
    const axis = axes[key];
    if (axis.required === 0) return [];
    return [{
      label,
      color,
      fill: Math.round((axis.covered / axis.required) * 100),
      weight: `${axis.covered}/${axis.required}`,
    }];
  });
}

const WORK_TYPE_LABEL: Record<string, string> = {
  remote: "리모트 가능",
  hybrid: "하이브리드",
  "on-site": "출근",
};

/** 파서가 내는 값은 기계용이다. 칩에는 사람이 읽는 말로 적는다. */
function conditionValue(condition: JobSearchCondition): string {
  const raw = String(condition.value);
  if (condition.field === "experience") return `${raw}년 이상`;
  if (condition.field === "salary") return `${Number(raw).toLocaleString("ko-KR")}만 이상`;
  if (condition.field === "work_type") return WORK_TYPE_LABEL[raw] ?? raw;
  if (condition.field === "technology") return raw.charAt(0).toUpperCase() + raw.slice(1);
  return raw;
}

/**
 * "어디서 모으나". **세지 않는다.**
 *
 * 전에는 여기 `838건`이 붙었는데, 그것은 **출처가 내놓은 수**지 우리가 들인
 * 수가 아니었다 — 쿠팡만 봐도 668건을 보고 108건을 들였다. 소프트웨어 직군만,
 * 지원할 수 있는 자리만, 본문 200자 이상만 들이기 때문에 차이가 크다.
 *
 * 수 자체는 진짜였지만, 40px 아래에 "공고 · 158건"이 서 있다. 뜻이 다른 두 수를
 * 나란히 세우면 **어느 값도 틀리지 않은 채로 화면이 거짓말을 한다** — 읽는
 * 사람은 838건을 갖고 있는데 158건만 보여준다고 읽는다.
 *
 * 그래서 헤더는 출처 이름만 댄다. 몇 건인지는 아래 목록이 이미 말하고 있고,
 * 그쪽은 지금 걸린 조건까지 반영한 수다.
 *
 * 이름은 앞의 셋만 든다. 스물일곱 곳을 다 적으면 헤더가 아니라 목록이 된다.
 */
function collectionNote(sources: JobSource[]): string {
  if (sources.length === 0) return "아직 모아 온 공고가 없습니다";
  // 한 번이라도 돌아 본 곳만 센다. 켜 두기만 하고 아직 안 돈 출처는 "모읍니다"에
  // 넣을 수 없다.
  const ran = sources.filter((source) => source.lastRunAt !== null);
  if (ran.length === 0) return `${sources.length}곳에서 모읍니다 · 아직 첫 수집 전`;
  const names = [...ran]
    .sort((left, right) => right.lastSeenCount - left.lastSeenCount)
    .map((source) => source.displayName);
  const shown = names.slice(0, 3).join(" · ");
  const rest = names.length > 3 ? ` 등 ${names.length}곳` : "";
  return `${shown}${rest}에서 모읍니다`;
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" && params.q.trim() ? params.q.trim() : undefined;
  const category = typeof params.category === "string" ? params.category : undefined;
  const sort = params.sort === "deadline" || params.sort === "recent" ? params.sort : "match";
  // 주소창의 숫자는 사용자가 고칠 수 있다. 1보다 작은 쪽은 없다.
  const page = Math.max(1, Number.parseInt(String(params.page ?? "1"), 10) || 1);
  /**
   * 근무지 나라. **적혀 있지 않으면 한국이다.**
   *
   * 이 화면을 쓰는 사람은 국내에서 일자리를 찾는다. 모아 둔 158건 중 70건이
   * 인도·미국·대만인데, 아무것도 안 고른 첫 화면이 그 70건을 섞어 보여주면
   * 대부분은 첫 쪽부터 넘길 수 없는 공고를 읽는다.
   *
   * 그래서 "안 고름"과 "전체"를 갈라 둔다 — `country=all`이라고 **적어야**
   * 전체다. 기본값을 주소에 안 적는 이유는 `/jobs`가 늘 같은 화면이어야
   * 하기 때문이다.
   */
  const countryExplicit = typeof params.country === "string" && params.country.trim()
    ? params.country.trim()
    : undefined;
  const country = countryExplicit ?? DEFAULT_COUNTRY;
  const countryFilter = country === "all" ? null : country;
  /**
   * 해석 칩에서 축 하나를 "끄기"로 누르면 그 축 값을 `off`로 적는다 —
   * 파라미터를 그냥 지우면 검색어가 다시 그 축을 읽어내 되살아나므로,
   * "안 골랐음"과 "꺼 버림"을 구분해야 한다. 아래 네 축(경력·지역·기술·직무)이
   * 모두 같은 규칙을 쓴다.
   */
  const experienceParam = typeof params.experience === "string" ? params.experience.trim() : "";
  const experienceOff = experienceParam === "off";
  const experienceParsed = Number.parseInt(experienceParam, 10);
  const experienceYears = !experienceOff && Number.isInteger(experienceParsed) && experienceParsed >= 0
    ? experienceParsed
    : undefined;
  const workType = typeof params.workType === "string" && params.workType.trim()
    ? params.workType.trim()
    : undefined;
  const company = typeof params.company === "string" && params.company.trim()
    ? params.company.trim()
    : undefined;
  // country처럼 기본값이 없다 — 검색어가 지역까지 읽어내면 그 값을 쓰고,
  // 아니면 나라 단위(country)까지만 걸린다.
  const locationParam = typeof params.location === "string" ? params.location.trim() : "";
  const locationOff = locationParam === "off";
  const locationExplicit = !locationOff && locationParam ? locationParam : undefined;
  // 기술 · 직무도 검색어에서 읽히지만, 칩으로 직접 고르거나 끌 수 있어야
  // "이렇게 이해했습니다" 줄이 실제로 동작한다.
  const technologyParam = typeof params.technology === "string" ? params.technology.trim() : "";
  const technologyOff = technologyParam === "off";
  const technologyExplicit = !technologyOff && technologyParam ? technologyParam : undefined;
  const familyParam = typeof params.family === "string" ? params.family.trim() : "";
  const familyOff = familyParam === "off";
  const familyExplicit = !familyOff && familyParam ? familyParam : undefined;
  const pageSize = 20;
  /*
   * 지금 걸린 조건을 한 문자열로 만들어 상세로 실어 보낸다. 상세 화면은
   * 어디서 왔는지 모르므로, 이걸 안 주면 돌아올 때 필터가 풀린다.
   */
  const listQuery = currentListQuery(params);
  const session = await requireSession();
  const now = Date.now();

  /*
   * 토큰만 있으면 되는 것들은 한 번에 나간다.
   *
   * 예전에는 해석 → 목록 → 수집처 순으로 줄을 서서, 관심 공고와 최근 검색이
   * 문장 해석이 끝나기를 기다렸다. 셋 다 검색어와 아무 상관이 없다.
   *
   * `session`은 여전히 앞에 둔다 — 만료된 토큰의 401을 받아 로그인으로 보내는
   * 관문이라, 이것과 나란히 세우면 만료 세션이 로그인 대신 오류 화면으로 샌다.
   *
   * 00b는 말로 쓴 조건을 먼저 해석하고, 그 결과를 실제 필터로 옮겨 찾는다.
   * 문장을 그대로 이름 매칭에 넣으면 아무것도 걸리지 않는다.
   */
  const [interpreted, watched, recent, sourceList] = await Promise.all([
    q ? jobsApi.interpret(session.accessToken, q, 0) : Promise.resolve(null),
    jobsApi.postings(session.accessToken, { interested: true, sort: "deadline", limit: 5 }),
    jobsApi.recentSearches(session.accessToken, 4),
    // 헤더가 "어디서 몇 건"을 말하려면 실제로 모으는 곳을 알아야 한다.
    // 예전에는 "원티드 · 잡코리아 · 링크드인에서 매일 아침 모아 옵니다 ·
    // 4,182건"이 적혀 있었는데, 셋 다 우리가 모을 수 없는 곳이고 4,182는
    // 지어낸 수였다.
    jobsApi.sources(session.accessToken),
  ]);

  const sources = sourceList.data.filter((source) => source.active);
  const derived = searchFilters(q, interpreted?.conditions ?? []);
  /**
   * 실제로 걸리는 나라·지역·연차·기술·직무 값. 주소에 명시된 값이 항상
   * 이기고, 없으면 검색어에서 읽어낸 값이, 그것도 없으면 기본값(나라는
   * 한국)이 쓰인다. 해석 칩 표시도 이 값을 그대로 써야 한다 — 안 그러면
   * "지역 · 미국"으로 해석해 놓고 칩은 "한국"이라고 보여주는 불일치가 생긴다.
   */
  const effectiveCountry = countryExplicit !== undefined || derived.country === undefined
    ? countryFilter
    : derived.country;
  /**
   * 검색어가 읽어낸 지역은 나라를 사용자가 직접 고르거나, 칩에서 "끄기"를
   * 누르면 접는다 — 안 그러면 "경기"를 검색해 놓고 근무지 칩에서 "미국"을
   * 눌렀는데 주소에는 여전히 `location=경기`가 남아 있어 아무 결과도 안
   * 나오는 모순이 생긴다.
   */
  const effectiveLocation = locationExplicit !== undefined
    ? locationExplicit
    : locationOff || countryExplicit !== undefined
      ? undefined
      : derived.location;
  const effectiveExperience = experienceYears !== undefined
    ? experienceYears
    : experienceOff
      ? undefined
      : derived.experience;
  const effectiveTechnology = technologyExplicit !== undefined
    ? technologyExplicit
    : technologyOff
      ? undefined
      : derived.technology;
  const effectiveFamily = familyExplicit !== undefined
    ? familyExplicit
    : familyOff
      ? undefined
      : derived.family;

  const listing = await jobsApi.postings(session.accessToken, {
    ...(q
      ? {
          ...derived,
          // 위에서 이미 최종 값을 다시 정했으니, 검색어가 읽어낸 값이 그대로
          // 새어 나가지 않게 여기서 먼저 비운다 — 특히 칩에서 "끄기"를 눌렀을
          // 때 이게 없으면 꺼지지 않는다.
          country: undefined,
          location: undefined,
          experience: undefined,
          technology: undefined,
          family: undefined,
        }
      : categoryFilter(category)),
    ...(effectiveCountry ? { country: effectiveCountry } : {}),
    ...(effectiveLocation ? { location: effectiveLocation } : {}),
    ...(effectiveExperience === undefined ? {} : { experience: effectiveExperience }),
    ...(effectiveTechnology ? { technology: effectiveTechnology } : {}),
    ...(effectiveFamily ? { family: effectiveFamily } : {}),
    ...(workType ? { workType } : {}),
    ...(company ? { company } : {}),
    sort,
    page,
    limit: pageSize,
  });

  // 결과 수를 알고 나서 최근 검색에 적어 둔다. 같은 말이면 새 줄이 생기지 않고
  // 방금 그 줄이 갱신된다.
  if (q) await jobsApi.interpret(session.accessToken, q, listing.summary.total);

  const postings = listing.data;

  /**
   * 축 하나만 바꾼 주소. 나머지 조건은 그대로 들고 가고 **쪽은 1로 되돌린다** —
   * 3쪽을 보다 조건을 바꾸면 그 쪽이 없을 수 있다.
   *
   * `null`을 주면 그 축을 푼다. 나라만 다르다 — 기본이 한국이라 "푼다"가
   * `country=all`이다.
   */
  const filterHref = (patch: {
    country?: string | null;
    experience?: number | null;
    workType?: string | null;
    company?: string | null;
  }): Route => {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (category) search.set("category", category);
    if (sort !== "match") search.set("sort", sort);

    const nextCountry = "country" in patch ? (patch.country ?? "all") : country;
    if (nextCountry !== DEFAULT_COUNTRY) search.set("country", nextCountry);

    const nextExperience = "experience" in patch ? patch.experience : experienceYears;
    if (nextExperience !== undefined && nextExperience !== null) {
      search.set("experience", String(nextExperience));
    }
    const nextWorkType = "workType" in patch ? patch.workType : workType;
    if (nextWorkType) search.set("workType", nextWorkType);
    const nextCompany = "company" in patch ? patch.company : company;
    if (nextCompany) search.set("company", nextCompany);

    const query = search.toString();
    return (query ? `/jobs?${query}` : "/jobs") as Route;
  };

  /** 쪽만 바꾸고 나머지 조건은 그대로 들고 간다. 필터가 풀리면 다른 목록이 된다. */
  const pageHref = (next: number): Route => {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (category) search.set("category", category);
    if (country !== DEFAULT_COUNTRY) search.set("country", country);
    if (locationExplicit) search.set("location", locationExplicit);
    if (experienceYears !== undefined) search.set("experience", String(experienceYears));
    if (workType) search.set("workType", workType);
    if (company) search.set("company", company);
    if (sort !== "match") search.set("sort", sort);
    if (next > 1) search.set("page", String(next));
    const query = search.toString();
    return (query ? `/jobs?${query}` : "/jobs") as Route;
  };
  /**
   * 해석 칩 하나를 다른 값으로 바꾸거나 끄는 주소. `filterHref`와 달리
   * 축을 "껐다"를 축마다 `off`로 명시해 남겨야 한다 — 그냥 지우면 검색어가
   * 다시 그 값을 읽어내 되살아난다. 지금 바꾸는 축이 아니면 지금 상태(꺼져
   * 있으면 off, 골라 뒀으면 그 값)를 그대로 옮겨 적어, 다른 축을 바꿀 때 이
   * 축이 조용히 풀리지 않게 한다.
   */
  const conditionHref = (
    patch: {
      location?: string | null;
      experience?: number | null;
      technology?: string | null;
      family?: string | null;
    },
  ): Route => {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (sort !== "match") search.set("sort", sort);
    if (country !== DEFAULT_COUNTRY) search.set("country", country);
    if (workType) search.set("workType", workType);
    if (company) search.set("company", company);

    if ("location" in patch) {
      search.set("location", patch.location === null || patch.location === undefined ? "off" : patch.location);
    } else if (locationOff) {
      search.set("location", "off");
    } else if (locationExplicit) {
      search.set("location", locationExplicit);
    }

    if ("experience" in patch) {
      search.set(
        "experience",
        patch.experience === null || patch.experience === undefined ? "off" : String(patch.experience),
      );
    } else if (experienceOff) {
      search.set("experience", "off");
    } else if (experienceYears !== undefined) {
      search.set("experience", String(experienceYears));
    }

    if ("technology" in patch) {
      search.set(
        "technology",
        patch.technology === null || patch.technology === undefined ? "off" : patch.technology,
      );
    } else if (technologyOff) {
      search.set("technology", "off");
    } else if (technologyExplicit) {
      search.set("technology", technologyExplicit);
    }

    if ("family" in patch) {
      search.set("family", patch.family === null || patch.family === undefined ? "off" : patch.family);
    } else if (familyOff) {
      search.set("family", "off");
    } else if (familyExplicit) {
      search.set("family", familyExplicit);
    }

    const query = search.toString();
    return (query ? `/jobs?${query}` : "/jobs") as Route;
  };
  /**
   * 필터에 세울 것들. 구획마다 `전체`가 맨 위고, 그 아래로 **걸린 것이 있는
   * 값만** 선다 — 0건짜리를 세우면 누를 수는 있는데 아무것도 없는 줄이 된다.
   *
   * 어느 축을 둘지는 데이터가 정했다. 158건을 세어 보니 근무지 158 · 경력 139 ·
   * 회사 158 · 근무 형태 39였고, 마감일과 기술 스택은 0이라 뺐다.
   */
  const summary = listing.summary;
  const sum = (rows: readonly { count: number }[]) =>
    rows.reduce((total, one) => total + one.count, 0);

  /**
   * 해석 칩(지역·경력·직무·기술)이 팝오버에 늘어놓을 값들.
   *
   * 경력·직무·기술은 이미 이 요청에서 받아 온 `summary`의 실제 집계를 그대로
   * 쓴다 — 새로 계산하지 않는다. 직무는 `summary.categories`의 `family:`
   * 칩과 같은 것이다(06 카테고리 칩이 쓰는 바로 그 집계). 지역은 나라 단위
   * 집계(`summary.countries`)만 있고 지역 단위 집계는 없어서, 건수 없이
   * 국내 지역 이름만 늘어놓는다.
   */
  const locationOptions = [...KOREAN_REGIONS].map((region) => ({ label: region, value: region }));
  const experienceOptions = summary.experienceLevels.map((one) => ({
    label: one.label,
    value: experienceValue(one.label),
    count: one.count,
  }));
  const familyOptions = summary.categories
    .filter((one) => one.key.startsWith("family:") && one.count > 0)
    .map((one) => ({ label: one.label, value: one.key.slice("family:".length), count: one.count }));
  const technologyOptions = summary.commonTechnologies.map((one) => ({
    label: one.label,
    value: one.label,
    count: one.count,
  }));

  const sections: FilterSection[] = [
    {
      key: "country",
      title: "근무지",
      active: effectiveCountry,
      options: [
        { label: ALL, count: sum(summary.countries), href: filterHref({ country: null }) },
        ...summary.countries.map((one) => ({
          label: one.label,
          count: one.count,
          href: filterHref({ country: one.label }),
        })),
      ],
    },
    {
      key: "experience",
      title: "내 경력",
      // 수가 서로를 품는다. 그렇게 읽으라고 적어 둔다.
      note: "지원할 수 있는 공고",
      active: effectiveExperience === undefined ? null : experienceLabel(effectiveExperience),
      options: [
        { label: ALL, count: summary.total, href: filterHref({ experience: null }) },
        ...summary.experienceLevels.map((one) => ({
          label: one.label,
          count: one.count,
          href: filterHref({ experience: experienceValue(one.label) }),
        })),
      ],
    },
    {
      key: "workType",
      title: "근무 형태",
      // `재택 · 출근 · 하이브리드`가 한 칸에 적힌 공고가 있다. 합이 전체를 넘는다.
      note: "여럿에 들 수 있음",
      active: workType ?? null,
      options: [
        { label: ALL, count: summary.total, href: filterHref({ workType: null }) },
        ...summary.workTypes.map((one) => ({
          label: one.label,
          count: one.count,
          href: filterHref({ workType: one.label }),
        })),
      ],
    },
    {
      key: "company",
      title: "회사",
      active: summary.companies.find((one) => one.key === company)?.label ?? null,
      options: [
        { label: ALL, count: sum(summary.companies), href: filterHref({ company: null }) },
        ...summary.companies.map((one) => ({
          label: one.label,
          count: one.count,
          href: filterHref({ company: one.key }),
        })),
      ],
    },
  ];

  const recordCount = session.categories.reduce(
    (sum, item) => sum + item.recordCount,
    0,
  );

  const header = (
    <AppHeader
      title={q ? "공고 검색" : "공고 탐색"}
      actions={
        <>
          <span className={styles.headNote}>{collectionNote(sources)}</span>
          <button type="button" className={styles.headAction}>
            <Icon name="bookmark-simple" size={14} color="var(--ex-fg-muted)" />
            관심 공고 {watched.summary.total}
          </button>
          <span className={styles.headRule} />
          <button type="button" className={styles.headAction}>
            <Icon name="bell-simple" size={14} color="var(--ex-fg-muted)" />
            알림 설정
          </button>
        </>
      }
    />
  );

  return (
    <>
      {header}
      <AppBody>
        <div className={styles.content}>
          {q ? (
            <SearchQueryCard
              query={q}
              conditions={interpreted?.conditions ?? []}
              effectiveByAxis={{
                location: effectiveLocation,
                experience: effectiveExperience,
                technology: effectiveTechnology,
                family: effectiveFamily,
              }}
              optionsByAxis={{
                location: locationOptions,
                experience: experienceOptions,
                technology: technologyOptions,
                family: familyOptions,
              }}
              conditionHref={conditionHref}
            />
          ) : (
            <BrowseSearchBar />
          )}

          {q ? null : (
            <div className={styles.categoryTabs}>
              {listing.summary.categories.map((chip) => (
                <Link
                  key={chip.key}
                  href={chipHref(chip)}
                  className={`${styles.categoryTab} ${
                    (category ?? "all") === chip.key ? styles.categoryTabActive : ""
                  }`}
                >
                  {chip.label}
                  <span className={styles.categoryCount}>{chip.count}</span>
                </Link>
              ))}
              <button type="button" className={styles.sortSelect}>
                내 기록과 가까운 순
                <Icon name="caret-down" size={10} />
              </button>
            </div>
          )}

          <div className={styles.columns}>
            <div className={styles.results}>
              <div className={styles.resultsHead}>
                <span className={styles.resultsCount}>
                  {q ? `결과 ${listing.summary.total}건` : `공고 · ${listing.summary.total}건`}
                </span>
                <span className={styles.resultsNote}>내 기록 {recordCount}건과 비교</span>
                {q ? (
                  <>
                    <div className={styles.sorts}>
                      {(
                        [
                          ["match", "일치도 순"],
                          ["deadline", "마감 순"],
                          ["recent", "최신 순"],
                        ] as const
                      ).map(([key, label]) => (
                        <Link
                          key={key}
                          href={
                            (key === "match"
                              ? `/jobs?q=${encodeURIComponent(q)}`
                              : `/jobs?q=${encodeURIComponent(q)}&sort=${key}`) as Route
                          }
                          className={`${styles.sort} ${sort === key ? styles.sortActive : ""}`}
                        >
                          {label}
                        </Link>
                      ))}
                    </div>
                  </>
                ) : null}
                <JobFilter sections={sections} />
              </div>

              <JobRowList
                jobs={postings}
                highlightFirst={Boolean(q)}
                tail={q ? "workType" : "experience"}
                now={now}
                listQuery={listQuery}
              />

              <div className={styles.resultsFoot}>
                <span className={styles.footText}>
                  {listing.summary.total === 0
                    ? "걸린 공고가 없습니다"
                    : `${listing.summary.total.toLocaleString("ko-KR")}건 중 ${
                        ((page - 1) * pageSize + 1).toLocaleString("ko-KR")
                      }–${
                        ((page - 1) * pageSize + postings.length).toLocaleString("ko-KR")
                      }`}
                </span>
                <Pagination page={listing.page} href={pageHref} />
                {q ? (
                  <span className={styles.footQuota}>
                    이번 달 추출 {session.quota.used} / {session.quota.limit ?? "무제한"}
                  </span>
                ) : null}
              </div>
            </div>

            <aside className={styles.rail}>
              {q ? (
                <SearchRail
                  total={listing.summary.total}
                  missing={listing.summary.missingTechnologies}
                  axes={matchAxes(postings)}
                  recent={recent.data}
                  query={q}
                />
              ) : (
                <BrowseRail
                  total={listing.summary.total}
                  common={listing.summary.commonTechnologies}
                  missing={listing.summary.missingTechnologies}
                  watched={watched.data}
                  now={now}
                  listQuery={listQuery}
                />
              )}
            </aside>
          </div>
        </div>
      </AppBody>
    </>
  );
}

/**
 * 검색 문장에서 나온 지역이 `서울`·`경기`처럼 국내 세부 지역명이면 API의
 * `location` 필터(나라보다 한 겹 더 좁다)로, 해외 지역명이면 `country`로
 * 보낸다. 이 목록은 백엔드 `ingest/classify.ts`의 REGION_RULES에서 나라가
 * `한국`인 지역들과 같아야 한다 — 국내 지역을 추가하면 여기도 같이 늘려야
 * 한다.
 */
const KOREAN_REGIONS = new Set([
  "서울", "경기", "인천", "부산", "대전", "대구", "광주", "제주", "한국 그 외",
]);

/**
 * "직무" 조건을 06 카테고리(`jobFamily`)로 옮길 때 쓰는 판정이다.
 *
 * `jobFamily`는 수집 시점에 `ingest/classify.ts`의 `FAMILY_RULES`로 이미 모든
 * 공고에 매겨져 있다(기술처럼 나중에 분석해야 채워지는 값이 아니다) — 그래서
 * 이 값과 맞추면 바로 걸린다. 패턴은 그 파일의 백엔드·프론트엔드 규칙을 그대로
 * 옮겼다 — 거기서 바뀌면 여기도 맞춰야 한다. 지금은 이 둘만 옮긴다(요청받은
 * 범위) — 나머지 갈래(모바일·데이터 등)도 같은 방식으로 늘릴 수 있다.
 */
const BACKEND_ROLE = /\b(backend|back-end|back end|server engineer|server developer|api engineer)\b|백\s?[엔앤]드|서버\s?(개발|엔지니어|프로그래머)/i;
const FRONTEND_ROLE = /\b(frontend|front-end|front end|web engineer|ui engineer)\b|프론트\s?[엔앤]드|퍼블리셔/i;

function familyFromRole(roleValue: string): string | undefined {
  if (BACKEND_ROLE.test(roleValue)) return "백엔드";
  if (FRONTEND_ROLE.test(roleValue)) return "프론트엔드";
  return undefined;
}

/**
 * 해석된 조건 중 API가 실제로 거를 수 있는 것만 필터로 옮긴다. 옮길 게
 * 하나도 없으면 적힌 말 그대로 이름·원문에서 찾는다 — 회사 이름으로 찾는
 * 사람도 있기 때문이다.
 */
function searchFilters(
  q: string | undefined,
  conditions: readonly JobSearchCondition[],
): {
  q?: string;
  technology?: string;
  remote?: true;
  country?: string;
  location?: string;
  experience?: number;
  family?: string;
} {
  if (!q) return {};
  const technology = conditions.find(
    (condition) => condition.field === "technology" && condition.enabled,
  );
  const remote = conditions.some(
    (condition) =>
      condition.field === "work_type" &&
      condition.enabled &&
      /remote|리모트|재택/i.test(String(condition.value)),
  );
  const location = conditions.find(
    (condition) => condition.field === "location" && condition.enabled,
  );
  const experience = conditions.find(
    (condition) => condition.field === "experience" && condition.enabled,
  );
  const role = conditions.find(
    (condition) => condition.field === "role" && condition.enabled,
  );
  const locationValue = location ? String(location.value) : null;
  const family = role ? familyFromRole(String(role.value)) : undefined;
  const filters = {
    ...(technology ? { technology: String(technology.value) } : {}),
    ...(remote ? { remote: true as const } : {}),
    // 국내 지역은 country(한국)와 location(경기 등)을 함께 보낸다 — location이
    // 더 좁혀 걸고, country는 근무지 필터 칩 표시를 예전과 그대로 맞춘다.
    ...(locationValue
      ? KOREAN_REGIONS.has(locationValue)
        ? { country: "한국", location: locationValue }
        : { country: locationValue }
      : {}),
    ...(experience ? { experience: Number(experience.value) } : {}),
    // "직무 · 백엔드/프론트엔드"로 잡힌 조건을 06 카테고리 필터(jobFamily)로도
    // 옮긴다 — 알아보는 갈래가 이 둘뿐이면 조용히 빠지고, 칩 표시는 그대로다.
    ...(family ? { family } : {}),
  };
  return Object.keys(filters).length > 0 ? filters : { q };
}

/** 칩의 `key`를 그대로 질의로 되돌린다 — 라벨을 다시 해석하지 않는다. */
function categoryFilter(key: string | undefined) {
  if (!key || key === "all") return {};
  if (key === "remote") return { remote: true } as const;
  if (key === "urgent") return { deadline: "urgent" } as const;
  if (key.startsWith("family:")) return { family: key.slice("family:".length) };
  return {};
}

function chipHref(chip: JobPostingCategory): Route {
  return (chip.key === "all" ? "/jobs" : `/jobs?category=${encodeURIComponent(chip.key)}`) as Route;
}

/** 해석 칩 중 다른 값으로 바꾸거나 끌 수 있는 축과, 그 값이 채워 넣는 질의 파라미터. */
const CHIP_AXIS_PARAM: Partial<
  Record<JobSearchCondition["field"], "location" | "experience" | "technology" | "family">
> = {
  location: "location",
  experience: "experience",
  role: "family",
  technology: "technology",
};

interface ChipOptionSource {
  label: string;
  value: string | number;
  count?: number;
}

/** `conditionHref`는 patch의 키마다 값 타입이 달라, 축별로 나눠 불러야 한다. */
function chipOffHref(
  axis: "location" | "experience" | "technology" | "family",
  conditionHref: (patch: {
    location?: string | null;
    experience?: number | null;
    technology?: string | null;
    family?: string | null;
  }) => Route,
): Route {
  if (axis === "location") return conditionHref({ location: null });
  if (axis === "experience") return conditionHref({ experience: null });
  if (axis === "technology") return conditionHref({ technology: null });
  return conditionHref({ family: null });
}

function chipOptionHref(
  axis: "location" | "experience" | "technology" | "family",
  value: string | number,
  conditionHref: (patch: {
    location?: string | null;
    experience?: number | null;
    technology?: string | null;
    family?: string | null;
  }) => Route,
): Route {
  if (axis === "location") return conditionHref({ location: String(value) });
  if (axis === "experience") return conditionHref({ experience: Number(value) });
  if (axis === "technology") return conditionHref({ technology: String(value) });
  return conditionHref({ family: String(value) });
}

/** 순서를 정한 근거는 가장 잘 맞은 공고의 일치 기술에서 나온다. */
function SearchQueryCard({
  query,
  conditions,
  effectiveByAxis,
  optionsByAxis,
  conditionHref,
}: {
  query: string;
  conditions: readonly JobSearchCondition[];
  effectiveByAxis: Record<"location" | "experience" | "technology" | "family", string | number | undefined>;
  optionsByAxis: Record<"location" | "experience" | "technology" | "family", ChipOptionSource[]>;
  conditionHref: (patch: {
    location?: string | null;
    experience?: number | null;
    technology?: string | null;
    family?: string | null;
  }) => Route;
}) {
  return (
    <div className={styles.queryCard}>
      <form className={styles.queryRow} action="/jobs">
        <Icon name="sparkle" size={18} color="var(--ex-accent-text)" />
        <input
          name="q"
          defaultValue={query}
          className={styles.queryText}
          aria-label="공고 검색"
        />
        <Link href="/jobs" className={styles.queryClear} aria-label="검색 초기화">
          <Icon name="x" size={15} />
        </Link>
        <button type="submit" className={styles.querySubmit}>
          검색
        </button>
      </form>

      {/* 해석 칩 — 확신이 낮은 조건도 칩으로 만들되 지울 수 있게 둔다. 지역 ·
          경력 · 직무 · 기술은 눌러서 다른 값을 고르거나 끌 수 있다. */}
      <div className={styles.parsedRow}>
        <span className={styles.parsedLabel}>이렇게 이해했습니다</span>
        {conditions.map((condition) => {
          const axis = CHIP_AXIS_PARAM[condition.field];
          if (!axis) {
            return (
              <button
                key={`${condition.field}-${condition.value}`}
                type="button"
                className={styles.parsedChip}
              >
                {CONDITION_AXIS[condition.field]} · {conditionValue(condition)}
                <Icon
                  name={condition.enabled ? "caret-down" : "x"}
                  size={10}
                  color={condition.enabled ? undefined : "var(--ex-accent-text)"}
                />
              </button>
            );
          }
          const effectiveValue = effectiveByAxis[axis];
          const enabled = effectiveValue !== undefined;
          const valueLabel = effectiveValue === undefined
            ? conditionValue(condition)
            : axis === "experience"
              ? experienceChipLabel(Number(effectiveValue))
              : String(effectiveValue);
          return (
            <ConditionChip
              key={`${condition.field}-${condition.value}`}
              axisLabel={CONDITION_AXIS[condition.field]}
              valueLabel={valueLabel}
              enabled={enabled}
              offHref={chipOffHref(axis, conditionHref)}
              options={optionsByAxis[axis].map((option) => ({
                label: option.label,
                active: option.value === effectiveValue,
                href: chipOptionHref(axis, option.value, conditionHref),
                ...(option.count === undefined ? {} : { count: option.count }),
              }))}
            />
          );
        })}
        <button type="button" className={styles.parsedAdd}>
          <Icon name="plus" size={11} />
          조건 추가
        </button>
        <button type="button" className={styles.parsedSave}>
          <Icon name="bell-simple" size={14} />이 검색 저장
        </button>
      </div>
    </div>
  );
}

function BrowseSearchBar() {
  return (
    <form className={styles.searchBar} action="/jobs">
      <Icon name="sparkle" size={18} color="var(--ex-accent-text)" />
      <input
        name="q"
        className={styles.searchInput}
        placeholder={BROWSE_QUERY_PLACEHOLDER}
        aria-label="공고 검색"
      />
      <span className={styles.searchShortcut}>⌘↵</span>
      <button type="submit" className={styles.querySubmit}>
        찾기
      </button>
    </form>
  );
}

function SearchRail({
  total,
  missing,
  axes,
  recent,
  query,
}: {
  total: number;
  missing: readonly JobPostingFacet[];
  axes: readonly { label: string; color: string; fill: number; weight: string }[];
  recent: readonly RecentJobSearch[];
  query: string;
}) {
  const top = missing[0];
  const similar = recent.filter((search) => search.query !== query).slice(0, 3);

  return (
    <>
      <div className={styles.railCardBrew}>
        <div className={styles.brewHead}>
          <Icon name="coffee" weight="fill" size={15} color="var(--ex-accent-text)" />
          <span className={styles.brewLabel}>이 결과가 요구하는 것</span>
        </div>
        <p className={styles.brewBody}>
          {top ? (
            <>
              {total}건 중 <b style={{ color: "var(--ex-fg)" }}>{top.count}건</b>이{" "}
              {top.label}을 요구합니다. 지금 기록에는 근거가 없습니다.
            </>
          ) : (
            <>이 결과가 요구하는 기술은 기록에서 모두 확인됩니다.</>
          )}
        </p>
        {missing.length > 0 ? (
          <div className={styles.brewInner}>
            <div className={styles.brewInnerTitle}>비어 있는 재료 {missing.length}</div>
            {missing.slice(0, 2).map((material, index) => (
              <div key={material.label} className={styles.missingRow}>
                <span
                  className={index === 0 ? styles.missingDanger : styles.missingWarning}
                >
                  {material.label} {Math.round(material.ratio * 100)}%
                </span>
                <span className={styles.missingNote}>공고 {material.count}건이 요구</span>
              </div>
            ))}
          </div>
        ) : null}
        <button type="button" className={styles.brewCta}>
          이 경험 기록하기
        </button>
      </div>

      <div className={styles.railCard}>
        <div className={styles.railTitle}>일치도는 이렇게 계산됩니다</div>
        {axes.map((axis) => (
          <div key={axis.label} className={styles.axisRow}>
            <span className={styles.axisLabel}>{axis.label}</span>
            <span className={styles.axisTrack}>
              <span
                className={styles.axisFill}
                style={{ width: `${axis.fill}%`, background: axis.color }}
              />
            </span>
            <span className={styles.axisWeight}>{axis.weight}</span>
          </div>
        ))}
        <div className={styles.railNote}>
          공고가 요구한 항목만 셉니다. 요구가 없는 축은 계산에서 빠집니다
        </div>
      </div>

      <div className={styles.railCard}>
        <div className={styles.railTitle}>비슷한 검색</div>
        <div className={styles.chipWrap}>
          {(similar.length > 0
            ? similar.map((search) => search.query)
            : SIMILAR_SEARCHES
          ).map((search) => (
            <Link
              key={search}
              href={{ pathname: "/jobs", query: { q: search } }}
              className={styles.railChip}
            >
              {search}
            </Link>
          ))}
        </div>
      </div>

      <div className={styles.railCard}>
        <div className={styles.railHeadRow}>
          <span className={styles.railTitle} style={{ marginBottom: 0 }}>
            최근 검색
          </span>
          <button type="button" className={styles.railHeadAction}>
            지우기
          </button>
        </div>
        <div className={styles.recentList}>
          {recent.slice(0, 2).map((search) => (
            <Link
              key={search.id}
              href={{ pathname: "/jobs", query: { q: search.query } }}
              className={styles.recentRow}
            >
              <Icon name="clock-counter-clockwise" size={14} color="var(--ex-fg-muted)" />
              <span className={styles.recentText}>{search.query}</span>
              <span className={styles.recentCount}>{search.resultCount}건</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}

function BrowseRail({
  total,
  common,
  missing,
  watched,
  now,
  listQuery,
}: {
  total: number;
  common: readonly JobPostingFacet[];
  missing: readonly JobPostingFacet[];
  watched: readonly JobPostingSummary[];
  now: number;
  /** 관심 공고에서 들어가도 **보고 있던 목록으로** 돌아온다. */
  listQuery: string;
}) {
  const gap = missing[0];

  return (
    <>
      <div className={styles.railCard}>
        <div className={styles.railTitle}>이 {total}건이 공통으로 찾는 것</div>
        {common.slice(0, 4).map((requirement) => (
          <div key={requirement.label} className={styles.requirementRow}>
            <span className={styles.requirementLabel}>{requirement.label}</span>
            <span className={styles.requirementCount}>{requirement.count}건</span>
            <span className={styles.requirementTrack}>
              <span
                className={styles.requirementFill}
                style={{ width: `${Math.round(requirement.ratio * 100)}%` }}
              />
            </span>
          </div>
        ))}
        <div className={styles.railNote}>
          공고 원문과 기술 블로그에서 뽑았습니다. 카테고리를 바꾸면 다시
          계산됩니다.
        </div>
      </div>

      {gap ? (
        <div className={styles.railCardBrew}>
          <div className={styles.brewHead}>
            <Icon name="coffee" weight="fill" size={15} color="var(--ex-accent-text)" />
            <span className={styles.brewLabel}>비어 있는 재료</span>
          </div>
          <div className={styles.brewInnerTitle}>
            {gap.label} 경험이 기록에 없습니다
          </div>
          <p className={styles.brewBody}>
            {gap.count}건이 {gap.label}을 요구합니다. 이미 적어 둔 이야기 안에 그
            부분이 있다면, 그것만 따로 기록해두면 됩니다.
          </p>
          <button type="button" className={styles.brewCta}>
            이 경험 기록하기
          </button>
        </div>
      ) : null}

      <div className={styles.railCard}>
        <div className={styles.railHeadRow}>
          <span className={styles.railTitle} style={{ marginBottom: 0 }}>
            관심 공고
          </span>
          <button type="button" className={styles.railHeadAction}>
            마감 순
          </button>
        </div>
        <div className={styles.watchList}>
          {watched.map((job) => (
            <Link
              key={job.id}
              href={detailHref(job.id, listQuery)}
              className={styles.watchRow}
            >
              <CompanyAvatar company={job.company} className={styles.watchInitial} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className={styles.watchLabel} style={{ display: "block" }}>
                  {job.company.name} · {shortTitle(job.title)}
                </span>
                <span className={styles.recentCount} style={{ display: "block" }}>
                  {brewState(job)}
                </span>
              </span>
              <span className={styles.watchDeadline}>{deadlineLabel(job)}</span>
            </Link>
          ))}
        </div>
        <div className={styles.railCtaWrap}>
          <button
            type="button"
            className={styles.brewCta}
            /*
             * 이 단추만 시그니처가 아니라 잉크 지면이다. 지면이 어두운 테마에서
             * 밝아지므로 글자도 함께 뒤집어야 한다 — 배경만 바꾸면 흰 글자가
             * 흰 지면 위에 남는다.
             */
            style={{
              background: "var(--ex-bg-inverse)",
              color: "var(--ex-fg-on-inverse)",
            }}
          >
            선택한 공고로 포트폴리오 만들기
          </button>
        </div>
      </div>
      {/* now는 JobRowList와 같은 기준 시각을 쓰기 위해 받는다. */}
      <span hidden data-now={now} />
    </>
  );
}

/** "백엔드 엔지니어 (Core Banking)" → "백엔드". 레일은 한 줄만 준다. */
function shortTitle(title: string): string {
  return title.replace(/\s*\(.*$/, "").split(" ")[0] ?? title;
}

/** 06 레일의 상태 줄. 제작을 시작했는지, 어디까지 갔는지로 갈린다. */
function brewState(job: JobPostingSummary): string {
  if (!job.brew) return "아직 시작 안 함";
  if (job.brew.portfolioId) return "포트폴리오 준비됨";
  if (job.brew.questionCount > 0) {
    return `초안 · 질문 ${job.brew.answered}/${job.brew.questionCount}`;
  }
  return "분석 대기";
}
