// Plans the phone notifications for the Android/iOS app. Pure functions: no device code here, so it can be tested in Node.
import { addDays, addMonths, daysBetween, toDate } from "./dates.js";

const STEP = { weekly: (b, k) => addDays(b, 7 * k), monthly: (b, k) => addMonths(b, k, toDate(b).getUTCDate()),
  quarterly: (b, k) => addMonths(b, 3 * k, toDate(b).getUTCDate()), yearly: (b, k) => addMonths(b, 12 * k, toDate(b).getUTCDate()) };

const money = (n, cur) => cur + Number(n).toLocaleString(cur === "₹" ? "en-IN" : "en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
const when = (d) => (d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`);

// Small stable number for a text id (native notification ids must be integers).
export function hashId(text) { let h = 2166136261; for (const c of text) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) % 2147483000 + 1; }

/**
 * Which notifications should be scheduled?
 * plan: [{id, name, amount, cadence, nextDue, remind}]
 * Returns [{id, at: "YYYY-MM-DDTHH:MM:00" (device local time), title, body, subId, lead}] soonest first.
 * Limits: only `horizonDays` ahead and at most `max` (iOS allows 64 pending, Android is generous but there is no need).
 */
export function planNotifications(plan, { today, nowMinutes = 0, leadDays = [3, 1], hour = 9, horizonDays = 90, max = 60, currency = "₹" } = {}) {
  const out = [];
  const leads = [...new Set(leadDays)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 60);
  const slot = hour * 60;
  for (const s of plan || []) {
    if (!s || !s.remind || !s.nextDue || !STEP[s.cadence]) continue;
    for (let k = 0; k < 400; k++) {
      const due = STEP[s.cadence](s.nextDue, k);
      if (daysBetween(today, due) > horizonDays + Math.max(0, ...leads)) break;
      for (const lead of leads) {
        const day = addDays(due, -lead);
        const ahead = daysBetween(today, day);
        if (ahead < 0 || ahead > horizonDays) continue;
        if (ahead === 0 && nowMinutes >= slot) continue; // today's 9 am has already passed
        out.push({
          id: hashId(`${s.id || s.name}|${due}|${lead}`),
          at: `${day}T${String(hour).padStart(2, "0")}:00:00`,
          title: `${s.name} renews ${when(lead)}`,
          body: `${money(s.amount, currency)} ${s.cadence === "weekly" ? "weekly" : s.cadence === "monthly" ? "monthly" : s.cadence === "quarterly" ? "every 3 months" : "yearly"}. Cancel now if you don't want it.`,
          subId: s.id || s.name, lead, due,
        });
      }
    }
  }
  out.sort((a, b) => a.at.localeCompare(b.at) || a.title.localeCompare(b.title));
  const seen = new Set();
  return out.filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true))).slice(0, max);
}
