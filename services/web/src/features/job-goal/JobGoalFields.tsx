import { JOB_GOAL_TEXT_MAX, type JobGoal } from "@expresso/contracts";

import styles from "./job-goal.module.css";

/**
 * 구직 목표를 묻는 세 질문. 온보딩과 앱의 구직 목표 화면이 같은 질문을 쓴다.
 * `name`은 계약(`JobGoal`)의 칸 이름이고, 폼은 이 이름으로 답을 보낸다.
 */
export const JOB_GOAL_QUESTIONS = [
  { name: "work", question: "어떤 일을 하고 싶으세요?", placeholder: "예: 커머스 서비스의 프론트엔드 개발" },
  { name: "place", question: "어떤 곳에서 일하고 싶으세요?", placeholder: "예: 사용자가 많은 서비스를 만드는 스타트업" },
  { name: "timing", question: "언제까지 취업하는 것이 목표인가요? 지금은 어떤 상황인가요?", placeholder: "예: 내년 상반기 이직, 지금은 재직 중" },
] as const;

/** 폼에서 세 답을 읽는다. 적지 않은 칸은 빈 글이다. */
export function readJobGoalAnswers(formData: FormData): { work: string; place: string; timing: string } {
  const answer = (name: string) => String(formData.get(name) ?? "").trim();
  return { work: answer("work"), place: answer("place"), timing: answer("timing") };
}

/** 세 질문과 답을 적는 칸. 적어 둔 목표가 있으면 그 답이 채워져 있다. 감싸는 폼이 저장한다. */
export function JobGoalFields({ goal }: { goal: JobGoal | null }) {
  return (
    <div className={styles.fields}>
      {JOB_GOAL_QUESTIONS.map(({ name, question, placeholder }) => (
        <label key={name} className={styles.field}>
          <span className={styles.label}>{question}</span>
          <textarea name={name} className={styles.textarea} rows={2} maxLength={JOB_GOAL_TEXT_MAX} defaultValue={goal?.[name] ?? ""} placeholder={placeholder} />
        </label>
      ))}
    </div>
  );
}
