/**
 * Estimates the VTV due month for a vehicle based on its plate terminal digit/letter.
 * Uses PBA (Provincia de Buenos Aires) rotation schedule.
 *
 * Terminal → month cycle (semestral: months repeat every 6):
 *  0 → Jan / Jul
 *  1 → Feb / Aug
 *  2 → Mar / Sep
 *  3 → Apr / Oct
 *  4 → May / Nov
 *  5 → Jun / Dec
 *  6 → Jan / Jul  (same as 0)
 *  7 → Feb / Aug
 *  8 → Mar / Sep
 *  9 → Apr / Oct
 *
 * For new-format plates (AB123CD) the terminal character is the last letter.
 * Letters map to digits by their position mod 10 in the alphabet (A=1, B=2, ..., J=0, K=1, ...).
 */

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Terminal digit → 0-based month index (first occurrence in year)
const TERMINAL_TO_MONTH = [0, 1, 2, 3, 4, 5, 0, 1, 2, 3]; // index 0-9

function terminalDigit(plate) {
  const p = plate.toUpperCase().replace(/[-\s]/g, "");
  const last = p[p.length - 1];
  if (/[0-9]/.test(last)) return parseInt(last, 10);
  // Letter → position in alphabet mod 10 (A=1,B=2,...,J=0,K=1,...)
  const pos = last.charCodeAt(0) - 64; // A=1, B=2, ...
  return pos % 10;
}

/**
 * Returns the next estimated VTV due date for the given plate.
 * @param {string} plate
 * @returns {{ month: string, year: number, date: Date } | null}
 */
export function estimateVTVMonth(plate) {
  if (!plate) return null;
  const digit = terminalDigit(plate);
  const baseMonth = TERMINAL_TO_MONTH[digit]; // 0-based

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-based

  // Two occurrences per year: baseMonth and baseMonth+6
  const candidates = [
    new Date(currentYear, baseMonth, 1),
    new Date(currentYear, baseMonth + 6, 1),
    new Date(currentYear + 1, baseMonth, 1),
  ];

  // Pick the next upcoming month (>= today's month start)
  const todayStart = new Date(currentYear, currentMonth, 1);
  const next = candidates.find((d) => d >= todayStart) ?? candidates[candidates.length - 1];

  return {
    month: MONTH_NAMES[next.getMonth()],
    year: next.getFullYear(),
    date: next,
  };
}
