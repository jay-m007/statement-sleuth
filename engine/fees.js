// Finds bank charges in a list of transactions and says how likely a refund request is to work.
import { addDays, daysBetween } from "./dates.js";
import { round2 } from "./csv.js";

// Order matters: first match wins, so specific rules go before general ones.
export const FEE_RULES = [
  { id: "overdraft", label: "Overdraft / insufficient funds fee", re: /overdraft|\bod\s*(fee|chg|charge)|\bnsf\b|insufficient\s*(funds|balance)|unpaid\s*item|returned\s*item|non[- ]?sufficient/i, base: "high",
    ask: "a one-time goodwill refund",
    why: "Banks refund first-time overdraft fees very often, especially for customers who are otherwise in good standing." },
  { id: "bounce", label: "Returned cheque / failed auto-debit charge", re: /(cheque|check|chq|ecs|nach|emi|auto[- ]?debit|mandate)\s*(return|bounce|dishonou?r|fail)|bounce\s*(charge|fee|chg)|return\s*(charge|chg|fee)|dishonou?r/i, base: "medium",
    ask: "a waiver of this charge",
    why: "If the failure happened because of a bank-side delay or a one-off short balance, banks often waive it once." },
  { id: "minbal", label: "Minimum balance charge", re: /min(imum)?\s*(avg|average)?\s*(bal|balance)|\bamb\b|\bmab\b|non[- ]?maintenance|nmb\s*(chg|charge)|avg\s*bal(ance)?\s*(chg|charge)|bal(ance)?\s*(shortfall|penalty)/i, base: "medium",
    ask: "a waiver or refund of this charge",
    why: "Worth asking if your account type should not carry a minimum balance (student, salary or zero-balance accounts) or if the balance dipped only briefly." },
  { id: "late", label: "Late payment fee", re: /late\s*(payment|pymt|pay)?\s*(fee|charge|chg)|\blpf\b|overdue\s*(fee|charge|chg)|delayed\s*payment/i, base: "high",
    ask: "a one-time goodwill waiver",
    why: "Credit-card issuers commonly waive the first late fee for customers with an otherwise clean record." },
  { id: "interest", label: "Interest / finance charge", re: /finance\s*(charge|chg)|interest\s*(charge|charged|debit|on\s*(card|outstanding))|int\.?\s*(charged|debit)|revolving\s*credit/i, base: "low",
    ask: "a review and, if possible, a partial waiver",
    why: "Interest is usually valid, so this is a long shot. It is most worth asking if it came right after a late fee you are also disputing." },
  { id: "foreign", label: "Foreign transaction / currency markup", re: /(forex|foreign|fx|cross[- ]?currency|currency\s*conversion|intl|international|dcc)\s*(txn|transaction|fee|charge|chg|mark.?up|conv)|\bmarkup\b/i, base: "low",
    ask: "a review of this charge",
    why: "These fees are normally part of the card terms, so refunds are rare. Mainly worth knowing about so you can switch to a card without them." },
  { id: "atm", label: "ATM fee", re: /atm.*(fee|charge|chg)|(fee|charge|chg).*atm|excess\s*atm|atm\s*(wdl|withdrawal)\s*(chg|charge|fee)|non[- ]?home\s*atm|interchange/i, base: "medium",
    ask: "a refund of this ATM fee",
    why: "Many banks refund out-of-network ATM fees on request, particularly if the machine was out of cash or the withdrawal failed." },
  { id: "annual", label: "Annual / renewal / joining fee", re: /(annual|yearly|renewal|joining|membership)\s*(fee|charge|chg)|card\s*(annual|renewal)|amc\b/i, base: "medium",
    ask: "a waiver of this fee",
    why: "Issuers often waive annual fees if you ask, particularly if you say you will otherwise cancel the card." },
  { id: "sms", label: "SMS / alert charges", re: /sms\s*(alert)?\s*(charge|fee|chg)|alert\s*(charge|fee|chg)|sms\s*banking/i, base: "low",
    ask: "removal of this charge",
    why: "Small amounts but they repeat every quarter. Switching to app notifications usually lets you stop them." },
  { id: "maintenance", label: "Account maintenance / service charge", re: /(account|a\/c|acct)\s*(maintenance|service|keeping)\s*(fee|charge|chg)|monthly\s*(maintenance|service)\s*(fee|charge)|service\s*(charge|fee)\b|debit\s*card\s*(fee|charge|amc)|dc\s*amc/i, base: "medium",
    ask: "a waiver and a fee-free account type",
    why: "Most banks have a student or basic account with no monthly fee. You can ask to be moved to it." },
  { id: "transfer", label: "Transfer fee", re: /(wire|neft|imps|rtgs|upi|transfer)\s*(fee|charge|chg)|(fee|charge|chg)\s*(on|for)\s*(neft|imps|rtgs|transfer)/i, base: "low",
    ask: "a review of this fee",
    why: "Transfer fees are usually valid. Many banks now charge nothing for UPI, so check whether you can use that instead." },
];

