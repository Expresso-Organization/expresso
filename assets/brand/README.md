# 브랜드 자산

로고 마크를 래스터로 구운 것들입니다. **손으로 만들지 않습니다** —
`scripts/build-brand-assets.py`가 굽고, 그림의 출처는
`services/web/src/components/brand/Logo.tsx` 하나입니다.

```
python3 scripts/build-brand-assets.py
```

로고를 고쳤으면 `Logo.tsx`를 고치고 이 스크립트를 다시 돌립니다. 반대로 하면
화면의 로고와 탭의 로고가 조용히 달라집니다.

## 무엇이 무엇인가

| 파일 | 지면 | 색 |
| --- | --- | --- |
| `expresso-mark-light-*.png` | 밝은 지면 (05 사이드바) | 컵 espresso · 손잡이 crema |
| `expresso-mark-dark-*.png` | 어두운 지면 (10 · 10b 좌측 패널) | 컵 crema · 손잡이 #A9793F |
| `expresso-tile-*.png` | 지면을 고를 수 없는 자리 | ink-900 타일 위 dark 짝 |
| `expresso-logo-grid-light.svg` | 밝은 지면 | 컵 bean-50 면 · espresso 윤곽, 손잡이 bean-100 면 · #A9793F 윤곽, 보조선 crema |
| `expresso-logo-grid-dark.svg` | 어두운 지면 | 컵 · 손잡이를 crema 계열 면과 윤곽, 보조선 crema 28 · 50% |

마크 두 벌은 배경이 없습니다. 뒤에 무엇이 오는지 아는 자리에서만 씁니다 —
espresso는 어두운 지면에서, crema는 밝은 지면에서 각각 묻힙니다.

**타일은 그래서 있습니다.** 파비콘·홈 화면 아이콘처럼 뒤에 무엇이 올지
모르는 자리는 지면을 함께 들고 갑니다. 밝은 탭에서도 어두운 탭에서도 같게
보입니다.

## 파비콘

`services/web/src/app/`의 `favicon.ico` · `icon.png` · `apple-icon.png`도 같은
스크립트가 굽습니다. Next App Router가 파일 이름만 보고 `<link>`를 붙이는
자리라 따로 적어 줄 것이 없습니다.

## 구성 그리드

`expresso-logo-grid-*.svg`는 마크를 한 가지 면과 윤곽선으로 그리고, 모양을 만드는 원과
기준선을 겹친 벡터입니다 — 손잡이를 이루는 두 원, 잉크 경계 상자의 네 변, 커피 면의 높이,
손잡이를 지우는 마스크 원, 상자 모서리 · 마크가 상자에 닿는 점 · 커피 면의 양 끝 · 두 중심. 표지 · 소개 자료처럼 로고의
구조를 보여 줄 자리에 씁니다.

개발 포털은 `docs/`만 발행하므로 같은 스크립트가 `docs/assets/brand/`에도 사본을
씁니다. 문서는 그 사본을 참조합니다.
