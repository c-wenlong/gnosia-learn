import { redirect } from "next/navigation";

/**
 * `/` is Today (DESIGN.md decision 9), which is phase 1a. Until it lands the
 * root sends the learner to Courses, which is what `/` used to show.
 * `redirect` from a page is a 307, so nothing caches it as permanent.
 */
export default function HomePage() {
  redirect("/courses");
}
