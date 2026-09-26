import { cookies } from "next/headers";

import { AppShell } from "@/components/AppShell";
import { requireSignedIn } from "@/lib/auth/session";
import { loadHabit } from "@/lib/habit";
import { LearnerProvider } from "@/lib/learner-context";
import { loadLearnerSnapshot } from "@/lib/learner-store";
import { studioEnabled } from "@/lib/studio";
import { asThemeMode, THEME_COOKIE } from "@/lib/theme-cookie";

/**
 * The owner's half of the app: every page except the landing and sign-in.
 *
 * It reads the learner's state, which makes every page under it dynamic. That
 * is the trade bundle 5 made deliberately. `LearnerProvider` needs real state
 * on the first render, since a provider seeded with zeros and corrected after
 * hydration is a progress bar that visibly jumps, and the state is a query.
 * Nothing is read at build time, so a build with no database at all still
 * succeeds; every read simply happens per request instead.
 *
 * `requireSignedIn` runs first and before any query. The proxy has already
 * turned an anonymous visitor away; this is the second lock, the one that
 * still holds if a matcher edit ever lets a page through, and it also means a
 * stranger's request never reaches Postgres.
 *
 * It also reads the habit numbers the top bar shows on every page (the streak
 * and the daily target, `@/lib/habit`) and hands them to the shell as props:
 * the bar is a client component and cannot query anything itself.
 */
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireSignedIn();
  const [cookieStore, { state, reachable }, habit] = await Promise.all([
    cookies(),
    loadLearnerSnapshot(),
    loadHabit(),
  ]);

  // The cookie wins when both are present: it is what the browser last chose,
  // and it may have been chosen while the database was unreachable.
  const theme = asThemeMode(cookieStore.get(THEME_COOKIE)?.value) ?? state.theme;
  const initialState = theme === state.theme ? state : { ...state, theme };

  return (
    <LearnerProvider initialState={initialState} reachable={reachable}>
      <AppShell habit={habit} studio={studioEnabled()}>
        {children}
      </AppShell>
    </LearnerProvider>
  );
}
