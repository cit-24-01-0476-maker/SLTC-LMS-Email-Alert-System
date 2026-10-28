# SLTC LMS Email Alert System

Voluntary university email signup for a shared SLTC LMS calendar monitor, using Google Apps Script HTMLService and a private Google Sheet.

**This repository is source code. It is not a live signup service yet.** The root `index.html` is a local demonstration that never sends or saves email. Deploy the files in `signup/` to Google Apps Script to activate email verification.

## මේක පටන් ගන්නේ කොහොමද?

1. Website design එක බලන්න `index.html` browser එකෙන් open කරන්න.
2. [START-HERE.txt](START-HERE.txt) කියවන්න.
3. [සිංහල deployment guide](DEPLOY-SINHALA.txt) අනුව private Sheet සහ Google Apps Script project එක configure කර deploy කරන්න.
4. [Monitor integration example](monitor/INTEGRATION-EXAMPLE.txt) අනුව existing private LMS monitor එක සම්බන්ධ කරන්න.

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
| `signup/Index.html` | Production HTMLService UI |
| `signup/appsscript.json` | New signup project's manifest |
| `monitor/SubscriberBridge.gs` | Adapter for the existing private monitor |
| `monitor/INTEGRATION-EXAMPLE.txt` | Instructions for preserving the current renderer and schedule |
| `DEPLOY-SINHALA.txt` | Deployment, quotas, privacy, security rotation and acceptance tests |
| `index.html` | Generated local UI preview; not a production backend |
| `tests/security.test.cjs` | Offline service simulation and security checks |

The original monitor source/template was unavailable. Connect the adapter to the actual monitor's alert send points; do not replace the original fetch/parser, renderer or 15-minute trigger with this package.

## Local checks

Node.js is required; no dependencies or `npm install` are needed.

```sh
npm test
npm run build
```

Edit `signup/Index.html` and rebuild to refresh the local preview. The offline suite has 19 checks. Real Google deployment, mail delivery and optional Turnstile iframe compatibility need the acceptance tests in the deployment guide.

## Deployment and security

Host the production signup app on **Google Apps Script**, with subscribers in a **restricted private Google Sheet**. GitHub Pages or Vercel are not needed for this architecture and cannot run these `.gs` files as an Apps Script backend.

Keep the public signup project separate from the private LMS monitor. Store the LMS calendar token only in the monitor's Script Properties. Store signing/CAPTCHA secrets in Script Properties, never in this repository or preview. Do not commit real subscriber data, private calendar URLs, `.env`, or Google login credentials.

Email sending is subject to the sender account's [Google Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas). This is not an unlimited email service. Follow the deployment guide before sharing a live signup URL.
