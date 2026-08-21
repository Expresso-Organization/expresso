import { createHash } from "node:crypto";

import {
  InterviewAnswerResultSchema,
  InterviewSessionSchema,
  type InterviewQuestionBasis,
  type SaveInterviewAnswer,
} from "@expresso/contracts";
import type { SqlTag, JSONValue } from "../../platform/mysql.js";

import { generateQuestionDrafts, hasMetric, questionTextForBasis } from "./questions.js";
import {
  cleanupChangedFields,
  cleanupProperties,
  type RecordCleaner,
} from "../career/record-cleaner.js";
import {
  countMentions,
  type QuestionBasisOption,
  type QuestionContext,
  type QuestionWriter,
} from "./question-writer.js";
import { withTimeout } from "../../platform/timeouts.js";
import { addOutboxEvent } from "../../platform/outbox.js";
import type { ConsentService } from "../consent/service.js";

/** 세션에 심을 질문 하나. 규칙이 만들든 계약이 만들든 이 모양이다. */
interface PlannedQuestion {
  text: string;
  basis: InterviewQuestionBasis;
  requirementId: string | null;
  variant: number;
  rationale: string | null;
}

interface IdRow { id: string }
interface BrewRow { id: string; job_analysis_id: string }
interface SessionRow {
  id: string;
  brew_id: string;
  status: "open" | "paused" | "done";
  current_order: number;
  answered_count: number;
  question_count: number;
}
interface QuestionRow {
  id: string;
  order_no: number;
  text: string;
  basis: InterviewQuestionBasis;
  rationale: string | null;
  replaced_from_id: string | null;
  skipped: boolean;
  answered: boolean;
  variant: number;
  requirement_id: string | null;
  interview_session_id: string;
}
interface AnswerRow {
  id: string;
  question_id: string;
  input_type: "text" | "voice";
  transcript: string;
  created_record_id: string;
  version: number;
  updated_at: Date | string;
  request_hash: string | null;
}
interface ChangeRow {
  change_type: "created" | "strengthened";
  record_id: string;
  changed_fields: string[];
  source_quote: string;
}

export class InterviewError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "InterviewError";
    this.statusCode = statusCode;
  }
}

/** 정리 계약이 없거나 실패했을 때의 제목. 첫 줄을 자른 것뿐이다. */
function fallbackTitle(transcript: string): string {
  return transcript.split(/\n/)[0]!.slice(0, 120);
}

function hashAnswer(questionId: string, input: SaveInterviewAnswer) {
  return createHash("sha256")
    .update(JSON.stringify({ questionId, ...input }))
    .digest("hex");
}

export class InterviewService {
  readonly #sql: SqlTag;
  readonly #writer: QuestionWriter | null;
  readonly #cleaner: RecordCleaner | null;
  readonly #consent: ConsentService | null;

  constructor(
    sql: SqlTag,
    writer?: QuestionWriter | null,
    cleaner?: RecordCleaner | null,
    consent?: ConsentService | null,
  ) {
    this.#sql = sql;
    this.#consent = consent ?? null;
    // 계약이 없으면 규칙 구현이 그대로 쓰인다 — 문장 틀에 요건을 끼워 넣는다.
    this.#writer = writer ?? null;
    this.#cleaner = cleaner ?? null;
  }

