/**
 * The desktop shell's launch token: where it travels and whether this server
 * process has spent it (`/api/auth/local`). Kept out of the route module,
 * which may export only route handlers.
 */

/** The header the desktop shell sends its launch token in, never the URL. */
export const LOCAL_TOKEN_HEADER = "x-gnosia-local-token";

let redeemed = false;

/** Whether this process has already traded its launch token for a cookie. */
export function localTokenRedeemed(): boolean {
  return redeemed;
}

/** Spend the token: from now on it mints no more cookies in this process. */
export function claimLocalToken(): void {
  redeemed = true;
}

/** For the tests: forget a redemption, as a new server process would. */
export function resetLocalTokenForTests(): void {
  redeemed = false;
}
