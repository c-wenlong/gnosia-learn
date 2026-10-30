import { cookies, headers } from "next/headers";

import { AppShell } from "@/components/AppShell";
import { MotionSeed } from "@/components/settings/MotionSeed";
import { NONCE_HEADER } from "@/lib/auth/csp";
import { requireSignedIn } from "@/lib/auth/session";
import { LearnerProvider } from "@/lib/learner-context";
import { loadLearnerSnapshot } from "@/lib/learner-store";
import { asMotionMode, LEGACY_MOTION_COOKIE, MOTION_COOKIE, MOTION_REDUCE_SCRIPT } from "@/lib/motion";
import { readStoredMotion } from "@/lib/motion-preference";
import { SIDEBAR_COOKIE, sidebarCollapsed } from "@/lib/sidebar-cookie";
import { studioEnabled } from "@/lib/studio";
import { runnerListening } from "@/lib/studio-runner";
import { appTimeZone } from "@gnosia/tutor/server/time-zone";
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
 * **The stored row wins over the browser's cookie**, for the theme and for
 * motion alike, whenever the database answered: a choice made in another
 * browser holds here too, and Settings never shows one value while the page
 * wears another. The cookies are the root layout's copy for the first paint,
 * and are brought in line here (the provider's theme effect, `MotionSeed`).
 * When the database did not answer, the cookie is all there is, and stands.
 * A theme write the database refused is kept and sent again by the provider,
 * so a choice made during an outage is not undone by the row it never
 * reached.
 *
 * The motion row is read beside the snapshot. When it says "Always reduce
 * motion" and the cookie does not, an inline script ahead of the shell marks
 * `<html>` while the document is parsed, so nothing under it paints moving
 * first. With scripts off neither runs, and nothing needs them to: the
 * loading frame's wait-then-fade (`PageLoading`) is CSS alone, so it still
 * shows, fully opaque, under the notice above.
 *
 * With a studio, the runner's port is looked at beside both
 * (`runnerListening`), so a sidebar on a page drawn while it was stopped
 * does not ask it.
 */
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireSignedIn();
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  // The motion script needs the request's CSP nonce to run (`@/lib/auth/csp`).
  const nonce = requestHeaders.get(NONCE_HEADER) ?? undefined;
  const cookieMotion = asMotionMode(cookieStore.get(MOTION_COOKIE)?.value ?? cookieStore.get(LEGACY_MOTION_COOKIE)?.value);
  const studio = studioEnabled();
  const [{ state, reachable }, storedMotion, runner] = await Promise.all([
    loadLearnerSnapshot(),
    readStoredMotion(),
    studio ? runnerListening() : Promise.resolve(false),
  ]);

  const cookieTheme = asThemeMode(cookieStore.get(THEME_COOKIE)?.value ?? cookieStore.get(LEGACY_THEME_COOKIE)?.value);
  const theme = reachable ? state.theme : (cookieTheme ?? state.theme);
  const initialState = theme === state.theme ? state : { ...state, theme };

  return (
    <>
      {storedMotion === "always" && cookieMotion !== "always" && (
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: MOTION_REDUCE_SCRIPT }} />
      )}
      <LearnerProvider initialState={initialState} reachable={reachable}>
        {storedMotion !== null && <MotionSeed mode={storedMotion} />}
        <AppShell
          studio={studio}
          runner={runner}
          // Resolved here, so the browser counts days in the server's zone, as Home does.
          timeZone={appTimeZone() ?? Intl.DateTimeFormat().resolvedOptions().timeZone}
          collapsed={sidebarCollapsed(cookieStore.get(SIDEBAR_COOKIE)?.value)}
        >
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
