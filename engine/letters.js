// Plain-language refund / waiver request letters. No legal claims; just a polite, specific ask.
import { pretty } from "./dates.js";

export function feeLetter(fee, { name = "[Your name]", bank = "[Bank name]", account = "XXXX", currency = "₹" } = {}) {
  const amt = `${currency}${fee.total.toFixed(2)}`;
  const gstNote = fee.gst ? ` (${currency}${fee.amount.toFixed(2)} fee plus ${currency}${fee.gst.toFixed(2)} tax)` : "";
  const first = fee.firstTime
    ? "This is the first time this charge has appeared on my account in the period I checked, and I have otherwise kept my account in good order."
    : "I understand this charge has appeared before. I am asking you to review it again because I would like to keep my account with you.";
  return [
    `Subject: Request to ${fee.id === "annual" ? "waive" : "refund"} a charge of ${amt} on ${pretty(fee.date)}`,
    "",
    `Dear ${bank} Customer Care,`,
    "",
    `I am writing about my account ending ${account}. On ${pretty(fee.date)} a charge of ${amt}${gstNote} was debited with the description "${fee.desc}".`,
    "",
    first,
    "",
    `I request ${fee.ask}. If the charge was applied correctly under my account terms, please tell me which term applies and the date it was last revised. If it cannot be refunded, please tell me what I can do to avoid it in future, such as moving to an account type without this fee.`,
    "",
    "Please reply in writing with a reference number.",
    "",
    "Thank you,",
    name,
    `Account ending ${account}`,
  ].join("\n");
}

export function duplicateLetter(d, { name = "[Your name]", bank = "[Bank name]", account = "XXXX", currency = "₹" } = {}) {
  return [
    `Subject: Possible duplicate charge of ${currency}${d.amount.toFixed(2)}`,
    "",
    `Dear ${bank} Customer Care,`,
    "",
    `My account ending ${account} shows two identical debits of ${currency}${d.amount.toFixed(2)} for "${d.desc}", on ${pretty(d.firstDate)} and ${pretty(d.date)}. I only made one purchase.`,
    "",
    "Please check whether the second debit is a duplicate and, if so, reverse it. Kindly reply in writing with a reference number.",
    "",
    "Thank you,",
    name,
    `Account ending ${account}`,
  ].join("\n");
}
