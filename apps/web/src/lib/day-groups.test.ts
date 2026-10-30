import { describe, expect, it } from "vitest";

import { dayDiff, dayGroups, dayLabel, editedLabel, EDITED_AFTER_MS, timeOfDay, weekdayName } from "./day-groups";

const NOW = new Date("2026-10-04T10:00:00Z");
const SG = "Asia/Singapore";

const rows = [
  { id: "a", at: "2026-10-04T09:12:00Z" },
  { id: "b", at: "2026-10-03T23:30:00Z" }, // 07:30 on 4 Oct in Singapore, 3 Oct in UTC
  { id: "c", at: "2026-10-02T13:30:00Z" },
  { id: "d", at: "2026-10-04T01:00:00Z" },
  { id: "e", at: "2025-12-28T12:00:00Z" },
  { id: "f", at: "not a date" },
  { id: "g", at: "2026-10-02T02:00:00Z" },
];
const at = (r: { at: string }) => r.at;
const shape = (groups: { key: string; label: string; rows: { id: string }[] }[]) =>
  groups.map((g) => `${g.label} (${g.rows.length}): ${g.rows.map((r) => r.id).join(" ")}`);

describe("dayGroups", () => {
  it("groups by calendar day in the zone, newest day first, rows in input order (golden)", () => {
    expect(shape(dayGroups(rows, at, { now: NOW, timeZone: SG }))).toEqual([
      "4 Oct (3): a b d",
      "2 Oct (2): c g",
      "28 Dec 2025 (1): e",
      "No date (1): f",
    ]);
  });

  it("counts days in UTC when that is the zone, which moves an early-morning row to the day before", () => {
    expect(shape(dayGroups(rows, at, { now: NOW, timeZone: "UTC" }))).toEqual([
      "4 Oct (2): a d",
      "3 Oct (1): b",
      "2 Oct (2): c g",
      "28 Dec 2025 (1): e",
      "No date (1): f",
    ]);
  });

  it("keeps the groups in date order whatever order the rows come in", () => {
    const byTitle = [rows[4], rows[2], rows[0], rows[6], rows[3]];
    expect(shape(dayGroups(byTitle, at, { now: NOW, timeZone: SG }))).toEqual([
      "4 Oct (2): a d",
      "2 Oct (2): c g",
      "28 Dec 2025 (1): e",
    ]);
  });

  it("answers no groups for no rows, and keys a group by its date", () => {
    expect(dayGroups([], at, { now: NOW })).toEqual([]);
    expect(dayGroups([rows[0]], at, { now: NOW, timeZone: SG })[0]?.key).toBe("2026-10-04");
  });
});

describe("weekdayName and dayDiff", () => {
  it("names a day key's weekday short, whatever the machine's zone", () => {
    expect(["2026-10-04", "2026-10-05", "2026-10-10"].map(weekdayName)).toEqual(["Sun", "Mon", "Sat"]);
  });

  it("counts whole calendar days, negative backwards, across a year end", () => {
    expect(dayDiff("2026-12-30", "2027-01-02")).toBe(3);
    expect(dayDiff("2026-10-05", "2026-10-04")).toBe(-1);
  });
});

describe("dayLabel", () => {
  it("drops the year only for this year's days", () => {
    expect(dayLabel("2026-10-04", "2026-10-04")).toBe("4 Oct");
    expect(dayLabel("2026-01-01", "2026-10-04")).toBe("1 Jan");
    expect(dayLabel("2025-10-04", "2026-10-04")).toBe("4 Oct 2025");
    expect(dayLabel("nonsense", "2026-10-04")).toBe("No date");
  });
});

describe("timeOfDay", () => {
  it("prints a 24-hour clock in the zone", () => {
    expect(timeOfDay("2026-10-04T10:12:00Z", SG)).toBe("18:12");
    expect(timeOfDay("2026-10-04T00:05:00Z", "UTC")).toBe("00:05");
    expect(timeOfDay("nope", SG)).toBeNull();
  });
});

describe("editedLabel", () => {
  const options = { now: NOW, timeZone: SG };

  it("says the day a row was edited when that is more than a day after it was made", () => {
    expect(editedLabel("2026-09-01T00:00:00Z", "2026-10-02T03:00:00Z", options)).toBe("edited 2 Oct");
    expect(editedLabel("2024-09-01T00:00:00Z", "2025-03-02T03:00:00Z", options)).toBe("edited 2 Mar 2025");
  });

  it("says nothing within a day, at exactly a day, or for an instant that does not parse", () => {
    const made = "2026-10-01T00:00:00Z";
    expect(editedLabel(made, made, options)).toBeNull();
    expect(editedLabel(made, "2026-10-01T23:00:00Z", options)).toBeNull();
    expect(editedLabel(made, new Date(Date.parse(made) + EDITED_AFTER_MS).toISOString(), options)).toBeNull();
    expect(editedLabel(made, new Date(Date.parse(made) + EDITED_AFTER_MS + 1000).toISOString(), options)).toBe(
      "edited 2 Oct",
    );
    expect(editedLabel("bad", "2026-10-03T00:00:00Z", options)).toBeNull();
    expect(editedLabel(made, "bad", options)).toBeNull();
  });

  it("says nothing when no person changed the row, however long ago it was made", () => {
    // The catalog's `editedAt` is null when the last change was an import or
    // an indexer refresh, which is most rows: `updated_at` is not read at all.
    expect(editedLabel("2026-01-01T00:00:00Z", null, options)).toBeNull();
  });
});
