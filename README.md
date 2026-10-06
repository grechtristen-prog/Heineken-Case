# HEINEKEN Sales Advisor Challenge

Interactive sales-rep demo for the challenge. The analysis date is 31 August 2018.

## Run locally

Requires Node.js and Python 3.12. On this Windows machine, use `npm.cmd` in
PowerShell if `npm.ps1` is blocked by the execution policy.

```powershell
npm.cmd install
npm.cmd run dev
```

Open the URL printed by Vite. The app works offline after dependencies have
been installed: account data, scripts, simulated contact, and follow-up tasks
are local. Demo activity is saved in the browser and can be cleared with Reset.

## Data

The supplied challenge dataset lives in `data/raw/` on this machine. Its
`README.md` documents the tables and join keys. Raw CSVs are ignored by Git;
they are approximately 74 MB extracted and should be kept separate from the
demo code. Do not commit the source ZIP or generated data either.

To set up a fresh checkout, obtain the challenge dataset ZIP and extract it
into `data/raw/`. The ZIP should contain `order_lines.csv`, the other source
CSV files, and its `README.md`. Keep `account_id` as text when loading data so
leading zeros are preserved.

Regenerate the committed browser extract after obtaining the raw CSVs:

```powershell
py -3.12 scripts/prepare_data.py
```

The generated `src/data/demo.json` includes 500 ranked accounts and four
comparison accounts. It contains real anonymized account summaries; outreach
and outcomes are simulated. Neutral portfolio-line names replace marketplace
category labels. The raw CSVs are never bundled into the website.

## Checks

```powershell
py -3.12 -m unittest discover -s tests -v
npm.cmd test
npm.cmd run test:server
npm.cmd run test:n8n
npm.cmd run build
npm.cmd run test:browser
```

The browser test uses locally installed Chrome. The retrospective check in
the app compares ordering after 31 May 2018 for an established cohort. It is
not a measured retention impact or a calibrated churn probability.

## n8n integration

The browser calls same-origin server routes; webhook URLs and the Header Auth
secret never enter frontend code:

- `POST /api/prepare-action` → `N8N_ACTION_WEBHOOK_URL`
- `POST /api/record-outcome` → `N8N_OUTCOME_WEBHOOK_URL`

Copy `.env.example` to `.env` and set the two production webhook URLs plus the
secret configured in each n8n Webhook node as the `x-webhook-secret` Header
Auth credential. `.env` is ignored by Git. Do not use `VITE_*` variables for
these values.

During development, Vite serves the two API routes through a server-only
plugin. For a production-style local run:

```powershell
npm.cmd run build
npm.cmd start
```

If n8n is unconfigured, unavailable, times out, or returns an invalid response,
the browser uses the schema-compatible deterministic local fallback and labels
the result **Local fallback**. It never presents fallback work as a live n8n
execution. HTTP 400 validation errors are shown instead of silently falling
back.

The app keeps simulated tasks in browser storage. Returned tasks are upserted
by deterministic `taskId`, duplicate open tasks for the same account and
purpose are suppressed, and only explicit valid cancellation selectors are
applied. An order closes an open retention-contact reminder but does not close
an unrelated service task.

Import and credential instructions, contracts, fixtures, and workflow-specific
verification are in `n8n/README.md`. The workflow exports are inactive and no
live n8n activation or public-site deployment is performed by this repository.
