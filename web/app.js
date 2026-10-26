import { analyze, readDocument, buildICS, googleCalendarLink, feeLetter, duplicateLetter, upcoming, todayStr, planNotifications } from "./engine/index.js";
import { sampleStatement } from "./engine/sample.js";
import { nextDue, subscriptionInsights } from "./engine/subs.js";
import { pretty, prettyShort, daysBetween } from "./engine/dates.js";

const $ = (id) => document.getElementById(id);
// Build DOM with textContent only: statement text is untrusted and must never be parsed as HTML.
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "text") el.textContent = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: fine, just not remembered */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

const state = {
  result: null, plan: [], lead: store.get("ss.lead", [3, 1]), keep: store.get("ss.keep", false),
  profile: store.get("ss.profile", { name: "", bank: "", account: "" }),
  currency: store.get("ss.currency", "₹"), ledgerFilter: "all", ledgerQuery: "", ledgerLimit: 150,
};
const money = (n) => state.currency + Number(n).toLocaleString(state.currency === "₹" ? "en-IN" : "en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });

/* ---------- reminders plan ---------- */
function planFromResult(r) {
  const saved = new Map(state.plan.map((p) => [p.id, p]));
  const fresh = r.subs.filter((s) => !s.stopped).map((s) => {
    const id = s.name.toLowerCase();
    return { id, name: s.name, amount: s.amount, cadence: s.cadence, cadenceLabel: s.cadenceLabel, nextDue: s.nextDue,
      category: s.category, remind: saved.has(id) ? saved.get(id).remind : true, manual: false, priceChange: s.priceChange, yearly: s.yearly, monthly: s.monthly };
  });
  const manual = state.plan.filter((p) => p.manual);
  return [...fresh, ...manual];
}
function rollForward(plan) {
  const t = todayStr();
  for (const p of plan) if (p.nextDue && p.nextDue < t) p.nextDue = nextDue(p.nextDue, p.cadence, t);
  return plan;
}
const PER_YEAR = { weekly: 52, monthly: 12, quarterly: 4, yearly: 1 };
const LABEL = { weekly: "weekly", monthly: "monthly", quarterly: "every 3 months", yearly: "yearly" };
function savePlan() { if (state.keep) store.set("ss.plan", state.plan); syncPhoneSoon(); }
function sortedPlan() { return [...state.plan].sort((a, b) => (a.nextDue || "9").localeCompare(b.nextDue || "9")); }

function dueWords(d) {
  const n = daysBetween(todayStr(), d);
  return n === 0 ? "today" : n === 1 ? "tomorrow" : n < 0 ? `${-n} days ago` : `in ${n} days`;
}

/* ---------- phone reminders (only inside the Android/iOS app) ---------- */
// Inside the app, Capacitor puts its plugins on window. On the website this is undefined and nothing below runs.
const native = () => { try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch { return false; } };
if (native()) document.documentElement.classList.add("native");
const LN = () => (native() && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) || null;
let phoneTimer = 0;
async function phonePermission(ask) {
  const ln = LN(); if (!ln) return "unavailable";
  let p = (await ln.checkPermissions()).display;
  if (p === "prompt" || p === "prompt-with-rationale") { if (!ask) return p; p = (await ln.requestPermissions()).display; }
  return p;
}
async function syncPhoneReminders() {
  const ln = LN(); if (!ln || !store.get("ss.phone", false)) return 0;
  if ((await phonePermission(false)) !== "granted") return 0;
  try { await ln.createChannel({ id: "renewals", name: "Renewal reminders", description: "Warnings before a subscription renews", importance: 4 }); } catch { /* channels are Android only */ }
  const pending = await ln.getPending();
  if (pending.notifications && pending.notifications.length) await ln.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  const now = new Date();
  const list = planNotifications(state.plan, { today: todayStr(), nowMinutes: now.getHours() * 60 + now.getMinutes(), leadDays: state.lead, currency: state.currency });
  if (!list.length) return 0;
  await ln.schedule({ notifications: list.map((n) => ({ id: n.id, title: n.title, body: n.body, channelId: "renewals", isExactNotification: false, schedule: { at: new Date(n.at), allowWhileIdle: true } })) });
  return list.length;
}
function syncPhoneSoon() { clearTimeout(phoneTimer); phoneTimer = setTimeout(() => { syncPhoneReminders().catch(() => {}); }, 400); }
async function enablePhone() {
  const p = await phonePermission(true);
  if (p !== "granted") { state.msg = "Notifications are off for this app. Turn them on in your phone's Settings > Apps > Statement Sleuth > Notifications, then try again."; renderRenewals(); return; }
  store.set("ss.phone", true);
  if (!state.keep) { state.keep = true; store.set("ss.keep", true); store.set("ss.plan", state.plan); }
  const n = await syncPhoneReminders();
  state.msg = n ? `${n} reminders are set on this phone and will ring even when the app is closed. Open the app now and then to keep them topped up.` : "Reminders are on. Nothing renews in the next 90 days; they will be set up when something does.";
  renderRenewals();
}

/* ---------- alerts ---------- */
function activeAlerts() {
  const maxLead = Math.max(0, ...state.lead);
  return upcoming(state.plan.filter((p) => p.remind), todayStr(), maxLead);
}
function renderBanner() {
  const b = $("banner"), list = activeAlerts();
  b.replaceChildren();
  if (!list.length) { b.hidden = true; return; }
  b.hidden = false;
  b.append(h("ul", {}, list.map(({ sub, daysLeft }) => h("li", {}, `${sub.name} renews ${daysLeft === 0 ? "today" : daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`}: ${money(sub.amount)}`))));
  maybeNotify(list);
}
function maybeNotify(list) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const key = todayStr() + "|" + list.map((x) => x.sub.id + x.daysLeft).join(",");
  if (store.get("ss.notified") === key) return;
  store.set("ss.notified", key);
  const body = list.map(({ sub, daysLeft }) => `${sub.name} ${daysLeft === 0 ? "today" : daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`} (${money(sub.amount)})`).join("\n");
  try { new Notification("Subscriptions renewing soon", { body, icon: "icon.svg", tag: "ss-renew" }); } catch { /* some mobile browsers need a service worker; the banner still shows */ }
}

/* ---------- start / load ---------- */
function showError(msg) { const e = $("error"); e.textContent = msg || ""; e.hidden = !msg; }
function run(text) {
  showError("");
  const opts = { asOf: todayStr(), dateOrder: $("dateOrder").value, spendingPositive: $("spendPos").checked };
  let r;
  try { r = analyze(text, opts); } catch (e) { showError(e.message); return; }
  state.currency = $("currency").value; store.set("ss.currency", state.currency);
  state.result = r;
  state.plan = rollForward(planFromResult(r));
  savePlan();
  show();
}
let pending = null; // a locked PDF waiting for its password
function showPw(on, wrong) {
  $("pwbox").hidden = !on;
  if (on) { $("pw").value = ""; $("pw").focus(); if (wrong) showError("That password did not work. Try again."); }
}
async function loadFile(file, password) {
  showError("");
  if (file.size > 25e6) return showError("That file is larger than 25 MB. Try a shorter date range.");
  const stop = busy();
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { rows } = await readDocument(file.name, bytes, { password });
    pending = null; showPw(false);
    run(rows);
  } catch (e) {
    if (e && e.code === "PDF_PASSWORD") { pending = file; showPw(true, false); }
    else if (e && e.code === "PDF_WRONG_PASSWORD") { pending = file; showPw(true, true); }
    else { showPw(false); showError(e && e.message ? e.message : "Could not read that file."); }
  } finally { stop(); }
}
function busy() {
  const d = $("drop");
  d.classList.add("busy");
  return () => d.classList.remove("busy");
}
function handleFile(file) { if (file) { pending = null; loadFile(file); } }
$("pwgo").addEventListener("click", () => { if (pending) loadFile(pending, $("pw").value); });
$("pw").addEventListener("keydown", (e) => { if (e.key === "Enter" && pending) loadFile(pending, $("pw").value); });

function show() {
  const r = state.result;
  if (!r && !state.plan.length) { $("start").hidden = false; $("results").hidden = true; return; }
  const firstShow = $("results").hidden;
  $("start").hidden = true; $("results").hidden = false;
  $("period").textContent = r ? `Statement from ${pretty(r.period.from)} to ${pretty(r.period.to)} · ${r.txns.length} transactions${r.skipped ? ` (${r.skipped} rows skipped)` : ""}` : "Saved reminders on this device";
  const hint = $("hint");
  hint.hidden = !(r && r.hint);
  if (r && r.hint) hint.textContent = "Every amount in this file is positive. If this is a credit-card statement, tick “spending shows as positive numbers” under Settings and load it again.";
  renderFigures(); renderRenewals(); renderFees(); renderLedger(); renderBanner(); if (firstShow) countUp($("figures"));
  document.body.classList.add("js-anim");
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add("go")));
}

function fig(num, label, hi) { return h("div", { class: "fig" }, h("div", { class: "n" }, hi ? h("mark", { class: "fee" }, num) : num), h("div", { class: "l" }, label)); }
/* count the headline numbers up from zero once, so the screen feels alive */
function countUp(root) {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const node of root.querySelectorAll(".fig .n")) {
    const target = node.querySelector("mark") || node;
    const text = target.textContent;
    const m = text.match(/^(\D*)([\d,.]+)(\D*)$/);
    if (!m) continue;
    const end = parseFloat(m[2].replace(/,/g, ""));
    if (!(end > 0)) continue;
    const dec = (m[2].split(".")[1] || "").length;
    const fmt = (v) => v.toLocaleString(state.currency === "₹" ? "en-IN" : "en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const t0 = performance.now(), dur = 900;
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      target.textContent = m[1] + fmt(end * e) + m[3];
      if (k < 1) requestAnimationFrame(tick); else target.textContent = text;
    };
    target.textContent = m[1] + fmt(0) + m[3];
    requestAnimationFrame(tick);
  }
}
function renderFigures() {
  const r = state.result, f = $("figures");
  f.replaceChildren();
  if (r) {
    f.append(fig(money(r.feeSummary.worthAsking), `in ${r.fees.filter((x) => !x.refunded && x.chance !== "low").length} fees worth asking back`, true));
    f.append(fig(money(r.feeSummary.total), `in ${r.feeSummary.count} fees found in total`));
  }
  const active = state.plan.filter((p) => p.nextDue);
  const yearly = active.reduce((a, p) => a + p.amount * PER_YEAR[p.cadence], 0);
  f.append(fig(money(Math.round(yearly)), `a year across ${active.length} subscriptions`));
}

