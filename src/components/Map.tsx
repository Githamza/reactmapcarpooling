import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Polyline,
  Popup,
  useMapEvents,
} from "react-leaflet";
import { LatLngBounds, PathOptions } from "leaflet";
import { useTripData } from "../contexts/TripDataContext";
import {
  formatDate,
  formatDistance,
  formatMonthFromTitle,
  formatNumber,
} from "../utils/format";
import { useTripIndex, isClusterFeature } from "../hooks/useTripIndex";
import {
  buildFlowModel,
  cellSizeForZoom,
  arcPoints,
  arrowPoints,
  Flow,
  FlowModel,
  FlowZone,
} from "../map/flows";
import {
  MIN_ZOOM_FOR_TRIPS,
  MAX_VISIBLE_TRIPS,
  MAX_VISIBLE_FLOWS,
} from "../config";
import {
  MapProps,
  MapEventHandlerProps,
  TripPopupProps,
  Trip,
  SelectedZone,
} from "../types";
import teamWheelsLogo from "../assets/images/logo.png";

// Center of France for initial map view
const DEFAULT_CENTER: [number, number] = [46.603354, 1.888334];
const DEFAULT_ZOOM = 6;

const FLOW_COLOR = "#3b82f6";
const FLOW_IN_COLOR = "#ff3388"; // incoming flows when a zone is isolated

// A flow ready to render: endpoints resolved, arc + arrowhead sampled
interface FlowArc {
  flow: Flow;
  fromZone: FlowZone;
  toZone: FlowZone;
  positions: [number, number][][]; // [arc, arrowhead]
}

// The single controlled popup — content components mount only when open
type OpenPopup =
  | {
      kind: "trip";
      trip: Trip;
      isEndPoint: boolean;
      position: [number, number];
    }
  | { kind: "flow"; arc: FlowArc; position: [number, number] };

// Component to track map events and bounds
const MapEventHandler: React.FC<MapEventHandlerProps> = ({
  onBoundsChange,
  onZoomChange,
  onBackgroundClick,
}) => {
  const map = useMapEvents({
    moveend: () => {
      onBoundsChange(map.getBounds());
    },
    zoomend: () => {
      onZoomChange(map.getZoom());
    },
    // Only reaches the map when the click misses every interactive layer —
    // markers/arcs/lines set bubblingMouseEvents: false
    click: () => {
      onBackgroundClick();
    },
  });

  // Initialize bounds/zoom on mount — Leaflet's "load" event has already
  // fired by the time this handler is attached
  useEffect(() => {
    onBoundsChange(map.getBounds());
    onZoomChange(map.getZoom());
  }, [map, onBoundsChange, onZoomChange]);

  return null;
};

// Popup content for an individual trip
const TripPopup: React.FC<TripPopupProps> = ({ trip, isEndPoint }) => {
  return (
    <div className="popup-content">
      <h3>{isEndPoint ? "Destination" : "Départ"}</h3>
      {isEndPoint
        ? trip.journey_end_town && (
            <p className="font-medium text-blue-700">{trip.journey_end_town}</p>
          )
        : trip.journey_start_town && (
            <p className="font-medium text-blue-700">
              {trip.journey_start_town}
            </p>
          )}
      <p>
        <strong>Date:</strong> {formatDate(trip.datetime)}
      </p>
      <p>
        <strong>Distance:</strong> {formatDistance(trip.journey_distance)}
      </p>
      {!isEndPoint && trip.journey_end_town && (
        <p>
          <strong>Destination:</strong> {trip.journey_end_town}
        </p>
      )}
      {isEndPoint && trip.journey_start_town && (
        <p>
          <strong>Origine:</strong> {trip.journey_start_town}
        </p>
      )}
      {trip.operator_class && (
        <p>
          <strong>Classe d'opérateur:</strong> {trip.operator_class}
        </p>
      )}
      {trip.passenger_seats > 0 && (
        <p>
          <strong>Passagers:</strong> {trip.passenger_seats}
        </p>
      )}
    </div>
  );
};

