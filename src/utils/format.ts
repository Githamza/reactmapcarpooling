export function formatNumber(value: number): string {
  return value.toLocaleString("fr-FR");
}

export function formatDistance(meters: number): string {
  const kilometers = meters / 1000;
  return `${kilometers.toLocaleString("fr-FR", {
    maximumFractionDigits: 0,
  })} km`;
}

/** "2026-05.csv" → "mai 2026" (null when the title has no YYYY-MM prefix) */
export function formatMonthFromTitle(title: string): string | null {
  const match = /^(\d{4})-(\d{2})/.exec(title);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatDate(dateString: string): string {
  if (!dateString) return "N/A";

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "Date invalide";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
