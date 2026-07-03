import Papa from "papaparse";
import { Trip } from "../types";
import { CSV_DELIMITER, rowToTrip } from "./parseTrips";

export interface StreamTripsOptions {
  maxRows: number;
  signal: AbortSignal;
  /** Called with each parsed batch as bytes arrive. */
  onBatch: (trips: Trip[], totalSoFar: number) => void;
}

/**
 * Streams the remote CSV and parses it progressively: fetch ReadableStream →
 * TextDecoder → complete lines → PapaParse per slab. The connection is
 * cancelled as soon as maxRows trips have been parsed, so only a few MB of
 * the 300-400 MB file are ever downloaded.
 *
 * Assumes no embedded newlines inside quoted fields (true for the RPC data);
 * slabs are cut at the last newline of each network chunk.
 */
export async function streamTrips(
  url: string,
  { maxRows, signal, onBatch }: StreamTripsOptions
): Promise<number> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  if (!response.body) {
    throw new Error("Streaming non supporté par ce navigateur");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let header: string | null = null;
  let leftover = "";
  let total = 0;

  const parseSlab = (slabBody: string): Trip[] => {
    const result = Papa.parse<Record<string, string>>(
      `${header}\n${slabBody}`,
      {
        header: true,
        delimiter: CSV_DELIMITER,
        skipEmptyLines: true,
      }
    );
    const trips: Trip[] = [];
    for (const row of result.data) {
      const trip = rowToTrip(row);
      if (trip) trips.push(trip);
    }
    return trips;
  };

  const emit = (trips: Trip[]): boolean => {
    if (trips.length === 0) return total < maxRows;
    const capped =
      total + trips.length > maxRows ? trips.slice(0, maxRows - total) : trips;
    total += capped.length;
    onBatch(capped, total);
    return total < maxRows;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        // Flush whatever remains (last line may lack a trailing newline)
        const tail = leftover + decoder.decode();
        if (header !== null && tail.trim()) emit(parseSlab(tail));
        break;
      }

      leftover += decoder.decode(value, { stream: true });
      const cut = leftover.lastIndexOf("\n");
      if (cut === -1) continue;

      let slab = leftover.slice(0, cut);
      leftover = leftover.slice(cut + 1);

      if (header === null) {
        const headerEnd = slab.indexOf("\n");
        if (headerEnd === -1) {
          header = slab;
          continue;
        }
        header = slab.slice(0, headerEnd);
        slab = slab.slice(headerEnd + 1);
      }

      if (slab && !emit(parseSlab(slab))) {
        // Cap reached — stop the download
        await reader.cancel();
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  return total;
}