const GST = /^\s*(gst|igst|cgst|sgst|service\s*tax|tax\s*on)\b/i;
const GENERIC_FEE = /\b(fee|fees|charge|charges|chg|penalty)\b/i;

/** Detect fees. Returns [{id,label,date,desc,amount,gst,total,chance,ask,why,txns,repeatIndex}] */
export function findFees(txns) {
  const out = [];
  const used = new Set();
  txns.forEach((t, i) => {
    if (t.amount >= 0) return;
    const rule = FEE_RULES.find((r) => r.re.test(t.desc));
    if (!rule) return;
    // a tax line ("GST ON OD FEE") belongs to its parent fee, handled below
    if (GST.test(t.desc)) return;
    out.push({ rule, i, t });
    used.add(i);
  });

  // Attach GST/tax lines that sit within 3 days of a fee and are small relative to it.
  const gstLines = txns.map((t, i) => ({ t, i })).filter(({ t }) => t.amount < 0 && GST.test(t.desc));
  const taken = new Set();
  const fees = out.map(({ rule, i, t }) => {
    const fee = Math.abs(t.amount);
    let gst = 0, gstTxn = null;
    for (const g of gstLines) {
      if (taken.has(g.i)) continue;
      const gap = Math.abs(daysBetween(t.date, g.t.date));
      const amt = Math.abs(g.t.amount);
      if (gap <= 3 && amt > 0 && amt <= fee * 0.3) { gst = amt; gstTxn = g.t; taken.add(g.i); break; }
    }
    return {
      id: rule.id, label: rule.label, date: t.date, desc: t.desc, amount: round2(fee), gst: round2(gst),
      total: round2(fee + gst), base: rule.base, ask: rule.ask, why: rule.why, txns: gstTxn ? [t, gstTxn] : [t],
    };
  });

  // Same fee type seen before = banks are less generous. First one gets the "first time" argument.
  const seen = {};
  for (const f of fees) {
    f.repeatIndex = (seen[f.id] = (seen[f.id] || 0) + 1);
    const step = { high: "medium", medium: "low", low: "low" };
    f.chance = f.repeatIndex === 1 ? f.base : f.repeatIndex === 2 ? step[f.base] : "low";
    f.firstTime = f.repeatIndex === 1;
  }

  // Unlabelled "fee/charge/penalty" lines we have no rule for: show as "other" so nothing is hidden.
  txns.forEach((t, i) => {
    if (used.has(i) || t.amount >= 0 || [...taken].includes(i)) return;
    if (GST.test(t.desc)) return;
    if (GENERIC_FEE.test(t.desc) && !/(refund|reversal|reversed|waiv|cashback)/i.test(t.desc)) {
      fees.push({ id: "other", label: "Other charge", date: t.date, desc: t.desc, amount: round2(Math.abs(t.amount)), gst: 0,
        total: round2(Math.abs(t.amount)), base: "low", chance: "low", ask: "an explanation of this charge",
        why: "We could not tell what this charge is for. It is worth asking the bank to explain it.", txns: [t], repeatIndex: 1, firstTime: true });
    }
  });
  fees.sort((a, b) => (a.date < b.date ? -1 : 1));

  // Refunds already received: if the statement shows a matching reversal, mark it so we don't tell you to claim it twice.
  for (const f of fees) {
    const back = txns.find((t) => t.amount > 0 && /(refund|reversal|reversed|waiv|chargeback|fee\s*credit)/i.test(t.desc)
      && Math.abs(t.amount - f.total) < 0.01 + f.gst && daysBetween(f.date, t.date) >= 0 && daysBetween(f.date, t.date) <= 45);
    if (back) { f.refunded = true; f.refundDate = back.date; }
  }
  return fees;
}

/** Possible double charges: same merchant text and amount within 2 days. */
export function findDuplicates(txns) {
  const out = [];
  for (let i = 0; i < txns.length; i++) {
    const a = txns[i];
    if (a.amount >= 0) continue;
    for (let j = i + 1; j < txns.length; j++) {
      const b = txns[j];
      if (daysBetween(a.date, b.date) > 2) break;
      if (b.amount === a.amount && a.desc.toLowerCase() === b.desc.toLowerCase() && !FEE_RULES.some((r) => r.re.test(a.desc))) {
        out.push({ date: b.date, desc: b.desc, amount: Math.abs(b.amount), firstDate: a.date });
      }
    }
  }
  return out;
}

export function summariseFees(fees) {
  const open = fees.filter((f) => !f.refunded);
  const sum = (xs) => round2(xs.reduce((s, f) => s + f.total, 0));
  return {
    count: fees.length,
    total: sum(fees),
    open: sum(open),
    likely: sum(open.filter((f) => f.chance === "high")),
    worthAsking: sum(open.filter((f) => f.chance !== "low")),
    refundedTotal: sum(fees.filter((f) => f.refunded)),
  };
}
