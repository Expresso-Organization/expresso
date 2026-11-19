---
title: 배포 중 웹 화면 오류 제거
slug: deploy-web-swap
stage: spec
status: accepted
intent: .intent/intent_deploy-web-swap.md
date: 2026-11-10
---

# 배포 중 웹 화면 오류 제거 — 명세

## 요구사항

- [ ] `next build`가 도는 동안 운영 `services/web/.next`를 지우거나 쓰지 않는다.
- [ ] 웹 교체는 `systemctl stop expresso-web` → 폴더 교체 → `systemctl start expresso-web` 순서다.
- [ ] 빌드가 실패하면 `.next`는 배포 전 그대로다(`set -e`로 교체 전에 끝난다).
- [ ] 새 `.next/static`에 이전 판의 정적 파일이 남고, 수정 시각이 7일을 넘은 파일은 지워진다.
- [ ] 교체 뒤 직전 빌드가 `services/web/.next-prev`에 있다.
- [ ] Turbopack 빌드 캐시(`.next/cache`)를 새 빌드가 이어 쓴다.
- [ ] 새 폴더 이름이 git에서 추적되지 않는다.

## 설계

재사용: `next.config.ts`가 이미 `NEXT_DIST_DIR`를 `distDir`로 받는다. `deploy.sh`의 `git checkout -- services/web/next-env.d.ts`가 빌드가 고친 `next-env.d.ts`를 되돌린다. 웹 준비 확인 루프와 바깥 확인은 그대로 쓴다.

`scripts/operations/deploy.sh`의 웹 빌드 단계를 바꾼다.

1. 빌드 전: `.next-build`를 지우고 만든 뒤 `.next/cache`를 `.next-build/cache`로 옮긴다(같은 파일 시스템의 rename). 운영 서버는 이미지 캐시가 필요하면 `.next/cache`를 다시 만든다.
2. 빌드: `NEXT_DIST_DIR=.next-build NEXT_PUBLIC_API_BASE_URL=… pnpm --filter @expresso/web build`.
3. 이전 판 정적 파일 복사: `.next/static`의 파일 중 `.next-build/static`에 없는 것만 `cp -p`로 복사한다. `-p`가 원래 수정 시각을 지킨다. `cp -n`은 건너뛸 때의 종료 코드가 coreutils 판·macOS마다 달라 쓰지 않는다.
4. API 준비 뒤 웹 교체: stop → `rm -rf .next-prev` → `mv .next .next-prev` → `mv .next-build .next` → start.
5. 교체 뒤 `find .next/static -type f -mtime +7 -delete`로 오래된 정적 파일을 정리한다.

이름 바꾸기가 안전한 근거: 빌드된 라우트 모듈에는 `distDir:".next-build"`가 박히지만, `next start`는 요청마다 서버의 실제 `distDir`로 덮어쓴다(`next/dist/server/route-modules/route-module.js` 363–365행, Next 16.3.0). 로컬에서 `.next-build`로 짓고 `.next`로 바꾼 뒤 `next start`에서 `/login` 200, 정적 청크 200을 확인했다.

## 버린 대안

- 판마다 폴더를 두고 systemd에 `NEXT_DIST_DIR`를 넘기는 방식: 유닛 파일과 환경 파일을 서버에 손으로 반영해야 하고, 이름 바꾸기로 충분하다.
- 앞선 판 정적 파일을 기간 제한 없이 누적: 배포마다 약 19MB씩 늘어난다.
- Next.js `deploymentId`로 판 불일치를 처리: 다른 화면으로 옮길 때만 새로고침해 주고, 이미 열린 화면의 지연 로드 청크 실패는 막지 못한다.

## 함정

- `.next`가 없는 첫 배포(새 서버): `mv .next/cache`, `cp`, `mv .next .next-prev`를 각각 존재 여부로 감싼다.
- 빌드 성공 뒤 API 준비에서 실패하면 `.next-build`가 남는다. 다음 배포의 1단계가 지운다.
- `rm -rf` 대상은 `$WEB_DIR`(`$ROOT/services/web`) 아래의 고정 이름만 쓴다.
- `.gitignore`의 `.next/`는 `.next-build/`·`.next-prev/`에 걸리지 않는다.

## 완료 기준

- `bash -n scripts/operations/deploy.sh` 통과.
- 로컬에서 웹 단계만 떼어 낸 시험(빌드 → 복사 → 교체 → `next start`)에서 `/login` 200, 새 청크 200, 이전 판 청크 200.
- 머지 뒤 운영 배포 중 `/_next/static` 요청이 500을 내지 않고, 배포가 「배포 완료」로 끝난다.
