import { notFound } from "next/navigation";

import { BranchReview } from "./review";

export default function BranchReviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <BranchReview />;
}
