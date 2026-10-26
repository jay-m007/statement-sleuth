import { readStatement } from "./csv.js";
import { findFees, findDuplicates, summariseFees } from "./fees.js";
import { findSubscriptions, subscriptionInsights, subscriptionTotals, upcoming } from "./subs.js";
import { buildICS, googleCalendarLink } from "./ics.js";
import { feeLetter, duplicateLetter } from "./letters.js";
import { today as todayStr } from "./dates.js";

export { buildICS, googleCalendarLink, feeLetter, duplicateLetter, upcoming, readStatement, findSubscriptions, subscriptionTotals, todayStr };
export { planNotifications, hashId } from "./notify.js";
export { readDocument, ACCEPT, SUPPORTED_TEXT } from "./readers/index.js";
export { PdfError } from "./readers/pdf.js";

/** One call for the page: CSV text in, everything out. */
export function analyze(csvTextOrRows, opts = {}) {
  const { txns, skipped, hint } = readStatement(csvTextOrRows, opts);
  const asOf = opts.asOf || todayStr();
  const fees = findFees(txns);
  const subs = findSubscriptions(txns, asOf);
  return {
    txns, skipped, hint, asOf,
    period: { from: txns[0].date, to: txns[txns.length - 1].date },
    fees, feeSummary: summariseFees(fees), duplicates: findDuplicates(txns),
    subs, subTotals: subscriptionTotals(subs), insights: subscriptionInsights(subs),
  };
}
