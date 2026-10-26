# Statement Sleuth

Find the bank fees you can ask back, find the subscriptions you forgot, and get a reminder before the next one renews.

**Live demo: https://jay-m007.github.io/statement-sleuth/** (click "Try it with a sample statement")

![Statement Sleuth on a phone](docs/phone-renewals.png)

## The startup this comes from

[Cushion](https://www.loot-drop.io/) (raised about $15M, shut down in 2025) got customers refunds for bank fees. It needed live access to people's bank accounts, and banks began blocking it. This project keeps the useful part and removes the dependency: you give it a statement file, it works on your own device, and no bank connection is needed.

## What it does

1. **Reads a bank statement in almost any file type:** PDF (including password-protected ones), Excel (.xlsx), Word (.docx), CSV, TSV, TXT, OpenDocument (.ods), OFX/QFX, QIF and HTML tables. Not supported: scanned PDFs or photos (no text to read) and the old .xls/.doc formats (the app says how to convert them). Everything is read on the device. Details are below. For tabular files it finds the header even with junk lines above it; handles separate Debit/Credit columns or one signed Amount; reads `05/03/26`, `5 Mar 2026`, `₹1,299.00 Dr`, `(500.00)` and similar.
2. **Finds fees:** overdraft, late payment, minimum balance, ATM, annual, SMS, foreign-exchange markup, returned cheque, maintenance, transfer. A GST/tax line next to a fee is added to it. A fee that already has a matching refund is marked as refunded.
3. **Says how likely a request is to work.** First-time fees rate higher than repeat ones. It says "worth asking", never "you will get this back".
4. **Writes the letter.** A polite, specific request you can edit, copy, or open in your email app. No legal claims.
5. **Finds subscriptions:** repeating payments (weekly, monthly, every 3 months, yearly) with a steady amount, plus known services (Netflix, Spotify, Prime, iCloud and so on). Shows price rises, services that stopped charging, and overlaps such as two music apps.
6. **Reminds you before renewals.**
   - **Calendar file (.ics):** one repeating event per subscription with alerts at the times you pick (same day, 1, 3, 7 days before). Apple Calendar and Outlook keep the alerts and ring even when this site is closed. Google Calendar adds the events but may apply its own default reminder.
   - **Browser alerts and a yellow bar** when you open the page and something is due soon.
   - **Add your own** subscriptions (for example an annual plan) and keep the list on your device.
7. **Spots possible double charges** (same text and amount within two days).

## File types

| Type | How it is read |
|---|---|
| CSV, TSV, TXT | Own parser; detects the delimiter and the encoding (UTF-8, UTF-16, Windows-1252) |
| Excel `.xlsx` / `.xlsm` | Own ZIP and XML reader (no library); real date cells are converted; the sheet that looks like a statement is used |
| Word `.docx` | Own reader; tables become rows, plain paragraphs are split on tabs or wide gaps |
| OpenDocument `.ods` | Own reader |
| PDF | [pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0, bundled in `web/vendor/pdfjs`, loaded only when a PDF is chosen). Text is placed in columns by position, wrapped descriptions are joined, repeated page headers are dropped. Locked PDFs ask for the password, which is used once and never saved |
| OFX / QFX / QIF | Own readers (these formats are already structured) |
| HTML | Table cells are read from the page |

Every reader returns the same table of rows, and the same column detection then runs on it, so a statement gives the same result in any format (`tests/readers.test.js` checks that 11 formats of one statement give identical transactions). PDFs are read by position, so check the numbers against your statement.

## Privacy

Everything runs in the browser. The page has a Content Security Policy with `connect-src 'none'`, so it cannot send data anywhere, and it loads no outside scripts, fonts or analytics. The statement is kept in memory only. If you choose "Remember this list", only the subscription names, amounts and dates are saved in this browser's local storage; "Clear everything" removes them.

Statement text is untrusted input: the page builds its DOM with `textContent` only, and a description like `<img onerror=...>` is shown as plain text (checked in a real browser).

## Android app (phone reminders)

The same code runs inside an Android app made with Capacitor. The one thing the website cannot do is ring your phone when it is closed, so the app does: it schedules local notifications at 9 am on the days you pick (3 days before, 1 day before and so on). No server, no internet.

- `engine/notify.js` plans which notifications to schedule (pure functions, 9 tests). It plans 90 days ahead and at most 60 notifications, and the app re-plans every time it is opened, so open it about once a month.
- `web/app.js` talks to the Capacitor `LocalNotifications` plugin only when it is running inside the app; on the website nothing changes.
- Reminders use inexact alarms, so they can arrive a few minutes late, and the app does not need the restricted exact-alarm permission.
- Privacy policy: `web/privacy.html`.

Build on Windows (needs Node and Android Studio, opened once): run `powershell -ExecutionPolicy Bypass -File tools/android-build.ps1`. It tests, builds, finds Android Studio's Java and SDK, runs Gradle and leaves `Statement-Sleuth.apk` next to the repo folder. Or open the `android` folder in Android Studio and press Run.

Honest limits of the app: it has been tested in a simulated phone (the plugin calls are mocked) and on a real phone only after you try it; iOS is not built (needs a Mac); the first Android release would need a Play Store account and a 14-day closed test.

## Honest limits

- CSV only (no PDF, no Excel directly). Bank formats vary; if yours is not read correctly, the error says what is missing.
- Detection is rule-based. It can miss a subscription with only one charge in the file, and can flag a repeating payment that is not a subscription (rent, for example). You can untick or remove any of them.
- A web page cannot ring your phone when it is closed. That is why the calendar file exists, and why an Android app is the next step ([docs/APP-PLAN.md](docs/APP-PLAN.md)).
- Refund chances are rules of thumb from how banks commonly behave, not data about your bank.
- Not legal or financial advice.

## Run it

```
npm test        # 53 tests, no dependencies
npm run serve   # builds site/ and serves http://localhost:8080
```

Requires Node 18 or newer. No packages to install.

## How it is built

```
engine/csv.js      CSV parsing, column detection, dates, amounts
engine/fees.js     fee rules, GST matching, refund matching, duplicates
engine/subs.js     merchant cleaning, cadence detection, next due date, insights
engine/ics.js      calendar file with alerts; Google Calendar link
engine/letters.js  refund / waiver letters
engine/sample.js   demo statement, built backwards from today
web/               the page (plain HTML, CSS, JavaScript modules)
tools/build.js     copies web/ and engine/ into site/ for publishing
```

The engine has no browser code, so the tests run it in plain Node.

## Next

An Android app using the same code (Capacitor) with real on-phone notifications. Costs and steps: [docs/APP-PLAN.md](docs/APP-PLAN.md).
