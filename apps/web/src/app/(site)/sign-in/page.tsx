import type { Metadata } from "next";

import { GnosiaLockup } from "@/components/brand/GnosiaWordmark";
import { GnosiaMascot } from "@/components/brand/GnosiaMascot";
import { Button } from "@/components/ui/Button";
import { AUTH_SECRET_VAR, OWNER_PASSWORD_VAR, safeNextPath } from "@/lib/auth/core";
import { authConfig } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

type Search = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

/**
 * The wait the sign-in route asked for, in whole minutes: at least one, and
 * never more than the limiter's fifteen whatever the query string says.
 */
function waitMinutes(retry: string | null): number {
  const seconds = Number.parseInt(retry ?? "", 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return 15;
  return Math.min(15, Math.max(1, Math.ceil(seconds / 60)));
}

/**
 * The owner's door. One field, a plain form post to `/api/auth/sign-in`, and
 * no JavaScript in the path: the route answers with a redirect either way and
 * this page reads the outcome from the query string.
 *
 * A signed-in visitor never sees it (the proxy sends them to `/home`), and a
 * deployment that has not set both variables gets told exactly which ones,
 * because a sign-in page that silently refuses every password is the kind of
 * bug that costs an evening.
 */
export default async function SignInPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const error = first(params.error);
  const next = safeNextPath(first(params.next));
  const config = authConfig();
  const missing = config.ok ? [] : config.missing;
  const unconfigured = missing.length > 0 || error === "unconfigured";
  const names = (missing.length > 0 ? missing : [OWNER_PASSWORD_VAR, AUTH_SECRET_VAR]).join(" and ");
  const retryMinutes = waitMinutes(first(params.retry));

  return (
    <div
      data-layout="site"
      data-page="sign-in"
      className="mx-auto grid w-full max-w-[960px] items-center gap-6 px-5 pt-4 pb-20 md:grid-cols-[1fr_minmax(0,26rem)] md:gap-12 md:px-8 md:pt-12 md:pb-28"
    >
      <div className="relative flex justify-center md:order-1">
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 size-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--brand-gold-soft)_55%,transparent),transparent)] md:size-[420px] dark:bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--brand-teal)_22%,transparent),transparent)]"
        />
        <GnosiaMascot pose="happy" float preload className="relative h-[120px] md:h-[300px]" />
      </div>

      <div className="gnosia-glass flex flex-col rounded-[28px] px-6 py-8 md:order-2 md:px-8 md:py-10">
        <GnosiaLockup size={44} className="self-center text-brand-ink" />
        <h1 className="mt-7 text-center font-book text-[30px] leading-tight font-medium tracking-[-0.02em] text-brand-ink">
          Open your book
        </h1>
        <p className="mt-2 text-center text-[15px] leading-relaxed text-brand-mist">
          Gnosia has one reader for now. Enter the owner password to continue.
        </p>

        <form method="post" action={next === safeNextPath(null) ? "/api/auth/sign-in" : `/api/auth/sign-in?${new URLSearchParams({ next })}`} className="mt-8 flex w-full flex-col gap-4">
          <input type="hidden" name="next" value={next} />
          <label className="flex flex-col gap-2">
            <span className="text-[14px] font-medium text-brand-mist">Password</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              autoFocus
              required
              disabled={unconfigured}
              aria-invalid={error === "password" || undefined}
              aria-describedby={error ? "sign-in-error" : undefined}
              className="h-12 rounded-2xl border border-brand-ink/15 bg-white/70 px-4 text-[16px] text-brand-ink outline-none transition-colors duration-150 focus-visible:border-brand-teal focus-visible:ring-2 focus-visible:ring-brand-teal/25 disabled:opacity-50 aria-invalid:border-danger dark:bg-brand-navy/50"
            />
          </label>
          {error === "password" && (
            <p id="sign-in-error" role="alert" className="text-[14px] text-danger">
              That is not the owner password.
            </p>
          )}
          {error === "throttled" && !unconfigured && (
            <p id="sign-in-error" role="alert" className="text-[14px] text-danger">
              Too many sign-in attempts. Try again in {retryMinutes === 1 ? "a minute" : `${retryMinutes} minutes`}.
            </p>
          )}
          {unconfigured && (
            <div
              id="sign-in-error"
              role="alert"
              className="rounded-2xl border border-brand-gold/40 bg-brand-gold-soft/25 px-4 py-3 dark:border-brand-gold/30 dark:bg-brand-gold/10 text-[14px] leading-relaxed text-brand-ink"
            >
              <p className="font-semibold">Sign-in is not configured on this deployment.</p>
              <p className="mt-1">
                Set <code className="font-mono text-[13px]">{names}</code> in{" "}
                <code className="font-mono text-[13px]">apps/web/.env.local</code> locally, or in the Vercel
                project&apos;s environment variables, then restart.
              </p>
            </div>
          )}
          <Button type="submit" variant="brand" block disabled={unconfigured} className="mt-2">
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
