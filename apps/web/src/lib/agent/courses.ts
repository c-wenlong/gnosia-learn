import "server-only";

import { NextResponse } from "next/server";

import { getCourses } from "@/data/courses";
import { ContentUnavailableError } from "@/data/source";
import type { Course } from "@/lib/types";

/**
 * The course list for a route handler, or the 503 the agent routes answer
 * when it cannot be read.
 *
 * A page that cannot read its content has an error boundary to say so. A route
 * handler does not: an uncaught `ContentUnavailableError` becomes a bare 500
 * with no body, which the tutor panel reports as the server failing rather
 * than the content being unavailable. So the two refusals are the same
 * `{ error, code }` 503 the routes already give a down knowledge base.
 *
 * The body names the fix for a type that is not flipped, since that sentence
 * is ours. For an unreachable database it does not carry the driver's
 * message: `contentSource()` has logged that on the server already.
 */
export async function readCoursesOr503(): Promise<{ courses: Course[] } | { response: NextResponse }> {
  try {
    return { courses: await getCourses() };
  } catch (error) {
    if (!(error instanceof ContentUnavailableError)) throw error;
    const body =
      error.reason === "not-flipped"
        ? { error: error.message, code: "CONTENT_NOT_FLIPPED" }
        : { error: "The course catalog could not be read, so the tutor has no topic to work from.", code: "CONTENT_UNAVAILABLE" };
    return { response: NextResponse.json(body, { status: 503 }) };
  }
}
