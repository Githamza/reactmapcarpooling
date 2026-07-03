import { DATASET_RESOURCES_URL } from "../config";
import { MonthResource } from "../types";

interface ApiResource {
  id?: string;
  title?: string;
  url?: string;
  checksum?: { value?: string } | null;
}

const MONTHLY_TITLE = /^\d{4}-\d{2}\.csv$/;

/**
 * Keeps only the plain monthly files (ignoring variant exports like
 * "2025-12-sans-covoit-idfm.csv"), newest first. Titles are YYYY-MM.csv,
 * so lexicographic order is chronological. Pure so it can be unit-tested.
 */
export function filterMonthlyResources(
  resources: ApiResource[]
): MonthResource[] {
  const months: MonthResource[] = [];
  for (const resource of resources) {
    const { id, title, url } = resource;
    if (!id || !title || !url || !MONTHLY_TITLE.test(title)) continue;
    months.push({ id, title, url, checksum: resource.checksum?.value ?? null });
  }
  return months.sort((a, b) => b.title.localeCompare(a.title));
}

/**
 * Fetches the dataset's resource list (CORS-open) and returns the monthly
 * files, newest first. Returns [] on any failure — the caller falls back to
 * the cached data or the pinned fallback resource.
 */
export async function fetchMonthlyResources(
  signal?: AbortSignal
): Promise<MonthResource[]> {
  try {
    const response = await fetch(DATASET_RESOURCES_URL, { signal });
    if (!response.ok) return [];
    const json = await response.json();
    return filterMonthlyResources(json?.data ?? []);
  } catch (error) {
    if (signal?.aborted) throw error;
    return [];
  }
}
