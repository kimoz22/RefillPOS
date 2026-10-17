# ClearSpring Water Refill POS

A responsive, browser-based POS prototype for a Philippine water-refill station. It runs without a build step or third-party JavaScript packages.

## Run

Install the server packages once, then run the app from the project folder:

```powershell
npm install
npm start
```

Open `http://localhost:8000`. Run the Node server (not `python -m http.server`): the login and email notification use its API.

Workspace data is saved in that browser's IndexedDB database (`clearspring-pos`), with separate stores for products, customers, sales, expenses, stock movements, audit logs, bottle records, and workspace settings. Existing data in the previous local-storage format is migrated automatically the first time the app opens. Use **Settings → Download data backup** regularly when evaluating the prototype.

Demo sign-ins: **admin** / **2468** (Administrator) and **user** / **1234** (Staff). Use the sign-out icon in the sidebar profile to return to the login screen. Sign-in lasts for the current browser tab.

## Gmail login alerts

To send successful-login alerts to `rogerviral74@gmail.com`:

1. Enable 2-Step Verification on the Gmail account that will send the alerts, then create a Google App Password for this app. Do not use your normal Gmail password.
2. Copy `.env.example` to `.env` in PowerShell: `Copy-Item .env.example .env`.
3. Set `SMTP_USER` to the sending Gmail address and `SMTP_APP_PASSWORD` to the App Password (enter the password without spaces). Keep `LOGIN_ALERT_TO=rogerviral74@gmail.com`.
4. Replace `SESSION_SECRET` with a long, random secret and change the demo account passwords before sharing the app.
5. Restart the Node server with `npm start`.

The sender and recipient may be the same Gmail account. Invalid sign-in attempts do not send email. If Gmail is not configured or cannot deliver an alert, the user can still sign in; the app displays a warning and the server logs the delivery failure. The notification includes the account name, role, sign-in time, and remote address, but never the password. Keep `.env` private; it is excluded from the static files served by the app.

## Project structure

```text
WaterRefillPOS/
├── index.html
├── assets/
│   └── styles.css
├── src/
│   ├── app.js
│   ├── components/
│   │   ├── login.js
│   │   └── shared.js
│   ├── data/
│   │   ├── default-state.js
│   │   ├── indexeddb.js
│   │   └── users.js
│   └── utils/
│       └── format.js
├── server.js
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

- `src/app.js` wires up app navigation, pages, and POS actions.
- `src/components/` contains the login screen and reusable UI pieces such as tables, cards, and modals.
- `src/data/` defines the initial workspace data, browser database, and login API client.
- `src/utils/` contains shared formatting and escaping helpers.
- `assets/` contains the app's stylesheets and other static assets.
- `server.js` serves the app, verifies demo logins, manages signed sessions, and sends Gmail notifications.

The sample workspace is seeded with Philippine peso prices, Makati business details, sample products, customers, transactions, and expenses. The manager PIN for trying the authorization dialogs is `2468`; change it in the source before sharing the demo. This PIN is intentionally not secure.

## Included workflows

- Dashboard metrics, daily sales chart, best-selling items, recent sales, and low-stock alerts.
- POS cart, configurable products and sizes, discounts with demo PIN authorization, cash/change, bank and mobile payments recorded as pending, split tenders, and customer credit.
- Manual payment confirmation requires an operator to verify the transaction outside this app first. The app does not connect to GCash, Maya, banks, or other provider APIs and never simulates provider confirmation.
- Receipt preview with browser printing / Save as PDF; CSV reports that open in spreadsheet applications.
- Stock sales, purchase and adjustment records, reorder alerts, and average unit cost updates.
- Customer accounts, purchase history, customer credit collection, configurable refundable 20L bottle deposits, outstanding returnable-bottle balances, and filled/empty bottle tracking.
- Expense records, estimated gross/net profit, transaction refunds with stock restoration, and a local audit activity log.
- Business / receipt configuration and JSON data backup / restore.

## Important production limitation

This is a **single-device UI prototype**, not a complete multi-user accounting system. Browser IndexedDB is editable by the user, is not encrypted or shared across devices, and can be lost. Server-side demo passwords are still sample credentials and must be changed; deploy with HTTPS and production-grade account/password management before handling real customer or payment data.

Before handling real customer or payment data, replace the browser-only state layer with a secured backend and database. That deployment still needs, at minimum:

- Server-side authentication, salted password hashing, secure session cookies, role/permission enforcement, and immutable audit records.
- Atomic sale, stock, bottle-ledger, refund, and expense transactions with database backup / recovery and multi-terminal concurrency controls.
- Provider-approved payment integrations and verified webhook processing, or a controlled manual-confirmation process with staff attribution.
- Production tax configuration, receipt-number concurrency, deployment monitoring, and operational security review.

CSV export is provided for spreadsheet compatibility; it is not a native `.xlsx` workbook. Receipt and report PDF output uses the browser's print dialog.
