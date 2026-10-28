import type { Persona } from "./types.js";

/** 기록이 아주 적은 사람. 졸업을 앞두고 처음 기록을 정리하기 시작했다. */
export const newgrad: Persona = {
  key: "dummy-newgrad",
  displayName: "한서윤",
  headline: "컴퓨터공학 졸업 예정 · 백엔드 지망 신입",
  profile: { targetRoles: ["백엔드"], experienceYears: 0, primaryGoal: "explore" },
  records: [
    {
      ref: "edu-univ",
      category: "education_history",
      title: "서해공과대학교 컴퓨터공학과",
      body: "2022.03 — 2027.02(졸업 예정)\n\n학점 3.7/4.5. 데이터베이스, 운영체제, 네트워크 과목을 들었고 졸업 프로젝트로 스터디 예약 서비스를 만들고 있다.",
      props: { organization: "서해공과대학교", period: "2022-03/2027-02", projects: { refs: ["proj-capstone"] } },
    },
    {
      ref: "proj-capstone",
      category: "project",
      title: "스터디룸 예약 서비스 졸업 프로젝트",
      body: "2026.03 — 진행 중\n\n4명이 팀을 이뤄 학교 스터디룸 예약 서비스를 만들고 있다. 나는 백엔드를 맡아 Spring Boot로 예약 API를 만들었다. 같은 시간에 두 사람이 예약하면 둘 다 성공하는 문제가 있어서 MySQL 행 잠금으로 막았다.\n\n- 예약 · 취소 · 조회 API 9개 작성\n- 동시 예약 테스트 100회에서 중복 예약 0건",
      props: { role: "백엔드 개발", technologies: ["Java", "Spring Boot", "MySQL"], period: "2026-03/", outcome: "동시 예약 테스트 100회에서 중복 예약 0건" },
    },
    {
      category: "skill_tool",
      title: "Java",
      status: "draft",
      body: "수업과 졸업 프로젝트에서 2년째 쓰고 있다.",
      props: { group: "언어 · 쿼리", firstUsedMonth: "2023-03", projects: { refs: ["proj-capstone"] } },
    },
  ],
};
