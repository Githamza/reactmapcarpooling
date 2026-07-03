import { describe, it, expect } from "vitest";
import { buildFlowModel, cellSizeForZoom, arcPoints } from "./flows";
import { Trip } from "../types";

function trip(overrides: Partial<Trip>): Trip {
  return {
    journey_id: "t",
    datetime: "2026-05-01T08:00:00+02:00",
    journey_start_lat: 48.85,
    journey_start_lon: 2.35,
    journey_start_town: "Paris",
    journey_end_lat: 45.76,
    journey_end_lon: 4.84,
    journey_end_town: "Lyon",
    journey_distance: 400_000,
    passenger_seats: 1,
    ...overrides,
  };
}

describe("buildFlowModel", () => {
  it("aggregates trips between the same zones into one flow", () => {
    const trips = [
      trip({ journey_id: "1" }),
      trip({ journey_id: "2", journey_distance: 410_000 }),
      trip({ journey_id: "3", journey_start_lat: 48.86 }), // same Paris cell at size 1
    ];
    const model = buildFlowModel(trips, 1);

    expect(model.flows).toHaveLength(1);
    expect(model.flows[0].count).toBe(3);
    expect(model.flows[0].sumDistance).toBe(1_210_000);
    expect(model.zones.size).toBe(2);

    const from = model.zones.get(model.flows[0].from)!;
    const to = model.zones.get(model.flows[0].to)!;
    expect(from.town).toBe("Paris");
    expect(from.startCount).toBe(3);
    expect(to.town).toBe("Lyon");
    expect(to.endCount).toBe(3);
  });

  it("counts intra-zone trips on the zone instead of creating a flow", () => {
    const intra = trip({
      journey_end_lat: 48.9,
      journey_end_lon: 2.4,
      journey_end_town: "Saint-Denis",
    });
    const model = buildFlowModel([intra], 1);

    expect(model.flows).toHaveLength(0);
    expect([...model.zones.values()][0].intraCount).toBe(1);
  });

  it("sorts flows by descending count and handles missing end coords", () => {
    const trips = [
      trip({ journey_id: "a" }),
      trip({ journey_id: "b" }),
      trip({
        journey_id: "c",
        journey_end_lat: 43.6,
        journey_end_lon: 1.44,
        journey_end_town: "Toulouse",
      }),
      trip({ journey_id: "d", journey_end_lat: undefined, journey_end_lon: undefined }),
    ];
    const model = buildFlowModel(trips, 1);

    expect(model.flows.map((f) => f.count)).toEqual([2, 1]);
  });
});

describe("cellSizeForZoom", () => {
  it("halves per zoom level and clamps", () => {
    expect(cellSizeForZoom(6)).toBeCloseTo(90 / 64);
    expect(cellSizeForZoom(7)).toBeCloseTo(90 / 128);
    expect(cellSizeForZoom(2)).toBe(cellSizeForZoom(4));
    expect(cellSizeForZoom(18)).toBe(cellSizeForZoom(14));
  });
});

describe("arcPoints", () => {
  it("starts and ends at the zone centers and bows off the straight line", () => {
    const arc = arcPoints([0, 0], [0, 10]);
    expect(arc[0]).toEqual([0, 0]);
    expect(arc[arc.length - 1]).toEqual([0, 10]);
    // Midpoint must be offset from the straight segment (the bow)
    const mid = arc[Math.floor(arc.length / 2)];
    expect(Math.abs(mid[0])).toBeGreaterThan(0.1);
  });
});
