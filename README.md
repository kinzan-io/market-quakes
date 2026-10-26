# Market quakes

Every day a tracked market moved **three or more standard deviations of its own recent volatility**, from the [Kinzan quake archive](https://kinzan.io/markets/quakes/). Currencies, metals, crypto, commodities, indices, bond yields and stocks, all measured the same way, so a quiet currency pair and a volatile coin can be compared on one scale.

Updated monthly. Free to use under [CC BY 4.0](LICENSE) with attribution.

## What a quake is

A move is measured close to close, and its size is expressed in standard deviations of that instrument's **own** previous 20 daily returns:

```
sigma = return_pct / sample standard deviation of the previous 20 daily returns
```

A 1% day in a currency pair that usually moves 0.3% a day is a 3.3σ event. The same 1% in a coin that usually moves 4% a day is noise. Any move of 3σ or more is a quake. Under a normal distribution that happens on about 1 trading day in 370; markets are fat-tailed, so it happens more often, and how much more often is part of what this dataset shows.

Full methodology: [kinzan.io/methodology](https://kinzan.io/methodology/).

## Coverage

<!-- coverage:start -->
<!-- coverage:end -->

## Files

| Path | What |
|---|---|
| `data/{YYYY}/{YYYY-MM}.csv` | One month, one row per quake |
| `data/{YYYY}/{YYYY-MM}.json` | The same month as JSON, with the licence attached |
| `data/all.csv` | Every month in one table |
| `data/index.json` | Coverage, column definitions and the source URL of every file |

Rows are sorted by date, then by size of move (largest first).

## Columns

<!-- columns:start -->
<!-- columns:end -->

## Rules the data follows

- **Settled days only.** A quake is recorded the night after its day finished trading, and a month is published only once it has ended. A day still in progress is never published.
- **Rows never change.** Once published, a row is not edited or removed. A month can **gain** rows when Kinzan starts tracking a new instrument and its past quakes are backfilled; each such update is a new release.
- **Empty means unknown, never zero.** An empty cell was not measured. A day an instrument did not trade is not a calm day, and is never recorded as one.
- **Weekends and holidays are spanned, not skipped.** Friday to Monday is one move, and `prev_date` says which close it was measured from.
- **No prices.** This dataset contains Kinzan's measurements of moves, not market prices.
- **The universe changes.** An instrument has no rows before Kinzan tracked it, and `measured` records how many instruments were measurable on each day, so breadth (`stressed`) can be read in proportion.

This is a record of what markets did. It is not investment advice and says nothing about what they will do next.

## Using it

```python
import pandas as pd
q = pd.read_csv("https://raw.githubusercontent.com/kinzan-io/market-quakes/main/data/all.csv")
q.groupby("class")["sigma"].apply(lambda s: s.abs().max())
```

Each row links to its permanent record page (`url`) and the instrument's live page (`instrument_url`) on kinzan.io.

## Licence and attribution

The data is licensed under [Creative Commons Attribution 4.0](LICENSE). You may use, share and adapt it, commercially or not, as long as you credit the source:

> Data: Kinzan market quake archive, [kinzan.io/markets/quakes](https://kinzan.io/markets/quakes/), CC BY 4.0

In a web page or article, link the words to `https://kinzan.io/markets/quakes/`. To cite it formally, use the "Cite this repository" button on GitHub, or the DOI on the latest release.

## How this repository updates

A GitHub Action (`.github/workflows/sync.yml`) runs `scripts/sync.mjs` every Monday and on the 3rd of each month. It fetches [kinzan.io/data/quakes/index.json](https://kinzan.io/data/quakes/index.json) and every month it lists, checks that the columns are exactly the documented set and that no published row has changed, commits the files, and creates a release when a month is added or extended.
