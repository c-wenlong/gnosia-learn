import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { courses } from "./index";
import type { Course, Module } from "@/lib/types";

// Guards zero drift between the TypeScript course literals (still what the
// app reads) and the new YAML data files under content/courses/. When the
// catalog loader lands, this test's job shifts to guarding the loader's
// output instead of the TS export, but until then it is the thing keeping
// the two representations honest.

const KEBAB_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const contentDir = path.resolve(__dirname, "../../../content/courses");

type YamlModule = Module & { topic?: string };
type YamlCourse = Omit<Course, "modules"> & { modules: YamlModule[] };

function loadYamlCourse(code: string): YamlCourse {
  const filePath = path.join(contentDir, `${code.toLowerCase()}.yaml`);
  const raw = fs.readFileSync(filePath, "utf8");
  return parse(raw) as YamlCourse;
}

describe("courses YAML matches the TypeScript source", () => {
  for (const course of courses) {
    it(`content/courses/${course.code.toLowerCase()}.yaml matches src/data/courses/${course.slug}.ts`, () => {
      const yamlCourse = loadYamlCourse(course.code);

      // Strip the `topic` key we add on top of the Course shape before
      // comparing — it has no TypeScript-side counterpart (yet).
      const strippedModules: Module[] = yamlCourse.modules.map((mod) => ({
        id: mod.id,
        slug: mod.slug,
        title: mod.title,
        order: mod.order,
        topics: mod.topics,
        resources: mod.resources,
      }));
      const strippedCourse: Course = {
        ...yamlCourse,
        modules: strippedModules,
      };

      expect(strippedCourse).toEqual(course);
    });
  }

  it("gives every module a kebab-case topic slug", () => {
    for (const course of courses) {
      const yamlCourse = loadYamlCourse(course.code);
      for (const mod of yamlCourse.modules) {
        expect(mod.topic, `${course.code} module ${mod.id} is missing topic`).toBeTruthy();
        expect(
          mod.topic && KEBAB_SLUG.test(mod.topic),
          `${course.code} module ${mod.id} topic "${mod.topic}" is not a kebab-case slug`,
        ).toBe(true);
      }
    }
  });
});
