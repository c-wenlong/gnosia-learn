import { childEnvironment } from "./env";

/**
 * `node --import tsx services/sidecar/src/child-env.ts`: the environment a
 * launcher gives every service it spawns, as one JSON object on stdout
 * (`childEnvironment` in env.ts). The desktop shell's `Checkout` and the
 * macOS app's `ChildEnvironment` run it once per launch through a login
 * shell. It holds secrets (AUTH_SECRET, provider keys), so it is written to
 * the parent's pipe and nowhere else.
 */
async function main(): Promise<void> {
  const env = await childEnvironment();
  process.stdout.write(`${JSON.stringify(env)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`child-env: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
