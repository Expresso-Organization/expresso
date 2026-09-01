import { randomUUID } from "node:crypto";
import type { MongoMigrationStep } from "../../mongo-migrations.js";

/**
 * 공고를 모아 올 곳.
 *
 * 번호가 0006 을 건너뛴다. `docs/portfolio-creation-flow-v2` 가 0006 을 먼저
 * 쓰고 있어서다 — 같은 번호를 두 브랜치가 잡으면 먼저 적용한 쪽 뒤에서
 * "modified after execution began" 으로 막힌다. 검증기는 번호 사이 빈 자리를
 * 허용한다.
 *
 * 어댑터만 배포하면 수집이 돌 대상이 없다. `job_sources` 에 줄이 있어야
 * 모은다 — 사람이 API 로 하나씩 넣는 대신 배포와 함께 맞춘다.
 * `scheduled_job_definitions` 를 0001 시드가 심는 것과 같은 자리다.
 *
 * **upsert 다.** 이미 있는 줄은 이름과 사이트만 갱신하고 `isActive` 를 켠다.
 * 수집 이력(`lastRunAt` · `lastSeenCount`)은 건드리지 않는다.
 *
 * 보드를 더 넣을 때는 마이그레이션을 하나 더 만든다. 급하면
 * `POST /v1/job-sources` 로 넣고 다음 마이그레이션에 옮겨 적는다.
 *
 * **슬러그는 짐작하지 않는다.** 변형 492개를 찍어 0건이었다 — 여기어때는
 * `gccompany`, 뷰노는 `vunohire`, 채널톡은 Lever 의 `zoyi` 다. 새 회사는 그
 * 회사 채용 페이지(`/careers` · `/recruit`)에 걸린 보드 주소에서 가져온다.
 */
interface Seed {
  provider: string;
  token: string;
  displayName: string;
  /**
   * 그 회사의 **자기 사이트**. 로고를 여기서 받는다.
   *
   * 확인하지 못한 곳은 비워 둔다 — 틀린 도메인을 적으면 다른 회사 로고가
   * 뜬다. 안 뜨는 것보다 나쁘다.
   */
  siteUrl: string | null;
}

