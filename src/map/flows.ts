import { Trip } from "../types";

/**
 * Flow-map model: trips are binned into grid "zones" (one cell per area at
 * the current zoom); trips between two zones aggregate into a single "flow"
 * with a count. This is what makes origin-destination data readable at any
 * zoom — 500 individual Paris→Orly lines become one thick arc.
 */

export interface FlowZone {
  key: string;
  lat: number; // centroid of the zone's trip endpoints
  lon: number;
  startCount: number; // trips departing from this zone
  endCount: number; // trips arriving into this zone
  intraCount: number; // trips fully inside the zone (not drawn as arcs)
  town: string | null; // most frequent town name, used as the zone label
}

export interface Flow {
  key: string;
  from: string; // zone key
  to: string; // zone key
  count: number;
  sumDistance: number; // meters
}

export interface FlowModel {
  zones: Map<string, FlowZone>;
  /** Sorted by count, descending */
  flows: Flow[];
  cellSize: number; // degrees
}

/** Grid cell size (degrees) for a zoom level, clamped to sane bounds. */
export function cellSizeForZoom(zoom: number): number {
  const z = Math.min(14, Math.max(4, Math.round(zoom)));
  return 90 / 2 ** z;
}

interface ZoneAcc {
  sumLat: number;
  sumLon: number;
  n: number;
  startCount: number;
  endCount: number;
  intraCount: number;
  towns: Map<string, number>;
}

export function buildFlowModel(trips: Trip[], cellSize: number): FlowModel {
  const zoneAcc = new Map<string, ZoneAcc>();
  const flowAcc = new Map<string, Flow>();

  const cellKey = (lat: number, lon: number): string =>
    `${Math.floor(lat / cellSize)}:${Math.floor(lon / cellSize)}`;

  const accumulate = (
    key: string,
    lat: number,
    lon: number,
    town: string | undefined,
    kind: "start" | "end"
  ): ZoneAcc => {
    let zone = zoneAcc.get(key);
    if (!zone) {
      zone = {
        sumLat: 0,
        sumLon: 0,
        n: 0,
        startCount: 0,
        endCount: 0,
        intraCount: 0,
        towns: new Map(),
      };
      zoneAcc.set(key, zone);
    }
    zone.sumLat += lat;
    zone.sumLon += lon;
    zone.n++;
    if (kind === "start") zone.startCount++;
    else zone.endCount++;
    if (town) zone.towns.set(town, (zone.towns.get(town) ?? 0) + 1);
    return zone;
  };

  for (const trip of trips) {
    const fromKey = cellKey(trip.journey_start_lat, trip.journey_start_lon);
    const fromZone = accumulate(
      fromKey,
      trip.journey_start_lat,
      trip.journey_start_lon,
      trip.journey_start_town,
      "start"
    );

    if (trip.journey_end_lat === undefined || trip.journey_end_lon === undefined) {
      continue;
    }

    const toKey = cellKey(trip.journey_end_lat, trip.journey_end_lon);
    accumulate(
      toKey,
      trip.journey_end_lat,
      trip.journey_end_lon,
      trip.journey_end_town,
      "end"
    );

    if (toKey === fromKey) {
      fromZone.intraCount++;
      continue;
    }

    const flowKey = `${fromKey}|${toKey}`;
    const flow = flowAcc.get(flowKey);
    if (flow) {
      flow.count++;
      flow.sumDistance += trip.journey_distance;
    } else {
      flowAcc.set(flowKey, {
        key: flowKey,
        from: fromKey,
        to: toKey,
        count: 1,
        sumDistance: trip.journey_distance,
      });
    }
  }

  const zones = new Map<string, FlowZone>();
  for (const [key, acc] of zoneAcc) {
    let town: string | null = null;
    let best = 0;
    for (const [name, count] of acc.towns) {
      if (count > best) {
        best = count;
        town = name;
      }
    }
    zones.set(key, {
      key,
      lat: acc.sumLat / acc.n,
      lon: acc.sumLon / acc.n,
      startCount: acc.startCount,
      endCount: acc.endCount,
      intraCount: acc.intraCount,
      town,
    });
  }

  const flows = [...flowAcc.values()].sort((a, b) => b.count - a.count);
  return { zones, flows, cellSize };
}

/**
 * Curved arc between two zones, sampled as polyline points. The arc bows to
 * the right of the travel direction (flow-map convention), so A→B and B→A
 * don't overlap and the bow itself encodes direction.
 */
export function arcPoints(
  from: [number, number],
  to: [number, number],
  samples = 12
): [number, number][] {
  const [lat1, lon1] = from;
  const [lat2, lon2] = to;
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const len = Math.hypot(dLat, dLon) || 1e-9;

  // Perpendicular pointing to the right of the direction of travel
  // (screen coords: lat is up, lon is right)
  const perpLat = -dLon / len;
  const perpLon = dLat / len;
  const bow = len * 0.18;

  const cLat = lat1 + dLat / 2 + perpLat * bow;
  const cLon = lon1 + dLon / 2 + perpLon * bow;

  const points: [number, number][] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const mt = 1 - t;
    points.push([
      mt * mt * lat1 + 2 * mt * t * cLat + t * t * lat2,
      mt * mt * lon1 + 2 * mt * t * cLon + t * t * lon2,
    ]);
  }
  return points;
}

/**
 * Small arrowhead (a "V") placed just past the middle of the arc, pointing
 * along the direction of travel.
 */
export function arrowPoints(arc: [number, number][]): [number, number][] {
  const i = Math.floor(arc.length * 0.55);
  const tip = arc[i];
  const prev = arc[i - 1];

  const dLat = tip[0] - prev[0];
  const dLon = tip[1] - prev[1];
  const len = Math.hypot(dLat, dLon) || 1e-9;
  const uLat = dLat / len;
  const uLon = dLon / len;
  const perpLat = -uLon;
  const perpLon = uLat;

  // Arrow size relative to the whole arc's span
  const span = Math.hypot(arc[arc.length - 1][0] - arc[0][0], arc[arc.length - 1][1] - arc[0][1]);
  const s = span * 0.06;

  return [
    [tip[0] - uLat * s + perpLat * s * 0.7, tip[1] - uLon * s + perpLon * s * 0.7],
    tip,
    [tip[0] - uLat * s - perpLat * s * 0.7, tip[1] - uLon * s - perpLon * s * 0.7],
  ];
}
