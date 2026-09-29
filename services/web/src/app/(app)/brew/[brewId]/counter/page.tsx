import type { Route } from "next";
import { redirect } from "next/navigation";

/** Brew AI Interview는 MVP 제품 경로에서 제외한다. */
export default async function CounterPage({
  params,
}: {
  params: Promise<{ brewId: string }>;
}) {
  const { brewId } = await params;
  redirect(`/brew/${brewId}/outline` as Route);
}
