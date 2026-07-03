import { Trip } from "../types";

// Minimal fallback dataset shown when the remote CSV cannot be loaded at all.
export const SAMPLE_TRIPS: Trip[] = [
  {
    journey_id: "sample1",
    datetime: "2023-05-15T08:30:00Z",
    journey_start_lat: 48.8566,
    journey_start_lon: 2.3522,
    journey_start_town: "Paris",
    journey_end_lat: 45.764,
    journey_end_lon: 4.8357,
    journey_end_town: "Lyon",
    journey_distance: 450000,
    operator_class: "C",
    passenger_seats: 3,
  },
  {
    journey_id: "sample2",
    datetime: "2023-05-15T09:15:00Z",
    journey_start_lat: 43.2965,
    journey_start_lon: 5.3698,
    journey_start_town: "Marseille",
    journey_end_lat: 43.6043,
    journey_end_lon: 1.4437,
    journey_end_town: "Toulouse",
    journey_distance: 320000,
    operator_class: "C",
    passenger_seats: 2,
  },
  {
    journey_id: "sample3",
    datetime: "2023-05-15T10:00:00Z",
    journey_start_lat: 47.2184,
    journey_start_lon: -1.5536,
    journey_start_town: "Nantes",
    journey_end_lat: 44.8378,
    journey_end_lon: -0.5792,
    journey_end_town: "Bordeaux",
    journey_distance: 280000,
    operator_class: "C",
    passenger_seats: 4,
  },
];
