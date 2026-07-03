// RPC open-data dataset on data.gouv.fr (one CSV per month, 300-400 MB each).
// The latest monthly resource is discovered at runtime via the dataset API.
export const DATASET_ID = "5e8ee97c16601da4ee24ffb7";

// CORS-open, paginated newest-first; one page covers ~4 years of months
export const DATASET_RESOURCES_URL = `https://www.data.gouv.fr/api/2/datasets/${DATASET_ID}/resources/?page=1&page_size=50&type=main`;

// Fallback when the dataset API is unreachable (February 2025 file)
export const FALLBACK_RESOURCE_ID = "0a89f315-266b-497f-971b-ca40d1d79cf4";
export const FALLBACK_CSV_URL = `https://www.data.gouv.fr/fr/datasets/r/${FALLBACK_RESOURCE_ID}`;
export const FALLBACK_RESOURCE_TITLE = "2025-02.csv";

// Row cap for the streamed CSV — the fetch is aborted once reached.
// ~720 bytes/row, so 100k rows ≈ 70 MB downloaded.
export const MAX_TRIPS = Number(import.meta.env.VITE_MAX_TRIPS ?? 100_000);

// Hard cap on individually rendered trips in the current viewport
export const MAX_VISIBLE_TRIPS = 1_500;

// Hard cap on rendered flow arcs (top by trip count) to keep the map legible
export const MAX_VISIBLE_FLOWS = 400;

// Zoom level at or above which individual trips replace clusters
export const MIN_ZOOM_FOR_TRIPS = 15;
