import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Reclaim Linux cgroup v2 filesystem page cache (`file` in `memory.stat`) left
 * behind after short-lived headless Chromium subprocesses (`canvas doctor`,
 * manual snippet checks) exit.
 *
 * When Chromium runs inside a systemd service cgroup, reading its ~250 MB
 * binary and shared libraries faults ~330 MB of clean file pages into the
 * cgroup's page cache. Even after Chromium exits and the Node runner's own
 * anonymous heap (`anon`) sits around 60 MB, Linux cgroup v2 continues
 * charging those 330 MB of `file` cache to `memory.current` (`systemctl status`
 * / `MemoryCurrent`), reporting ~400 MB for an idle service.
 *
 * Writing `<file_bytes> swappiness=0` to `memory.reclaim` (Linux 6.2+) instructs
 * the kernel to evict only clean file-backed page cache from this cgroup
 * without swapping out any anonymous heap (`swap = 0`). On non-Linux hosts,
 * older kernels without `swappiness=0`, or unprivileged containers where
 * `memory.reclaim` is absent or read-only, this is a silent no-op.
 */

export const MIN_RECLAIM_FILE_BYTES = 16 * 1024 * 1024;

export interface ReclaimCgroupOptions {
  platform?: NodeJS.Platform;
  procCgroupPath?: string;
  cgroupRoot?: string;
  minBytes?: number;
}

export function parseCgroupV2Path(procCgroupText: string): string | null {
  for (const rawLine of procCgroupText.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("0::")) continue;
    const rel = line.slice(3).trim();
    if (!rel.startsWith("/") || rel === "/" || rel.includes("..")) return null;
    return rel;
  }
  return null;
}

export function parseFileBytes(memoryStatText: string): number | null {
  for (const rawLine of memoryStatText.split("\n")) {
    const match = /^file\s+(\d+)$/.exec(rawLine.trim());
    if (match?.[1] !== undefined) {
      const parsed = Number.parseInt(match[1], 10);
      return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
    }
  }
  return null;
}

export async function reclaimCgroupFileCache(options: ReclaimCgroupOptions = {}): Promise<boolean> {
  const platform = options.platform ?? process.platform;
  if (platform !== "linux") return false;
  const procCgroupPath = options.procCgroupPath ?? "/proc/self/cgroup";
  const cgroupRoot = options.cgroupRoot ?? "/sys/fs/cgroup";
  const minBytes = options.minBytes ?? MIN_RECLAIM_FILE_BYTES;

  try {
    const procText = await readFile(procCgroupPath, "utf8");
    const relPath = parseCgroupV2Path(procText);
    if (relPath === null) return false;

    const cgroupDir = path.join(cgroupRoot, relPath);
    const statText = await readFile(path.join(cgroupDir, "memory.stat"), "utf8");
    const fileBytes = parseFileBytes(statText);
    if (fileBytes === null || fileBytes < minBytes) return false;

    await writeFile(path.join(cgroupDir, "memory.reclaim"), `${fileBytes} swappiness=0\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}
