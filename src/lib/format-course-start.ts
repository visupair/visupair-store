/**
 * Course session label: `02 APR 2026 - 16:45` (day, upper short month, year, hyphen, 24h time).
 * No weekday. Used on course grid + detail.
 */
const LOCALE = "en-GB";

/** Format Sanity `datetime` (ISO). `style` is kept for call-site compatibility and ignored. */
export function formatCourseStartsAt(
  iso: string | undefined | null,
  _style?: "full" | "compact",
): string | null {
  if (iso == null || iso === "") return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const dateFmt = new Intl.DateTimeFormat(LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const parts = dateFmt.formatToParts(d);
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const month = (
    parts.find((p) => p.type === "month")?.value ?? ""
  ).toUpperCase();
  const year = parts.find((p) => p.type === "year")?.value ?? "";

  const timePart = d.toLocaleTimeString(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `${day} ${month} ${year} - ${timePart}`;
}