  /**
   * §8.3 「기록 정리」 — 답변 하나를 STAR 기록으로 만든다.
   *
   * 저장이 끝난 뒤 큐가 부른다. 답을 저장하는 일은 이미 끝났으므로 여기서
   * 실패해도 사용자가 쓴 글은 남는다 — 제목이 첫 줄인 초안으로 남을 뿐이다.
   */
  async cleanupAnswer(userId: string, answerId: string): Promise<void> {
    if (!this.#cleaner) return;
    await this.#consent?.require(userId, "record_cleanup");
    const context = (await this.#sql<{
      transcript: string; question_text: string;
      record_id: string; record_title: string; record_body: string | null;
      record_status: string;
    }[]>`
      select answer.transcript, question.text as question_text,
             record.id as record_id, record.title as record_title,
             record.body_md as record_body, record.status as record_status
      from answer
      join question on question.id = answer.question_id and question.user_id = answer.user_id
      join record on record.id = answer.created_record_id and record.user_id = answer.user_id
      where answer.id = ${answerId} and answer.user_id = ${userId}
        and record.origin = 'interview'
    `)[0];
    if (!context) return;

    const cleaned = await withTimeout(
      this.#cleaner.clean({
        question: context.question_text,
        transcript: context.transcript,
        // 이미 정리된 적이 있으면 그 위에 덧쓴다. 원문 그대로면 참고할 것이 없다.
        existing: context.record_status === "draft"
          ? null
          : { title: context.record_title, bodyMd: context.record_body ?? "" },
      }),
      420_000,
      "record cleaner",
    );

    await this.#sql.begin(async (transaction) => {
      // 사용자가 직접 고친 기록은 건드리지 않는다(P3).
      const owned = (await transaction<{ id: string }[]>`
        select id from record
        where id = ${context.record_id} and user_id = ${userId}
          and origin = 'interview' and status <> 'verified'
        for update
      `)[0];
      if (!owned) return;
      await transaction`
        update record
        set title = ${cleaned.title},
            properties = ${transaction.json(cleanupProperties(cleaned) as JSONValue)},
            -- 정리된 기록은 재료로 고를 수 있다. 원문만 남은 초안은 못 고른다.
            status = 'organized',
            updated_at = now(6)
        where id = ${context.record_id} and user_id = ${userId}
      `;
      await transaction`
        update answer_record_change
        set changed_fields = ${transaction.json(cleanupChangedFields(cleaned) as JSONValue)}
        where user_id = ${userId} and answer_id = ${answerId}
      `;
    });
  }

  async start(userId: string, brewId: string, idempotencyKey: string) {
    // 계약 호출은 트랜잭션 **밖**이다. 안에서 부르면 그동안 brew 행을 잠근 채로
    // 커넥션을 붙들고 있게 된다.
    const replayed = (await this.#sql<IdRow[]>`
      select id from interview_session
      where user_id = ${userId} and input_idempotency_key = ${idempotencyKey}
    `)[0];
    if (replayed) return this.getSession(userId, replayed.id);
    const started = (await this.#sql<IdRow[]>`
      select id from interview_session where user_id = ${userId} and brew_id = ${brewId}
    `)[0];
    if (started) return this.getSession(userId, started.id);

    const planned = await this.#planQuestions(userId, brewId);
    if (planned.length < 3) {
      throw new InterviewError(409, "at least three grounded questions are required");
    }

    const sessionId = await this.#sql.begin(async (transaction) => {
      const replay = (await transaction<IdRow[]>`
        select id from interview_session
        where user_id = ${userId} and input_idempotency_key = ${idempotencyKey}
      `)[0];
      if (replay) return replay.id;
      const brew = (await transaction<BrewRow[]>`
        select id, job_analysis_id from brew
        where id = ${brewId} and user_id = ${userId}
        for update
      `)[0];
      if (!brew) throw new InterviewError(404, "brew not found");
      const existing = (await transaction<IdRow[]>`
        select id from interview_session where user_id = ${userId} and brew_id = ${brewId}
      `)[0];
      // 계약을 부르는 동안 다른 요청이 먼저 세션을 만들었으면 그쪽을 쓴다.
      if (existing) return existing.id;
      const drafts = planned;
      const session = (await transaction<IdRow[]>`
        insert into interview_session (
          user_id, brew_id, status, question_count, input_idempotency_key
        ) values (${userId}, ${brewId}, 'open', ${drafts.length}, ${idempotencyKey})
        returning id
      `)[0];
      if (!session) throw new Error("interview session was not persisted");
      for (const [order, draft] of drafts.entries()) {
        await transaction`
          insert into question (
            user_id, interview_session_id, requirement_id, order_no,
            text, basis, variant, rationale
          ) values (
            ${userId}, ${session.id}, ${draft.requirementId}, ${order},
            ${draft.text}, ${transaction.json(draft.basis as JSONValue)},
            ${draft.variant}, ${draft.rationale}
          )
        `;
      }
      await transaction`
        update brew set status = 'interviewing', updated_at = now(6)
        where id = ${brewId} and user_id = ${userId}
      `;
      return session.id;
    });
    return this.getSession(userId, sessionId);
  }

  /**
   * 물을 자리를 모은다.
   *
   * 자리는 두 갈래뿐이다 — **공고가 요구하는데 아직 못 채운 것**과
   * **기록에 있는데 수치가 빠진 것**. 여기서 만든 근거에만 질문이 붙으므로,
   * 모델이 무엇을 고르든 질문은 실제 공고와 실제 기록을 가리킨다.
   */
  async #questionOptions(userId: string, brewId: string) {
    const sql = this.#sql;
    const brew = (await sql<BrewRow[]>`
      select id, job_analysis_id from brew where id = ${brewId} and user_id = ${userId}
    `)[0];
    if (!brew) throw new InterviewError(404, "brew not found");

    const [requirements, records, subject] = await Promise.all([
      sql<{
        id: string; label: string; coverage: "covered" | "partial" | "missing";
        source_span: { quote: string }; description_raw: string;
      }[]>`
        select
          job_posting_requirement.id,
          job_posting_requirement.label,
          requirement_coverage.coverage,
          job_posting_requirement.source_span,
          job_posting.description_raw
        from job_analysis
        join job_posting on job_posting.id = job_analysis.job_posting_id
        join job_posting_requirement
          on job_posting_requirement.job_posting_id = job_analysis.job_posting_id
        join requirement_coverage
          on requirement_coverage.requirement_id = job_posting_requirement.id
          and requirement_coverage.user_id = ${userId}
        where job_analysis.id = ${brew.job_analysis_id}
        order by job_posting_requirement.order_no, job_posting_requirement.id
      `,
      sql<{ id: string; title: string; body_md: string; properties: unknown }[]>`
        select record.id, record.title, coalesce(record.body_md, '') as body_md, record.properties
        from brew_source
        join record on record.id = brew_source.record_id
          and record.user_id = brew_source.user_id
        where brew_source.user_id = ${userId} and brew_source.brew_id = ${brewId}
          and brew_source.is_selected
        order by brew_source.\`rank\`
      `,
      sql<{
        job_title: string; company_name: string;
        industry: string | null; tone_summary: string | null;
      }[]>`
        select job_posting.title as job_title, company.name as company_name,
               company.industry, company.tone_summary
        from job_analysis
        join job_posting on job_posting.id = job_analysis.job_posting_id
        join company on company.id = job_posting.company_id
        where job_analysis.id = ${brew.job_analysis_id} and job_analysis.user_id = ${userId}
      `,
    ]);

    const options: QuestionBasisOption[] = [
      ...requirements
        .filter(({ coverage }) => coverage !== "covered")
        .map((requirement) => ({
          basis: {
            type: "requirement" as const,
            requirementId: requirement.id,
            coverage: requirement.coverage as "partial" | "missing",
            evidence: requirement.source_span.quote,
          },
          label: `[공고 요건 · ${requirement.coverage === "missing" ? "안 채움" : "일부만"}] ${requirement.label}`,
          detail: requirement.source_span.quote,
          mentions: countMentions(requirement.label, requirement.description_raw),
        })),
      ...records
        .filter((record) => !hasMetric(`${record.title} ${record.body_md} ${JSON.stringify(record.properties)}`))
        .map((record) => ({
          basis: {
            type: "record_gap" as const,
            recordId: record.id,
            gap: "metric" as const,
            evidence: record.title,
          },
          label: `[기록 · 수치 없음] ${record.title}`,
          detail: record.body_md,
          mentions: null,
        })),
    ];

    const context: QuestionContext = {
      options,
      company: subject[0]
        ? {
          name: subject[0].company_name,
          industry: subject[0].industry,
          toneSummary: subject[0].tone_summary,
        }
        : null,
      jobTitle: subject[0]?.job_title ?? null,
      materials: records.map(({ title }) => title),
    };
    return { context, requirements, records };
  }

  /** 계약이 있으면 계약이, 없으면 규칙이 질문을 만든다. */
  async #planQuestions(userId: string, brewId: string): Promise<PlannedQuestion[]> {
    const { context, requirements, records } = await this.#questionOptions(userId, brewId);

    // 세션은 질문 3개 이상으로만 존재할 수 있고(`InterviewSessionSchema`), 질문은
    // 자리마다 하나씩이다. 자리가 셋보다 적으면 어떤 모델도 셋을 만들 수 없다 —
    // 계약을 불러 봐야 같은 답이므로 여기서 끊는다.
    if (context.options.length < 3) {
      throw new InterviewError(409, "at least three grounded question bases are required");
    }

    if (this.#writer) {
      // 기록과 공고를 모델에 보내기 전에 묻는다. 규칙 폴백은 이 문을 지나지 않는다.
      await this.#consent?.require(userId, "question_draft");
      const drafted = await withTimeout(
        this.#writer.draft(context), 420_000, "question writer",
      );
      return drafted.map((question) => {
        const option = context.options[question.optionIndex]!;
        return {
          text: question.text,
          basis: option.basis,
          requirementId: option.basis.type === "requirement" ? option.basis.requirementId : null,
          variant: 0,
          rationale: question.rationale,
        };
      });
    }

    return generateQuestionDrafts(
      requirements.map((requirement) => ({
        id: requirement.id,
        label: requirement.label,
        coverage: requirement.coverage,
        evidence: requirement.source_span.quote,
      })),
      records.map((record) => ({
        id: record.id,
        title: record.title,
        text: `${record.title}\n${record.body_md}\n${JSON.stringify(record.properties)}`,
      })),
    ).map((draft) => ({ ...draft, rationale: null }));
  }

  async getSession(userId: string, sessionId: string) {
    const session = (await this.#sql<SessionRow[]>`
      select id, brew_id, status, current_order, answered_count, question_count
      from interview_session where id = ${sessionId} and user_id = ${userId}
    `)[0];
    if (!session) throw new InterviewError(404, "interview session not found");
    const questions = await this.#sql<QuestionRow[]>`
      select question.id, question.order_no, question.text, question.basis,
             question.rationale, question.replaced_from_id, question.skipped, question.variant,
             question.requirement_id, question.interview_session_id,
             (answer.id is not null) as answered
      from question
      left join answer on answer.user_id = question.user_id and answer.question_id = question.id
      where question.user_id = ${userId}
        and question.interview_session_id = ${sessionId}
        and question.active
      order by question.order_no
    `;
    return InterviewSessionSchema.parse({
      id: session.id,
      brewId: session.brew_id,
      status: session.status,
      currentOrder: session.current_order,
      answeredCount: session.answered_count,
      questionCount: session.question_count,
      questionsMayAdapt: true,
      questions: questions.map((question) => ({
        id: question.id,
        order: question.order_no,
        text: question.text,
        basis: question.basis,
        rationale: question.rationale,
        replacedFromId: question.replaced_from_id,
        skipped: question.skipped,
        answered: question.answered,
      })),
    });
  }

  async setPaused(userId: string, sessionId: string, paused: boolean) {
    const rows = await this.#sql<IdRow[]>`
      update interview_session
      set status = ${paused ? "paused" : "open"},
          paused_at = ${paused ? this.#sql`now()` : null}, updated_at = now()
      where id = ${sessionId} and user_id = ${userId} and status <> 'done'
      returning id
    `;
    if (!rows[0]) throw new InterviewError(404, "interview session not found");
    return this.getSession(userId, sessionId);
  }

  async replaceQuestion(userId: string, sessionId: string, questionId: string) {
    const current = (await this.#sql<QuestionRow[]>`
      select question.*, false as answered
      from question
      join interview_session on interview_session.id = question.interview_session_id
        and interview_session.user_id = question.user_id
      where question.id = ${questionId} and question.user_id = ${userId}
        and question.interview_session_id = ${sessionId} and question.active
    `)[0];
    if (!current) throw new InterviewError(404, "question not found");
    const alreadyAnswered = (await this.#sql<IdRow[]>`
      select id from answer where user_id = ${userId} and question_id = ${questionId}
    `)[0];
    if (alreadyAnswered) throw new InterviewError(409, "answered question cannot be replaced");

    const variant = current.variant + 1;
    const rewritten = await this.#rewrite(userId, sessionId, current, variant);

    await this.#sql.begin(async (transaction) => {
      const question = (await transaction<QuestionRow[]>`
        select question.*, false as answered from question
        where question.id = ${questionId} and question.user_id = ${userId}
          and question.interview_session_id = ${sessionId} and question.active
        for update
      `)[0];
      if (!question) throw new InterviewError(404, "question not found");
      const answered = (await transaction<IdRow[]>`
        select id from answer where user_id = ${userId} and question_id = ${questionId}
      `)[0];
      if (answered) throw new InterviewError(409, "answered question cannot be replaced");
      await transaction`
        update question set active = false, skipped = true where id = ${questionId}
      `;
      await transaction`
        insert into question (
          user_id, interview_session_id, requirement_id, replaced_from_id,
          order_no, text, basis, variant, rationale
        ) values (
          ${userId}, ${sessionId}, ${question.requirement_id}, ${question.id},
          ${question.order_no}, ${rewritten.text},
          ${transaction.json(question.basis as JSONValue)}, ${variant},
          ${rewritten.rationale}
        )
      `;
      await transaction`
        update interview_session set updated_at = now(6) where id = ${sessionId}
      `;
    });
    return this.getSession(userId, sessionId);
  }

  /**
   * 같은 근거를 다른 각도에서 다시 묻는다.
   *
   * 계약이 없으면 문장 틀의 다음 변형을 쓴다 — 말만 바뀌지만 근거는 그대로다.
   */
  async #rewrite(
    userId: string,
    sessionId: string,
    question: QuestionRow,
    variant: number,
  ): Promise<{ text: string; rationale: string | null }> {
    if (!this.#writer) {
      return { text: questionTextForBasis(question.basis, variant), rationale: null };
    }
    // 이 자리에서 이미 나온 질문들. 말만 바꾼 것을 다시 내지 않게 한다.
    const previous = await this.#sql<{ text: string }[]>`
      select text from question
      where user_id = ${userId} and interview_session_id = ${sessionId}
        and order_no = ${question.order_no}
      order by variant
    `;
    const { context } = await this.#questionOptions(userId, await this.#brewOf(sessionId, userId));
    const option = context.options.find(({ basis }) =>
      basis.type === question.basis.type
      && (basis.type === "requirement" && question.basis.type === "requirement"
        ? basis.requirementId === question.basis.requirementId
        : basis.type === "record_gap" && question.basis.type === "record_gap"
          && basis.recordId === question.basis.recordId));

    return withTimeout(
      this.#writer.rewrite({
        // 자리가 이미 채워져 목록에서 빠졌을 수도 있다. 그때는 옛 근거를 그대로 쓴다.
        option: option ?? {
          basis: question.basis,
          label: question.basis.evidence,
          detail: question.basis.evidence,
          mentions: null,
        },
        previousTexts: previous.map(({ text }) => text),
        company: context.company,
        jobTitle: context.jobTitle,
      }),
      420_000,
      "question writer",
    );
  }

  async #brewOf(sessionId: string, userId: string): Promise<string> {
    const row = (await this.#sql<{ brew_id: string }[]>`
      select brew_id from interview_session where id = ${sessionId} and user_id = ${userId}
    `)[0];
    if (!row) throw new InterviewError(404, "interview session not found");
    return row.brew_id;
  }

  async skipQuestion(userId: string, sessionId: string, questionId: string) {
    const rows = await this.#sql<IdRow[]>`
      update question set skipped = true
      where id = ${questionId} and user_id = ${userId}
        and interview_session_id = ${sessionId} and active
      returning id
    `;
    if (!rows[0]) throw new InterviewError(404, "question not found");
    await this.#refreshProgress(userId, sessionId);
    return this.getSession(userId, sessionId);
  }

  async saveAnswer(
    userId: string,
    sessionId: string,
    questionId: string,
    idempotencyKey: string,
    input: SaveInterviewAnswer,
  ) {
    const requestHash = hashAnswer(questionId, input);
    const answerId = await this.#sql.begin(async (transaction) => {
      const question = (await transaction<QuestionRow[]>`
        select question.*, false as answered
        from question
        join interview_session on interview_session.id = question.interview_session_id
          and interview_session.user_id = question.user_id
        where question.id = ${questionId} and question.user_id = ${userId}
          and question.interview_session_id = ${sessionId} and question.active
        for update of question
      `)[0];
      if (!question) throw new InterviewError(404, "question not found");
      const keyed = (await transaction<AnswerRow[]>`
        select * from answer where user_id = ${userId}
          and input_idempotency_key = ${idempotencyKey}
      `)[0];
      if (keyed && keyed.request_hash !== requestHash) {
        throw new InterviewError(409, "idempotency key was reused for another answer");
      }
      if (keyed) return keyed.id;
      const existing = (await transaction<AnswerRow[]>`
        select * from answer where user_id = ${userId} and question_id = ${questionId}
        for update
      `)[0];
      if (existing) {
        await transaction`
          update answer set input_type = ${input.inputType}, transcript = ${input.transcript},
            input_idempotency_key = ${idempotencyKey}, request_hash = ${requestHash},
            version = version + 1, updated_at = now(6)
          where id = ${existing.id} and user_id = ${userId}
        `;
        await transaction`
          update record set title = ${fallbackTitle(input.transcript)},
            body_md = ${input.transcript}
          where id = ${existing.created_record_id} and user_id = ${userId}
            and origin = 'interview'
        `;
        await transaction`
          update answer_record_change
          set change_type = 'strengthened',
              changed_fields = '[\`title\`,\`body_md\`]',
              source_quote = ${input.transcript}, created_at = now(6)
          where user_id = ${userId} and answer_id = ${existing.id}
        `;
        return existing.id;
      }
      const categoryId = (await transaction<IdRow[]>`
        select id from category where \`key\` = 'experience' and is_system
      `)[0]?.id;
      if (!categoryId) throw new Error("experience category missing");
      const recordId = (await transaction<IdRow[]>`
        insert into record (
          user_id, category_id, title, status, origin, properties, body_md
        ) values (
          ${userId}, ${categoryId}, ${fallbackTitle(input.transcript)},
          'draft', 'interview', '{}', ${input.transcript}
        ) returning id
      `)[0]?.id;
      if (!recordId) throw new Error("interview record was not persisted");
      const answerId = (await transaction<IdRow[]>`
        insert into answer (
          user_id, question_id, input_type, transcript, created_record_id,
          input_idempotency_key, request_hash
        ) values (
          ${userId}, ${questionId}, ${input.inputType}, ${input.transcript}, ${recordId},
          ${idempotencyKey}, ${requestHash}
        ) returning id
      `)[0]?.id;
      if (!answerId) throw new Error("interview answer was not persisted");
      await transaction`
        insert into answer_record_change (
          user_id, answer_id, record_id, change_type, changed_fields, source_quote
        ) values (
          ${userId}, ${answerId}, ${recordId}, 'created',
          '[\`title\`,\`body_md\`]', ${input.transcript}
        )
      `;
      // 정리는 뒤에서 따라온다. 답을 저장하는 일이 계약을 기다리면 안 된다 —
      // 사람은 방금 쓴 글이 바로 남기를 기대한다(§8.3 기록 정리는 30초 넘게 걸린다).
      await addOutboxEvent(transaction, {
        topic: "record.cleanup",
        payload: { answerId, userId },
        idempotencyKey: `record-cleanup:${answerId}:${requestHash.slice(0, 16)}`,
      });
      return answerId;
    });
    await this.#refreshProgress(userId, sessionId);
    return this.#getAnswerResult(userId, sessionId, answerId);
  }

  async #refreshProgress(userId: string, sessionId: string) {
    // MySQL 은 CTE 로 갱신하지 못한다 — 진행 상태를 먼저 세고 그 값으로 고친다.
    const progress = (await this.#sql<{
      answered_count: number; current_order: number; finished: number;
    }[]>`
      select
        count(answer.id) as answered_count,
        coalesce(min(case when answer.id is null and not question.skipped then question.order_no end), count(*)) as current_order,
        min(answer.id is not null or question.skipped) as finished
      from question
      left join answer on answer.user_id = question.user_id and answer.question_id = question.id
      where question.user_id = ${userId}
        and question.interview_session_id = ${sessionId}
        and question.active
    `)[0];
    if (!progress) return;
    await this.#sql`
      update interview_session
      set answered_count = ${progress.answered_count},
          current_order = ${progress.current_order},
          status = case when ${progress.finished ? 1 : 0} = 1 then 'done' else status end,
          updated_at = now(6)
      where id = ${sessionId} and user_id = ${userId}
    `;
  }

  async #getAnswerResult(userId: string, sessionId: string, answerId: string) {
    const answer = (await this.#sql<AnswerRow[]>`
      select answer.* from answer
      join question on question.id = answer.question_id and question.user_id = answer.user_id
      where answer.id = ${answerId} and answer.user_id = ${userId}
        and question.interview_session_id = ${sessionId}
    `)[0];
    if (!answer) throw new InterviewError(404, "answer not found");
    const change = (await this.#sql<ChangeRow[]>`
      select change_type, record_id, changed_fields, source_quote
      from answer_record_change where user_id = ${userId} and answer_id = ${answerId}
    `)[0];
    const session = (await this.#sql<SessionRow[]>`
      select id, brew_id, status, current_order, answered_count, question_count
      from interview_session where id = ${sessionId} and user_id = ${userId}
    `)[0];
    if (!change || !session) throw new Error("answer result is incomplete");
    return InterviewAnswerResultSchema.parse({
      answer: {
        id: answer.id,
        questionId: answer.question_id,
        inputType: answer.input_type,
        transcript: answer.transcript,
        createdRecordId: answer.created_record_id,
        version: answer.version,
        updatedAt: new Date(answer.updated_at).toISOString(),
      },
      recordChange: {
        type: change.change_type,
        recordId: change.record_id,
        changedFields: change.changed_fields,
        sourceQuote: change.source_quote,
      },
      progress: { answered: session.answered_count, total: session.question_count },
    });
  }
}
