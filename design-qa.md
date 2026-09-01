# M2 디자인 선택 화면 QA

## 검증 조건

- 기준 문서: `docs/architecture/portfolio-creation-flow-v2.md` 6장, 15.1
- 화면 정의 참고: `docs/screens/03.png`
- 구현 경로: `/brew/51517143-1346-47af-b7ef-cfb025de48e9/design`
- 데스크톱 viewport: 1440 × 940
- 모바일 viewport: 390 × 844
- 선택 디자인: Refero Styles 기반 `Apple` r2

## 확인 결과

- 1440 × 940에서 카탈로그와 최소 520px 인스펙터를 함께 표시했다.
- 추천, Expresso 기본, 유명 웹사이트, 내 디자인, 회사 웹사이트 분류 수가 각각
  1, 3, 5, 0, 0으로 표시됐다.
- 분류를 바꾸면 카드 목록의 이전 스크롤 위치를 버리고 첫 카드부터 표시했다.
- Refero 기반 카드 5개가 이름, 출처, 특징, 추천 이유, 같은 공통 샘플의 축소
  `DESIGN.html`을 표시했다.
- `DESIGN.html` 미리보기와 코드, `DESIGN.md`, 출처와 적용 규칙 탭을 전환했다.
- Apple 카드의 출처 탭에서 Refero 스타일 URL과 Refero가 분석한 원본 URL을 확인했다.
- 전체 화면 전환 후 `Escape`로 원래 인스펙터 상태에 돌아왔다.
- 390 × 844에서 카탈로그는 한 열로 표시됐고, 카드 클릭 시 인스펙터가 화면 전체를
  사용했다. 닫기 뒤 카탈로그로 돌아왔다.
- Apple 디자인 적용 후 `적용됨` 상태와 `레시피로 계속` 링크가 표시됐다.
- DB에서 선택한 revision ID, `ReferenceLock` 스냅샷, 선택 시각이 저장된 것을 확인했다.
- 레시피 화면은 v2 단계 표시 `02 / 03 · 레시피`를 유지했다.

## 시각 판정

- Apple r2는 getdesign.md의 Apple·Claude Live Preview에서 확인한 정보 구조를 기준으로
  표지, 색상 견본, 타입 램프, 표면·버튼, 구성 와이어프레임, 컴포넌트 상태, 이미지
  아티팩트, 모션, 사용 규칙, 완성형 포트폴리오 예시를 한 문서에 배치했다.
- 고품질 Live Preview 분기는 `refero-apple` r2에만 적용했다. 나머지 디자인 7종은
  기존 렌더러를 유지한다.
- 색, 간격, 반경, 그림자는 기존 `--ex-*` 역할 토큰을 사용한다.
- 데스크톱에서는 비교 카드와 문서가 같은 시야에 들어오며, 1280px 미만에서는
  인스펙터가 오버레이로 열려 카드 폭을 보존한다.
- 모바일에서는 가로 필터를 스크롤할 수 있고 본문 가로 넘침은 없었다.

final result: passed

---

# Career property header menu design QA

- Source visual truth: `/var/folders/wy/zrbg0t692zq6smx73mhzsdhr0000gn/T/codex-clipboard-023f9c86-e463-4abd-8002-758e8997638a.png`
- Implementation screenshot: `/tmp/expresso-career-property-menu-implementation.png`
- Focused comparison: `/tmp/expresso-property-menu-comparison.png`
- Route: `http://127.0.0.1:3200/career/e2e_properties_a86af0b5652a4e9bb9efe8f3344c2f85`
- Viewport: 1433 × 1027 CSS px, dark theme
- Source pixels: 1790 × 1133
- Implementation pixels: 1433 × 1027 at the browser viewport density
- Normalization: the source menu and implementation menu were cropped to their visible component bounds and normalized to 360 px width in the focused comparison.
- State: table view, `속성 text` column menu open, property-name input focused

## Full-view comparison evidence

The implementation keeps the table, toolbar, column header, and menu in the same interaction state as the source. The menu is anchored below the selected column and remains inside the viewport without shifting the table. The implementation uses the existing Expresso navigation and table density around the focused component.

## Focused region comparison evidence

The focused comparison covers the full open menu because typography, icon alignment, separators, and action density are the fidelity-critical surfaces. Both menus use a name-edit row, property type control, view actions, a separator, and column actions ending in a danger-colored delete action.

## Required fidelity surfaces

- Fonts and typography: Expresso UI tokens preserve the source hierarchy through a semibold property name, regular action labels, and muted secondary state text. Truncation is applied to long property labels.
- Spacing and layout rhythm: the source hierarchy is preserved with a compact 320 px menu, 34 px action rows, 7–8 px internal padding, section dividers, and an 11 px outer radius. The denser vertical rhythm matches the existing Expresso toolbar and table.
- Colors and visual tokens: surfaces, borders, hover states, muted labels, and destructive actions use `--ex-*` tokens. The source blue focus treatment is translated to the product focus-ring token.
- Image quality and asset fidelity: the target contains no raster imagery. All icons use the product's existing Phosphor icon component; no custom SVG, CSS art, or placeholder assets were introduced.
- Copy and content: source actions supported by the career-property and saved-view contracts are included. Unsupported Notion-specific actions such as AI auto-fill, pinning, and calculation are omitted so every displayed action works.
- Accessibility and interaction: the menu is a labelled non-modal dialog, returns focus after Escape, closes on outside interaction, keeps the name input labelled, and uses a second confirmation step for lossy type changes and deletion.

## Findings

No actionable P0, P1, or P2 mismatch remains.

Accepted product adaptations:

- Expresso uses a narrower, denser menu than the reference to match the existing table scale.
- Type selection is direct in the menu instead of a second submenu.
- Unsupported reference actions are omitted rather than rendered as inert controls.

## Comparison history

- Pass 1: the open reference and browser implementation were cropped and normalized side by side. No P0–P2 mismatch was found; no visual correction loop was required.

## Interactions verified

- Table view opens from the saved-view tab.
- Clicking `속성 text` opens the correct property menu below the header.
- The property-name input receives focus.
- Current sort direction appears as applied.
- Focused tests cover sorting through the menu and the property preview/apply rename round trip.

## Implementation checklist

- [x] Column header opens the property menu.
- [x] Name and type changes use property preview/apply.
- [x] Filter, sort, group, and hide update the saved view.
- [x] Insert, duplicate, and delete use working schema operations.
- [x] Lossy changes require confirmation.
- [x] Browser capture and focused component comparison completed.

final result: passed
