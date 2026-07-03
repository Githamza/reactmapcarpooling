import { useEffect, useRef, useState } from "react";
import Supercluster from "supercluster";
import { Trip } from "../types";
import { MIN_ZOOM_FOR_TRIPS } from "../config";

export interface TripPointProps {
  tripIndex: number;
  isEnd: boolean;
}

export type TripIndex = Supercluster<TripPointProps, Supercluster.AnyProps>;

/**
 * The index and the exact trips array it was built from. Consumers must
 * resolve `tripIndex` properties against this snapshot — never against the
 * live tripData, which may already hold a newer (e.g. different-month)
 * array while the throttled index rebuild is still pending.
 */
export interface IndexedTrips {
  index: TripIndex;
  trips: Trip[];
}

export function isClusterFeature(
  feature:
    | Supercluster.ClusterFeature<Supercluster.AnyProps>
    | Supercluster.PointFeature<TripPointProps>
): feature is Supercluster.ClusterFeature<Supercluster.AnyProps> {
  return (
    (feature.properties as Supercluster.ClusterProperties).cluster === true
  );
}

// Building a 100k-point index takes ~100-300 ms; throttle rebuilds while
// batches stream in so the main thread stays responsive.
const REBUILD_INTERVAL_MS = 1500;

/**
 * Spatial index over BOTH endpoints of every trip, used for the
 * individual-trips view (zoom >= MIN_ZOOM_FOR_TRIPS): a trip is found — and
 * its line stays rendered — as long as either its start or its end is in
 * view. Query with getClusters(bbox, zoom>=15), which returns raw points,
 * then dedupe by tripIndex.
 */
export function useTripIndex(trips: Trip[]): IndexedTrips | null {
  const [indexed, setIndexed] = useState<IndexedTrips | null>(null);
  const lastBuildRef = useRef(0);

  useEffect(() => {
    if (trips.length === 0) {
      setIndexed(null);
      return;
    }

    const build = () => {
      lastBuildRef.current = performance.now();
      const sc: TripIndex = new Supercluster({
        radius: 60,
        maxZoom: MIN_ZOOM_FOR_TRIPS - 1,
      });
      const points: Supercluster.PointFeature<TripPointProps>[] = [];
      trips.forEach((trip, i) => {
        points.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [trip.journey_start_lon, trip.journey_start_lat],
          },
          properties: { tripIndex: i, isEnd: false },
        });
        if (
          trip.journey_end_lat !== undefined &&
          trip.journey_end_lon !== undefined
        ) {
          points.push({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [trip.journey_end_lon, trip.journey_end_lat],
            },
            properties: { tripIndex: i, isEnd: true },
          });
        }
      });
      sc.load(points);
      setIndexed({ index: sc, trips });
    };

    const sinceLastBuild = performance.now() - lastBuildRef.current;
    if (sinceLastBuild >= REBUILD_INTERVAL_MS) {
      build();
      return;
    }
    const timer = setTimeout(build, REBUILD_INTERVAL_MS - sinceLastBuild);
    return () => clearTimeout(timer);
  }, [trips]);

  return indexed;
}
