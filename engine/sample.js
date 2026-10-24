// A made-up statement for the demo button and the tests. Dates are built backwards from `today`
// so the demo always has a renewal that is due in a couple of days.
import { addDays, addMonths, toDate } from "./dates.js";

export function sampleStatement(today) {
  const rows = [];
  const add = (date, desc, amount) => rows.push({ date, desc, amount });
  const monthly = (nextDate, desc, amountFn, months = 6) => {
    const day = toDate(nextDate).getUTCDate();
    for (let i = months; i >= 0; i--) {
      const d = addMonths(nextDate, -i, day);
      if (d <= today) add(d, desc, -amountFn(i));
    }
  };
  monthly(addDays(today, 5), "UPI/NETFLIX.COM/netflix@axisbank", () => 649);
  monthly(addDays(today, 2), "SPOTIFY INDIA PVT LTD MUMBAI", () => 119);
  monthly(addDays(today, 9), "GOOGLE YOUTUBEPREMIUM", (i) => (i <= 1 ? 149 : 129));
  monthly(addDays(today, 14), "APPLE.COM/BILL ICLOUD", () => 75);
  monthly(addDays(today, 20), "CULT FIT GYM MEMBERSHIP", () => 1499);
  monthly(addDays(today, 3), "UPI/LANDLORD RAMESH KUMAR/RENT", () => 9000);
  // Hotstar stopped three months ago: should show as "not charging any more".
  monthly(addDays(addMonths(today, -3), -1), "HOTSTAR*DISNEY 4021", () => 299, 3);
  // Every 3 months
  for (const i of [6, 3, 0]) { const d = addMonths(addDays(today, 40), -i); if (d <= today) add(d, "JIO PREPAID RECHARGE", -899); }
  // Salary
  monthly(addDays(today, 6), "NEFT CR SALARY STIPEND ACME LABS", () => -42000);
  // Everyday spending: varies, should NOT look like subscriptions
  const food = [212, 340, 180, 455, 290, 120, 610, 205, 330, 275, 190, 420];
  food.forEach((a, i) => add(addDays(today, -(i * 14) - 3), "UPI/SWIGGY/ORDER", -a));
  [1200, 1850, 640, 2210, 980].forEach((a, i) => add(addDays(today, -(i * 33) - 6), "BIG BAZAAR GROCERY POS", -a));
  [500, 800, 600].forEach((a, i) => add(addDays(today, -(i * 41) - 9), "ATM WDL SBI " + (4000 + i), -a));
  // Duplicate charge
  add(addDays(today, -22), "UPI/ZOMATO/ORDER 77", -389); add(addDays(today, -22), "UPI/ZOMATO/ORDER 77", -389);
  // Fees
  add(addDays(today, -150), "ATM WDL CHG OTHER BANK", -21);
  add(addDays(today, -128), "OVERDRAFT FEE", -500); add(addDays(today, -128), "GST ON OD FEE", -90);
  add(addDays(today, -110), "SMS ALERT CHARGES Q2", -17.7);
  add(addDays(today, -95), "MIN BAL CHARGES - AMB", -236); add(addDays(today, -95), "IGST ON CHARGES", -42.48);
  add(addDays(today, -65), "MIN BAL CHARGES - AMB", -236); add(addDays(today, -65), "IGST ON CHARGES", -42.48);
  add(addDays(today, -52), "SMS ALERT CHARGES Q3", -17.7);
  add(addDays(today, -40), "LATE PAYMENT FEE CREDIT CARD", -750);
  add(addDays(today, -33), "FOREX MARKUP FEE - ADOBE", -118);
  // A fee that was already refunded
  add(addDays(today, -80), "CHEQUE RETURN CHARGES", -354); add(addDays(today, -74), "REFUND OF CHEQUE RETURN CHARGES", 354);

  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let bal = 60000;
  const lines = ["Account Statement", "Account No: XXXXXX4821", "Date,Narration,Debit,Credit,Balance"];
  for (const r of rows) {
    bal += r.amount;
    const [y, m, d] = r.date.split("-");
    lines.push(`${d}/${m}/${y},"${r.desc}",${r.amount < 0 ? (-r.amount).toFixed(2) : ""},${r.amount > 0 ? r.amount.toFixed(2) : ""},${bal.toFixed(2)}`);
  }
  return lines.join("\n") + "\n";
}
