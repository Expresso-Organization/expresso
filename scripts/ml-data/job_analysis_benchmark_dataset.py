"""서버에서 내보낸 공개 공고 중 고정 벤치마크 표본을 만든다."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


SELECTED_IDS = [
    "3a92e870-32df-45d4-8415-938c0df8be54",  # 짧고 노이즈가 있는 고용24 공고
    "bf6de54a-80f5-4740-8f83-11771f871444",  # 짧은 보안 공고
    "c5718c14-c75c-498b-b287-fd31f9f016bb",  # QA
    "dd4903ec-371e-4eec-a637-120ab49c6d26",  # 데이터
    "eeeea76a-54b0-4132-bdcb-5845973a59c3",  # 모바일
    "b2eae6de-07ee-445b-8983-0b7e049d9607",  # 프론트엔드
    "f91518b9-a7aa-4164-8868-697e6125e106",  # 백엔드
    "6bf811c0-d26c-46a2-a11d-751346e47407",  # 인프라
    "59753094-32b6-4d10-aeff-3d76d7d6db79",  # ML
    "45d1ae53-036e-460a-8039-e879f4d2d212",  # 긴 백엔드
    "331851c9-369c-4346-b344-c57f77af348d",  # 긴 보안
    "edf52078-93cd-4248-9528-08a355f3475f",  # 긴 AI 연구
]


REFERENCES = {
    "3a92e870-32df-45d4-8415-938c0df8be54": [
        {"quote": "인사관리(채용, 인사, 근태, 급여, 복리후생, 퇴직금, 평가 등) 시스템 웹 프로그램 개발", "kind": "must", "axis": "role"},
        {"quote": "프로그램 기능 및 디자인 개선", "kind": "must", "axis": "role"},
        {"quote": "웹 개발 관련 기술 도입 및 적용", "kind": "must", "axis": "technology"},
        {"quote": "프로젝트 관리 및 협업", "kind": "must", "axis": "role"},
    ],
    "bf6de54a-80f5-4740-8f83-11771f871444": [
        {"quote": "정보보안 밑 네트워크 엔지니어링 경력자(경험 3년 이상~9년 이하)", "kind": "must", "axis": "role"},
        {"quote": "정보보안 관련 자격증 소지자 우대", "kind": "nice", "axis": "role"},
        {"quote": "TCP/IP, VLAN, VPN 등의 지식 보유", "kind": "must", "axis": "technology"},
        {"quote": "시스템 보안에 대한 깊은 이해도", "kind": "must", "axis": "technology"},
        {"quote": "운전 면허증 및 자차 보유 필수", "kind": "must", "axis": "conditions"},
    ],
    "c5718c14-c75c-498b-b287-fd31f9f016bb": [
        {"quote": "아래 유관 경력 만 3년 이상", "kind": "must", "axis": "role"},
        {"quote": "전반적인 개발 라이프 사이클에서 요구사항 분석, 테스트 기법 선정, 개발 단계 별 테스트 경험 보유", "kind": "must", "axis": "role"},
        {"quote": "E-commerce 비즈니스 QA 수행 및 관리를 해보신 분", "kind": "nice", "axis": "role"},
        {"quote": "백엔드 시스템(API, DB, 아키텍쳐 등)에 대한 테스트 경험이 있으신 분", "kind": "nice", "axis": "technology"},
        {"quote": "단일 API 및 서비스 시나리오 기반 API 테스트 설계 및 테스트(Postman 등) 경험이 있으신 분", "kind": "nice", "axis": "technology"},
    ],
    "dd4903ec-371e-4eec-a637-120ab49c6d26": [
        {"quote": "5년 이상의 데이터 엔지니어링 또는 분석 데이터 구축·운영 실무 경험", "kind": "must", "axis": "role"},
        {"quote": "대용량 데이터 환경에서 복잡한 변환 로직을 효율적이고 가독성 있는 형태로 구현할 수 있는 SQL 역량", "kind": "must", "axis": "technology"},
        {"quote": "정규화/비정규화, Dimensional Modeling 등을 활용한 데이터 모델 설계 경험", "kind": "must", "axis": "technology"},
        {"quote": "ETL/ELT 프로세스 설계 및 데이터 파이프라인의 안정적인 운영 경험", "kind": "must", "axis": "technology"},
        {"quote": "dbt 등 변환 모델링 프레임워크 기반 개발·운영 경험이 있으신 분", "kind": "nice", "axis": "technology"},
    ],
    "eeeea76a-54b0-4132-bdcb-5845973a59c3": [
        {"quote": "Android(Kotlin) 개발 경력이 5년 이상이신 분", "kind": "must", "axis": "role"},
        {"quote": "Android Platform 구조에 대해 이해하고 있으신 분", "kind": "must", "axis": "technology"},
        {"quote": "상용 서비스 개발과 유지보수 경험이 있으신 분", "kind": "must", "axis": "role"},
        {"quote": "WebView를 활용한 개발 경험을 보유하신 분", "kind": "nice", "axis": "technology"},
        {"quote": "Jetpack, AAC, Compose를 통한 개발 경험이 있으신 분", "kind": "nice", "axis": "technology"},
    ],
    "b2eae6de-07ee-445b-8983-0b7e049d9607": [
        {"quote": "프론트엔드 실무 3년 이상의 서비스 개발/운영 경험이 있는 분", "kind": "must", "axis": "role"},
        {"quote": "React/Vue 등을 이용한 서비스 개발/운영 경험이 있는 분", "kind": "must", "axis": "technology"},
        {"quote": "JavaScript/TypeScript에 대한 기본적인 이해와 활용 경험이 있는 분", "kind": "must", "axis": "technology"},
        {"quote": "REST API, 인증/인가, 데이터 흐름에 대한 기본 이해가 있는 분", "kind": "must", "axis": "technology"},
        {"quote": "대규모 서비스 개발 프로젝트에서 프론트엔드 성능 최적화 경험이 있는 분", "kind": "nice", "axis": "impact"},
    ],
    "f91518b9-a7aa-4164-8868-697e6125e106": [
        {"quote": "유저의 행동 데이터와 지표를 살펴보며 문제를 발견하고 개선해본 경험이 있는 분", "kind": "must", "axis": "impact"},
        {"quote": "AI·LLM을 활용해 개발 생산성을 높이거나 새로운 방식의 문제 해결을 시도해본 경험이 있는 분", "kind": "must", "axis": "technology"},
        {"quote": "3년 이상의 백엔드 개발 경험 또는 이에 준하는 엔지니어링 역량을 갖추신 분", "kind": "must", "axis": "role"},
        {"quote": "Kotlin, Spring Boot, RDBMS 기반의 서비스를 설계하고 운영한 경험이 있으신 분", "kind": "nice", "axis": "technology"},
        {"quote": "RDBMS, Redis, Kafka를 활용한 시스템 설계 경험이 있으신 분", "kind": "nice", "axis": "technology"},
    ],
    "6bf811c0-d26c-46a2-a11d-751346e47407": [
        {"quote": "관련 경력 3년 이상 또는 그에 준하는 역량이 있으신 분", "kind": "must", "axis": "role"},
        {"quote": "Kubernetes 기반 프로덕션 환경 운영 경험 및 트러블슈팅 경험이 있으신 분", "kind": "must", "axis": "technology"},
        {"quote": "IaC(Infrastructure as Code) 기반 자동화 및 운영 경험이 있으신 분", "kind": "must", "axis": "technology"},
        {"quote": "Helm 또는 Kustomize 기반 배포 운영 경험이 있으신 분", "kind": "must", "axis": "technology"},
        {"quote": "GPU 기반 워크로드(Workload) 운영 경험이 있으신 분", "kind": "nice", "axis": "technology"},
    ],
    "59753094-32b6-4d10-aeff-3d76d7d6db79": [
        {"quote": "머신러닝 이론과 기본기가 탄탄하신 분", "kind": "must", "axis": "technology"},
        {"quote": "딥러닝에 대한 깊은 이해가 있으신 분 (Recommendation, NLP, Graph Neural Net, Reinforcement Learning, Vision 중 하나 이상)", "kind": "must", "axis": "technology"},
        {"quote": "효율적인 코드 아키텍처를 구상하고 가독성 뛰어난 코드 작성에 경험이 있으신 분", "kind": "must", "axis": "technology"},
        {"quote": "데이터 드리븐 환경에서 머신러닝을 통해 사용자 서비스에 실질적인 임팩트를 만들어 보신 분", "kind": "nice", "axis": "impact"},
        {"quote": "ML 기반 추천 시스템, 광고 시스템에 경험이 있으신 분", "kind": "nice", "axis": "technology"},
    ],
    "45d1ae53-036e-460a-8039-e879f4d2d212": [
        {"quote": "3년 이상의 백엔드 개발 실무 경력을 갖추신 분", "kind": "must", "axis": "role"},
        {"quote": "Go, Python 등 하나 이상의 서버 프로그래밍 언어를 능숙하게 다루시는 분", "kind": "must", "axis": "technology"},
        {"quote": "MySQL 등 관계형 데이터베이스와 Redis, DynamoDB 등 NoSQL 저장소를 실무에서 활용해 보신 분", "kind": "must", "axis": "technology"},
        {"quote": "AI 도구를 적극적으로 도입하고, 이를 통해 생산성을 극대화할 수 있는 역량을 갖추신 분", "kind": "must", "axis": "technology"},
        {"quote": "AWS / Kubernetes 기반 클라우드 네이티브 환경에서의 서비스 설계 및 운영 경험", "kind": "nice", "axis": "technology"},
    ],
    "331851c9-369c-4346-b344-c57f77af348d": [
        {"quote": "사이버보안 분야 경력 8년 이상", "kind": "must", "axis": "role"},
        {"quote": "보안 환경 내 플랫폼 또는 보안 도구 개발 경력 2년 이상", "kind": "must", "axis": "role"},
        {"quote": "Detection Engineering, 보안 로그 분석, SIEM 운영 또는 관련 분야에 대한 깊은 실무 경험", "kind": "must", "axis": "technology"},
        {"quote": "EDR, CSPM, WAF, SIEM, Identity Protection 등 여러 보안 솔루션 통합 경험", "kind": "must", "axis": "technology"},
        {"quote": "Python 기반 백엔드 개발, 자동화 및 보안 도구 개발 역량", "kind": "must", "axis": "technology"},
        {"quote": "AI 에이전트 인프라, 워크플로우 자동화 또는 오케스트레이션 시스템 구축 경험", "kind": "nice", "axis": "technology"},
    ],
    "edf52078-93cd-4248-9528-08a355f3475f": [
        {"quote": "2+ years of industry/research experience in machine learning or deep learning", "kind": "must", "axis": "role"},
        {"quote": "Hands-on proficiency in Python and modern ML frameworks (e.g., PyTorch, Hugging Face Transformers)", "kind": "must", "axis": "technology"},
        {"quote": "Demonstrated track record of building and shipping working systems", "kind": "must", "axis": "impact"},
        {"quote": "Capable of handling day-to-day business communication in English (written or verbal).", "kind": "must", "axis": "conditions"},
        {"quote": "Experience working with clinical, biomedical, or otherwise high-stakes text data (ie. EMR).", "kind": "nice", "axis": "role"},
        {"quote": "Hands-on experience with one or more of: LLM fine-tuning / post-training (SFT, DPO/RLHF), retrieval-augmented generation systems, agentic / tool-using LLM pipelines, or LLM evaluation frameworks.", "kind": "nice", "axis": "technology"},
    ],
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--review-output", type=Path, required=True)
    args = parser.parse_args()
    source_path = args.source
    output_path = args.output
    review_path = args.review_output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    review_path.parent.mkdir(parents=True, exist_ok=True)

    by_id = {}
    with source_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                item = json.loads(line)
                by_id[item["_id"]] = item

    missing = [item_id for item_id in SELECTED_IDS if item_id not in by_id]
    if missing:
        raise RuntimeError(f"선택한 공고가 원본에 없습니다: {missing}")

    selected = []
    for item_id in SELECTED_IDS:
        source = by_id[item_id]
        missing_quotes = [
            reference["quote"]
            for reference in REFERENCES[source["_id"]]
            if reference["quote"] not in source["descriptionRaw"]
        ]
        if missing_quotes:
            raise RuntimeError(f"원문에 없는 기준 인용문: {source['_id']} {missing_quotes}")
        selected.append(
            {
                "_id": source["_id"],
                "title": source["title"],
                "sourceBoard": source.get("sourceBoard"),
                "jobFamily": source.get("jobFamily"),
                "descriptionRaw": source["descriptionRaw"],
                "referenceRequirements": REFERENCES[source["_id"]],
            }
        )

    with output_path.open("w", encoding="utf-8", newline="\n") as handle:
        for item in selected:
            handle.write(json.dumps(item, ensure_ascii=False) + "\n")

    sections = ["# 고정 표본 원문", ""]
    for index, item in enumerate(selected, start=1):
        sections.extend(
            [
                f"## {index}. {item['title']}",
                "",
                f"- id: `{item['_id']}`",
                f"- 출처: {item['sourceBoard']}",
                f"- 직군: {item['jobFamily']}",
                f"- 원문 글자 수: {len(item['descriptionRaw'])}",
                "",
                "```text",
                item["descriptionRaw"],
                "```",
                "",
            ]
        )
    review_path.write_text("\n".join(sections), encoding="utf-8")

    print(f"wrote {len(selected)} postings to {output_path}")
    print(f"review copy: {review_path}")


if __name__ == "__main__":
    main()
