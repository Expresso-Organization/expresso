import { randomUUID } from "node:crypto";

import {
  CareerRecordResponseSchema,
  CreateCareerRecordSchema,
} from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { request } from "@/lib/api/client";
import { requireSession } from "@/lib/require-session";

const TEST_BODY = [
  "이 기록은 맞춤 분석 기능 검증을 위한 가상 테스트 자료입니다.",
  "",
  "Node.js와 TypeScript를 사용해 프로젝트 관리 REST API를 개발했다.",
  "Express로 프로젝트 생성, 조회, 수정, 삭제 API를 구현했다.",
  "MongoDB에 프로젝트 데이터를 저장하고 조회했다.",
  "Zod로 요청 본문의 형식을 검증했다.",
  "사용자 인증과 사용자별 데이터 접근 제한을 구현했다.",
  "Git으로 소스 코드와 변경 이력을 관리했다.",
  "",
  "Docker 운영 배포, Redis 활용, 대규모 트래픽 처리 경험은",
  "이 테스트 기록에 포함하지 않았다.",
].join("\n");

async function createTestCareerRecord(formData: FormData) {
  "use server";

  // 개발 서버에서만 테스트 기록을 생성할 수 있습니다.
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  const session = await requireSession();

  const category = session.categories.find(
    (item) => item.key === "project",
  );

  if (!category) {
    throw new Error("프로젝트 경력 카테고리를 찾을 수 없습니다.");
  }

  const requestId = z.uuid().parse(formData.get("requestId"));
  const rawTitle = z.string().trim().min(1).max(290).parse(
    formData.get("title"),
  );
  const bodyMd = z.string().trim().min(1).max(200000).parse(
    formData.get("bodyMd"),
  );

  const title = rawTitle.startsWith("[TEST]")
    ? rawTitle
    : `[TEST] ${rawTitle}`;

  const input = CreateCareerRecordSchema.parse({
    categoryId: category.id,
    title,
    bodyMd,
    properties: {},
  });

  const result = await request(
    "/v1/career/records",
    CareerRecordResponseSchema,
    {
      method: "POST",
      accessToken: session.accessToken,
      idempotencyKey: requestId,
      body: input,
      cache: "no-store",
    },
  );

  redirect(
    `/career-test?created=${result.data.id}` as Route,
  );
}

export default async function CareerTestPage({
  searchParams,
}: {
  searchParams: Promise<{
    created?: string | string[];
  }>;
}) {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  await requireSession();

  const query = await searchParams;
  const created = z.uuid().safeParse(query.created);

  return (
    <main
      style={{
        maxWidth: 800,
        margin: "0 auto",
        padding: 24,
      }}
    >
      <h1>P3 테스트용 경력 등록</h1>

      <p>
        로그인한 계정의 프로젝트 경력에 가상 테스트 자료를 저장합니다.
        실제 지원 자료와 구분하도록 제목에 [TEST]를 표시합니다.
      </p>

      {created.success ? (
        <section>
          <p role="status">테스트 경력이 저장되었습니다.</p>

          <p>
            <Link href="/career/project">
              프로젝트 경력 목록 확인
            </Link>
          </p>

          <p>
            <Link
              href={
                "/agentic-chat?sessionId=57c7dd4a-0e69-4794-80e0-896f741cc81c" as Route
              }
            >
              테스트 대화방으로 돌아가기
            </Link>
          </p>

          <p>
            대화방에서 ‘내 경력과 맞춤 분석’ 또는
            ‘현재 경력으로 새로 분석’을 누르세요.
          </p>
        </section>
      ) : (
        <form action={createTestCareerRecord}>
          <input
            type="hidden"
            name="requestId"
            value={randomUUID()}
          />

          <label htmlFor="test-career-title">제목</label>

          <input
            id="test-career-title"
            name="title"
            defaultValue="[TEST] TypeScript 백엔드 API 개발 프로젝트"
            required
            maxLength={290}
            style={{
              display: "block",
              width: "100%",
              marginTop: 8,
              marginBottom: 20,
            }}
          />

          <label htmlFor="test-career-body">경력 본문</label>

          <textarea
            id="test-career-body"
            name="bodyMd"
            defaultValue={TEST_BODY}
            required
            maxLength={200000}
            rows={15}
            style={{
              display: "block",
              width: "100%",
              marginTop: 8,
              marginBottom: 20,
            }}
          />

          <button type="submit">
            테스트 경력 저장
          </button>
        </form>
      )}
    </main>
  );
}