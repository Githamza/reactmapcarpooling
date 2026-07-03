import { openDB, DBSchema } from "idb";
import { MonthResource, Trip } from "../types";

export interface TripCacheMeta {
  resourceId: string;
  title: string; // e.g. "2026-05.csv" — used for the data-month banner
  checksum: string | null;
  rowCap: number;
  tripCount: number;
  storedAt: number; // epoch ms
}

interface TripCacheSchema extends DBSchema {
  trips: { key: number; value: Trip[] };
  meta: { key: string; value: TripCacheMeta };
}

const DB_NAME = "covoiturage-map";
const META_KEY = "meta";
const BATCH_SIZE = 25_000;
const OFFLINE_TTL_MS = 7 * 24 * 3600 * 1000;

// v2: trips are now filtered to metropolitan France at parse time — clear
// caches written before the filter existed (checksums alone can't tell).
const DB_VERSION = 2;

function getDb() {
  return openDB<TripCacheSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        db.createObjectStore("trips");
        db.createObjectStore("meta");
      } else {
        tx.objectStore("trips").clear();
        tx.objectStore("meta").clear();
      }
    },
  });
}

/**
 * Decides whether the cached trips can be used instead of re-streaming.
 * Pure so it can be unit-tested.
 */
export function isCacheValid(
  meta: TripCacheMeta,
  remote: MonthResource | null,
  maxTrips: number,
  now: number
): boolean {
  // The cache was truncated at a cap lower than what we now want, and the
  // file actually had more rows — refetch to honour the bigger cap.
  if (meta.rowCap < maxTrips && meta.tripCount >= meta.rowCap) return false;

  if (remote) {
    // A newer monthly file (or a republished one) invalidates the cache
    if (meta.resourceId !== remote.id) return false;
    if (remote.checksum) return meta.checksum === remote.checksum;
    return true;
  }

  // Dataset API unreachable — accept a recent cache (graceful offline)
  return now - meta.storedAt < OFFLINE_TTL_MS;
}

export async function readCachedTrips(): Promise<{
  meta: TripCacheMeta;
  trips: Trip[];
} | null> {
  try {
    const db = await getDb();
    const meta = await db.get("meta", META_KEY);
    if (!meta) return null;
    const batches = await db.getAll("trips");
    const trips = batches.flat();
    return trips.length > 0 ? { meta, trips } : null;
  } catch {
    return null; // cache is best-effort
  }
}

export async function writeCachedTrips(
  trips: Trip[],
  meta: TripCacheMeta
): Promise<void> {
  try {
    const db = await getDb();
    await db.clear("trips");
    for (let i = 0; i * BATCH_SIZE < trips.length; i++) {
      await db.put(
        "trips",
        trips.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE),
        i
      );
    }
    await db.put("meta", meta, META_KEY);
  } catch {
    // cache is best-effort — never break loading over a storage error
  }
}
