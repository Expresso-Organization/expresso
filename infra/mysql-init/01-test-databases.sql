-- 통합 테스트는 파일마다 격리 데이터베이스를 새로 만들고 지웁니다. 공식 이미지가
-- 주는 권한은 `expresso` 한 곳뿐이라 그 자리를 넓힙니다.
--
-- 개발과 테스트에만 쓰고 버리는 통이라 이렇게 합니다 — 운영
-- (`compose.server.yaml`)은 `expresso` 한 곳만 그대로 둡니다.
grant all privileges on *.* to 'expresso'@'%';
