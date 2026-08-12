-- 스타일 문법에 **골격**을 더한다.
--
-- 지금까지 문법은 배경 · 글자 · 강조 · 서체 · 밀도 다섯이었다. 색과 서체는
-- 정하는데 **지면이 어떻게 짜이는지**는 아무도 정하지 않았고, 자유 생성으로
-- 옮기고 나서 그 자리가 그대로 드러났다 — 같은 문법으로 다섯 번 뽑았을 때
-- 팔레트는 매번 같았지만 어떤 판은 슬라이드 띠로, 어떤 판은 2단 격자로 나왔다.
-- 실행 사이에 가장 크게 흔들린 축이 문법에 없었던 것이다.
--
-- 그래서 한 칸을 연다. 사용자가 고르는 것이 "색과 서체"가 아니라 **지면의 성격**이
-- 되고, 생성기는 그걸 지켜야 할 제약으로 받는다.

update template set style = style || '{"structure":"single-column"}'::jsonb
  where code = 'clarity';
update template set style = style || '{"structure":"dense-grid"}'::jsonb
  where code = 'signal';
update template set style = style || '{"structure":"wide-margin"}'::jsonb
  where code = 'editorial';

update template set style = style || '{"structure":"single-column"}'::jsonb
  where style <> '{}'::jsonb and not (style ? 'structure');

-- 0013이 기본값을 팔레트만 든 문법으로 바꿔 놨다. 거기에도 골격을 넣는다 —
-- 안 그러면 style을 안 주고 넣은 행이 아래 제약에 걸린다.
alter table template
  alter column style set default
    '{"background":"#ffffff","text":"#1f2937","accent":"#2563eb","font":"sans","density":"comfortable","structure":"single-column"}'::jsonb;

-- **문법을 설정했다면** 골격이 있어야 한다. 빈 style은 "아직 안 정했다"는 뜻이고
-- 그때는 생성기가 문법 없이 돈다 — 반쯤 채운 문법을 넘기는 것보다 낫다.
-- 여기서 골격을 필수로 걸어 두는 이유는, 팔레트만 있고 골격이 없으면 실행마다
-- 지면 짜임이 흔들리는데 사용자는 자기가 그걸 골랐다고 믿기 때문이다.
alter table template
  add constraint template_style_has_structure check (
    style = '{}'::jsonb
      or (style ? 'structure'
          and style ->> 'structure' in ('single-column', 'dense-grid', 'wide-margin'))
  );

comment on column template.style is
  '스타일 문법. 생성 전에 사용자가 고르고 생성기가 제약으로 받는다 — 팔레트 · 서체 · 밀도 · 골격.';
