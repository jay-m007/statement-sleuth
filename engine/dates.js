// Date helpers on "YYYY-MM-DD" strings, all in UTC so results never depend on the machine's timezone.

export function toDate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); }
export function fmt(d) { return d.toISOString().slice(0, 10); }
export function daysBetween(a, b) { return Math.round((toDate(b) - toDate(a)) / 86400000); }
export function addDays(s, n) { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); }

/** Add calendar months, clamping to month end (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(s, n, anchorDay) {
  const d = toDate(s);
  const day = anchorDay || d.getUTCDate();
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return fmt(new Date(Date.UTC(y, m, Math.min(day, last))));
}

/** Today's date on the person's own clock (not UTC, which is a day behind for part of the day in India). */
export function today() {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function pretty(s) { const d = toDate(s); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
export function prettyShort(s) { const d = toDate(s); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; }
