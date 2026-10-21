import { cookies } from "next/headers";

import { AppShell } from "@/components/AppShell";
import { MotionSeed } from "@/components/settings/MotionSeed";
import { requireSignedIn } from "@/lib/auth/session";
import { LearnerProvider } from "@/lib/learner-context";
import { loadLearnerSnapshot } from "@/lib/learner-store";
import { asMotionMode, LEGACY_MOTION_COOKIE, MOTION_COOKIE, MOTION_REDUCE_SCRIPT } from "@/lib/motion";
import { readStoredMotion } from "@/lib/motion-preference";
import { SIDEBAR_COOKIE, sidebarCollapsed } from "@/lib/sidebar-cookie";
import { studioEnabled } from "@/lib/studio";
import { asThemeMode, LEGACY_THEME_COOKIE, THEME_COOKIE } from "@/lib/theme-cookie";

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
 * Every page under it streams inside a loading boundary (`loading.tsx`), and
 * React swaps the streamed content in with an inline script. With scripts off
 * that swap never runs and the page stays on its loading frame, so the
 * `<noscript>` notice says why instead of leaving a skeleton that never fills.
 *
 * `requireSignedIn` runs first and before any query. The proxy has already
 * turned an anonymous visitor away; this is the second lock, the one that
 * still holds if a matcher edit ever lets a page through, and it also means a
 * stranger's request never reaches Postgres.
 *
 * A browser with no motion cookie (`@/lib/motion`) has its stored motion
 * preference read once here, beside the snapshot, and `MotionSeed` writes the
 * cookie, so the root layout can apply "Always reduce motion" from then on.
 * For this first page, an inline script ahead of the shell marks `<html>`
 * while the document is parsed, so nothing under it paints moving first.
 * With scripts off neither runs, and nothing needs them to: the loading
 * frame's wait-then-fade (`PageLoading`) is CSS alone, so it still shows,
 * fully opaque, under the notice above.
 */
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireSignedIn();
  const cookieStore = await cookies();
  const motionKnown =
    asMotionMode(cookieStore.get(MOTION_COOKIE)?.value ?? cookieStore.get(LEGACY_MOTION_COOKIE)?.value) !== null;
  const [{ state, reachable }, storedMotion] = await Promise.all([
    loadLearnerSnapshot(),
    motionKnown ? Promise.resolve(null) : readStoredMotion(),
  ]);

  // The cookie wins when both are present: it is what the browser last chose,
  // and it may have been chosen while the database was unreachable.
  const theme = asThemeMode(cookieStore.get(THEME_COOKIE)?.value ?? cookieStore.get(LEGACY_THEME_COOKIE)?.value) ?? state.theme;
  const initialState = theme === state.theme ? state : { ...state, theme };

  return (
    <>
      {storedMotion === "always" && <script dangerouslySetInnerHTML={{ __html: MOTION_REDUCE_SCRIPT }} />}
      <LearnerProvider initialState={initialState} reachable={reachable}>
        {storedMotion !== null && <MotionSeed mode={storedMotion} />}
        <AppShell studio={studioEnabled()} collapsed={sidebarCollapsed(cookieStore.get(SIDEBAR_COOKIE)?.value)}>
          <noscript>
            <p className="mb-6 rounded-xl border border-border bg-surface px-4 py-3 text-[14px] leading-5 text-text2">
              Gnosia needs JavaScript. Turn it on for this site and reload the page.
            </p>
          </noscript>
          {children}
        </AppShell>
      </LearnerProvider>
    </>
  );
}
