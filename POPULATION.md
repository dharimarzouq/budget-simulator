# The synthetic population

**This population is made up.** No household in it is a real household. It's built so that, taken together, it matches published UK totals. Results from it are estimates, and they're labelled as such wherever they appear.

It replaces survey microdata (the Family Resources Survey), which can't be published. See RESEARCH.md, decision 1.

## How it's built

1. **Targets** (`data/targets/`, listed with sources in `targets.yaml`): published tables from HMRC, DWP, the Family Resources Survey via Stat-Xplore, and the OBR.
2. **Seed** (`data/build_seed.py`): 30,012 made-up households (33,990 benefit units). They're spread across all 12 regions, the four tenures, and households with and without children, in proportion to the FRS, with at least 40 in every combination. Each starts with a weight: how many real households it stands for.
3. **Calibration** (step 5c, not yet done): the weights are adjusted as little as possible so the totals match the targets.
4. **Checks**: some published tables are kept out of calibration and used only to test the result.

Households with three or more adults are split into two benefit units: a couple (with any children) and one more adult. That's because tax and benefits are worked out per benefit unit.

## Assumptions in the seed

These are starting guesses, not published figures. Calibration corrects the totals, but guesses about *how things combine* (such as who has the health element, or whether high earners opt out of Child Benefit) partly survive it. Each will be replaced by a published figure where one exists.

| Assumption | Value | Why |
|---|---|---|
| Working-age adults who are employees / self-employed | 72% / 10% (lone parents 62% employees) | Roughly the UK employment rate |
| Employee pay | Median £31,000, wide spread, plus a 4% top tail from £80,000 | Roughly ONS pay statistics, 2026-27 terms |
| Self-employed profits | Median £14,000, wide spread | Rough |
| Pensioners on the new State Pension | 60% (rest on the old basic pension) | Rough; new pension £241.30 a week, old £184.90 (DWP) |
| Pensioners with a private pension | 65%, median £7,000 | Rough |
| Working-age adults not working who get the UC health element | 45% (90% of them at the protected rate) | Rough; DWP tables show half of single UC claimants have it |
| Carers among other non-working adults | 8% | Rough |
| Disabled children | 6% (30% at the higher rate) | Rough |
| Rents | FRS 2024-25 average by region and tenure, uprated with OBR rent growth, with a spread | FRS, OBR |
| Childcare | 35% of working households with a child under 5, median £700 a month | Rough |
| Universal Credit take-up | 85% | Rough; DWP doesn't publish a current take-up rate |
| Child Benefit opt-out | 25% where the higher earner is on £60,000–£80,000, 60% above £80,000 | Rough |
| Savings | FRS 2024-25 savings bands | FRS |
| Ages | Working age 22–65 (18–24 for extra adults), pensioners 66+ | Rough |

Uprating to 2026-27 uses the OBR's March 2026 forecasts: average earnings +7.9% from 2024-25 and +13.9% from 2023-24, plus rent growth.

## The seed before calibration

Weighted totals compared with published figures. Large gaps are expected at this stage; this shows where calibration has the most work to do.

| Measure | Seed | Published | Ratio | Source |
|---|---:|---:|---:|---|
| Households | 28.97m | 28.97m | 1.00 | FRS 2024-25 |
| Income taxpayers | 35.5m | 36.7m | 0.97 | HMRC SPI 2023-24 |
| Employment income | £1,225bn | £1,230bn | 1.00 | HMRC SPI, uprated |
| Self-employment profits | £85bn | £122bn | 0.70 | HMRC SPI, uprated |
| Pension income | £249bn | £243bn | 1.03 | HMRC SPI, uprated |
| Income tax | £289bn | £360bn | 0.80 | OBR |
| Employee NICs | £50.9bn | £51.5bn | 0.99 | OBR |
| Employer NICs | £163bn | £151bn | 1.08 | OBR |
| Self-employed NICs | £2.3bn | £3.2bn | 0.72 | OBR |
| Child Benefit | £14.6bn | £13.7bn | 1.07 | OBR |
| Families paid Child Benefit | 7.08m | 6.87m | 1.03 | HMRC Aug 2025 |
| Child Benefit charge | £1.39bn | £0.36bn | 3.87 | HMRC 2024-25 (provisional) |
| Households on Universal Credit | 5.25m | 7.16m | 0.73 | DWP May 2026 |
| Universal Credit spending | £53bn | £88bn | 0.60 | OBR |

What this says:

- **Universal Credit is the biggest gap**: too few households on it, and too little paid to each. The seed has too few low-income, non-working and health-element households. Calibrating to the DWP tables (family type, tenure, health, children) is the main job of step 5c.
- **Income tax is 20% short.** Part of that is tax we don't model yet (savings, dividends, property and company income). Part is too thin a top tail of earners, which calibrating to HMRC's income bands should fix. The gap we can explain will be written down here once calibration is done.
- **The Child Benefit charge is four times too high.** Far more real families above £60,000 opt out of Child Benefit, or have their income arranged to avoid the charge, than the seed assumes. The charge revenue becomes a calibration target.
- **Employer NICs come out 8% high** because we ignore the £10,500 Employment Allowance; the public sector also pays employer NICs, but that's within the same total.
- Northern Ireland is in our figures but not in DWP's Universal Credit table. It needs a separate source.

## Rebuilding it

```
.venv\Scripts\python.exe -I data\fetch.py
.venv\Scripts\python.exe -I data\build_targets.py
.venv\Scripts\python.exe -I data\pull_statxplore.py      (needs a Stat-Xplore key)
.venv\Scripts\python.exe -I data\build_seed.py
node tools\run_population.mjs data\build\seed.json data\build\seed_results.csv
.venv\Scripts\python.exe -I data\check_population.py data\build\seed.json data\build\seed_results.csv
```
