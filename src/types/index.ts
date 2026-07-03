import { LatLngBounds } from "leaflet";

// Trip data structure (mapped from the RPC CSV — see src/data/parseTrips.ts)
export interface Trip {
  journey_id: string;
  datetime: string; // journey_start_datetime in the CSV
  journey_start_lat: number;
  journey_start_lon: number;
  journey_start_town?: string;
  journey_end_lat?: number;
  journey_end_lon?: number;
  journey_end_town?: string;
  journey_distance: number; // meters
  operator_class?: string; // A/B/C — the dataset has no operator name column
  passenger_seats: number;
}

// Map stats structure
export interface MapStats {
  zoom: number;
  zoneCount: number;
  flowCount: number;
  tripCount: number;
  totalTripsInView: number;
}

// A destination town of a selected zone, with its trip count
export interface ZoneDestination {
  town: string;
  count: number;
}

// Details of the currently selected zone/cluster, surfaced to the InfoPanel
export interface SelectedZone {
  town: string;
  startCount: number;
  endCount: number;
  intraCount: number;
  topDestinations: ZoneDestination[];
}

// Message structure
export interface Message {
  type: "success" | "error" | "warning" | "info";
  text: string;
}

// Stats structure
export interface Stats {
  totalTrips: number;
  totalDistance: number;
}

// Streaming load progress
export interface LoadProgress {
  rows: number;
  done: boolean;
}

// One monthly CSV file of the RPC dataset
export interface MonthResource {
  id: string;
  title: string; // e.g. "2026-05.csv"
  url: string; // direct static.data.gouv.fr URL
  checksum: string | null;
}

// Context type for TripDataContext
export interface TripDataContextType {
  tripData: Trip[];
  isLoading: boolean;
  progress: LoadProgress;
  message: Message | null;
  stats: Stats;
  selectedTrip: Trip | null;
  /** Title of the monthly source file currently displayed, e.g. "2026-05.csv" */
  dataTitle: string | null;
  /** All available monthly files, newest first */
  availableMonths: MonthResource[];
  selectTrip: (trip: Trip) => void;
  clearSelectedTrip: () => void;
  /** Load a specific month by resource title */
  selectMonth: (title: string) => Promise<void>;
  fetchTripData: () => Promise<void>;
}

// Props types for components
export interface MapProps {
  onStatsChange: (stats: MapStats) => void;
  onSelectedZoneChange: (zone: SelectedZone | null) => void;
}

export interface InfoPanelProps {
  mapStats: MapStats | null;
  selectedZone: SelectedZone | null;
}

export interface MapEventHandlerProps {
  onBoundsChange: (bounds: LatLngBounds) => void;
  onZoomChange: (zoom: number) => void;
  /** Click on the map background (not on any zone/arc/trip) — deselects */
  onBackgroundClick: () => void;
}

export interface TripPopupProps {
  trip: Trip;
  isEndPoint: boolean;
}

export interface MapLegendProps {
  showSelected?: boolean;
}

export interface MessageToastProps {
  type: string;
  text: string;
}
