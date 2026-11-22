# 추천모델 배포와 복구

초기 운영 후보는 로컬 공고 순위 모델 A와 문단 근거 헤드 B다. 기존 탐색 순서는 유지하며 사용자가 추천·근거 찾기 버튼으로 실행한다. 배포 승인 전에는 모델 파일 준비와 격리 검증까지만 수행한다.

## 배포 파일

| 항목 | 값 |
| --- | --- |
| 압축 파일 | `expresso-match-cpu-v2-final.tar.gz` |
| 크기 | 701,732,454바이트 |
| SHA-256 | `3a6d6fbf131096ceea3571c22b374329596e210b27db412d2925d58c9775d5df` |
| 배포본 ID | `3a6d6fbf131096ce-31dd18d5847ee015` |
| Python | 3.12, 배포본별 가상환경 |
| 의존성 | `services/match-inference/requirements.lock` |
| 모델 경로 | `/home/ubuntu/expresso/var/match-model/releases/<배포본 ID>` |
| 선택 링크 | `/home/ubuntu/expresso/var/match-model/current`, `previous` |
| 벡터·체크포인트 | `/var/lib/expresso-match` |
| 내부 주소 | `http://127.0.0.1:4810` |

배포본 ID는 압축 파일 해시와 Python 의존성 해시의 앞 16자리씩을 결합한다. `ready.json`에는 배포 파일별 해시가 있다. `prepare`는 파일을 풀고 고정된 의존성을 설치한 뒤 실제 추천·문단 근거·SQLite 복원을 검사한다. 실패하면 이번 실행에서 생성한 배포본만 정리한다. 기존 배포본과 선택 링크는 유지한다.

## 승인 전 준비

검증한 후보 코드에서 아래 명령을 실행한다. 후보 코드는 운영 체크아웃과 분리하고, `--root`로 운영에 둘 비활성 모델 경로만 지정한다.

```sh
export PATH="/home/ubuntu/.local/bin:$PATH"
python3 scripts/operations/match-release.py \
  --root /home/ubuntu/expresso/var/match-model prepare \
  --archive /home/ubuntu/expresso/var/match-validation-20261122/model.tar.gz \
  --sha256 3a6d6fbf131096ceea3571c22b374329596e210b27db412d2925d58c9775d5df
```

이 명령은 운영 서비스 설치·시작, `current` 전환, API·Worker 설정 변경을 수행하지 않는다. 가상환경은 이동하면 실행 경로가 깨지므로 실제 최종 경로에서 생성한다.

파일 검사는 서비스 변경 없이 반복할 수 있다.

```sh
python3 scripts/operations/match-release.py \
  --root /home/ubuntu/expresso/var/match-model verify \
  3a6d6fbf131096ce-31dd18d5847ee015
```

## 승인 후 운영 전환

GitHub 저장소 변수 `MATCH_MODEL_RELEASE`에 위 배포본 ID를 지정하면 `web-deploy.yml`이 해당 ID를 기존 배포 스크립트에 전달한다. 첫 전환 전에 배포본 준비를 끝내야 한다. 변수를 지정하지 않은 호스트는 기존 `current`가 있을 때만 모델을 재시작한다.

수동 배포도 같은 경로를 쓴다. 아래 명령의 커밋은 승인된 통합 커밋으로 지정한다.

```sh
EXPRESSO_MATCH_RELEASE=3a6d6fbf131096ce-31dd18d5847ee015 \
  scripts/operations/deploy.sh "$APPROVED_COMMIT"
```

`deploy.sh`는 백엔드·웹 빌드 후 API·Worker를 재시작하기 전에 다음 단계를 수행한다.

1. `ready.json`과 Python 의존성 해시 검사.
2. `current` 원자적 교체, 직전 링크를 `previous`로 보관.
3. 추론 systemd 유닛과 API·Worker의 `30-match-model.conf` 설치.
4. 추론 서비스 시작과 `/health` 확인.
5. 최신 백엔드 CLI로 기존 공고·기록의 전체 임베딩 준비. MongoDB 변경 시점을 저장해 준비 도중의 변경을 Worker가 이어서 처리.
6. 기존 배포 절차로 Worker·API·Web 전환 및 상태 검사.

다른 Worker가 준비 도중 체크포인트를 옮겼으면 원천을 다시 대조한다. 늦은 전체 준비 요청이 과거의 벡터 참조를 남기는 것을 막는다.

