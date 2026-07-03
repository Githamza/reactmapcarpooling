import { describe, it, expect, vi, afterEach } from "vitest";
import { streamTrips } from "./streamTrips";
import { parseTripsCsv } from "./parseTrips";
import { Trip } from "../types";

const HEADER =
  '"journey_id";"journey_start_datetime";"journey_start_lon";"journey_start_lat";"journey_start_town";"journey_end_lon";"journey_end_lat";"journey_end_town";"passenger_seats";"operator_class";"journey_distance"';

function makeRow(i: number): string {
  return `"id${i}";"2025-02-01T00:00:00+0100";"3.856";"43.588";"Pérols";"3.877";"43.610";"Montpellier";1;"C";${1000 + i}`;
}

function makeCsv(rows: number): string {
  const lines = [HEADER];
  for (let i = 0; i < rows; i++) lines.push(makeRow(i));
  return lines.join("\n") + "\n";
}

function stubFetchWithChunks(text: string, chunkSize: number): void {
  const bytes = new TextEncoder().encode(text);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) {
        controller.enqueue(bytes.slice(i, i + chunkSize));
      }
      controller.close();
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(stream, { status: 200 }))
  );
}

async function collect(maxRows: number): Promise<{
  trips: Trip[];
  total: number;
}> {
  const trips: Trip[] = [];
  const total = await streamTrips("http://example.test/data.csv", {
    maxRows,
    signal: new AbortController().signal,
    onBatch: (batch) => trips.push(...batch),
  });
  return { trips, total };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("streamTrips", () => {
  it("parses rows split across network chunks (incl. multi-byte UTF-8)", async () => {
    const csv = makeCsv(50);
    // 7-byte chunks split every row, the header, and the 2-byte "é" in Pérols
    stubFetchWithChunks(csv, 7);

    const { trips, total } = await collect(1000);

    expect(total).toBe(50);
    expect(trips).toEqual(parseTripsCsv(csv));
    expect(trips[0].journey_start_town).toBe("Pérols");
  });

  it("handles a missing trailing newline on the last row", async () => {
    stubFetchWithChunks(makeCsv(10).trimEnd(), 64);
    const { total } = await collect(1000);
    expect(total).toBe(10);
  });

  it("stops at maxRows and never emits beyond the cap", async () => {
    stubFetchWithChunks(makeCsv(500), 1024);
    const { trips, total } = await collect(123);

    expect(total).toBe(123);
    expect(trips).toHaveLength(123);
    expect(trips[122].journey_id).toBe("id122");
  });

  it("throws on HTTP errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 503 }))
    );
    await expect(collect(10)).rejects.toThrow("HTTP 503");
  });
});
