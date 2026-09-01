import { notFound } from "next/navigation";

import { ApiError } from "@/lib/api/client";
import { jobs } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { ReadingPanel, type Reading } from "../../(app)/brew/[brewId]/recipe/Brewing";

import styles from "./page.module.css";

/**
 * 내려지는 잔을 기다리지 않고 보는 자리.
 *
 * 이 그림은 레시피가 짜이는 90초 동안에만 화면에 있다. 그걸 다듬으려고 매번
 * 모델을 부르면 한 번 고칠 때마다 90초에 계약 호출 하나를 태운다.
 *
 * **목업이 아니다** — `ReadingPanel`은 제품이 쓰는 바로 그 컴포넌트이고, 공고는
 * 공고판에서 실제로 하나 꺼내 온다(회사 마크가 그래야 진짜 마크다). 지어낸 것은
 * 넣어 주는 기록뿐이다 — 그건 남의 커리어라 꺼내 올 자리가 없다. 그래서 여기서
 * 고친 것이 곧 제품에서 고쳐진 것이다.
 *
 * 프로덕션 빌드에서는 404다.
 */
export const dynamic = "force-dynamic";

/** 실제 화면과 같은 길이·같은 결의 글. 짧은 글로 맞춰 두면 실제에서 넘친다. */
const RECORDS = [
  { recordId: "1", title: "주로 쓰는 기술", categoryIcon: "wrench", reason: "공고 요건과 겹치는 말: python, java, aws, ec2, rds" },
  { recordId: "2", title: "정산 데이터 레이크 구축", categoryIcon: "briefcase", reason: "공고 요건과 겹치는 말: 필수, python, aws, s3, glue" },
  { recordId: "3", title: "커머스 플랫폼팀 백엔드 엔지니어", categoryIcon: "chat-circle", reason: "공고 요건과 겹치는 말: 설계, 파이프라인, 1년, 데이터, 규모의" },
  { recordId: "4", title: "다국가 배송 요금 라우팅 엔진", categoryIcon: "briefcase", reason: "공고 요건과 겹치는 말: java, 설계, 파이프라인, 검증, 기준" },
  { recordId: "5", title: "적재 파이프라인 데이터 품질 프레임워크", categoryIcon: "briefcase", reason: "공고 요건과 겹치는 말: python, 설계, 파이프라인, airflow, 데이터" },
  { recordId: "6", title: "개인정보 처리 흐름 정리와 PIPA 대응", categoryIcon: "chat-circle", reason: "공고 요건과 겹치는 말: 설계, 데이터, 개인정보, 보호" },
  { recordId: "7", title: "사내 기술상 — 데이터 플랫폼 부문", categoryIcon: "certificate", reason: "공고 요건과 겹치는 말: 데이터, 구축, 기술, 기준" },
  { recordId: "8", title: "사내 기술 블로그 — 데이터 계약으로 파이프라인 지키기", categoryIcon: "book-open", reason: "공고 요건과 겹치는 말: 파이프라인, 데이터, 기술" },
  { recordId: "9", title: "결제 대사 배치의 실시간 전환", categoryIcon: "briefcase", reason: "공고 요건과 겹치는 말: java, 전환" },
  { recordId: "10", title: "온콜 체계 개편", categoryIcon: "chat-circle", reason: "공고 요건과 겹치는 말: 설계, 관측" },
];

/**
 * 공고판이 비었거나 못 읽었을 때 세우는 자리.
 *
 * 마크가 없으므로 이니셜이 선다 — 마크를 못 받아 둔 회사에서 실제로 나오는
 * 그림이라, 이것도 봐 둘 값이 있는 상태다.
 */
const FALLBACK: NonNullable<Reading["posting"]> = {
  title: "Senior Back End Engineer (Global Mobility & Business Travel)",
  company: { name: "Coupang" },
};

/**
 * 공고 하나를 실제로 꺼내 온다.
 *
 * 마크가 있는 것을 먼저 고른다 — 이 화면을 보는 이유의 절반이 그 마크가 칸
 * 안에서 어떻게 서는지이고, 회사마다 가로세로가 달라서 지어낸 값으로는 알 수
 * 없다. 마크를 받아 둔 회사가 하나도 없으면 그냥 첫 줄이다.
 */
async function pickPosting(): Promise<NonNullable<Reading["posting"]>> {
  try {
    const session = await requireSession();
    const { data } = await jobs.postings(session.accessToken, { limit: 20 });
    const found = data.find(({ company }) => company.logoUrl) ?? data[0];
    if (!found) return FALLBACK;
    const { name, initial, avatarBackground, avatarColor, logoUrl } = found.company;
    return { title: found.title, company: { name, initial, avatarBackground, avatarColor, logoUrl } };
  } catch (error) {
    if (error instanceof ApiError) return FALLBACK;
    throw error;
  }
}

export default async function BrewingSamplePage() {
  if (process.env.NODE_ENV === "production") notFound();
  const posting = await pickPosting();

  return (
    <main className={styles.page}>
      <p className={styles.note}>
        <code>/dev/brewing</code> · 02 레시피가 짜이는 동안의 화면. 제품이 쓰는
        컴포넌트 그대로이고, 공고는 공고판에서 꺼내 온 것입니다. 기록만 지어낸
        것입니다. 프로덕션에서는 404입니다.
      </p>
      <div className={styles.sheet}>
        <div className={styles.doc}>
          <ReadingPanel queued={false} reading={{ posting, records: RECORDS }} />
        </div>
      </div>
    </main>
  );
}
