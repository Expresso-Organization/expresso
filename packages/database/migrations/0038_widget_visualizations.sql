-- 위젯이 그릴 수 있는 그림을 07이 실제로 그리는 것들로 맞춘다.
--
-- 원래 목록은 number · line · bar · funnel · table이었다. 07이 그리는 것 중
-- **유입 도넛 · 기업 도메인 목록 · 해설 · 타일 스파크**가 여기에 없어서, 지금
-- 화면에 있는 위젯조차 저장할 수 없었다.
--
-- funnel은 지운다. 깔때기를 그릴 자리가 화면 정의서에 없고, 그릴 데이터도 없다.
-- table도 지운다 — 같은 뜻을 list가 한다.

alter table widget drop constraint widget_visualization_check;

alter table widget
  add constraint widget_visualization_check
  check (visualization in ('number', 'spark', 'line', 'bar', 'donut', 'list', 'note'));

comment on column widget.visualization is
  '어떻게 보여줄까. 무엇을(metric_key)과 갈라져 있고, 어느 지표가 어느 그림을 낼 수 있는지는 지표 카탈로그가 정한다.';

comment on column widget.position is
  '{"order": 0, "span": 3} — 12칼럼 그리드에서의 순서와 폭.';