// Popup content for a flow arc
const FlowPopup: React.FC<{ arc: FlowArc }> = ({ arc }) => {
  const { flow, fromZone, toZone } = arc;
  const avgDistance = flow.sumDistance / flow.count;

  return (
    <div className="popup-content">
      <h3 className="text-base font-bold mb-1">
        {fromZone.town ?? "Zone"} → {toZone.town ?? "Zone"}
      </h3>
      <p>
        <strong>Trajets:</strong> {formatNumber(flow.count)}
      </p>
      {avgDistance > 0 && (
        <p>
          <strong>Distance moyenne:</strong> {formatDistance(avgDistance)}
        </p>
      )}
    </div>
  );
};

// Top destination towns for a zone — merged by town name, since adjacent grid
// cells can share the same town. (Plain object because `Map` is shadowed.)
const topDestinationsForZone = (
  model: FlowModel,
  zoneKey: string
): { town: string; count: number }[] => {
  const byTown: Record<string, number> = {};
  for (const flow of model.flows) {
    if (flow.from !== zoneKey) continue;
    const town = model.zones.get(flow.to)?.town ?? "Zone voisine";
    byTown[town] = (byTown[town] ?? 0) + flow.count;
  }
  return Object.entries(byTown)
    .map(([town, count]) => ({ town, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
};

interface MapContentProps {
  zones: FlowZone[];
  arcs: FlowArc[];
  isolatedZoneKey: string | null;
  visibleTrips: Trip[];
  showIndividualTrips: boolean;
  selectedTrip: Trip | null;
  onTripClick: (trip: Trip) => void;
  onOpenPopup: (popup: OpenPopup) => void;
  onZoneSelect: (zone: FlowZone) => void;
}

// Memoized map content component — markers carry no mounted popups
const MapContent: React.FC<MapContentProps> = React.memo(
  ({
    zones,
    arcs,
    isolatedZoneKey,
    visibleTrips,
    showIndividualTrips,
    selectedTrip,
    onTripClick,
    onOpenPopup,
    onZoneSelect,
  }) => {
    // The flow layer stays mounted at street-level zoom while a zone is
    // isolated, so its (frozen) flows remain visible over individual trips
    const showFlowLayer = !showIndividualTrips || isolatedZoneKey !== null;

    return (
      <>
        {/* Flow arcs — while isolated, only the selected zone's flows are
            passed in, so no dimming is needed here */}
        {showFlowLayer &&
          arcs.map((arc) => {
            const { flow } = arc;
            const incoming = flow.to === isolatedZoneKey;

            const weight = 1 + Math.min(6, Math.log2(flow.count));
            const options: PathOptions = {
              bubblingMouseEvents: false,
              color: incoming ? FLOW_IN_COLOR : FLOW_COLOR,
              weight,
              opacity: isolatedZoneKey
                ? 0.85
                : flow.count === 1
                ? 0.3
                : 0.55,
            };

            return (
              <Polyline
                key={flow.key}
                positions={arc.positions}
                pathOptions={options}
                eventHandlers={{
                  click: () => {
                    const mid =
                      arc.positions[0][Math.floor(arc.positions[0].length / 2)];
                    onOpenPopup({ kind: "flow", arc, position: mid });
                  },
                }}
              />
            );
          })}

        {/* Zone bubbles — while isolated, only the selected zone and its
            connected destinations are passed in; soften the destinations so
            the selected zone stands out but they stay readable */}
        {showFlowLayer &&
          zones.map((zone) => {
            const activity = zone.startCount + zone.endCount;
            const radius = Math.max(5, Math.min(20, Math.log(activity) * 2.6));
            const intensity = Math.min(255, Math.log(activity) * 18);
            const connected =
              isolatedZoneKey !== null && zone.key !== isolatedZoneKey;

            const options: PathOptions = {
              bubblingMouseEvents: false,
              fillColor: `rgb(${intensity}, 0, ${255 - intensity})`,
              color: "#fff",
              weight: 1,
              opacity: connected ? 0.6 : 0.9,
              fillOpacity: connected ? 0.45 : 0.75,
            };

            return (
              <CircleMarker
                key={zone.key}
                center={[zone.lat, zone.lon]}
                radius={radius}
                pathOptions={options}
                eventHandlers={{
                  click: () => {
                    onZoneSelect(zone);
                  },
                }}
              />
            );
          })}

        {/* Individual trips (street-level zoom). A selected trip stays
            rendered at ANY zoom so it can be analyzed while zooming/panning
            between its départ and arrivée. */}
        {(showIndividualTrips
          ? visibleTrips
          : selectedTrip
          ? [selectedTrip]
          : []
        ).map((trip) => {
            const isSelected =
              selectedTrip !== null &&
              selectedTrip.journey_id === trip.journey_id;

            const startMarkerOptions: PathOptions = {
              bubblingMouseEvents: false,
              fillColor: isSelected ? "#30c0ff" : "#3388ff",
              color: "#fff",
              weight: 1,
              opacity: 1,
              fillOpacity: isSelected ? 1 : 0.8,
            };

            const endMarkerOptions: PathOptions = {
              bubblingMouseEvents: false,
              fillColor: isSelected ? "#ff30c0" : "#ff3388",
              color: "#fff",
              weight: 1,
              opacity: 1,
              fillOpacity: isSelected ? 1 : 0.8,
            };

            const lineOptions: PathOptions = {
              bubblingMouseEvents: false,
              color: isSelected ? "#30c0ff" : "#3388ff",
              weight: isSelected ? 4 : 2,
              opacity: isSelected ? 0.8 : 0.5,
            };

            const hasEnd =
              trip.journey_end_lat !== undefined &&
              trip.journey_end_lon !== undefined;

            return (
              <React.Fragment key={trip.journey_id}>
                <CircleMarker
                  center={[trip.journey_start_lat, trip.journey_start_lon]}
                  radius={isSelected ? 7 : 5}
                  pathOptions={startMarkerOptions}
                  eventHandlers={{
                    click: () => {
                      onTripClick(trip);
                      onOpenPopup({
                        kind: "trip",
                        trip,
                        isEndPoint: false,
                        position: [
                          trip.journey_start_lat,
                          trip.journey_start_lon,
                        ],
                      });
                    },
                  }}
                />

                {hasEnd && (
                  <>
                    <Polyline
                      positions={[
                        [trip.journey_start_lat, trip.journey_start_lon],
                        [trip.journey_end_lat!, trip.journey_end_lon!],
                      ]}
                      pathOptions={lineOptions}
                      eventHandlers={{
                        click: () => onTripClick(trip),
                      }}
                    />

                    <CircleMarker
                      center={[trip.journey_end_lat!, trip.journey_end_lon!]}
                      radius={isSelected ? 5 : 3}
                      pathOptions={endMarkerOptions}
                      eventHandlers={{
                        click: () => {
                          onTripClick(trip);
                          onOpenPopup({
                            kind: "trip",
                            trip,
                            isEndPoint: true,
                            position: [
                              trip.journey_end_lat!,
                              trip.journey_end_lon!,
                            ],
                          });
                        },
                      }}
                    />
                  </>
                )}
              </React.Fragment>
            );
          })}
      </>
    );
  }
);

const Map: React.FC<MapProps> = ({ onStatsChange, onSelectedZoneChange }) => {
  const {
    tripData,
    progress,
    selectedTrip,
    dataTitle,
    availableMonths,
    selectTrip,
    clearSelectedTrip,
    selectMonth,
  } = useTripData();

  const [currentZoom, setCurrentZoom] = useState<number>(DEFAULT_ZOOM);
  const [currentBounds, setCurrentBounds] = useState<LatLngBounds | null>(null);
  const [openPopup, setOpenPopup] = useState<OpenPopup | null>(null);
  // Selecting a zone FREEZES the clustering: the flow model keeps being built
  // at the zoom bucket captured here, so the selected cluster and its flows
  // (same trips, same counts) stay identical while the user zooms/pans.
  const [isolated, setIsolated] = useState<{
    key: string;
    bucket: number;
  } | null>(null);
  const isolatedZoneKey = isolated?.key ?? null;

  const indexed = useTripIndex(tripData);

  const handleZoomChange = useCallback((zoom: number) => {
    setCurrentZoom(zoom);
  }, []);

  const handleBoundsChange = useCallback((bounds: LatLngBounds) => {
    setCurrentBounds(bounds);
  }, []);

  const showIndividualTrips = currentZoom >= MIN_ZOOM_FOR_TRIPS;

  // Flow model: recomputed only when the data or the zoom bucket changes —
  // panning just filters it
  const zoomBucket = Math.min(
    MIN_ZOOM_FOR_TRIPS - 1,
    Math.max(4, Math.round(currentZoom))
  );

  // While a zone is isolated the model is pinned to the bucket captured at
  // selection time — zooming rescales the SAME clusters instead of
  // re-aggregating them — and it keeps being built even at street-level zoom
  // so the isolated flows stay visible over the individual trips.
  const effectiveBucket = isolated?.bucket ?? zoomBucket;
  const modelDisabled = showIndividualTrips && isolated === null;

  const flowModel = useMemo(() => {
    if (tripData.length === 0 || modelDisabled) return null;
    return buildFlowModel(tripData, cellSizeForZoom(effectiveBucket));
  }, [tripData, effectiveBucket, modelDisabled]);

  // Arc geometry only changes when the model is rebuilt or dropped — close a
  // flow popup then. Trip popups are anchored to fixed coordinates and
  // survive any zoom change.
  useEffect(() => {
    setOpenPopup((current) =>
      current && current.kind === "flow" ? null : current
    );
  }, [flowModel]);

  // Visible zones + top flows for the current view
  const { visibleZones, visibleArcs, flowTripsInView } = useMemo(() => {
    if (!flowModel || !currentBounds) {
      return {
        visibleZones: [] as FlowZone[],
        visibleArcs: [] as FlowArc[],
        flowTripsInView: 0,
      };
    }

    // Pad the view so flows to just-off-screen zones stay visible
    const bounds = currentBounds.pad(0.5);
    const inView = (zone: FlowZone) => bounds.contains([zone.lat, zone.lon]);

    // Arcs first: when a zone is isolated we keep ALL of its flows regardless
    // of the viewport, so panning away from the selected cluster does not hide
    // its paths. Every zone touched by a kept isolated flow is force-shown too.
    const forcedZoneKeys = new Set<string>();
    if (isolatedZoneKey !== null) forcedZoneKeys.add(isolatedZoneKey);

    const visibleArcs: FlowArc[] = [];
    for (const flow of flowModel.flows) {
      if (visibleArcs.length >= MAX_VISIBLE_FLOWS) break;
      const fromZone = flowModel.zones.get(flow.from);
      const toZone = flowModel.zones.get(flow.to);
      if (!fromZone || !toZone) continue;

      if (isolatedZoneKey !== null) {
        const connected =
          flow.from === isolatedZoneKey || flow.to === isolatedZoneKey;
        if (!connected) continue; // isolation: skip unrelated flows entirely
        // Keep connected flows even when both endpoints are panned off-screen,
        // and make sure their zones render so the destinations stay visible.
        forcedZoneKeys.add(flow.from);
        forcedZoneKeys.add(flow.to);
      } else if (!inView(fromZone) && !inView(toZone)) {
        continue;
      }

      const arc = arcPoints(
        [fromZone.lat, fromZone.lon],
        [toZone.lat, toZone.lon]
      );
      visibleArcs.push({
        flow,
        fromZone,
        toZone,
        positions: [arc, arrowPoints(arc)],
      });
    }

    // While isolated, only the selected zone and the zones its flows touch
    // are drawn — the rest of the (frozen) grid stays hidden.
    const visibleZones: FlowZone[] = [];
    let flowTripsInView = 0;
    for (const zone of flowModel.zones.values()) {
      const shown =
        isolatedZoneKey !== null
          ? forcedZoneKeys.has(zone.key)
          : inView(zone);
      if (!shown) continue;
      visibleZones.push(zone);
      if (inView(zone)) flowTripsInView += zone.startCount;
    }

    return { visibleZones, visibleArcs, flowTripsInView };
  }, [flowModel, currentBounds, isolatedZoneKey]);

  // Details of the selected (isolated) zone, surfaced to the side panel.
  // Selecting a zone == isolating it, so this derives straight from the key.
  const selectedZoneInfo = useMemo<SelectedZone | null>(() => {
    if (isolatedZoneKey === null || !flowModel) return null;
    const zone = flowModel.zones.get(isolatedZoneKey);
    if (!zone) return null;
    return {
      town: zone.town ?? "Zone",
      startCount: zone.startCount,
      endCount: zone.endCount,
      intraCount: zone.intraCount,
      topDestinations: topDestinationsForZone(flowModel, zone.key),
    };
  }, [isolatedZoneKey, flowModel]);

  useEffect(() => {
    onSelectedZoneChange(selectedZoneInfo);
  }, [selectedZoneInfo, onSelectedZoneChange]);

  // Individual trips: queried from BOTH endpoints, so a line stays visible
  // while either end is on screen
  const { visibleTrips, totalTripsInView } = useMemo(() => {
    if (!showIndividualTrips || !indexed || !currentBounds) {
      return { visibleTrips: [] as Trip[], totalTripsInView: 0 };
    }
    const { index, trips: indexedTrips } = indexed;

    const bbox: [number, number, number, number] = [
      currentBounds.getWest(),
      currentBounds.getSouth(),
      currentBounds.getEast(),
      currentBounds.getNorth(),
    ];
    const features = index.getClusters(bbox, Math.round(currentZoom));

    const seen = new Set<number>();
    const trips: Trip[] = [];
    for (const feature of features) {
      if (isClusterFeature(feature)) continue;
      const i = feature.properties.tripIndex;
      if (seen.has(i)) continue;
      seen.add(i);
      const trip = indexedTrips[i];
      if (trip) trips.push(trip);
    }
    const capped = trips.slice(0, MAX_VISIBLE_TRIPS);

    // Keep the selected trip on the map even after the user pans its départ /
    // arrivée out of the viewport (or if it fell past the render cap).
    if (
      selectedTrip &&
      !capped.some((t) => t.journey_id === selectedTrip.journey_id)
    ) {
      capped.push(selectedTrip);
    }

    return {
      visibleTrips: capped,
      totalTripsInView: trips.length,
    };
  }, [showIndividualTrips, indexed, currentBounds, currentZoom, selectedTrip]);

  // Update parent component with stats about the current map view
  useEffect(() => {
    onStatsChange({
      zoom: currentZoom,
      zoneCount: visibleZones.length,
      flowCount: visibleArcs.length,
      tripCount: visibleTrips.length,
      totalTripsInView: showIndividualTrips
        ? totalTripsInView
        : flowTripsInView,
    });
  }, [
    currentZoom,
    visibleZones.length,
    visibleArcs.length,
    visibleTrips.length,
    totalTripsInView,
    flowTripsInView,
    showIndividualTrips,
    onStatsChange,
  ]);

  // Clicking a trip always selects it — deselection happens by clicking the
  // map background (a click also opens the trip's popup, so toggling off here
  // would leave a popup open for a deselected trip)
  const handleTripClick = useCallback(
    (trip: Trip) => {
      selectTrip(trip);
    },
    [selectTrip]
  );

  const handleOpenPopup = useCallback((popup: OpenPopup) => {
    setOpenPopup(popup);
  }, []);

  // Selecting a zone/cluster isolates it (only its flows and destinations are
  // shown) and freezes the clustering at the current bucket. Clicking the
  // same zone again clears the selection; clicking another zone (still a zone
  // of the FROZEN grid) moves the selection within that grid.
  const handleZoneSelect = useCallback((zone: FlowZone) => {
    setIsolated((current) => {
      if (current?.key === zone.key) return null;
      return { key: zone.key, bucket: current?.bucket ?? zoomBucket };
    });
  }, [zoomBucket]);

  // Clicking empty map (outside any zone, arc or trip) is the ONLY implicit
  // way to deselect — zooming and panning never clear a selection.
  const handleBackgroundClick = useCallback(() => {
    setIsolated(null);
    clearSelectedTrip();
    setOpenPopup(null);
  }, [clearSelectedTrip]);

  return (
    <div className="map-wrapper relative w-full h-screen">
      {/* Non-blocking streaming progress pill — the map stays interactive */}
      {!progress.done && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[1500] bg-white/90 rounded-full shadow-md px-4 py-1.5 text-sm font-medium text-gray-700 flex items-center gap-2">
          <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
          {progress.rows === 0
            ? "Chargement des données…"
            : `${formatNumber(progress.rows)} trajets chargés…`}
        </div>
      )}

      {/* Isolation banner — stays up at any zoom while a zone is selected */}
      {isolatedZoneKey !== null && (
        <div className="absolute top-14 left-4 z-[1500] bg-pink-600 text-white rounded-full shadow-md px-4 py-1.5 text-sm font-medium flex items-center gap-2">
          Flux d'une zone isolés
          <button
            type="button"
            onClick={() => setIsolated(null)}
            className="font-bold hover:text-pink-200"
            aria-label="Afficher tous les flux"
          >
            ✕
          </button>
        </div>
      )}

      {/* Source Data Banner with month navigation */}
      <div className="fixed top-0 left-0 right-0 bg-blue-600 text-white px-2 py-1.5 sm:p-2 shadow-xl z-[1000] text-sm sm:text-base font-medium flex items-center justify-center gap-2 flex-wrap">
        <span>Trajets réalisés en covoiturage</span>
        {availableMonths.length > 0 && dataTitle ? (
          <select
            value={dataTitle}
            onChange={(e) => selectMonth(e.target.value)}
            disabled={!progress.done}
            aria-label="Mois des données"
            className="bg-blue-700 text-white text-sm rounded border border-blue-400 px-2 py-1 cursor-pointer disabled:opacity-60 disabled:cursor-wait"
          >
            {availableMonths.map((month) => (
              <option key={month.id} value={month.title}>
                {formatMonthFromTitle(month.title) ?? month.title}
              </option>
            ))}
          </select>
        ) : (
          dataTitle && <span>— {formatMonthFromTitle(dataTitle)}</span>
        )}
        <a
          href="https://www.data.gouv.fr/fr/datasets/trajets-realises-en-covoiturage-registre-de-preuve-de-covoiturage/#/resources"
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-bold hover:text-green-200 ml-1"
        >
          Source
        </a>
      </div>

      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        scrollWheelZoom={true}
        preferCanvas={true}
        fadeAnimation={false}
        className="absolute inset-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapEventHandler
          onBoundsChange={handleBoundsChange}
          onZoomChange={handleZoomChange}
          onBackgroundClick={handleBackgroundClick}
        />

        <MapContent
          zones={visibleZones}
          arcs={visibleArcs}
          isolatedZoneKey={isolatedZoneKey}
          visibleTrips={visibleTrips}
          showIndividualTrips={showIndividualTrips}
          selectedTrip={selectedTrip}
          onTripClick={handleTripClick}
          onOpenPopup={handleOpenPopup}
          onZoneSelect={handleZoneSelect}
        />

        {openPopup && (
          <Popup
            position={openPopup.position}
            eventHandlers={{ remove: () => setOpenPopup(null) }}
          >
            {openPopup.kind === "trip" ? (
              <TripPopup
                trip={openPopup.trip}
                isEndPoint={openPopup.isEndPoint}
              />
            ) : (
              <FlowPopup arc={openPopup.arc} />
            )}
          </Popup>
        )}
      </MapContainer>

      {/* Stats display */}
      <div className="absolute bottom-16 right-3 sm:bottom-5 sm:right-5 bg-white/80 rounded p-2 text-xs sm:text-sm z-10">
        <div>Zoom: {currentZoom}</div>
        <div>
          {showIndividualTrips
            ? `Trajets visibles: ${formatNumber(visibleTrips.length)}` +
              (totalTripsInView > visibleTrips.length
                ? ` / ${formatNumber(totalTripsInView)}`
                : "")
            : `Zones: ${formatNumber(
                visibleZones.length
              )} · Flux: ${formatNumber(visibleArcs.length)}`}
        </div>
      </div>

      {/* Marketing Banner */}
      <div className="fixed bottom-4 left-3 right-3 sm:bottom-5 sm:left-6 sm:right-6 max-w-4xl mx-auto bg-gradient-to-r from-green-600 to-emerald-500 text-white px-4 py-3 sm:px-6 sm:py-4 text-center shadow-xl ring-2 ring-green-300/60 z-[1000] text-sm sm:text-base font-medium rounded-xl flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
        <img
          src={teamWheelsLogo}
          alt="TeamWheels"
          className="h-8 sm:h-10 drop-shadow"
        />
        <span className="hidden sm:inline">
          <span className="font-extrabold">TeamWheels</span> — boostez votre
          politique <span className="font-bold">RH &amp; RSE</span> : déployez un
          covoiturage domicile-travail simple, réduisez votre empreinte carbone
          et fidélisez vos collaborateurs.
        </span>
        <span className="sm:hidden font-bold">
          TeamWheels — covoiturage domicile-travail pour vos équipes RH &amp; RSE
        </span>
        <a
          href="https://www.teamwheelsapp.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-full bg-white px-4 py-1.5 text-sm font-bold text-green-700 shadow-md transition hover:bg-green-50 hover:scale-105"
        >
          Demander une démo →
        </a>
      </div>
    </div>
  );
};

export default Map;
