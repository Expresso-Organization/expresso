---
title: AI 사용량 계측과 사용량 기준 요금제
slug: plans-billing
stage: spec
status: accepted
intent: .intent/intent_plans-billing.md
date: 2026-10-27
---

# AI 사용량 계측과 사용량 기준 요금제 — 명세

## 요구사항

### 계측

- [ ] AI 호출이 끝나면 `ai_usage_events`에 한 건이 쌓인다 — `userId`(없으면 `null`) ·
      `contract` · `model` · 입력 · 출력 · 캐시 읽기 · 캐시 생성 토큰 · `costUsd` ·
      `durationMs` · `createdAt`.
- [ ] 성공한 호출만 기록한다. 화면 정의서가 "실패한 작업은 차감하지 않습니다"라고
      정한다. 기록이 실패해도 호출 결과는 그대로 돌아간다 — 계측이 기능을 막지 않는다.
- [ ] `AI_PROVIDER=off`면 호출이 없으므로 기록도 없다.
- [ ] 기존 모듈의 호출 코드가 결과를 쓰는 방식은 바뀌지 않는다.

### 한도

- [ ] `plans`에 `monthlyCredits`가 있고 `generationQuota`는 사라진다.
- [ ] 1 크레딧 = 10,000 토큰(입력 + 출력 + 캐시 생성 + 캐시 읽기).
- [ ] `entitlements.check("portfolio.generate")`가 이번 달 누적 크레딧과
      `monthlyCredits`를 비교한다. 넘었으면 `QUOTA_EXHAUSTED`.
- [ ] 세 플랜 모두 크레딧 한도가 걸린다. `plans.features`에서 `generation.unlimited`를
      지우고 서비스의 `plan.code !== "free"` 대체 규칙을 지운다. 정의서가 Double Shot 계정에
      "620 / 1,000"을 그린다 — 유료 플랜도 한도가 있다.
- [ ] `usage`의 `used` · `limit` · `remaining`은 크레딧 단위다.
- [ ] 생성 횟수로 막는 길이 남아 있지 않다 — `usage_counters`와
      `generation_usage_ledger`는 기록으로 남기되 한도 판단에 쓰지 않는다.
- [ ] 한도를 넘긴 계정도 편집 · 배포 · 기록 관리 라우트를 그대로 쓴다.

### 화면

- [ ] 설정 사용량 구획에 이번 달 크레딧 사용량 · 남은 양 · 초기화 날짜가 선다.
- [ ] 날짜별 사용 추이(토큰 종류별로 쌓음) · 기능별 사용량 · 모델별 사용량 세 그림이 선다.
- [ ] 이번 달 호출이 없으면 세 그림 자리에 "이번 달 사용 없음" 한 줄이 선다.
- [ ] 설정에 「요금제」 · 「결제」 구획이 있고 `ACCOUNT_SECTIONS`에 들어 있다.
- [ ] 횟수를 전제로 쓴 화면 문구가 크레딧으로 바뀐다 — 사이드바 · 사이드바 대기 모양 ·
      공고 화면 · 재료 고르기 · 편집기의 「생성 1회」. 한도만큼 칸을 그리던 두 자리
      (재료 고르기 · 설정)는 비율 막대가 된다. 1,000칸을 그리지 않는다.
- [ ] `pnpm typecheck` · `pnpm test` · `pnpm test:infra`가 통과한다.

## 설계

### 계측을 거는 자리 — 모듈이 아니라 클라이언트

AI 호출은 모두 `AiClient.complete`를 지난다. 모듈 14곳을 고치지 않고 그 한 자리를
감싼다. `ContractRoutedAiClient` · `RecordingAiClient`가 이미 같은 방식이다.

```
platform/ai/metered.ts   MeteredAiClient — complete를 감싸 결과·오류 양쪽에서 기록
platform/ai/usage-sink.ts  AiUsageSink 인터페이스 { record(event): Promise<void> }
```

`createAiClient(config, sink?)`에 싱크를 넘긴다. 싱크가 없으면 감싸지 않는다 —
테스트와 오프라인 경로가 지금처럼 돈다. 기록은 `void sink.record(...)`로 띄워
보내고 실패는 로그만 남긴다.

누구의 호출인지는 `AiCallOptions`에 `userId?: string`을 더해 받는다. `spec.contract`가
이미 어느 기능인지 말하므로 기능 식별자는 더하지 않는다. 호출 지점 14곳에서
`userId`를 넘긴다. 사용자가 없는 작업(공고 적재 `jobs/ingest/facts.ts`)은 넘기지
않고 `null`로 쌓인다.

### 데이터베이스 — 마이그레이션 `0021`

0014–0016 · 0018 · 0019는 열린 PR이 쓰고 있다. 다음 빈 번호는 0021이다.
`migrations.test.ts`의 개수 기대값(15)도 함께 올린다.

- 컬렉션 `ai_usage_events` 신설. 인덱스 `{ userId: 1, createdAt: -1 }`.
- `plans`에 `monthlyCredits` · `displayName` · `monthlyPriceKrw` · `sortOrder`를 더하고
  `generationQuota`를 지운다. `features["generation.unlimited"]`를 지운다.
