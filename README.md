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
npm.cmd run build
npm.cmd run test:browser
```

The browser test uses locally installed Chrome. The retrospective check in
the app compares ordering after 31 May 2018 for an established cohort. It is
not a measured retention impact or a calibrated churn probability.
