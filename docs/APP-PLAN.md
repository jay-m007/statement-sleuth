# Statement Sleuth: from website to Android app

Plan, costs and risks. Prices checked on the web on 25 Oct 2026; store fees change, so re-check before paying.

## 1. Does something like this already exist?

| Product | What it does | Gap |
|---|---|---|
| Rocket Money / Trim (US) | Links to your bank, finds subscriptions, negotiates bills | Does not connect to Indian banks. Needs bank access, which is what killed Cushion |
| Emma (UK/EU) | Bank-linked subscription tracking | Does not serve Indian banks |
| SubTracker | Manual subscription list, calendar feed; reminders are paid ($5.90/month) | No statement reading, no fee detection |
| CancelMates (India) | Free tracker for Hotstar, Netflix and similar; reminders; cancel guides | Page does not say it finds bank fees or writes refund letters |
| Bank / UPI mandate list, Google Play subscriptions | Show active auto-pays | Only cover what that app controls; no fee detection |

Gap we fill: **upload a statement, find the fees you can ask back, find forgotten subscriptions, get reminders, all offline.** I did not find a product doing fee detection plus refund letters plus offline CSV together. That is a limited search, not proof nobody does it.

## 2. Why an app helps

A website cannot ring your phone when it is closed. An Android app can schedule local notifications ("Spotify renews tomorrow, ₹119") that fire with no server and no internet. That is the feature the user asked for, done properly.

## 3. Route (cheapest first)

| Step | What | Cost | Time |
|---|---|---|---|
| A. Website (in progress) | GitHub Pages demo, calendar (.ics) reminders, browser alerts | ₹0 | done soon |
| B. Installable web app (PWA) | "Add to Home Screen", works offline, same code | ₹0 | 1 day |
| C. Android app | Wrap the same site with **Capacitor**; add `@capacitor/local-notifications` and a file picker for CSV | ₹0 tools | 3 to 5 days |
| D. Play Store release | Developer account, store listing, testing, review | **$25 once** (roughly ₹2,200) | 3 to 4 weeks, mostly waiting |
| E. iPhone app (optional, later) | Needs a Mac for builds | **$99/year** (roughly ₹8,700) plus Mac access | skip for now |

Why Capacitor: it wraps an existing web app, so no rewrite. Notifications go through a plugin. Builds need Android Studio (free; works on Windows). iOS builds need macOS.

## 4. Total cost

| Item | One-time | Yearly |
|---|---|---|
| Hosting (static site, GitHub Pages) | ₹0 | ₹0 |
| Backend / database | ₹0 (none; data stays on the phone) | ₹0 |
| Android Studio, Capacitor, Node | ₹0 | ₹0 |
| Google Play developer account | $25 | none |
| Apple Developer Program (optional) | none | $99 |
| Custom domain (optional) | none | roughly ₹800 to ₹1,200 (not verified) |
| Commission | none while the app is free with no in-app purchases | none |

**Minimum to be on the Play Store: $25 (about ₹2,200).**

## 5. Play Store checklist

1. Pay $25, verify identity.
2. Privacy policy page (host free on GitHub Pages). Say plainly: statements are read on the device and never uploaded.
3. Data safety form: declare no data collected or shared.
4. Store listing: 512x512 icon, 1024x500 feature graphic, at least 2 phone screenshots, short and long description.
5. Build a signed `.aab`; keep the signing key safe, losing it blocks updates.
6. **Closed test: personal accounts created after 13 Nov 2023 need at least 12 testers opted in for 14 continuous days before production access.** Start recruiting classmates early. This is the step people miss.
7. Apply for production; review can take hours to 7 days or more.

## 6. Risks and honest limits

- Refunds are never guaranteed; the app says "worth asking" and never "you will get this back". It is not legal or financial advice.
- Bank CSV formats vary a lot. Plan to test with real exports from several banks (SBI, HDFC, ICICI, Axis, Kotak) with personal details removed.
- Do not plan on reading SMS automatically: Google Play restricts SMS permissions heavily, and it would break the "nothing leaves your phone" story.
- Android 12+ limits exact alarms; the plugin handles this, but test on a real phone.
- Do not store bank statements in the app after analysis unless the user asks; keep only the subscription list.

## 7. Timeline

| Week | Work |
|---|---|
| 1 | Finish engine and website; PWA; deploy |
| 2 | Capacitor wrap, notifications, test on a real phone; privacy policy |
| 3 | Pay $25, listing, recruit 12 testers, start 14-day test |
| 4 to 5 | Test period ends; apply for production; release |
