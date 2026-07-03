import { describe, it, expect } from "vitest";
import { isCacheValid, TripCacheMeta } from "./tripCache";
import { MonthResource } from "../types";

const NOW = 1_750_000_000_000;
const DAY = 24 * 3600 * 1000;

function meta(overrides: Partial<TripCacheMeta> = {}): TripCacheMeta {
  return {
    resourceId: "res-1",
    title: "2026-05.csv",
    checksum: "abc",
    rowCap: 100_000,
    tripCount: 100_000,
    storedAt: NOW - DAY,
    ...overrides,
  };
}

function remote(overrides: Partial<MonthResource> = {}): MonthResource {
  return {
    id: "res-1",
    title: "2026-05.csv",
    url: "https://static.data.gouv.fr/x.csv",
    checksum: "abc",
    ...overrides,
  };
}

describe("isCacheValid", () => {
  it("accepts a cache whose checksum matches the remote resource", () => {
    expect(isCacheValid(meta(), remote(), 100_000, NOW)).toBe(true);
  });

  it("rejects when the remote checksum changed (republished file)", () => {
    expect(isCacheValid(meta(), remote({ checksum: "def" }), 100_000, NOW)).toBe(
      false
    );
  });

  it("rejects when a different month is requested or published", () => {
    expect(
      isCacheValid(meta(), remote({ id: "res-2", title: "2026-06.csv" }), 100_000, NOW)
    ).toBe(false);
  });

  it("rejects a truncated cache when the cap was raised", () => {
    expect(isCacheValid(meta(), remote(), 200_000, NOW)).toBe(false);
  });

  it("accepts a bigger cap when the whole file fit under the old cap", () => {
    // tripCount < rowCap means the file was fully consumed — nothing to gain
    expect(isCacheValid(meta({ tripCount: 42_000 }), remote(), 200_000, NOW)).toBe(
      true
    );
  });

  it("falls back to a 7-day TTL when the dataset API is unreachable", () => {
    expect(isCacheValid(meta(), null, 100_000, NOW)).toBe(true);
    expect(isCacheValid(meta({ storedAt: NOW - 8 * DAY }), null, 100_000, NOW)).toBe(
      false
    );
  });
});