/* ---------- renewals tab ---------- */
function renderRenewals() {
  const p = $("panel-renew");
  p.replaceChildren();
  const r = state.result;
  const sorted = sortedPlan();

  // reminder settings
  const leadChoices = [[0, "Same day"], [1, "1 day before"], [3, "3 days before"], [7, "7 days before"]];
  const status = h("p", { class: "status", "aria-live": "polite" }, state.msg || "");
  const phoneOn = native() && store.get("ss.phone", false);
  const hero = h("section", { class: "remind-hero" + (phoneOn ? " on" : ""), "aria-label": "Reminders" },
    h("div", { class: "rh-top" },
      h("div", { class: "rh-icon", "aria-hidden": "true" }, phoneOn ? "\u2713" : "\uD83D\uDD14"),
      h("div", { class: "rh-body" },
        h("h2", {}, phoneOn ? "Reminders are on" : "Get warned before you are charged"),
        h("p", { class: "muted" }, native()
          ? (phoneOn ? "Your phone will notify you at 9 am before each renewal, even when the app is closed." : "One tap. Your phone notifies you at 9 am before each renewal. No internet needed.")
          : "Download a calendar file and your phone's calendar rings before each renewal."))),
    native()
      ? h("button", { class: phoneOn ? "cta calm" : "cta", type: "button", onclick: () => enablePhone() }, phoneOn ? "Refresh reminders" : "Turn on phone reminders")
      : h("div", { class: "actions" },
        h("button", { class: "cta", type: "button", onclick: () => downloadICS(status) }, "Download calendar reminders"),
        h("button", { class: "ghost", type: "button", onclick: () => enableAlerts(status) }, "Alert me when I open this page")),
    status);
  const settings = h("div", { class: "panel-box" },
    h("h2", {}, "When to remind me"),
    h("p", { class: "muted" }, "Pick how early you want the warning. You can choose more than one."),
    h("div", { class: "chips", role: "group", "aria-label": "Remind me" }, leadChoices.map(([d, label]) =>
      h("button", { class: "small alt", type: "button", "aria-pressed": String(state.lead.includes(d)), onclick: () => {
        state.lead = state.lead.includes(d) ? state.lead.filter((x) => x !== d) : [...state.lead, d].sort((a, b) => b - a);
        store.set("ss.lead", state.lead); renderRenewals(); renderBanner(); syncPhoneSoon();
      } }, label))),
    native()
      ? h("p", { class: "meta" }, "Reminders are planned 90 days ahead. Open the app every month or so to top them up.")
      : h("p", { class: "meta" }, "The calendar file is the reliable one: Apple Calendar and Outlook ring before each renewal even when this page is closed. Google Calendar adds the events but may use its own default reminder. Browser alerts only appear while this page is open."),
    h("label", { class: "remind-line" }, h("input", { type: "checkbox", checked: state.keep, onchange: (e) => {
      state.keep = e.target.checked; store.set("ss.keep", state.keep);
      if (state.keep) store.set("ss.plan", state.plan); else store.del("ss.plan");
    } }), "Remember this list on this device"));
  p.append(hero, settings);

  const notes = r ? subscriptionInsights(r.subs, money) : [];
  if (notes.length) p.append(h("div", { class: "panel-box" }, h("h2", {}, "Worth a look"), h("ul", { class: "note-list" }, notes.map((n) => h("li", {}, n)))));

  if (!sorted.length) p.append(h("p", { class: "muted" }, "No repeating payments found yet. You can add one yourself below."));
  for (const s of sorted) p.append(subCard(s));

  const stopped = r ? r.subs.filter((s) => s.stopped) : [];
  if (stopped.length) {
    p.append(h("h2", {}, "Not charging any more"));
    for (const s of stopped) p.append(h("div", { class: "card quiet" }, h("div", { class: "card-head" }, h("div", {}, h("h3", {}, s.name), h("p", { class: "meta" }, `Last charged ${pretty(s.lastDate)} · ${money(s.amount)} ${s.cadenceLabel}`)), h("span", { class: "tag info" }, "No reminder"))));
  }
  p.append(addForm());
}

