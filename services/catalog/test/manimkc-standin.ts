import { chmod, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect } from "vitest";

import { SEED } from "./seed";

/**
 * A manimkc checkout with one rendered topic folder, `demo/one`: a video and
 * its transcript under `<root>/out/demo/one/`, and a CLI at
 * `<root>/tools/cli/manimkc` answering `topics --json` and `mirrors --json`
 * the way the real one does. Point `MANIMKC_ROOT` at `root` and the catalog
 * runs it in place of the submodule's.
 */
export async function manimkcStandIn(root: string, video: Buffer): Promise<{ videoFile: string }> {
  const out = path.join(root, "out", "demo", "one");
  await mkdir(out, { recursive: true });
  const videoFile = path.join(out, "one.mp4");
  await writeFile(videoFile, video);
  await writeFile(path.join(out, "one.transcript.json"), JSON.stringify({ segments: [] }));
  const cli = path.join(root, "tools", "cli", "manimkc");
  await mkdir(path.dirname(cli), { recursive: true });
  await writeFile(
    cli,
    [
      "#!/usr/bin/env python3",
      "import json, sys",
      'root = sys.argv[sys.argv.index("--root") + 1]',
      'if "mirrors" in sys.argv:',
      '    print(json.dumps({"outRoot": root, "destinations": {}}))',
      "else:",
      '    print(json.dumps({"outRoot": root, "topics": [{"path": "demo/one", "title": "One", "topic": None,',
      '        "out_dir": "out/demo/one", "sections": [{"section": "main", "deliverable": {',
      '        "path": "out/demo/one/one.mp4", "exists": True, "sidecars": {',
      '        "transcript": {"path": "out/demo/one/one.transcript.json", "exists": True}}}}]}],',
      '        "drift": {"orphans": [], "unrendered": []}}))',
      "",
    ].join("\n"),
  );
  await chmod(cli, 0o755);
  return { videoFile };
}

/** A copy of the seed at `into`, with `demo/one` mapped under one of its topics, for the stand-in above. */
export async function seedWithManimkc(into: string): Promise<void> {
  for (const folder of ["content", "learn"]) {
    await cp(path.join(SEED, folder), path.join(into, folder), { recursive: true });
  }
  const topics = path.join(into, "content", "topics.yaml");
  const vocabulary = await readFile(topics, "utf8");
  const mapped = vocabulary.replace(
    /(- slug: agent-tool-use-and-reasoning-loops\n(?:.*\n)*?\s+manimkc: )\[\]/,
    "$1[demo/one]",
  );
  expect(mapped).not.toBe(vocabulary);
  await writeFile(topics, mapped);
}
