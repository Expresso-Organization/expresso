-- 고용24 채용정보 화면을 읽는 출처를 더한다.
--
-- 기존 `work24`는 공공기관 채용정보(재정경제부 API)만 준다. 워크넷 채용정보
-- API는 고용24 기업회원 전용이라 개인 자격으로 열 수 없고, 공공데이터포털의
-- 워크넷 API는 전부 LINK 유형이라 우회가 되지 않는다. 그래서 공개 목록을
-- 직접 읽는 `work24web`을 따로 둔다 — 같은 이름 아래 두면 어느 쪽이 무엇을
-- 가져왔는지 `job_source`에서 구분할 수 없다.
alter table `job_source` drop check `job_source_provider_check`;
alter table `job_source` add constraint `job_source_provider_check`
  check ((`provider` in (
    'greenhouse', 'lever', 'ashby', 'workable', 'greeting', 'work24', 'work24web'
  )));
