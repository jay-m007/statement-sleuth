// Builds an iCalendar (.ics) file: one repeating all-day event per subscription, with alerts before each renewal.
import { addDays } from "./dates.js";

const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** RFC 5545 says lines over 75 octets must be folded. */
function fold(line) {
  const out = [];
  let cur = "", bytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    if (bytes + b > 74) { out.push(cur); cur = " " + ch; bytes = 1 + b; } else { cur += ch; bytes += b; }
  }
  out.push(cur);
  return out.join("\r\n");
}

const compact = (d) => d.replace(/-/g, "");
const RRULE = { weekly: "FREQ=WEEKLY", monthly: "FREQ=MONTHLY", quarterly: "FREQ=MONTHLY;INTERVAL=3", yearly: "FREQ=YEARLY" };

/** All-day events start at 00:00, so an alert at 9am `d` days before is -P(d-1)DT15H; on the day itself it is PT9H. */
export function trigger(daysBefore) {
  if (daysBefore <= 0) return "PT9H";
  return daysBefore === 1 ? "-PT15H" : `-P${daysBefore - 1}DT15H`;
}

export function buildICS(subs, { leadDays = [3, 1], currency = "₹", now = new Date() } = {}) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Statement Sleuth//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Subscription renewals"];
  for (const s of subs) {
    if (!s.nextDue || s.stopped) continue;
    const uid = `${compact(s.nextDue)}-${s.name.replace(/[^a-z0-9]/gi, "").toLowerCase()}@statement-sleuth`;
    lines.push("BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(s.nextDue)}`, `DTEND;VALUE=DATE:${compact(addDays(s.nextDue, 1))}`,
      `RRULE:${RRULE[s.cadence]}`,
      `SUMMARY:${esc(`${s.name} renews: ${currency}${s.amount}`)}`,
      `DESCRIPTION:${esc(`${s.name} charges ${currency}${s.amount} ${s.cadenceLabel}. Cancel before this date if you no longer use it.`)}`,
      "TRANSP:TRANSPARENT");
    for (const d of leadDays) {
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(`${s.name} renews ${d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`}: ${currency}${s.amount}`)}`, `TRIGGER:${trigger(d)}`, "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** A link that opens Google Calendar's "new event" form already filled in. Only used when the person clicks it. */
export function googleCalendarLink(s, currency = "₹") {
  const p = new URLSearchParams({
    action: "TEMPLATE", text: `${s.name} renews: ${currency}${s.amount}`,
    dates: `${compact(s.nextDue)}/${compact(addDays(s.nextDue, 1))}`,
    details: `${s.name} charges ${currency}${s.amount} ${s.cadenceLabel}.`, recur: `RRULE:${RRULE[s.cadence]}`,
  });
  return "https://calendar.google.com/calendar/render?" + p.toString();
}
