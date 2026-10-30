import { describe, expect, it } from "vitest";

import { tutorProblem } from "./tutor-errors";

describe("tutorProblem", () => {
  it("names each code the tutor routes answer, the same on every surface", () => {
    expect(tutorProblem(400, { code: "MISSING_API_KEY", error: "No key for Gemini." })).toBe("No key for Gemini.");
    expect(tutorProblem(400, { code: "MISSING_API_KEY" })).toContain("Add one in Settings");
    expect(tutorProblem(503, { code: "CONCEPT_UNAVAILABLE", error: "raw" })).toContain("knowledge base is unreachable");
    expect(tutorProblem(502, { code: "UNSTRUCTURED_REPLY" })).toContain("not with a question");
    expect(tutorProblem(429, null)).toContain("a lot of questions in a minute");
    expect(tutorProblem(400, { code: "RATE_LIMITED" })).toContain("a lot of questions in a minute");
  });

  it("falls back to the server's sentence, then to the status", () => {
    expect(tutorProblem(500, { error: "Provider down." })).toBe("Provider down.");
    expect(tutorProblem(504, undefined)).toBe("The tutor did not answer (HTTP 504).");
  });
});
