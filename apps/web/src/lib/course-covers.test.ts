import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { COURSE_COVERS, coverSrc } from "./course-covers";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FOLDER = path.resolve(HERE, "..", "..", "public", "course-covers");

describe("course covers", () => {
  it("lists exactly the photos in public/course-covers", () => {
    const files = existsSync(FOLDER)
      ? readdirSync(FOLDER)
          .filter((f) => f.endsWith(".webp"))
          .map((f) => f.slice(0, -".webp".length))
          .sort()
      : [];
    expect([...COURSE_COVERS].sort()).toEqual(files);
  });

  it("credits every photo with its source page", () => {
    if (COURSE_COVERS.size === 0) return;
    const credits = readFileSync(path.join(FOLDER, "CREDITS.md"), "utf8");
    for (const slug of COURSE_COVERS) {
      const row = credits.split("\n").find((line) => line.startsWith(`| ${slug} |`));
      expect(row, `CREDITS.md has no row for ${slug}`).toBeDefined();
      expect(row).toMatch(/https:\/\/(unsplash\.com|www\.pexels\.com)\/photos?\//);
    }
  });

  it("serves a listed slug and nothing else", () => {
    for (const slug of COURSE_COVERS) expect(coverSrc(slug)).toBe(`/course-covers/${slug}.webp`);
    expect(coverSrc("no-such-course")).toBeNull();
  });
});
