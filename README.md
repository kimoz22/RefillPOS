# ClearSpring Water Refill POS

A responsive, browser-based POS prototype for a Philippine water-refill station. It runs without a build step or third-party JavaScript packages.

## Run

Because the app uses JavaScript modules, serve the project over HTTP instead of opening `index.html` directly. From the project folder, run `python -m http.server 8000` and open `http://localhost:8000`.

Workspace data is saved in that browser's IndexedDB database (`clearspring-pos`), with separate stores for products, customers, sales, expenses, stock movements, audit logs, bottle records, and workspace settings. Existing data in the previous local-storage format is migrated automatically the first time the app opens. Use **Settings → Download data backup** regularly when evaluating the prototype.

## Project structure

```text
WaterRefillPOS/
├── index.html
├── assets/
│   └── styles.css
├── src/
│   ├── app.js
│   ├── components/
│   │   └── shared.js
│   ├── data/
│   │   ├── default-state.js
│   │   └── indexeddb.js
│   └── utils/
│       └── format.js
└── README.md
```

- `src/app.js` wires up app navigation, pages, and POS actions.
- `src/components/` contains reusable UI pieces such as tables, cards, and modals.
- `src/data/` defines the initial workspace data and browser database.
- `src/utils/` contains shared formatting and escaping helpers.
- `assets/` contains the app's stylesheets and other static assets.

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

This is a **single-device UI prototype**, not a secure production POS or a complete multi-user accounting system. Browser IndexedDB is editable by the user, is not encrypted or shared across devices, and can be lost. The demo PIN and role labels do not provide real authorization.

Before handling real customer or payment data, replace the browser-only state layer with a secured backend and database. That deployment still needs, at minimum:

- Server-side authentication, salted password hashing, secure session cookies, role/permission enforcement, and immutable audit records.
- Atomic sale, stock, bottle-ledger, refund, and expense transactions with database backup / recovery and multi-terminal concurrency controls.
- Provider-approved payment integrations and verified webhook processing, or a controlled manual-confirmation process with staff attribution.
- Production tax configuration, receipt-number concurrency, deployment monitoring, and operational security review.

CSV export is provided for spreadsheet compatibility; it is not a native `.xlsx` workbook. Receipt and report PDF output uses the browser's print dialog.
