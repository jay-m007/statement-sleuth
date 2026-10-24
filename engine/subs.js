// Finds repeating payments (subscriptions) and predicts when the next one is due.
import { addDays, addMonths, daysBetween, toDate } from "./dates.js";
import { round2 } from "./csv.js";

// Known services: keyword -> display name + category. Matching is on the cleaned description.
export const KNOWN = [
  ["netflix", "Netflix", "Video"], ["hotstar", "JioHotstar", "Video"], ["jiohotstar", "JioHotstar", "Video"],
  ["prime video", "Amazon Prime", "Video"], ["amazon prime", "Amazon Prime", "Video"], ["primevideo", "Amazon Prime", "Video"],
  ["sonyliv", "SonyLIV", "Video"], ["zee5", "ZEE5", "Video"], ["disney", "Disney+", "Video"], ["hulu", "Hulu", "Video"],
  ["youtube premium", "YouTube Premium", "Video"], ["youtubepremium", "YouTube Premium", "Video"], ["hbo", "HBO Max", "Video"],
  ["spotify", "Spotify", "Music"], ["gaana", "Gaana", "Music"], ["jiosaavn", "JioSaavn", "Music"], ["wynk", "Wynk", "Music"],
  ["apple music", "Apple Music", "Music"], ["deezer", "Deezer", "Music"], ["audible", "Audible", "Music"],
  ["icloud", "iCloud", "Cloud"], ["google one", "Google One", "Cloud"], ["google storage", "Google One", "Cloud"],
  ["dropbox", "Dropbox", "Cloud"], ["onedrive", "OneDrive", "Cloud"],
  ["chatgpt", "ChatGPT", "Software"], ["openai", "ChatGPT", "Software"], ["claude.ai", "Claude", "Software"], ["anthropic", "Claude", "Software"],
  ["adobe", "Adobe", "Software"], ["canva", "Canva", "Software"], ["notion", "Notion", "Software"], ["github", "GitHub", "Software"],
  ["microsoft 365", "Microsoft 365", "Software"], ["office 365", "Microsoft 365", "Software"], ["msft", "Microsoft", "Software"],
  ["linkedin", "LinkedIn Premium", "Software"], ["coursera", "Coursera", "Learning"], ["udemy", "Udemy", "Learning"], ["duolingo", "Duolingo", "Learning"],
  ["jio", "Jio", "Phone & internet"], ["airtel", "Airtel", "Phone & internet"], ["vodafone", "Vi", "Phone & internet"], ["bsnl", "BSNL", "Phone & internet"],
  ["cult.fit", "Cult.fit", "Fitness"], ["cultfit", "Cult.fit", "Fitness"], ["gym", "Gym", "Fitness"], ["fitness", "Fitness", "Fitness"],
  ["times prime", "Times Prime", "News"], ["nytimes", "New York Times", "News"], ["the hindu", "The Hindu", "News"], ["medium", "Medium", "News"],
  ["swiggy one", "Swiggy One", "Food"], ["zomato gold", "Zomato Gold", "Food"], ["zomato", "Zomato", "Food"],
  ["playstation", "PlayStation", "Gaming"], ["xbox", "Xbox", "Gaming"], ["steam", "Steam", "Gaming"], ["nintendo", "Nintendo", "Gaming"],
];

const NOISE = /\b(upi|pos|ach|ecs|nach|imps|neft|ib|bill\s*pay|billpay|autopay|auto\s*debit|si|debit|card|purchase|payment|pmt|txn|ref|no|www|com|in|ltd|pvt|private|limited|inc|llc|india|mumbai|delhi|bangalore|bengaluru|recurring|subscription|sub|mandate|e-?mandate|dr|cr|vpa|ybl|okaxis|okhdfcbank|oksbi|okicici|paytm|apl|axl|ibl)\b/gi;

