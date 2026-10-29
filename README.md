# UK budget simulator (working name)

Change UK taxes and benefits for 2026-27 and see what it raises or costs, who gains and loses, and what it does to
borrowing and the fiscal rules. Every number shows its source, method and how far to trust it.

**Every figure is an estimate.** Costings run on made-up households weighted to match published UK totals, not on real
people's data. See the "How we know" page in the app, and [COSTING.md](COSTING.md) and [POPULATION.md](POPULATION.md),
for the method, the checks against official figures, and where they fall short.

## What's in it

- **The engine** (`src/engine`): income tax (including Scotland's bands, savings and dividends), National Insurance,
  Universal Credit, Child Benefit and its charge, and the benefit cap, for 2026-27. Checked against PolicyEngine UK and
  hand-worked examples.
- **The rules** (`rules/`): every rate and threshold as data, each with its source and the law or guidance behind it.
- **The population** (`data/`, built into `public/data/`): about 32,600 synthetic households, calibrated to around 800
  published totals from HMRC, DWP, the Family Resources Survey's published tables, ONS and the OBR.
- **Costing** (`src/policy`): static and behavioural costings, shown separately; winners and losers.
- **Borrowing and debt** (`src/economy`, `forecasts/`): the OBR's October 2026 forecast as the baseline, debt interest,
  the fiscal rules, and a separate, rougher estimate of the effect on the economy.

## Running it

```
npm ci
npm run dev        # the site, at http://localhost:5173/
npm test           # the tests
npm run build      # a static site in dist/
```

The population is already built. Rebuilding it from the published tables needs Python; the steps are at the end of
[POPULATION.md](POPULATION.md).

## Data and licences

The code is under the [MIT licence](LICENSE).

The data comes from public sources, each recorded with its URL, publisher, licence and date in
[rules/sources.yaml](rules/sources.yaml) and [data/targets/targets.yaml](data/targets/targets.yaml). All of it is
published by HMRC, DWP, ONS, the OBR, HM Treasury, the Scottish Government and other public bodies under the Open
Government Licence v3.0: contains public sector information licensed under the
[Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/). One
Institute for Fiscal Studies paper is cited for its finding; nothing from it is reproduced.

No survey microdata is included, and none may be committed (see `.gitignore`).
