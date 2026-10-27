import { koreanPlace } from "@expresso/contracts";
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
import { watchedJobs } from "@/lib/app-data";
import { requireSession } from "@/lib/require-session";

import { AddCondition, type AddConditionSection } from "./AddCondition";
import { BROWSE_QUERY_PLACEHOLDER } from "./browse-copy";
import { JobRowList, deadlineLabel } from "./JobRows";
import { ConditionChip, type ConditionChipOption } from "./ConditionChip";
import { currentListQuery, detailHref, isInterestedList } from "./list-query";
import { Pagination } from "./Pagination";
import { ALL, JobFilter, type FilterSection } from "./JobFilter";
import { RecentSearches } from "./RecentSearches";
import { SaveSearchButton } from "./SaveSearchButton";
import { SortMenu } from "./SortMenu";
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

/**
 * 해석 칩이 서는 축과 그 이름. 칩마다 주소의 파라미터 하나를 바꾸거나 끈다.
 *
 * 연봉 · 규모는 해석은 되지만 공고 목록에 그 축의 필터가 없다. 칩을 세우면
 * 결과에 반영되지 않은 조건이 걸린 것처럼 보이므로 세우지 않는다.
 */
type ChipAxis = "location" | "experience" | "technology" | "family" | "workType";

const CHIP_AXES: readonly ChipAxis[] = ["family", "experience", "workType", "location", "technology"];

const CHIP_AXIS_LABEL: Record<ChipAxis, string> = {
  family: "직무",
  experience: "경력",
  workType: "근무",
  location: "지역",
  technology: "기술",
};