- `0001`은 고치지 않는다. `loadMongoMigrations`가 `0001`의 `schema.json`을 체크섬에
  넣으므로 고치면 이미 적용한 데이터베이스에서 마이그레이션이 "modified"로 멈춘다.
  0013 · 0020처럼 0021이 `collMod`로 `plans` 검증 규칙을 바꾼다. 순서는 검증 규칙 →
  값 `$set` · `$unset` 이다. 규칙을 먼저 바꾸지 않으면 `$unset`이 엄격 검증에 걸린다.

| code | displayName | monthlyPriceKrw | monthlyCredits | sortOrder |
|---|---|---|---|---|
| `free` | Single Shot | 0 | 100 | 1 |
| `pro` | Double Shot | 9900 | 1000 | 2 |
| `team` | Extra Shot | 19900 | 2500 | 3 |

이름 · 가격 · 크레딧 수의 출처는 모두 화면 정의서다. 크레딧의 크기(10,000 토큰)는
측정값에서 정했다 — 저장된 생성 40건의 평균이 약 235,000 토큰이므로 생성 한 번이
23.5 크레딧이고, 무료 플랜 100 크레딧으로 네 번 생성할 수 있다. 이 근거를
마이그레이션 주석에 적는다.

### 한도 판단 — `modules/entitlements/service.ts`

`usageCounters`를 세던 자리를 `ai_usage_events` 집계로 바꾼다.

```
creditsUsed = ceil(sum(input + output + cacheRead + cacheCreation) / 10000)
```

기간은 지금 쓰는 `kstMonthlyPeriod(at)` 그대로다. 토큰을 기간 전체에서 먼저 더하고
올림은 한 번만 한다. 호출마다 올리면 작은 호출 50건이 50 크레딧이 된다.

`limit: null`은 플랜에 `monthlyCredits`가 없을 때만 나온다. 0021 이후에는 세 플랜
모두 값이 있다.

### 읽기 API — `modules/usage` (신규)

```
GET /v1/me/usage          이번 달 요약 + 날짜별 · 계약별 · 모델별 집계
```

한 번에 돌려준다. 화면이 세 그림과 요약을 함께 그리므로 호출을 나눌 이유가 없다.
집계는 `$group`으로 데이터베이스에서 한다.

계약: `packages/contracts/src/usage.ts` — 날짜별 점은 토큰 네 종류를 따로 담는다(쌓은
막대를 그리려면 합계만으로는 안 된다). 날짜는 `kstMonthlyPeriod`와 같은 한국 시각
기준으로 나눈다.

```
GET /v1/plans            공개 플랜 목록 — 이름 · 월 가격 · 월 크레딧 · 기능 값
```

요금제 카드의 기능 줄은 `features`의 켜진 값에서 만든다. 집행하지 않는 한도(동시 배포
개수)는 적지 않는다.

### 화면 — 사용량 구획

기존 분석 화면(`analytics/`)의 그림 방식을 그대로 쓴다. 인라인 SVG · 2px 선 ·
`.chartWrap` · `.chartAxis` · `.axisLabel` · `.chartDates`.

| 자리 | 형태 | 왜 |
|---|---|---|
| 이번 달 크레딧 | 큰 숫자 + 눈금(`.usageSlots` 재사용) + 초기화 날짜 | 값 하나와 남은 양이다. 그림이 필요 없다 |
| 날짜별 추이 | 날짜마다 세로 막대 하나, 토큰 종류 넷으로 쌓는다 | 시간에 따른 변화와 무엇이 양을 차지하는지를 한 그림에서 본다 |
| 기능별 사용량 | 가로 막대, 많은 순 | 항목 이름이 왼쪽에 서는 크기 비교 |
| 모델별 사용량 | 가로 막대, 많은 순 | 같다 |

**차트 계열 색을 토큰 표에 더한다.** 사용자가 색 추가를 허락했다. 토큰 종류 넷(입력 ·
출력 · 캐시 생성 · 캐시 읽기)을 가르는 데만 쓴다. 역할 토큰 `--ex-chart-1`~`--ex-chart-4`를
밝은 지면과 어두운 지면에 따로 둔다. 값은 dataviz 스킬의 기본 범주 팔레트 앞 네 칸이다.

| 토큰 | 밝은 지면 | 어두운 지면 |
|---|---|---|
| `--ex-chart-1` | `#2a78d6` | `#3987e5` |
| `--ex-chart-2` | `#eb6834` | `#d95926` |
| `--ex-chart-3` | `#1baf7a` | `#199e70` |
| `--ex-chart-4` | `#eda100` | `#c98500` |

`validate_palette.js`로 이 저장소의 지면(`#ffffff` · `#171719`)에서 검사했다. 인접 쌍
색각 이상 ΔE는 밝은 지면 9.1 · 어두운 지면 8.4로 모두 통과다. 밝은 지면에서 `#1baf7a`
(2.82:1) · `#eda100`(2.17:1)이 3:1에 못 미친다. 그래서 범례에 종류마다 이번 달 합계
숫자를 적는다 — 색만으로 값을 읽게 두지 않는다.

