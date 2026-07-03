import { describe, it, expect } from "vitest";
import { filterMonthlyResources } from "./resourceMeta";
import { formatMonthFromTitle } from "../utils/format";

describe("filterMonthlyResources", () => {
  it("keeps only plain monthly files, newest first", () => {
    const months = filterMonthlyResources([
      { id: "a", title: "2025-12.csv", url: "u1", checksum: { value: "c1" } },
      { id: "b", title: "2025-12-sans-covoit-idfm.csv", url: "u2" },
      { id: "c", title: "2026-05.csv", url: "u3", checksum: { value: "c3" } },
      { id: "d", title: "readme.md", url: "u4" },
      { id: "e", title: "2026-01.csv", url: "u5" },
    ]);

    expect(months.map((m) => m.title)).toEqual([
      "2026-05.csv",
      "2026-01.csv",
      "2025-12.csv",
    ]);
    expect(months[0]).toMatchObject({ id: "c", checksum: "c3" });
    expect(months[1].checksum).toBe(null);
  });

  it("ignores malformed entries", () => {
    expect(
      filterMonthlyResources([{ title: "2026-05.csv" }, { id: "x", url: "u" }])
    ).toEqual([]);
  });
});

describe("formatMonthFromTitle", () => {
  it("formats YYYY-MM titles as French month labels", () => {
    expect(formatMonthFromTitle("2026-05.csv")).toBe("mai 2026");
    expect(formatMonthFromTitle("2025-02.csv")).toBe("février 2025");
  });

  it("returns null for titles without a month prefix", () => {
    expect(formatMonthFromTitle("readme.md")).toBe(null);
  });
});