/** 칩의 축이 저장할 때 어느 해석 필드로 돌아가는지. */
const CHIP_AXIS_FIELD: Record<ChipAxis, JobSearchCondition["field"]> = {
  family: "role",
  experience: "experience",
  workType: "work_type",
  location: "location",
  technology: "technology",
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
   * 머리의 "관심 공고 N"을 눌러 켠 목록. 켜져 있으면 다른 조건과 겹쳐 걸리고,
   * 이 화면이 만드는 모든 주소에 함께 실린다.
   */
  const interested = isInterestedList(params);
  /**
   * 관심 공고 목록에는 나라 기본값을 걸지 않는다. 머리 숫자 N은 나라 조건 없이
   * 센 건수다 — 기본값이 걸리면 해외 공고를 담은 사람이 N보다 적은 목록을 본다.
   * 담은 것은 사용자가 직접 고른 것이라 국내 기본값으로 감출 근거도 없다.
   */
  const defaultCountry = interested ? "all" : DEFAULT_COUNTRY;
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
  const country = countryExplicit ?? defaultCountry;
  const countryFilter = country === "all" ? null : country;
  /**
   * 해석 칩에서 축 하나를 "끄기"로 누르면 그 축 값을 `off`로 적는다 —
   * 파라미터를 그냥 지우면 검색어가 다시 그 축을 읽어내 되살아나므로,
   * "안 골랐음"과 "꺼 버림"을 구분해야 한다. 경력·근무·지역·기술·직무가
   * 모두 같은 규칙을 쓴다.
   */
  const experienceParam = typeof params.experience === "string" ? params.experience.trim() : "";
  const experienceOff = experienceParam === "off";
  const experienceParsed = Number.parseInt(experienceParam, 10);
  const experienceYears = !experienceOff && Number.isInteger(experienceParsed) && experienceParsed >= 0
    ? experienceParsed
    : undefined;
  const workTypeParam = typeof params.workType === "string" ? params.workType.trim() : "";
  const workTypeOff = workTypeParam === "off";
  const workType = !workTypeOff && workTypeParam ? workTypeParam : undefined;
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
  const [interpreted, watched, recent, sourceList, savedSearches] = await Promise.all([
    q ? jobsApi.interpret(session.accessToken, q, 0) : Promise.resolve(null),
    // 사이드바 "관심 공고"와 같은 목록이다. 한 요청 안에서 한 번만 부른다.
    watchedJobs(session.accessToken),
    jobsApi.recentSearches(session.accessToken, 4),
    // 헤더가 "어디서 몇 건"을 말하려면 실제로 모으는 곳을 알아야 한다.
    // 예전에는 "원티드 · 잡코리아 · 링크드인에서 매일 아침 모아 옵니다 ·
    // 4,182건"이 적혀 있었는데, 셋 다 우리가 모을 수 없는 곳이고 4,182는
    // 지어낸 수였다.
    jobsApi.sources(session.accessToken),
    // 「이 검색 저장」이 이미 저장한 검색인지 알아야 같은 줄을 두 번 만들지 않는다.
    q ? jobsApi.savedSearches(session.accessToken) : Promise.resolve(null),
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
  /**
   * 근무 칩. 근무 형태를 주소에 골라 두었거나 껐으면 검색어가 읽어낸 리모트는
   * 걸지 않는다 — 안 그러면 "출근"을 골랐는데 리모트도 함께 걸려 아무것도 안
   * 나온다.
   */
  const effectiveRemote = !workTypeParam && derived.remote === true;

  const listing = await jobsApi.postings(session.accessToken, {
    ...(interested ? { interested: true } : {}),
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
          remote: undefined,
        }
      : categoryFilter(category)),
    ...(effectiveRemote ? { remote: true as const } : {}),
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
   * 목록 주소의 끝부분. 아래 주소 조립 함수가 모두 여기를 지난다 — 관심 공고
   * 목록이면 `interested=true`를 싣는다. 한 곳이라도 빠지면 그 링크를 누르는
   * 순간 관심 공고 목록이 풀린다.
   */
  const listHref = (search: URLSearchParams): Route => {
    if (interested) search.set("interested", "true");
    const query = search.toString();
    return (query ? `/jobs?${query}` : "/jobs") as Route;
  };

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
    if (nextCountry !== defaultCountry) search.set("country", nextCountry);

    const nextExperience = "experience" in patch ? patch.experience : experienceYears;
    if (nextExperience !== undefined && nextExperience !== null) {
      search.set("experience", String(nextExperience));
    }
    const nextWorkType = "workType" in patch ? patch.workType : workTypeParam;
    if (nextWorkType) search.set("workType", nextWorkType);
    const nextCompany = "company" in patch ? patch.company : company;
    if (nextCompany) search.set("company", nextCompany);

    return listHref(search);
  };

  /**
   * 지금 걸린 조건 전부. 칩에서 끈 축(`off`)과 「조건 추가」로 고른 축까지
   * 주소에 적힌 그대로 옮긴다 — 하나라도 빠지면 쪽이나 정렬을 바꾸는 순간 그
   * 조건이 풀린다. 쪽은 넣지 않는다.
   */
  const currentSearch = (): URLSearchParams => {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (category) search.set("category", category);
    if (country !== defaultCountry) search.set("country", country);
    if (locationParam) search.set("location", locationParam);
    if (experienceParam) search.set("experience", experienceParam);
    if (technologyParam) search.set("technology", technologyParam);
    if (familyParam) search.set("family", familyParam);
    if (workTypeParam) search.set("workType", workTypeParam);
    if (company) search.set("company", company);
    if (sort !== "match") search.set("sort", sort);
    return search;
  };

  /** 쪽만 바꾸고 나머지 조건은 그대로 들고 간다. 필터가 풀리면 다른 목록이 된다. */
  const pageHref = (next: number): Route => {
    const search = currentSearch();
    if (next > 1) search.set("page", String(next));
    return listHref(search);
  };

  /** 정렬만 바꾼 주소. 순서가 바뀌므로 쪽은 1로 되돌린다. */
  const sortHref = (next: typeof sort): Route => {
    const search = currentSearch();
    if (next === "match") search.delete("sort");
    else search.set("sort", next);
    return listHref(search);
  };
  /**
   * 해석 칩 하나를 다른 값으로 바꾸거나 끄는 주소. `filterHref`와 달리
   * 축을 "껐다"를 축마다 `off`로 명시해 남겨야 한다 — 그냥 지우면 검색어가
   * 다시 그 값을 읽어내 되살아난다. 지금 바꾸는 축이 아니면 지금 상태(꺼져
   * 있으면 off, 골라 뒀으면 그 값)를 그대로 옮겨 적어, 다른 축을 바꿀 때 이
   * 축이 조용히 풀리지 않게 한다.
   */
  const conditionHref = (patch: ConditionPatch): Route => {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (sort !== "match") search.set("sort", sort);
    if (country !== defaultCountry) search.set("country", country);
    if (company) search.set("company", company);

    if ("workType" in patch) {
      search.set("workType", patch.workType === null || patch.workType === undefined ? "off" : patch.workType);
    } else if (workTypeParam) {
      search.set("workType", workTypeParam);
    }

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

    return listHref(search);
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
  // 검색어가 "판교"처럼 지역보다 좁은 장소로 읽혔으면 그 장소를 맨 앞에 둔다 —
  // 지역 목록에는 없어서, 안 두면 팝오버에서 지금 걸린 값이 안 보인다.
  const locationOptions = [
    ...(effectiveLocation && koreanPlace(effectiveLocation) ? [{ label: `${effectiveLocation} 근처`, value: effectiveLocation }] : []),
    ...[...KOREAN_REGIONS].map((region) => ({ label: region, value: region })),
  ];
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
  // 근무 형태 집계는 근무 축을 빼고 센 수라, 다른 값을 골랐을 때의 건수로 읽힌다.
  const workTypeOptions = summary.workTypes.map((one) => ({
    label: one.label,
    value: one.label,
    count: one.count,
  }));
  const optionsByAxis: Record<ChipAxis, ChipOptionSource[]> = {
    location: locationOptions,
    experience: experienceOptions,
    technology: technologyOptions,
    family: familyOptions,
    workType: workTypeOptions,
  };

  /** 주소에 직접 적힌 값. 칩에서 고르거나 「조건 추가」로 더한 값이다. */
  const explicitByAxis: Record<ChipAxis, string | number | undefined> = {
    location: locationExplicit,
    experience: experienceYears,
    technology: technologyExplicit,
    family: familyExplicit,
    workType,
  };
  /** 실제로 걸린 값. 칩이 켜져 있는지, 무엇이라고 적을지를 정한다. */
  const effectiveByAxis: Record<ChipAxis, string | number | undefined> = {
    location: effectiveLocation,
    experience: effectiveExperience,
    technology: effectiveTechnology,
    family: effectiveFamily,
    workType: workType ?? (effectiveRemote ? "remote" : undefined),
  };

  /**
   * 해석 칩. 검색어가 읽어낸 조건마다 하나, 그리고 검색어에는 없지만
   * 「조건 추가」로 주소에 더한 축마다 하나. 필터가 없는 축(연봉 · 규모)은 뺀다.
   */
  const parsedChips = (interpreted?.conditions ?? []).flatMap((condition) => {
    const axis = CHIP_AXIS_PARAM[condition.field];
    return axis ? [{ axis, condition }] : [];
  });
  const parsedAxes = new Set(parsedChips.map((chip) => chip.axis));
  const chips: { axis: ChipAxis; condition: JobSearchCondition | null }[] = [
    ...parsedChips,
    ...CHIP_AXES.filter(
      (axis) => !parsedAxes.has(axis) && explicitByAxis[axis] !== undefined,
    ).map((axis) => ({ axis, condition: null })),
  ];
  const chippedAxes = new Set(chips.map((chip) => chip.axis));

  const queryChips: QueryChip[] = chips.map(({ axis, condition }) => {
    const effectiveValue = effectiveByAxis[axis];
    return {
      key: condition ? `${condition.field}-${condition.value}` : `added-${axis}`,
      axisLabel: CHIP_AXIS_LABEL[axis],
      valueLabel: chipValueLabel(axis, effectiveValue, condition),
      enabled: effectiveValue !== undefined,
      offHref: chipOffHref(axis, conditionHref),
      options: optionsByAxis[axis].map((option) => ({
        label: option.label,
        active: option.value === effectiveValue,
        href: chipOptionHref(axis, option.value, conditionHref),
        ...(option.count === undefined ? {} : { count: option.count }),
      })),
    };
  });

  /** 칩이 없는 축만 「조건 추가」에 선다. 0건짜리 값은 골라도 아무것도 안 걸린다. */
  const addSections: AddConditionSection[] = CHIP_AXES.filter((axis) => !chippedAxes.has(axis))
    .map((axis) => ({
      key: axis,
      title: CHIP_AXIS_LABEL[axis],
      options: optionsByAxis[axis]
        .filter((option) => option.count === undefined || option.count > 0)
        .map((option) => ({
          label: option.label,
          href: chipOptionHref(axis, option.value, conditionHref),
          ...(option.count === undefined ? {} : { count: option.count }),
        })),
    }))
    .filter((section) => section.options.length > 0);

  /**
   * 저장할 조건은 칩이 지금 보여 주는 것이다. 칩에서 바꾼 값은 그 값으로,
   * 끈 칩은 `enabled: false`로 남는다.
   */
  const savedConditions: JobSearchCondition[] = chips.flatMap(({ axis, condition }) => {
    const value = explicitByAxis[axis] ?? condition?.value;
    if (value === undefined) return [];
    return [{
      field: condition?.field ?? CHIP_AXIS_FIELD[axis],
      value,
      enabled: effectiveByAxis[axis] !== undefined,
      confidence: condition?.confidence ?? 1,
    }];
  });
  const searchSaved = Boolean(
    q && savedSearches?.data.some((search) => search.originalQuery === q),
  );

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
          {/*
           * 관심 공고만 보기를 켜고 끈다. 켤 때는 다른 조건을 들고 가지 않는다 —
           * 이 숫자는 조건 없이 센 건수라, 눌러서 나온 목록도 같은 수여야 한다.
           * 링크라서 `aria-pressed`(button 전용) 대신 `aria-current`로 켜짐을 알린다.
           */}
          <Link
            href={(interested ? "/jobs" : "/jobs?interested=true") as Route}
            className={`${styles.headAction} ${interested ? styles.headActionActive : ""}`}
            aria-current={interested ? "true" : undefined}
          >
            <Icon
              name="bookmark-simple"
              weight={interested ? "fill" : "regular"}
              size={14}
              color={interested ? "var(--ex-fg)" : "var(--ex-fg-muted)"}
            />
            관심 공고 {watched.summary.total}
          </Link>
          <span className={styles.headRule} />
          {/* 마감 · 생성 알림을 켜고 끄는 곳은 설정 화면의 알림 항목이다. */}
          <Link href={"/account#notifications" as Route} className={styles.headAction}>
            <Icon name="bell-simple" size={14} color="var(--ex-fg-muted)" />
            알림 설정
          </Link>
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
              chips={queryChips}
              addSections={addSections}
              savedConditions={savedConditions}
              saved={searchSaved}
              clearHref={listHref(new URLSearchParams())}
              interested={interested}
            />
          ) : (
            <BrowseSearchBar interested={interested} />
          )}

          {q ? null : (
            <div className={styles.categoryTabs}>
              {listing.summary.categories.map((chip) => (
                <Link
                  key={chip.key}
                  href={listHref(chipQuery(chip, sort))}
                  className={`${styles.categoryTab} ${
                    (category ?? "all") === chip.key ? styles.categoryTabActive : ""
                  }`}
                >
                  {chip.label}
                  <span className={styles.categoryCount}>{chip.count}</span>
                </Link>
              ))}
              <SortMenu
                options={SORTS.map(([key, , browseLabel]) => ({
                  key,
                  label: browseLabel,
                  href: sortHref(key),
                  active: sort === key,
                }))}
              />
            </div>
          )}

          <div className={styles.columns}>
            <div className={styles.results}>
              <div className={styles.resultsHead}>
                <span className={styles.resultsCount}>
                  {q
                    ? `결과 ${listing.summary.total}건`
                    : `${interested ? "관심 공고" : "공고"} · ${listing.summary.total}건`}
                </span>
                <span className={styles.resultsNote}>내 기록 {recordCount}건과 비교</span>
                {q ? (
                  <>
                    <div className={styles.sorts}>
                      {SORTS.map(([key, label]) => (
                        <Link
                          key={key}
                          href={sortHref(key)}
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
                    ? interested
                      ? "조건에 맞는 관심 공고가 없습니다"
                      : "걸린 공고가 없습니다"
                    : `${listing.summary.total.toLocaleString("ko-KR")}건 중 ${
                        ((page - 1) * pageSize + 1).toLocaleString("ko-KR")
                      }–${
                        ((page - 1) * pageSize + postings.length).toLocaleString("ko-KR")
                      }`}
                </span>
                <Pagination page={listing.page} href={pageHref} />
                {q ? (
                  <span className={styles.footQuota}>
                    이번 달 크레딧 {session.quota.used.toLocaleString("ko-KR")} / {session.quota.limit?.toLocaleString("ko-KR") ?? "무제한"}
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
    // "판교"처럼 지역보다 좁은 국내 장소도 `location`으로 보낸다 — 백엔드가
    // 그 장소에서 가까운 순으로 건다.
    ...(locationValue
      ? KOREAN_REGIONS.has(locationValue) || koreanPlace(locationValue)
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

/**
 * 칩 하나가 거는 조건. 고른 정렬은 카테고리를 바꿔도 유지한다. 주소의 끝부분은
 * 화면의 `listHref`가 붙인다.
 */
function chipQuery(chip: JobPostingCategory, sort: string): URLSearchParams {
  const search = new URLSearchParams(chip.key === "all" ? {} : { category: chip.key });
  if (sort !== "match") search.set("sort", sort);
  return search;
}

/**
 * 정렬 셋. 00b는 결과 머리에 나란히, 06은 카테고리 줄 오른쪽 메뉴에 세운다.
 * 일치도는 내 기록과 비교한 점수라 06에서는 그 뜻을 이름으로 적는다(정의서).
 */
const SORTS = [
  ["match", "일치도 순", "내 기록과 가까운 순"],
  ["deadline", "마감 순", "마감 순"],
  ["recent", "최신 순", "최신 순"],
] as const;

/** 해석 칩 중 다른 값으로 바꾸거나 끌 수 있는 축과, 그 값이 채워 넣는 질의 파라미터. */
const CHIP_AXIS_PARAM: Partial<Record<JobSearchCondition["field"], ChipAxis>> = {
  location: "location",
  experience: "experience",
  role: "family",
  technology: "technology",
  work_type: "workType",
};

/** 칩에 적는 값. 걸려 있으면 걸린 값을, 꺼져 있으면 검색어가 읽어낸 값을 적는다. */
function chipValueLabel(
  axis: ChipAxis,
  effectiveValue: string | number | undefined,
  condition: JobSearchCondition | null,
): string {
  if (effectiveValue === undefined) return condition ? conditionValue(condition) : "";
  if (axis === "experience") return experienceChipLabel(Number(effectiveValue));
  if (axis === "workType") return WORK_TYPE_LABEL[String(effectiveValue)] ?? String(effectiveValue);
  return String(effectiveValue);
}

interface QueryChip {
  key: string;
  axisLabel: string;
  valueLabel: string;
  enabled: boolean;
  offHref: Route;
  options: ConditionChipOption[];
}

type ConditionPatch = {
  location?: string | null;
  experience?: number | null;
  technology?: string | null;
  family?: string | null;
  workType?: string | null;
};

interface ChipOptionSource {
  label: string;
  value: string | number;
  count?: number;
}

/** `conditionHref`는 patch의 키마다 값 타입이 달라, 축별로 나눠 불러야 한다. */
function chipOffHref(
  axis: ChipAxis,
  conditionHref: (patch: ConditionPatch) => Route,
): Route {
  if (axis === "location") return conditionHref({ location: null });
  if (axis === "experience") return conditionHref({ experience: null });
  if (axis === "technology") return conditionHref({ technology: null });
  if (axis === "workType") return conditionHref({ workType: null });
  return conditionHref({ family: null });
}

function chipOptionHref(
  axis: ChipAxis,
  value: string | number,
  conditionHref: (patch: ConditionPatch) => Route,
): Route {
  if (axis === "location") return conditionHref({ location: String(value) });
  if (axis === "experience") return conditionHref({ experience: Number(value) });
  if (axis === "technology") return conditionHref({ technology: String(value) });
  if (axis === "workType") return conditionHref({ workType: String(value) });
  return conditionHref({ family: String(value) });
}

/** 순서를 정한 근거는 가장 잘 맞은 공고의 일치 기술에서 나온다. */
function SearchQueryCard({
  query,
  chips,
  addSections,
  savedConditions,
  saved,
  clearHref,
  interested,
}: {
  query: string;
  chips: readonly QueryChip[];
  addSections: AddConditionSection[];
  savedConditions: JobSearchCondition[];
  /** 같은 검색 문장을 이미 저장했는지. */
  saved: boolean;
  /** 검색어만 지운 목록. 관심 공고 목록이면 그 목록으로 돌아간다. */
  clearHref: Route;
  interested: boolean;
}) {
  return (
    <div className={styles.queryCard}>
      <form className={styles.queryRow} action="/jobs">
        <InterestedField interested={interested} />
        <Icon name="sparkle" size={18} color="var(--ex-accent-text)" />
        <input
          name="q"
          defaultValue={query}
          className={styles.queryText}
          aria-label="공고 검색"
        />
        <Link href={clearHref} className={styles.queryClear} aria-label="검색 초기화">
          <Icon name="x" size={15} />
        </Link>
        <button type="submit" className={styles.querySubmit}>
          검색
        </button>
      </form>

      {/* 해석 칩 — 확신이 낮은 조건도 칩으로 만들되 끌 수 있게 둔다. 칩마다
          눌러서 다른 값을 고르거나 끌 수 있다. */}
      <div className={styles.parsedRow}>
        <span className={styles.parsedLabel}>이렇게 이해했습니다</span>
        {chips.map((chip) => (
          <ConditionChip
            key={chip.key}
            axisLabel={chip.axisLabel}
            valueLabel={chip.valueLabel}
            enabled={chip.enabled}
            offHref={chip.offHref}
            options={chip.options}
          />
        ))}
        {addSections.length > 0 ? <AddCondition sections={addSections} /> : null}
        {/* 검색어가 바뀌면 저장 상태를 처음부터 다시 받는다. 같은 화면 안에서
            링크로 옮겨 가면 컴포넌트가 남아 앞 검색의 상태를 들고 간다. */}
        <SaveSearchButton
          key={query}
          query={query}
          conditions={savedConditions}
          saved={saved}
        />
      </div>
    </div>
  );
}

/** 관심 공고 목록 안에서 검색하면 결과도 관심 공고 안에서 찾는다. */
function InterestedField({ interested }: { interested: boolean }) {
  return interested ? <input type="hidden" name="interested" value="true" /> : null;
}

function BrowseSearchBar({ interested }: { interested: boolean }) {
  return (
    <form className={styles.searchBar} action="/jobs">
      <InterestedField interested={interested} />
      <Icon name="sparkle" size={18} color="var(--ex-accent-text)" />
      <input
        name="q"
        className={styles.searchInput}
        placeholder={BROWSE_QUERY_PLACEHOLDER}
        aria-label="공고 검색"
      />
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
        <Link href={RECORD_EXPERIENCE_HREF} className={styles.brewCta}>
          이 경험 기록하기
        </Link>
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

      {/* 지운 상태도 검색어마다 새로 시작한다 — 저장 버튼과 같은 이유다. */}
      <RecentSearches key={query} recent={recent} query={query} />
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
          <Link href={RECORD_EXPERIENCE_HREF} className={styles.brewCta}>
            이 경험 기록하기
          </Link>
        </div>
      ) : null}

      <div className={styles.railCard}>
        <div className={styles.railHeadRow}>
          <span className={styles.railTitle} style={{ marginBottom: 0 }}>
            관심 공고
          </span>
          {/* 이 목록은 늘 마감이 가까운 순으로 받아 온다(`watchedJobs`). 고르는 버튼이 아니다. */}
          <span className={styles.railHeadNote}>마감 순</span>
          <Link href={"/jobs?interested=true" as Route} className={styles.railHeadLink}>
            전체
          </Link>
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
          {/*
           * 공고를 여기서 고르지 않는다. 새 포트폴리오 화면이 관심 공고 · 모아 둔
           * 공고 · 붙여넣기 중에서 고르게 한다.
           */}
          <Link
            href="/brew/new"
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
            새 포트폴리오 만들기
            <Icon name="arrow-right" size={14} />
          </Link>
        </div>
      </div>
      {/* now는 JobRowList와 같은 기준 시각을 쓰기 위해 받는다. */}
      <span hidden data-now={now} />
    </>
  );
}

/** 「이 경험 기록하기」가 여는 곳 — 내 커리어의 경험 카테고리. */
const RECORD_EXPERIENCE_HREF = "/career/experience" as Route;

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
