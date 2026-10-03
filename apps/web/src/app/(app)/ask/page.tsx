import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OpenTutorChat } from "@/components/ask/OpenTutorChat";
import { AskBox } from "@/components/home/AskBox";
import { OPEN_SUBJECT_LIMIT } from "@/lib/agent/prompt";

export const metadata: Metadata = { title: "Ask the tutor" };

/**
 * `/ask?q=<subject>` (docs/proposals/home-page.md, part 1): the open tutor on
 * whatever the owner typed into Home's Ask box when nothing matched. With no
 * subject there is nothing to ask about, so it goes back to Home.
 *
 * The chat is the page's own state (H4): it is not saved and records no
 * mastery, and the line under the title says so, so nobody expects to find it
 * again or to see their answers move a concept.
 */
export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.q) ? params.q[0] : params.q;
  const subject = typeof raw === "string" ? raw.trim().slice(0, OPEN_SUBJECT_LIMIT) : "";
  if (subject === "") redirect("/home");

  return (
    <div data-layout="app" className="mx-auto flex w-full max-w-[760px] flex-col gap-5">
      <AskBox />
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[28px] leading-tight font-bold text-text">{subject}</h1>
        <p className="text-[13px] text-text2">
          Nothing in your notebook covers this yet. This chat is not saved, and your answers here move no mastery.
        </p>
      </div>
      <OpenTutorChat key={subject} subject={subject} />
    </div>
  );
}