4~5단계가 실패하면 직전 모델을 복원한다. 첫 활성화 실패는 추론 서비스를 비활성화하고 새 연결 설정을 제거한다. API·Worker의 기존 프로세스는 이 준비가 성공할 때까지 유지된다. 첫 전체 임베딩 준비 시간은 실제 데이터 수에 따라 늘어나므로 배포 작업의 시간 제한에 반영한다.

systemd는 추론에 CPU 한 코어 분량과 ONNX 1스레드를 배정한다. `/var/lib/expresso-match`는 0700이며 모델과 분리한다. 모델 파일은 읽기 전용으로 사용하고, 프로세스 실패 시 재시작한다.

## 외부 검증

기본 전환은 외부 호출을 끈다. 운영자가 별도 환경 설정 `/etc/expresso/match-inference.conf`에서 `EXPRESSO_MATCH_DECISIONS=1`과 실행 환경의 `OPENAI_API_KEY`를 제공한 경우에만 Decisions를 켠다. 키를 저장소·배포 파일·검증 보고서에 넣지 않는다.

외부 검증 캐시는 전용 상태 디렉터리의 `decisions` 아래에 둔다. 제품의 동의를 통과하고 외부 검증 버튼을 누른 요청만 전송한다. Cross-Encoder 가중치는 비교용이며 이 CPU 서비스에 로드하지 않는다.

## 실패와 복구

모델 프로세스 중단은 기존 API의 `/health/ready`를 실패시키지 않는다. 추천 화면은 연결 불가 상태를 표시하고, 제작 재료 선택은 기존 규칙으로 처리한다. 추론 모델에 데이터가 준비됐는지는 아래 내부 경로로 확인한다.

```sh
curl -fsS http://127.0.0.1:4810/health
curl -fsS -H 'content-type: application/json' -d '{}' \
  http://127.0.0.1:4810/v1/vector-stats
sudo systemctl status expresso-match-inference
```

API·Worker의 연결 설정은 추가 `EnvironmentFile`로 전달해 기존 환경 파일보다 뒤에 적용한다. 모델의 비밀 값과 프로필 원문을 점검 로그에 출력하지 않는다.

직전 모델로 되돌릴 때는 해당 Python 의존성과 호환되는 앱 코드에서 실행한다.

```sh
bash scripts/operations/match-service.sh rollback
```

처음 모델을 도입하기 전 앱으로 복구하거나 모델을 끌 때는 먼저 연결 설정을 제거한다. 이후 기존 [앱 복구 절차](DEPLOYMENT.md)에 따라 이전 커밋을 배포한다.

```sh
bash scripts/operations/match-service.sh disable
```

모델을 끈 뒤에는 API·Worker 재시작이 필요하다. 배포본과 SQLite 상태는 남겨 재활성화·조사를 지원한다. 모델을 끈 상태를 유지하려면 GitHub 변수 `MATCH_MODEL_RELEASE`도 비운다.

## 격리 검증 재실행

`scripts/operations/validate-match-release.mjs`는 별도 MongoDB 57177·Redis 56479·API 4497·추론 4897만 사용한다. 공개 공고 스냅샷의 경로와 준비한 배포본을 지정한다. 실제 사용자의 기록·인증 정보는 복사하지 않으며 가상 계정 6명을 생성한다.

```sh
MATCH_VALIDATION_DIR=/home/ubuntu/expresso/var/match-validation-20261122 \
MATCH_VALIDATION_RELEASE=/path/to/prepared/release \
  node scripts/operations/validate-match-release.mjs
```

현재 모집 중인 전체 공개 공고로 인증 추천·원문 인용·1/2/4/6 동시 요청을 검사한다. 실제 기록 저장·삭제, Worker 중단 중 변경, 3회 전체 시험 프로세스 재시작, 추론 중단·복구를 검사한다. 원문 데이터·세션 토큰은 보고서에 넣지 않고 요청별 시간과 검사 결과만 기록한다.

격리 systemd 전환·준비 실패·복구는 `scripts/operations/validate-match-activation.sh`로 검사한다. 운영 유닛과 다른 이름·포트·상태 경로를 강제한다. [2026-11-22 통합 검증과 비활성 준비 상태](../architecture/match-release-readiness-2026-11-22.md)에 요청별 결과와 운영 상태의 최종 재대조 결과가 있다.
