/**
 * Where this deployment lives, resolved once for everything that needs to say so.
 *
 * Two callers, and they used to be two implementations. The root layout resolves
 * it for `metadataBase`, so social image URLs are absolute; the agent's
 * OpenRouter provider resolves it for the `HTTP-Referer` attribution header. A
 * second parse is how they came to disagree on bad input: the layout fell back
 * to localhost on an unparseable value and the header sent the malformed string
 * on to OpenRouter.
 *
 * Set `NEXT_PUBLIC_SITE_URL` to the canonical origin, with or without a scheme
 * ("example.com" and "https://example.com" both work). On Vercel the production
 * domain is injected instead. Anything unusable falls back to the dev server
 * rather than throwing: this runs while the root layout loads, and a bad value
 * should cost a link preview and not the whole app.
 *
 * The empty string is the case that has actually bitten. `NEXT_PUBLIC_SITE_URL=""`
 * once crashed a build through `new URL("")`, because `??` does not fall through
 * on an empty string. Hence `||` over `??`, and a `trim()` before it, so a
 * variable set to nothing at all is the same as one never set.
 */

export const LOCAL_SITE_URL = "http://localhost:3000";

type EnvMap = Record<string, string | undefined>;

export function resolveSiteUrl(env: EnvMap = process.env): URL {
  const configured =
    env.NEXT_PUBLIC_SITE_URL?.trim() || env.VERCEL_PROJECT_PRODUCTION_URL?.trim();

  if (!configured) return new URL(LOCAL_SITE_URL);

  const withScheme = /^https?:\/\//i.test(configured)
    ? configured
    : `https://${configured}`;

  try {
    return new URL(withScheme);
  } catch {
    console.warn(
      `Ignoring unparseable site URL ${JSON.stringify(configured)}; ` +
        `social images will resolve against ${LOCAL_SITE_URL}.`,
    );
    return new URL(LOCAL_SITE_URL);
  }
}