기능별 · 모델별 막대는 계열이 하나라 한 가지 색(`--ex-fg`)이다. 막대의 정체는 왼쪽
이름표가 전달한다.

막대는 2px 둥근 끝 · 기준선에 붙는다. 값은 막대 오른쪽에 숫자로 직접 적는다.

### 화면 — 요금제 · 결제 구획

- 요금제 — 카드 세 장. 이름 · 월 가격 · 월 크레딧 · 기능 줄. 「사용 중」은
  `session.user.planCode`가 가리키는 카드에 붙는다. 플랜을 바꾸는 버튼은 없다.
- 결제 — 지면용 값으로 날짜 · 항목 · 금액 · 상태 줄. 영수증 버튼은 없다.
- CSS는 PR #121 이전(`8aec6487^`)의 `.plan*` · `.billing*`를 가져온다. 버튼
  관련 규칙은 가져오지 않는다.

## 버린 대안

- **모듈 14곳에서 각자 기록** — 같은 코드가 열네 벌이 되고 한 곳을 빠뜨리면
  조용히 샌다. 호출이 지나는 한 자리를 감싼다.
- **`generated_pages.generationManifest`를 집계** — 생성에만 있고 색인이 없다.
  에이전트 채팅 · 인터뷰 · 레시피는 들어 있지 않다.
- **사전 차감(예상 차감량)** — 호출 전에 쓸 양을 알 수 없다. 측정값에서 생성 한 번이
  1.0~2.4달러로 갈린다. 끝난 호출만 기록한다.
- **`generationQuota`를 남겨 두기** — 읽지 않는 값이 남으면 다음 사람이 그것으로
  판단한다.
- **원형 그래프로 기능별 비중** — 항목이 열 가까이 되고 작은 조각을 읽을 수 없다.
- **선 한 줄로 날짜별 추이** — 하루 합계만 보이고 캐시 읽기가 양의 대부분이라는 사실이
  가려진다.

## 함정

- `costUsd`는 공급자가 알려줄 때만 들어온다. `anthropic` 공급자는 `null`을 준다
  (`anthropic.ts:176`). 비용을 화면의 기준값으로 쓰지 않는다 — 한도는 토큰으로 센다.
- 캐시 읽기 토큰이 평균 81,423으로 입력 토큰(평균 8)보다 네 자리 크다. 입력만 세면
  실제 사용량과 전혀 다른 값이 된다.
- 지금은 `submit`에 한도 검사가 없고, 끝난 작업을 `chargeMongoGenerationUsage`가
  막는다. 크레딧 기준에서는 끝난 작업의 토큰이 이미 합계에 들어 있어서, 한도 근처에서
  시작한 생성이 다 만들어진 뒤 버려진다. 한도 검사를 `submit`으로 옮기고
  `chargeMongoGenerationUsage`는 생성 횟수만 센다. 막히면 403이다 — 웹은 402 · 403을
  한도 문구로 받는다.
- `entitlements.integration.test.ts`와 `service.test.ts`가 횟수 기준으로 쓰여 있다.
  크레딧 기준으로 다시 쓴다.
- `AiCallOptions`에 `userId`를 더해도 넘기지 않으면 타입이 통과한다. 호출 지점
  14곳을 `git grep "\.complete("`으로 세어 하나씩 확인한다.
- `MeteredAiClient`가 던지면 호출이 실패한다. `record`는 기다리지 않고 띄워 보낸다.
- `MeteredAiClient`는 `createAiClient`가 돌려줄 마지막 클라이언트를 감싼다. 계약별
  경로를 하나씩 감싸지 않는다. `streams`를 그대로 넘긴다.
- 생성 작업이 중간에 실패하면 그 전에 성공한 호출은 기록에 남는다. 작업 단위 환불은
  이번 범위가 아니다.
- 1–6단계 커밋만 머지하면 재료 고르기가 크레딧 수만큼 칸을 그린다. 두 커밋을 한 PR로
  낸다.
- 분석 화면의 `formatDate`는 연도를 버린다(`slice(5)`). 사용량 추이는 이번 달
  안이므로 같은 형식이 맞다.

## 완료 기준

```
pnpm typecheck
pnpm test
pnpm test:infra
```

셋 다 통과. 화면 확인은 `AI_PROVIDER=fixture`로 워커와 API를 띄워 생성을 한 번
돌린 뒤 설정 화면에서 본다.

1. 사용량 구획에 이번 달 크레딧과 남은 양이 선다.
2. 날짜별 추이에 오늘 한 점이 선다.
3. 기능별 · 모델별 막대에 방금 호출한 계약과 모델이 선다.
4. 요금제 구획에서 무료 계정이면 Single Shot에 「사용 중」이 붙고 월 100 크레딧이
   적힌다.
5. 결제 구획에 내역 줄이 서고 누를 수 있는 것이 없다.
