---
title: 첫 화면 3D를 3d-motion-web 엔진으로
slug: motionweb-engine
stage: plan
date: 2026-11-20
---

# 구현 계획

1. 생성 스크립트 · `page-engine.generated.ts` · THIRD-PARTY 고지.
2. `pageDocument` 엔진 싣기 + 테스트(쓰면 실림 · 해시 · 안 쓰면 같은 문서).
3. `PAGE_SCRIPT_PROMPT` · `design-rules.ts` · 판 올림. 프롬프트 테스트.
4. 같은 네 짝 다시 그리기 → 로컬 vgpu 검사 · 1440×900 촬영(WebGPU) · 보드에 「엔진」 칸.
5. 전체 검사 · 커밋 · 푸시 · 보고.