function subCard(s) {
  const n = s.nextDue ? daysBetween(todayStr(), s.nextDue) : null;
  const soon = n != null && n <= Math.max(0, ...state.lead);
  return h("article", { class: "card" },
    h("div", { class: "card-head" },
      h("div", {},
        h("h3", {}, s.name, s.priceChange ? h("span", { class: "tag warn" }, `Price up from ${money(s.priceChange.from)}`) : null, s.manual ? h("span", { class: "tag info" }, "Added by you") : null),
        h("p", { class: "meta" }, `${s.category || "Recurring payment"} · ${LABEL[s.cadence]} · about ${money(Math.round(s.amount * PER_YEAR[s.cadence]))} a year`)),
      h("div", { class: "price" }, money(s.amount))),
    h("p", { class: "meta" }, "Next renewal: ", h("span", { class: "due" + (soon ? " soon" : "") }, `${prettyShort(s.nextDue)} (${dueWords(s.nextDue)})`)),
    h("div", { class: "actions" },
      h("label", { class: "remind-line" }, h("input", { type: "checkbox", checked: s.remind, onchange: (e) => { s.remind = e.target.checked; savePlan(); renderBanner(); } }), "Remind me"),
      h("a", { class: "small alt", style: null, href: googleCalendarLink(s, state.currency), target: "_blank", rel: "noopener noreferrer", "aria-label": `Add ${s.name} to Google Calendar (opens Google)` }, "Add to Google Calendar"),
      h("button", { class: "small alt", type: "button", onclick: () => { state.plan = state.plan.filter((x) => x.id !== s.id); savePlan(); renderFigures(); renderRenewals(); renderBanner(); } }, "I cancelled it")));
}
function addForm() {
  const name = h("input", { type: "text", id: "m-name", placeholder: "e.g. Netflix", autocomplete: "off" });
  const amount = h("input", { type: "number", id: "m-amt", min: "0", step: "0.01", inputmode: "decimal", placeholder: "649" });
  const cad = h("select", { id: "m-cad" }, Object.entries(LABEL).map(([k, v]) => h("option", { value: k, selected: k === "monthly" }, v)));
  const date = h("input", { type: "date", id: "m-date" });
  const err = h("p", { class: "error", role: "alert", hidden: true });
  return h("details", { class: "panel-box" }, h("summary", {}, h("strong", {}, "Add a subscription yourself")),
    h("p", { class: "muted" }, "For things that don't show up in a statement, like an annual plan or a card you didn't upload."),
    h("div", { class: "row-form" },
      h("label", { for: "m-name" }, "Name", name), h("label", { for: "m-amt" }, "Amount", amount),
      h("label", { for: "m-cad" }, "How often", cad), h("label", { for: "m-date" }, "Next renewal date", date)),
    err,
    h("div", { class: "actions" }, h("button", { class: "btn", type: "button", onclick: () => {
      const a = parseFloat(amount.value);
      if (!name.value.trim() || !(a > 0) || !date.value) { err.hidden = false; err.textContent = "Please fill in the name, amount and next renewal date."; return; }
      const id = name.value.trim().toLowerCase();
      state.plan = state.plan.filter((x) => x.id !== id);
      state.plan.push({ id, name: name.value.trim(), amount: a, cadence: cad.value, cadenceLabel: LABEL[cad.value], nextDue: date.value, category: "Added by you", remind: true, manual: true });
      rollForward(state.plan); savePlan(); show(); document.getElementById("tab-renew").click();
    } }, "Add reminder")));
}

