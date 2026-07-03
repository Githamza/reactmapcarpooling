import { describe, it, expect } from "vitest";
import { formatNumber, formatDistance, formatDate } from "./format";

// fr-FR uses narrow no-break spaces as thousands separators
const normalize = (s: string) => s.replace(/[  ]/g, " ");

describe("formatNumber", () => {
  it("formats with French thousands separators", () => {
    expect(normalize(formatNumber(1234567))).toBe("1 234 567");
  });
});

describe("formatDistance", () => {
  it("converts meters to rounded kilometers", () => {
    expect(normalize(formatDistance(450000))).toBe("450 km");
    expect(normalize(formatDistance(13558))).toBe("14 km");
  });
});

describe("formatDate", () => {
  it("formats ISO datetimes as dd/mm/yyyy hh:mm", () => {
    expect(formatDate("2025-02-01T12:00:00+01:00")).toMatch(
      /\d{2}\/\d{2}\/2025 \d{2}:\d{2}/
    );
  });

  it("handles empty and invalid input", () => {
    expect(formatDate("")).toBe("N/A");
    expect(formatDate("not-a-date")).toBe("Date invalide");
  });
});
