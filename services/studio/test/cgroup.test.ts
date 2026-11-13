import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseCgroupV2Path, parseFileBytes, reclaimCgroupFileCache } from "../src/cgroup";

describe("reclaimCgroupFileCache", () => {
  let root = "";

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "studio-cgroup-"));
  });

  afterEach(async () => {
    if (root !== "") await rm(root, { recursive: true, force: true });
    root = "";
  });

  it("parses cgroup v2 paths and memory.stat file byte counts", () => {
    expect(parseCgroupV2Path("0::/user.slice/user-1000.slice/app.slice/gnosia-learn-studio.service\n")).toBe(
      "/user.slice/user-1000.slice/app.slice/gnosia-learn-studio.service",
    );
    expect(parseCgroupV2Path("0::/\n")).toBeNull();
    expect(parseCgroupV2Path("0::/../escape\n")).toBeNull();
    expect(parseFileBytes("anon 59248640\nfile 344940544\nkernel 5410816\n")).toBe(344940544);
    expect(parseFileBytes("anon 59248640\n")).toBeNull();
  });

  it("writes '<file_bytes> swappiness=0' to memory.reclaim when file cache exceeds the threshold", async () => {
    const procFile = path.join(root, "proc-cgroup");
    const serviceRel = "/user.slice/user-1000.slice/app.slice/gnosia-learn-studio.service";
    const cgroupDir = path.join(root, "sys-cgroup", serviceRel);
    await mkdir(cgroupDir, { recursive: true });
    await writeFile(procFile, `0::${serviceRel}\n`, "utf8");
    await writeFile(path.join(cgroupDir, "memory.stat"), "anon 60178432\nfile 344940544\nkernel 4317184\n", "utf8");
    await writeFile(path.join(cgroupDir, "memory.reclaim"), "", "utf8");

    const reclaimed = await reclaimCgroupFileCache({
      platform: "linux",
      procCgroupPath: procFile,
      cgroupRoot: path.join(root, "sys-cgroup"),
    });
    expect(reclaimed).toBe(true);
    expect(await readFile(path.join(cgroupDir, "memory.reclaim"), "utf8")).toBe("344940544 swappiness=0\n");
  });

  it("skips reclaiming on non-Linux or when file cache is already small", async () => {
    const procFile = path.join(root, "proc-cgroup");
    const serviceRel = "/user.slice/gnosia-learn-studio.service";
    const cgroupDir = path.join(root, "sys-cgroup", serviceRel);
    await mkdir(cgroupDir, { recursive: true });
    await writeFile(procFile, `0::${serviceRel}\n`, "utf8");
    await writeFile(path.join(cgroupDir, "memory.stat"), "anon 60178432\nfile 2654208\n", "utf8");

    expect(
      await reclaimCgroupFileCache({
        platform: "darwin",
        procCgroupPath: procFile,
        cgroupRoot: path.join(root, "sys-cgroup"),
      }),
    ).toBe(false);

    expect(
      await reclaimCgroupFileCache({
        platform: "linux",
        procCgroupPath: procFile,
        cgroupRoot: path.join(root, "sys-cgroup"),
      }),
    ).toBe(false);
  });
});