function downloadICS(status) {
  const items = state.plan.filter((p) => p.remind && p.nextDue).map((p) => ({ ...p, stopped: false }));
  if (!items.length) { status.textContent = "Nothing to export. Tick “Remind me” on at least one subscription."; return; }
  if (!state.lead.length) { status.textContent = "Pick at least one reminder time above."; return; }
  const ics = buildICS(items, { leadDays: state.lead, currency: state.currency });
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = h("a", { href: url, download: "subscription-renewals.ics" });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  status.textContent = `Downloaded ${items.length} repeating renewals. Open the file on your phone to add them to your calendar.`;
}
async function enableAlerts(status) {
  if (!("Notification" in window)) { status.textContent = "This browser can't show alerts. Use the calendar file instead."; return; }
  if (Notification.permission === "denied") { status.textContent = "Alerts are blocked for this site. Allow them in your browser's site settings, or use the calendar file."; return; }
  const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (perm !== "granted") { status.textContent = "No problem. You will still see the yellow bar at the top whenever something is due soon."; return; }
  if (!state.keep) { state.keep = true; store.set("ss.keep", true); store.set("ss.plan", state.plan); }
  store.del("ss.notified");
  status.textContent = "Alerts are on. You will be told when you open this page and something renews within your chosen days. The list is remembered on this device.";
  renderBanner();
  const list = activeAlerts();
  if (!list.length) { try { new Notification("Alerts are on", { body: "Nothing renews soon. You will be told when something does.", icon: "icon.svg" }); } catch { /* ignore */ } }
}