/** Reduce a bank description to a stable merchant key, e.g. "UPI/4021/NETFLIX.COM/ref" -> "netflix". */
export function merchantKey(desc) {
  const low = String(desc).toLowerCase();
  for (const [kw, name] of KNOWN) if (low.includes(kw)) return "known:" + name;
  const cleaned = low
    .replace(/[0-9]+/g, " ").replace(/[\/*#@_\-.,:;()]+/g, " ")
    .replace(NOISE, " ").replace(/\s+/g, " ").trim();
  const words = cleaned.split(" ").filter((w) => w.length > 1).slice(0, 2);
  return words.length ? "raw:" + words.join(" ") : "";
}

function titleCase(s) { return s.replace(/\b\w/g, (c) => c.toUpperCase()); }

const CADENCES = [
  { id: "weekly", label: "weekly", min: 6, max: 8, perYear: 52 },
  { id: "monthly", label: "monthly", min: 26, max: 35, perYear: 12 },
  { id: "quarterly", label: "every 3 months", min: 84, max: 97, perYear: 4 },
  { id: "yearly", label: "yearly", min: 350, max: 380, perYear: 1 },
];

function median(xs) { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

/** Next due date on or after asOf, stepping from the last charge by the cadence. */
export function nextDue(lastDate, cadenceId, asOf) {
  let d = lastDate, guard = 0;
  const step = (x, n) => cadenceId === "weekly" ? addDays(x, 7 * n)
    : cadenceId === "monthly" ? addMonths(x, n, toDate(lastDate).getUTCDate())
    : cadenceId === "quarterly" ? addMonths(x, 3 * n, toDate(lastDate).getUTCDate())
    : addMonths(x, 12 * n, toDate(lastDate).getUTCDate());
  let k = 1;
  d = step(lastDate, k);
  while (d < asOf && guard++ < 600) d = step(lastDate, ++k);
  return d;
}

/**
 * Detect subscriptions in transactions.
 * asOf: the date to compute "next due" from (default: last transaction date).
 */
export function findSubscriptions(txns, asOf) {
  const out = txns.filter((t) => t.amount < 0);
  const endDate = txns.length ? txns[txns.length - 1].date : asOf;
  asOf = asOf || endDate;
  const groups = new Map();
  for (const t of out) {
    const key = merchantKey(t.desc);
    if (!key) continue;
    (groups.get(key) || groups.set(key, []).get(key)).push(t);
  }
  const subs = [];
  for (const [key, list] of groups) {
    const known = key.startsWith("known:");
    if (list.length < 2) continue;
    // collapse same-day duplicates (two charges the same day are not a cycle)
    const byDay = [];
    for (const t of list) if (!byDay.length || byDay[byDay.length - 1].date !== t.date) byDay.push(t);
    if (byDay.length < 2) continue;
    const gaps = [];
    for (let i = 1; i < byDay.length; i++) gaps.push(daysBetween(byDay[i - 1].date, byDay[i].date));
    const mid = median(gaps);
    const cad = CADENCES.find((c) => mid >= c.min && mid <= c.max);
    if (!cad) continue;
    const inBand = gaps.filter((g) => g >= cad.min - 3 && g <= cad.max + 3).length / gaps.length;
    if (inBand < 0.6) continue;
    const amounts = byDay.map((t) => Math.abs(t.amount));
    const amtMid = median(amounts);
    const steady = amounts.filter((a) => Math.abs(a - amtMid) <= amtMid * 0.15).length / amounts.length;
    // Unknown merchants must repeat with a steady amount (rules out groceries, fuel, food delivery).
    if (!known && (byDay.length < 3 || steady < 0.7)) continue;
    const last = byDay[byDay.length - 1];
    const prev = byDay[byDay.length - 2];
    const lastAmt = Math.abs(last.amount), prevAmt = Math.abs(prev.amount);
    const info = known ? KNOWN.find((k) => k[1] === key.slice(6)) : null;
    const name = known ? info[1] : titleCase(key.slice(4));
    const due = nextDue(last.date, cad.id, asOf);
    const graceDays = Math.ceil(cad.max * 0.35) + 5;
    const stopped = daysBetween(last.date, endDate) > cad.max + graceDays;
    subs.push({
      key, name, category: known ? info[2] : "Recurring payment", known,
      cadence: cad.id, cadenceLabel: cad.label,
      amount: round2(lastAmt), count: byDay.length, lastDate: last.date, firstDate: byDay[0].date,
      nextDue: stopped ? null : due, stopped,
      yearly: round2(lastAmt * cad.perYear), monthly: round2((lastAmt * cad.perYear) / 12),
      priceChange: Math.abs(lastAmt - prevAmt) > 0.5 && Math.abs(lastAmt - prevAmt) / prevAmt > 0.03
        ? { from: round2(prevAmt), to: round2(lastAmt), date: last.date } : null,
      confidence: known ? "high" : steady >= 0.9 && byDay.length >= 4 ? "high" : "medium",
      descs: [...new Set(byDay.map((t) => t.desc))].slice(0, 3),
    });
  }
  subs.sort((a, b) => (a.stopped - b.stopped) || (a.nextDue || "9") .localeCompare(b.nextDue || "9"));
  return subs;
}

/** Plain-language observations about the whole list. */
export function subscriptionInsights(subs, fmt = (n) => n) {
  const active = subs.filter((s) => !s.stopped);
  const notes = [];
  const byCat = {};
  for (const s of active) (byCat[s.category] = byCat[s.category] || []).push(s);
  for (const [cat, list] of Object.entries(byCat)) {
    if (list.length >= 2 && ["Video", "Music", "Cloud"].includes(cat)) {
      const total = round2(list.reduce((a, s) => a + s.monthly, 0));
      notes.push(`You pay for ${list.length} ${cat.toLowerCase()} services (${list.map((s) => s.name).join(", ")}), about ${fmt(total)} a month together. Check whether you use all of them.`);
    }
  }
  for (const s of active) if (s.priceChange) notes.push(`${s.name} went from ${fmt(s.priceChange.from)} to ${fmt(s.priceChange.to)}.`);
  const stopped = subs.filter((s) => s.stopped);
  if (stopped.length) notes.push(`${stopped.map((s) => s.name).join(", ")} ${stopped.length > 1 ? "have" : "has"} not charged recently. They may be cancelled, or the payment may be failing.`);
  return notes;
}

export function subscriptionTotals(subs) {
  const active = subs.filter((s) => !s.stopped);
  return {
    active: active.length,
    monthly: round2(active.reduce((a, s) => a + s.monthly, 0)),
    yearly: round2(active.reduce((a, s) => a + s.yearly, 0)),
  };
}

/** Which reminders are due now? lead = days before. Returns [{sub, daysLeft}] sorted soonest first. */
export function upcoming(subs, today, lead = 3) {
  return subs.filter((s) => !s.stopped && s.nextDue)
    .map((s) => ({ sub: s, daysLeft: daysBetween(today, s.nextDue) }))
    .filter((x) => x.daysLeft >= 0 && x.daysLeft <= lead)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
