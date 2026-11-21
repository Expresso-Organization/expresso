# Expresso 한국어 추천 모델 · 문단 근거 검색 v2

파이썬 3.12에서 실행한다. CPU 패키지의 루트에 모델 폴더 `cpu`, 예시 입력 `example.json`, 정책 파일 `evidence-policy.json`과 아래 스크립트가 들어 있다.

```sh
uv run --no-project --python 3.12 --with-requirements requirements-cpu.txt python scripts/ml-data/match_release/cpu.py --bundle cpu --input example.json --output ranking.json
uv run --no-project --python 3.12 --with-requirements requirements-cpu.txt python scripts/ml-data/match_release/record_search.py query --bundle cpu --input example.json --job-id analyst --output evidence.json
```

- `ranking.json`의 `jobs`는 내림차순이다. `localScore`는 교사의 기록 부합도를 예측한 0~100 점수다. `evidence[].records`에는 상위 후보와 비교용 logit을, `evidenceRecordIds`에는 검증 분할의 근거 표시 기준을 통과한 ID만 둔다. 근거가 없는 프로필은 `insufficient_evidence`를 반환한다.
- `evidence.json`은 선택한 공고의 요건별 상위 기록 3개와 혼합 검색 후보(기본 최대 24개)를 담는다. 제목·Markdown 문단·속성을 나눠 검색하며 같은 기록의 문단을 기록 ID로 집계한다. `--candidate-limit`으로 후보 수를 정한다. 여러 기록에 걸친 경력 기간과 복합 조건은 별도 검토가 필요하다.
- 학습 점수·코사인·BM25의 순위를 결합해 후보를 고르고, 학습한 근거 헤드로 같은 후보를 재정렬한다. BM25 일치가 없는 0점 항목은 순위 결합에서 제외한다. 공고 순위 모델 A의 입력·가중치는 v1과 같고, 상세 근거 검색만 문단 경로를 사용한다.
- `records[].quote`의 `text`는 원문 인용이며 `source`는 `title`, `bodyMd`, `property`다. `start`·`end`는 Unicode 코드 포인트 위치이고 속성에는 `propertyKey`가 붙는다. 제품 API는 본인 기록의 해당 위치와 원문이 일치하는 인용만 표시한다. 인용은 근거 후보이며 요건 충족 확정이 아니다.
- `cpu/evidence.onnx`와 `cpu/evidence.json`이 있으면 별도 학습한 근거 헤드를 자동으로 읽는다. 원본 CPU 번들의 가중치 해시가 맞아야 실행된다. v1 비교에는 첫 명령의 `--evidence-mode record`, 둘째 명령의 `--legacy`를 쓴다. HTTP 서비스의 `--evidence-model`로 외부 헤드 경로를 지정할 수도 있다.
- 재정렬을 켤 때만 `OPENAI_API_KEY`를 실행 환경에 설정한다. 첫 명령에 `--decisions-cache cache/jobs`를 추가하면 공고 상위 K개를 재정렬한다. 둘째 명령에 `--decisions-cache cache/records --policy evidence-policy.json`을 추가하면 근거 후보를 재검증한다. 로컬 호출은 네트워크를 사용하지 않는다. API 실패 시 공고는 로컬 순위를 유지하고, 기록은 미검증 상태를 표시한다.
- 고정 요건은 직무 단위로 작성하고 ID를 유지한다. `kind` 값은 `must`, `responsibility`, `preferred`다. 동일한 계정에서 경력 기록 ID는 고유해야 한다. 같은 공고를 여러 사용자에게 적용할 때는 `CpuRanker` 인스턴스를 재사용하면 공고 벡터가 캐시된다.