/* ---------- fees tab ---------- */
const CHANCE = { high: ["Good chance", "good"], medium: ["Worth asking", "warn"], low: ["Long shot", "info"] };
function renderFees() {
  const p = $("panel-fees");
  p.replaceChildren();
  const r = state.result;
  if (!r) { p.append(h("p", { class: "muted" }, "Load a statement to see fees.")); return; }
  const prof = h("div", { class: "panel-box" }, h("h2", {}, "Your details for the letters"),
    h("p", { class: "muted" }, "Typed here only; used to fill in the letters. Not saved unless you tick the box on the Renewals tab."),
    h("div", { class: "row-form" },
      field("Your name", "p-name", state.profile.name), field("Bank name", "p-bank", state.profile.bank), field("Last 4 digits of account", "p-acc", state.profile.account, 4)));
  p.append(prof);
  const sync = () => { state.profile = { name: $("p-name").value, bank: $("p-bank").value, account: $("p-acc").value }; };
  prof.addEventListener("input", sync);

  if (!r.fees.length) p.append(h("p", {}, "No bank fees found in this statement. Nice."));
  const order = { high: 0, medium: 1, low: 2 };
  const fees = [...r.fees].sort((a, b) => (a.refunded - b.refunded) || (order[a.chance] - order[b.chance]) || (a.date < b.date ? 1 : -1));
  for (const f of fees) p.append(feeCard(f, sync));
  if (r.duplicates.length) {
    p.append(h("h2", {}, "Possible double charges"));
    for (const d of r.duplicates) p.append(dupCard(d, sync));
  }
}
function field(label, id, value, max) { return h("label", { for: id }, label, h("input", { type: "text", id, value, maxlength: max, autocomplete: "off" })); }
function feeCard(f, sync) {
  const [word, cls] = f.refunded ? ["Already refunded", "good"] : CHANCE[f.chance];
  const box = h("div", { class: "letter", hidden: true });
  return h("article", { class: "card" },
    h("div", { class: "card-head" },
      h("div", {}, h("h3", {}, f.label, h("span", { class: "tag " + cls }, word)), h("p", { class: "meta" }, `${pretty(f.date)} · ${f.desc}`)),
      h("div", { class: "price" }, h("mark", { class: "fee" }, money(f.total)))),
    f.gst ? h("p", { class: "meta" }, `${money(f.amount)} fee plus ${money(f.gst)} tax`) : null,
    f.refunded ? h("p", { class: "meta" }, `A matching refund shows up on ${pretty(f.refundDate)}.`) : h("p", {}, f.why),
    f.refunded ? null : h("div", { class: "actions" }, h("button", { class: "small", type: "button", "aria-expanded": "false", onclick: (e) => toggleLetter(e.currentTarget, box, () => feeLetter(f, letterOpts()), sync) }, "Write the letter")),
    box);
}
function dupCard(d, sync) {
  const box = h("div", { class: "letter", hidden: true });
  return h("article", { class: "card" },
    h("div", { class: "card-head" }, h("div", {}, h("h3", {}, "Same charge twice", h("span", { class: "tag warn" }, "Check this")), h("p", { class: "meta" }, `${pretty(d.date)} · ${d.desc}`)), h("div", { class: "price" }, money(d.amount))),
    h("p", {}, "Two identical charges within two days. If you only bought once, ask the bank or the shop to reverse one."),
    h("div", { class: "actions" }, h("button", { class: "small", type: "button", "aria-expanded": "false", onclick: (e) => toggleLetter(e.currentTarget, box, () => duplicateLetter(d, letterOpts()), sync) }, "Write the letter")),
    box);
}
function letterOpts() { const p = state.profile; return { name: p.name || undefined, bank: p.bank || undefined, account: p.account || undefined, currency: state.currency }; }
function toggleLetter(btn, box, make, sync) {
  const open = btn.getAttribute("aria-expanded") === "true";
  if (open) { box.hidden = true; btn.setAttribute("aria-expanded", "false"); return; }
  sync(); box.replaceChildren();
  const text = make();
  const ta = h("textarea", { "aria-label": "Letter text, you can edit it", spellcheck: "true" }); ta.value = text;
  const msg = h("p", { class: "status", "aria-live": "polite" });
  const subject = text.split("\n")[0].replace(/^Subject:\s*/, "");
  box.append(ta, h("div", { class: "actions" },
    h("button", { class: "small", type: "button", onclick: async () => { try { await navigator.clipboard.writeText(ta.value); msg.textContent = "Copied."; } catch { ta.select(); msg.textContent = "Press Ctrl+C (or Copy) to copy."; } } }, "Copy"),
    h("a", { class: "small alt", href: "mailto:?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(ta.value.split("\n").slice(2).join("\n")) }, "Open in my email app")), msg);
  box.hidden = false; btn.setAttribute("aria-expanded", "true"); ta.focus();
}

/* ---------- ledger tab ---------- */
function renderLedger() {
  const p = $("panel-ledger");
  p.replaceChildren();
  const r = state.result;
  if (!r) { p.append(h("p", { class: "muted" }, "Load a statement to see it here.")); return; }
  const feeRows = new Set(r.fees.flatMap((f) => f.txns.map((t) => t.row)));
  const subKeys = new Set(r.subs.filter((s) => !s.stopped).flatMap((s) => s.descs));
  const q = h("input", { type: "text", placeholder: "Search", "aria-label": "Search the statement", value: state.ledgerQuery });
  const body = h("tbody");
  const more = h("button", { class: "ghost", type: "button" });
  const chips = [["all", "All"], ["fees", "Fees"], ["subs", "Subscriptions"], ["in", "Money in"]];
  const chipEls = chips.map(([k, label]) => h("button", { class: "small alt", type: "button", "aria-pressed": String(state.ledgerFilter === k), onclick: () => { state.ledgerFilter = k; state.ledgerLimit = 150; paint(); chipEls.forEach((c, i) => c.setAttribute("aria-pressed", String(chips[i][0] === k))); } }, label));
  function paint() {
    const query = state.ledgerQuery.toLowerCase();
    const rows = r.txns.filter((t) => {
      if (query && !t.desc.toLowerCase().includes(query)) return false;
      if (state.ledgerFilter === "fees") return feeRows.has(t.row);
      if (state.ledgerFilter === "subs") return subKeys.has(t.desc);
      if (state.ledgerFilter === "in") return t.amount > 0;
      return true;
    }).reverse();
    body.replaceChildren(...rows.slice(0, state.ledgerLimit).map((t) => h("tr", { class: (feeRows.has(t.row) ? "is-fee " : "") + (subKeys.has(t.desc) ? "is-sub" : "") },
      h("td", { class: "date" }, pretty(t.date)), h("td", { class: "d" }, t.desc), h("td", { class: "num" + (t.amount > 0 ? " in" : "") }, (t.amount > 0 ? "+" : "") + money(Math.abs(t.amount))))));
    more.hidden = rows.length <= state.ledgerLimit;
    more.textContent = `Show more (${rows.length - state.ledgerLimit} left)`;
    count.textContent = `${rows.length} transactions`;
  }
  const count = h("span", { class: "muted" });
  more.addEventListener("click", () => { state.ledgerLimit += 150; paint(); });
  q.addEventListener("input", () => { state.ledgerQuery = q.value; state.ledgerLimit = 150; paint(); });
  p.append(h("div", { class: "filters" }, q, chipEls, count),
    h("div", { class: "table-wrap" }, h("table", {}, h("caption", { class: "skip" }, "Statement"), h("thead", {}, h("tr", {}, h("th", {}, "Date"), h("th", {}, "Description"), h("th", { class: "num" }, "Amount"))), body)),
    h("p", {}, more));
  paint();
}

/* ---------- wiring ---------- */
const tabs = ["renew", "fees", "ledger"];
function selectTab(name) {
  for (const t of tabs) {
    const sel = t === name;
    $("tab-" + t).setAttribute("aria-selected", String(sel)); $("tab-" + t).tabIndex = sel ? 0 : -1;
    $("panel-" + t).hidden = !sel;
  }
}
for (const t of tabs) {
  $("tab-" + t).addEventListener("click", () => selectTab(t));
  $("tab-" + t).addEventListener("keydown", (e) => {
    const i = tabs.indexOf(t);
    const j = e.key === "ArrowRight" ? (i + 1) % 3 : e.key === "ArrowLeft" ? (i + 2) % 3 : -1;
    if (j >= 0) { e.preventDefault(); selectTab(tabs[j]); $("tab-" + tabs[j]).focus(); }
  });
}
$("file").addEventListener("change", (e) => handleFile(e.target.files[0]));
const drop = $("drop");
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => handleFile(e.dataTransfer.files[0]));
$("sample").addEventListener("click", () => run(sampleStatement(todayStr())));
$("again").addEventListener("click", () => { $("file").value = ""; $("results").hidden = true; $("start").hidden = false; window.scrollTo(0, 0); });
$("clear").addEventListener("click", () => {
  state.result = null; state.plan = []; state.keep = false;
  ["ss.plan", "ss.keep", "ss.notified", "ss.profile", "ss.phone"].forEach(store.del);
  const ln = LN();
  if (ln) ln.getPending().then((p) => (p.notifications.length ? ln.cancel({ notifications: p.notifications.map((n) => ({ id: n.id })) }) : null)).catch(() => {});
  $("file").value = ""; $("results").hidden = true; $("start").hidden = false; $("banner").hidden = true; selectTab("renew");
  $("privacy").lastChild.textContent = "Everything cleared from this device.";
});
$("currency").value = state.currency;

// Saved reminders from an earlier visit: show them straight away.
if (state.keep) {
  const saved = store.get("ss.plan", []);
  if (Array.isArray(saved) && saved.length) { state.plan = rollForward(saved); savePlan(); show(); }
}
setInterval(renderBanner, 60 * 60 * 1000);

/* tap ripple on every button */
document.addEventListener("pointerdown", (e) => {
  const b = e.target.closest && e.target.closest(".btn,.ghost,.small,.cta");
  if (!b || b.disabled) return;
  const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2;
  const s = document.createElement("span");
  s.className = "ripple";
  s.style.width = s.style.height = d + "px";
  s.style.left = e.clientX - r.left - d / 2 + "px";
  s.style.top = e.clientY - r.top - d / 2 + "px";
  b.append(s);
  setTimeout(() => s.remove(), 650);
}, { passive: true });
