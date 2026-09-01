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

# Career table row controls design QA

- Source visual truth: `/var/folders/wy/zrbg0t692zq6smx73mhzsdhr0000gn/T/codex-clipboard-1556a70d-d73c-4c81-8cf4-40ebbc0a9bd5.png`
- Implementation screenshot: `/tmp/expresso-notion-row-controls.png`
- Focused comparison: `/tmp/expresso-notion-row-controls-comparison.png`
- Route: `http://127.0.0.1:3200/career/e2e_properties_a86af0b5652a4e9bb9efe8f3344c2f85`
- Viewport: 1433 × 1027 CSS px, dark theme
- Source pixels: 782 × 318 at approximately 2× density
- Implementation pixels: 1433 × 1027 at browser viewport density
- Normalization: the source was reduced to 390 × 159 before comparing the row-control region at matching CSS density.
- State: grouped table, `모든 속성` row controls visible; selected checkbox state checked separately

## Full-view comparison evidence

The source is a focused Notion database crop, so the implementation was checked in its full Expresso screen first to confirm that the wider row-control column did not shift the sidebar, toolbar, grouped-table boundaries, or horizontal scrolling behavior.

## Focused region comparison evidence

The normalized comparison places the source and implementation row regions together. Both use the same left-to-right order: add, six-dot drag handle, selection checkbox, page icon, and title. The controls share the compact 16–18 px optical scale after source-density normalization and appear only while the row is hovered, focused, active, or selected.

## Required fidelity surfaces

- Fonts and typography: existing Expresso table text remains at its established size and weight; the row controls contain icons only.
- Spacing and layout rhythm: the action column is 96 px, with 24 px add and drag targets, a 16 px checkbox, and 3 px internal gaps. The title starts after a page icon with an 8 px gap.
- Colors and visual tokens: inactive controls use muted foreground and neutral borders; hover, focus, checked, drag, and drop states use existing `--ex-*` tokens.
- Image quality and asset fidelity: all visible controls use the existing Phosphor icon set. No raster placeholder, handcrafted SVG, CSS icon, or text glyph was introduced.
- Copy and content: row titles and existing property values remain unchanged. Accessible labels describe add, reorder, and selection actions.
- Accessibility and interaction: selection stays a native checkbox input behind the custom visual; the drag handle supports pointer drag and arrow-key reorder; drop position is visible; manual movement clears property sorting and persists the record order in the saved view.

## Findings

No actionable P0, P1, or P2 mismatch remains within the requested row-handle and selection-control scope.

Accepted product adaptations:

- The source `열기` pill is outside this change's handle-and-checkbox scope; Expresso continues opening a record through its title and double-click behavior.
- Expresso keeps its existing grouped-table frame and density around the matched row controls.

## Comparison history

- Pass 1 found that the original table exposed only a browser checkbox and had no row drag affordance.
- The implementation added the Notion control sequence, neutral custom checkbox, page icon, hover/focus states, drag feedback, keyboard movement, and saved `recordOrder`.
- Pass 2 normalized the 2× source density and found no remaining P0–P2 difference in the requested control region.

## Interactions verified

- Browser: row controls appear together when the drag handle receives focus.
- Browser: selecting the custom checkbox shows the checked state and the bulk toolbar; deselecting restores the row.
- Browser: arrow-key movement saves without a view-change error.
- Focused tests: pointer drag and arrow-key reorder both emit persisted manual order and clear conflicting property sorts.
- Backend test: saved record order compiles into a stable Mongo sort with `_id` tie-breaking.

## Implementation checklist

- [x] Add and six-dot drag controls use the product icon library.
- [x] Checkbox visuals match the reference without browser-native chrome.
- [x] Hover, focus, checked, dragging, and drop-target states are present.
- [x] Pointer and keyboard reordering update the saved view.
- [x] Existing saved views default missing `recordOrder` to an empty list.
- [x] Browser capture and density-normalized focused comparison completed.

final result: passed

---

# Career grouped table design QA

- Source visual truth: `/var/folders/wy/zrbg0t692zq6smx73mhzsdhr0000gn/T/codex-clipboard-02ad4eb2-3ce4-4808-ab50-39024558bc0a.png`
- Implementation screenshot: `/tmp/expresso-grouped-table-final.png`
- Focused comparison: `/tmp/expresso-grouped-table-final-comparison.png`
- Route: `http://127.0.0.1:3200/career/e2e_properties_a86af0b5652a4e9bb9efe8f3344c2f85`
- Viewport: 1433 × 1027 CSS px, dark theme
- Source pixels: 1934 × 1502
- Implementation pixels: 1433 × 1027 at the browser viewport density
- Normalization: the grouped-table regions were cropped and normalized to 680 px width in the focused comparison.
- State: table view grouped by `select 1`, empty and `선택 A` groups expanded

## Full-view comparison evidence

The implementation keeps the Expresso navigation and toolbar while replacing the flat table with value-based sections. Group headers, repeated column headers, rows, and per-group creation controls remain inside the existing table content area without shifting the sidebar or toolbar.

## Focused region comparison evidence

The focused comparison covers the group header, repeated table header, record row, and group creation row. Both the source and implementation repeat the same columns for every expanded group and place a creation action immediately after each group table.

## Required fidelity surfaces

- Fonts and typography: group names use the existing UI font and semibold hierarchy; counts and creation actions use smaller muted text.
- Spacing and layout rhythm: groups use 20 px vertical separation, compact 32 px group headers, 42 px table rows, and rounded table surfaces consistent with the existing career view.
- Colors and visual tokens: all surfaces, borders, pills, hover states, and muted labels use `--ex-*` tokens. Large accent-filled group backgrounds were avoided.
- Image quality and asset fidelity: the target contains no raster assets inside the grouped component. Carets and property icons use the existing Phosphor icon component.
- Copy and content: empty groups use `{속성명} 없음`; option groups use the resolved option name; every group exposes `새 기록` and its record count.
- Accessibility and interaction: group toggles expose expanded state and explicit fold/unfold names; each expanded group is a labelled grid; title and property resize separators remain keyboard reachable.

## Findings

No actionable P0, P1, or P2 mismatch remains.

Accepted product adaptations:

- The implementation uses the two records available in the E2E category, while the reference contains more sample groups and rows.
- Group pills use Expresso neutral tokens instead of copying the reference's arbitrary option colors.
- The group creation label is `새 기록`, matching the product's career terminology.

## Comparison history

- Pass 1 found the missing per-group creation action.
- The implementation added a working `새 기록` row that pre-fills select and multi-select group values.
- Pass 2 compared the revised expanded groups and found no remaining P0–P2 difference.

## Interactions verified

- `select 1` produces `select 1 없음` and `선택 A` sections.
- Group sections repeat the table header and contain only their matching records.
- Collapse removes the group grid and exposes the corresponding expand control.
- Each group exposes a working creation button; focused tests verify multi-select prefill.
- An implicit title column exposes a resize separator in every expanded group.

## Implementation checklist

- [x] Saved `groupPropertyId` drives table rendering.
- [x] Empty, select, multi-select, and general value groups are supported.
- [x] Multi-select records may appear in multiple matching groups.
- [x] Group order respects saved keys or labels.
- [x] Groups are collapsible and keyboard accessible.
- [x] Group creation pre-fills select and multi-select values.
- [x] Browser capture and focused comparison completed.

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
