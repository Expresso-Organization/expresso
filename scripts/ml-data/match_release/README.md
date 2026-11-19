# Expresso 한국어 추천 모델 v1

파이썬 3.12에서 실행한다. CPU 패키지의 루트에 모델 폴더 `cpu`, 예시 입력 `example.json`, 정책 파일 `evidence-policy.json`과 아래 스크립트가 들어 있다.

```sh
uv run --no-project --python 3.12 --with-requirements requirements-cpu.txt python scripts/ml-data/match_release/cpu.py --bundle cpu --input example.json --output ranking.json
uv run --no-project --python 3.12 --with-requirements requirements-cpu.txt python scripts/ml-data/match_release/record_search.py query --bundle cpu --input example.json --job-id analyst --output evidence.json
```

- `ranking.json`의 `jobs`는 내림차순이다. `localScore`는 교사의 기록 부합도를 예측한 0~100 점수다. `evidence[].records`에는 상위 후보와 비교용 logit을, `evidenceRecordIds`에는 검증 분할의 근거 표시 기준을 통과한 ID만 둔다. 근거가 없는 프로필은 `insufficient_evidence`를 반환한다.
- `evidence.json`은 선택한 공고의 요건별 로컬 상위 기록과 선택적 검증용 후보(최대 12건)를 담는다. 기록 단독으로 요건을 뒷받침하는지를 본다. 여러 기록에 걸친 경력 기간과 복합 조건에는 별도 검토가 필요하다.
- 재정렬을 켤 때만 `OPENAI_API_KEY`를 실행 환경에 설정한다. 첫 명령에 `--decisions-cache cache/jobs`를 추가하면 공고 상위 K개를 재정렬한다. 둘째 명령에 `--decisions-cache cache/records --policy evidence-policy.json`을 추가하면 근거 후보를 재검증한다. 로컬 호출은 네트워크를 사용하지 않는다. API 실패 시 공고는 로컬 순위를 유지하고, 기록은 미검증 상태를 표시한다.
- 고정 요건은 직무 단위로 작성하고 ID를 유지한다. `kind` 값은 `must`, `responsibility`, `preferred`다. 동일한 계정에서 경력 기록 ID는 고유해야 한다. 같은 공고를 여러 사용자에게 적용할 때는 `CpuRanker` 인스턴스를 재사용하면 공고 벡터가 캐시된다.