const SEEDS: Seed[] = [
  // Greenhouse — `?content=true` 하나로 본문까지 온다.
  { provider: "greenhouse", token: "daangn", displayName: "당근", siteUrl: "https://www.daangn.com" },
  { provider: "greenhouse", token: "coupang", displayName: "쿠팡", siteUrl: "https://www.coupang.jobs" },
  { provider: "greenhouse", token: "krafton", displayName: "크래프톤", siteUrl: "https://www.krafton.com" },
  { provider: "greenhouse", token: "moloco", displayName: "몰로코", siteUrl: "https://www.moloco.com" },
  { provider: "greenhouse", token: "sendbird", displayName: "센드버드", siteUrl: "https://sendbird.com" },

  // 그리팅 — 국내 스타트업이 가장 많이 쓴다. 공고 하나가 요청 하나다.
  { provider: "greeting", token: "oliveyoung", displayName: "CJ올리브영", siteUrl: "https://www.oliveyoung.co.kr" },
  { provider: "greeting", token: "hybe", displayName: "HYBE", siteUrl: "https://hybecorp.com" },
  { provider: "greeting", token: "musinsa", displayName: "무신사", siteUrl: "https://www.musinsa.com" },
  { provider: "greeting", token: "kurly", displayName: "컬리", siteUrl: "https://www.kurly.com" },
  { provider: "greeting", token: "fastfive", displayName: "패스트파이브", siteUrl: "https://www.fastfive.co.kr" },
  { provider: "greeting", token: "catchtable", displayName: "캐치테이블", siteUrl: "https://www.catchtable.co.kr" },
  { provider: "greeting", token: "makinarocks", displayName: "마키나락스", siteUrl: "https://www.makinarocks.ai" },
  // 여기어때는 goodchoice.kr 이 아니라 yeogi.com 으로 옮겼다(실측 리다이렉트).
  { provider: "greeting", token: "gccompany", displayName: "여기어때", siteUrl: "https://www.yeogi.com" },
  // 팀스파르타는 teamsparta.co 가 응답하지 않아 사이트를 비운다.
  { provider: "greeting", token: "teamsparta", displayName: "팀스파르타", siteUrl: null },
  { provider: "greeting", token: "finda", displayName: "핀다", siteUrl: "https://finda.co.kr" },
  { provider: "greeting", token: "kakaomobility", displayName: "카카오모빌리티", siteUrl: "https://www.kakaomobility.com" },
  { provider: "greeting", token: "wadiz", displayName: "와디즈", siteUrl: "https://www.wadiz.kr" },
  { provider: "greeting", token: "buzzvil", displayName: "버즈빌", siteUrl: "https://www.buzzvil.com" },
  { provider: "greeting", token: "igaworks", displayName: "아이지에이웍스", siteUrl: "https://www.igaworks.com" },
  { provider: "greeting", token: "zigbang", displayName: "직방", siteUrl: "https://www.zigbang.com" },
  { provider: "greeting", token: "vunohire", displayName: "뷰노", siteUrl: "https://www.vuno.co" },
  { provider: "greeting", token: "korbit", displayName: "코빗", siteUrl: "https://www.korbit.co.kr" },
  { provider: "greeting", token: "wavve", displayName: "콘텐츠웨이브", siteUrl: "https://www.wavve.com" },
  { provider: "greeting", token: "socraai", displayName: "Socra.ai", siteUrl: "https://socra.ai" },
  { provider: "greeting", token: "qanda", displayName: "매스프레소", siteUrl: "https://mathpresso.com" },
  // 오늘의집(`bucketplace`)은 보드 루트가 꺼져 있어 404 다. 우리가 할 수 있는
  // 일이 없는 실패라 넣지 않는다. 보드를 켜면 이 줄만 되살리면 된다.

  // Lever — 회사 이름 칸이 없어 `displayName` 이 그대로 회사 이름이 된다.
  { provider: "lever", token: "zoyi", displayName: "채널코퍼레이션", siteUrl: "https://channel.io" },
  { provider: "lever", token: "neowiz", displayName: "네오위즈", siteUrl: "https://www.neowiz.com" },

  { provider: "workable", token: "lunit", displayName: "루닛", siteUrl: "https://www.lunit.io" },

  // 고용24 채용정보 화면. `token` 은 직종코드이고 직종마다 한 줄씩 나눠 둔다 —
  // 한 출처가 목록 20장을 넘으면 어댑터가 던진다. 회사가 여럿이라 사이트는
  // 비운다(로고는 공고마다 회사가 다르다).
  { provider: "work24web", token: "022", displayName: "고용24 · 컴퓨터하드웨어·통신공학", siteUrl: null },
  { provider: "work24web", token: "023", displayName: "고용24 · 컴퓨터시스템", siteUrl: null },
  { provider: "work24web", token: "024", displayName: "고용24 · 소프트웨어", siteUrl: null },
  { provider: "work24web", token: "025", displayName: "고용24 · 네트워크·정보보안", siteUrl: null },
  { provider: "work24web", token: "026", displayName: "고용24 · 데이터·정보시스템·웹운영", siteUrl: null },
];

export async function jobSourceSeedSteps(): Promise<MongoMigrationStep[]> {
  return [{
    id: "job_sources:seed_boards",
    async run(db) {
      const now = new Date();
      for (const seed of SEEDS) {
        await db.collection("job_sources").updateOne(
          { provider: seed.provider, token: seed.token },
          {
            $set: {
              displayName: seed.displayName,
              isActive: true,
              ...(seed.siteUrl === null ? {} : { siteUrl: seed.siteUrl }),
            },
            $setOnInsert: {
              _id: randomUUID(),
              provider: seed.provider,
              token: seed.token,
              lastSeenCount: 0,
              lastAddedCount: 0,
              createdAt: now,
            },
          },
          { upsert: true },
        );
      }
    },
  }];
}
