# HEINEKEN Sales Advisor Challenge

Working repository for the challenge demo. The analysis date is 31 August 2018.

## Data

The supplied challenge dataset lives in `data/raw/` on this machine. Its
`README.md` documents the tables and join keys. Raw CSVs are ignored by Git;
they are approximately 74 MB extracted and should be kept separate from the
demo code. Do not commit the source ZIP or generated data either.

To set up a fresh checkout, obtain the challenge dataset ZIP and extract it
into `data/raw/`. The ZIP should contain `order_lines.csv`, the other source
CSV files, and its `README.md`. Keep `account_id` as text when loading data so
leading zeros are preserved.

The demo will use derived data in `data/processed/`, which is also ignored.
