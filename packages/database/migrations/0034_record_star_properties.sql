-- 경험 기록에 STAR 자리를 만든다.
--
-- §8.3 「기록 정리」는 대화 답변 하나를 STAR 4항목 + 수치 + 역량 + 제목으로
-- 정리한다. `record.properties`가 그걸 담을 자리인데, 트리거가 **카테고리가
-- 선언하지 않은 속성을 거부**하므로(0006 `validate_record_properties`) 먼저
-- 스키마에 자리를 낸다.
--
-- 기존 `role` · `organization` · `achievements`는 건드리지 않는다 —
-- 0006의 트리거가 속성 제거를 막기도 하고, 사람이 직접 쓰던 칸이다.
--
-- 네 칸 모두 required가 아니다. 말하지 않은 것은 비워 둔다(§8.3 추측 금지).

-- `category_system_immutable`은 **런타임 변경**을 막는 방패다. 사용자가 시스템
-- 카테고리를 고치지 못하게 하는 것이지, 정의가 영영 못 바뀐다는 뜻은 아니다.
-- 마이그레이션이 하는 일이 바로 그 정의를 옮기는 것이므로 잠깐 내렸다 올린다.
alter table category disable trigger category_system_immutable;

update category
set property_schema = property_schema || jsonb_build_object(
  'situation',    jsonb_build_object('label', '상황',    'type', 'text', 'required', false, 'system', false),
  'task',         jsonb_build_object('label', '맡은 일', 'type', 'text', 'required', false, 'system', false),
  'action',       jsonb_build_object('label', '한 일',   'type', 'text', 'required', false, 'system', false),
  'result',       jsonb_build_object('label', '결과',    'type', 'text', 'required', false, 'system', false),
  'metrics',      jsonb_build_object('label', '수치',    'type', 'tags', 'required', false, 'system', false),
  'competencies', jsonb_build_object('label', '역량',    'type', 'tags', 'required', false, 'system', false)
)
where key = 'experience' and is_system;

alter table category enable trigger category_system_immutable;
