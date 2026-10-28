# SLTC LMS Email Alert System

Voluntary university email signup for a shared SLTC LMS calendar monitor, using Google Apps Script HTMLService and a private Google Sheet.

**Live signup:** [Open SLTC LMS Alerts](https://cit-24-01-0476-maker.github.io/SLTC-LMS-Email-Alert-System/). The mobile-friendly website is hosted on GitHub Pages. Google Apps Script handles confirmation emails and the private subscriber Sheet; the existing private monitor keeps its schedule.

## මේක පටන් ගන්නේ කොහොමද?

1. Website design එක බලන්න `index.html` browser එකෙන් open කරන්න.
2. [START-HERE.txt](START-HERE.txt) කියවන්න.
3. [සිංහල deployment guide](DEPLOY-SINHALA.txt) අනුව private Sheet සහ Google Apps Script project එක configure කර deploy කරන්න.
4. `monitor/LmsMonitor.gs` එකෙන් පරණ monitor Code.gs replace කර `monitor/SubscriberBridge.gs` සහ `monitor/StartHere.gs` add කරන්න. Existing Script Properties සහ `checkLms` trigger එක තබාගන්න.

Students confirm their `@sltc.ac.lk` email before activation. Confirmed subscribers are read automatically from the Sheet; the organiser does not edit script settings for every signup.

## Included

- Responsive signup UI, explicit consent and privacy information.
- Email ownership confirmation with expiring, single-use links.
- Signed unsubscribe links and subscriber record deletion.
- Server-side email validation, resend cooldowns and daily abuse limits.
- Optional Cloudflare Turnstile verification.
- Individual alert emails with the existing monitor's styled HTML and an unsubscribe footer.
- Durable delivery queue, quota deferral, retries and event revision deduplication.

**Only events visible to the shared monitor are broadcast.** Entering an email does not connect a student's personalised LMS courses. This is an unofficial student community project.

## Project files

| Path | Purpose |
| --- | --- |
| `signup/Code.gs` | Public signup backend |
| `signup/StartHere.gs` | Owner-checked setup entry point for the editor |
| `signup/Index.html` | Production HTMLService UI |
| `signup/appsscript.json` | New signup project's manifest |
| `monitor/SubscriberBridge.gs` | Adapter for the existing private monitor |
| `monitor/StartHere.gs` | Owner-checked monitor setup entry point |
| `monitor/appsscript.json` | Required scopes for the private monitor; merge any existing additional configuration |
| `monitor/LmsMonitor.gs` | Complete integrated version of the supplied v2.0 monitor |
| `monitor/INTEGRATION-EXAMPLE.txt` | Instructions for preserving the current renderer and schedule |
| `DEPLOY-SINHALA.txt` | Deployment, quotas, privacy, security rotation and acceptance tests |
| `index.html` | Production GitHub Pages UI |
| `assets/app.js` | Secure cross-origin connection to the email backend |
| `signup/Bridge.html` | Origin-checked Google transport for the static site |
| `tests/security.test.cjs` | Offline service simulation and security checks |

The user's original v2.0 monitor is now integrated. Its navy/gold HTML renderer is preserved exactly, including inline campus logo, event cards and owner-only preview. Existing `EVT_` fingerprints, `LMS_INITIALIZED`, `LMS_ICAL_URL`, `ALERT_EMAIL` and `checkLms` trigger are retained. Subscriber sends are enabled with `SUBSCRIBER_ALERTS_ENABLED=true` after bridge configuration. The calendar fetch rejects redirects and event links are filtered to keep private calendar tokens out of mail.

## Local checks

Node.js is required; no dependencies or `npm install` are needed.

```sh
npm test
npm run build
```

Edit `signup/Index.html` and rebuild to refresh the local preview. The offline suite has 61 checks, including the integrated original monitor and an exact original-renderer output regression check. The production signup page was verified accessible without login (HTTP 200), and both setup steps completed. A real student-mailbox confirmation/alert delivery test and optional Turnstile iframe compatibility still require the acceptance tests in the deployment guide.

## Deployment and security

Host the frontend on **GitHub Pages**, with the email backend on **Google Apps Script** and subscribers in a **restricted private Google Sheet**. GitHub does not run the `.gs` files. The browser connects through an origin-checked Google iframe; supported browsers load it without Google cookies to avoid multi-account conflicts. Confirmation and unsubscribe links point to the GitHub site using a URL fragment. Old Google links continue to work.

Keep the public signup project separate from the private LMS monitor. Store the LMS calendar token only in the monitor's Script Properties. Store signing/CAPTCHA secrets in Script Properties, never in this repository or preview. Do not commit real subscriber data, private calendar URLs, `.env`, or Google login credentials.

Email sending is subject to the sender account's [Google Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas). This is not an unlimited email service. Follow the deployment guide before sharing a live signup URL.

The completed production bootstrap helpers were removed. Signing keys are held in Script Properties, not in the deployed source or repository. The monitor has no public web endpoint.

## GitHub Pages hosting

Pages publishes the `main` branch at `/`; `.nojekyll` serves the static files directly. Run `npm run build` after layout/client changes and commit `index.html` plus `assets/app.js`. Never publish `work/`, credentials or private deployment helpers. Backend template changes require a separate Apps Script push and update of the existing deployment.

The bridge permits an explicit set of student/activity methods plus server-authenticated admin methods. Both sides check the origin, per-page random channel and request identity. No request result is shown as successful until the matching backend response arrives. If connection fails, the page offers retry/private-window help. Real browser handshake and mailbox delivery need live acceptance testing.

## Operator dashboard

[Open Admin](https://cit-24-01-0476-maker.github.io/SLTC-LMS-Email-Alert-System/admin.html). The code is configured only on the server; it is not in this repository. The dashboard shows protected subscriber emails, anonymous recent-visit counts, monitor health, sending quota and action history. Operators can validate/update the private calendar source, test its connection, request a check, retry failed jobs and repair missing schedules.

See [ADMIN-OPERATIONS.txt](ADMIN-OPERATIONS.txt) for the five-minute control worker, session limits and recovery. Expired university tokens require a fresh LMS-issued calendar link. No admin button can regenerate an LMS token or bypass Google sending quotas. The existing fifteen-minute monitor and original navy/gold emails remain.
