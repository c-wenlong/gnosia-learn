import type { Metadata } from "next";

import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Review" };

/** Placeholder until phase 1e builds the review session. */
export default function ReviewPage() {
  return (
    <ComingSoon title="Review">
      Due reviews, one card at a time with the four Anki ratings, will live here. Until then, run{" "}
      <code className="font-mono text-[0.9em]">/review</code> in Claude Code.
    </ComingSoon>
  );
}
