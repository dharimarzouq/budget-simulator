# The synthetic population

**This population is made up.** No household in it is a real household. It's built so that, taken together, it matches published UK totals. Results from it are estimates, and they're labelled as such wherever they appear.

It replaces survey microdata (the Family Resources Survey), which can't be published. See RESEARCH.md, decision 1.

## How it's built

1. **Targets** (`data/targets/`, listed with sources in `targets.yaml`): published tables from HMRC, DWP, the Family Resources Survey via Stat-Xplore, and the OBR.
2. **Seed** (`data/build_seed.py`): 30,012 made-up households (33,912 benefit units). They're spread across all 12 regions, the four tenures, and households with and without children, in proportion to the FRS, with at least 40 in every combination. Each starts with a weight: how many real households it stands for.
3. **Calibration** (`data/calibrate.py`): the weights are scaled up or down to bring the weighted totals as close as possible to 346 published figures at once. Each household's scaling is kept as close to 1 as it can be, and never below ÷10 or above ×10. Published sources disagree with each other slightly, so this minimises the misses rather than forcing an exact match. Every miss is reported in `data/build/calibration_report.csv`.
4. **Checks**: totals that were *not* used in calibration test the result (below).

Households with three or more adults are split into two benefit units: a couple (with any children) and one more adult. That's because tax and benefits are worked out per benefit unit. The two units share a weight.

## Assumptions in the seed

These are starting guesses, not published figures. Calibration corrects the totals, but guesses about *how things combine* (such as who has the health element, or whether high earners opt out of Child Benefit) partly survive it. Each will be replaced by a published figure where one exists.

| Assumption | Value | Why |
|---|---|---|
| Working-age adults who are employees / self-employed | 72% / 10% (lone parents 62% employees) | Roughly the UK employment rate |
| Employee pay | Median £31,000, wide spread, plus a 4% top tail from £80,000 | Roughly ONS pay statistics, 2026-27 terms |
| Self-employed profits | Median £14,000, wide spread, plus a 4% top tail from £80,000 | Rough; the tail is needed to cover HMRC's top bands |
| Pensioners on the new State Pension | 60% (rest on the old basic pension) | Rough; new pension £241.30 a week, old £184.90 (DWP) |
| Pensioners with a private pension | 65%, median £7,000, 3% tail from £50,000 | Rough |
| Working-age adults not working who get the UC health element | 45% (90% of them at the protected rate) | Rough; DWP tables show half of single UC claimants have it |
| Carers | 25% of other non-working adults, 3% of working adults | Rough; raised after the first run had too few |
| Disabled children | 12% (30% at the higher rate) | DWP shows 19% of lone parents on UC have a disabled child |
| Rents | FRS 2024-25 average by region and tenure, uprated with OBR rent growth, with a spread | FRS, OBR |
| Childcare | 35% of working households with a child under 5, median £700 a month | Rough |
| Universal Credit take-up | 85% | Rough; DWP doesn't publish a current take-up rate |
| Child Benefit opt-out | 40% where the higher earner is on £60,000–£80,000, 80% above £80,000 | Rough; raised after the first run overstated the charge |
| Savings | FRS 2024-25 savings bands | FRS |
| Ages | Working age 22–65 (18–24 for extra adults), pensioners 66+ | Rough |

Uprating to 2026-27 uses the OBR's March 2026 forecasts: average earnings +7.9% from 2024-25 and +13.9% from 2023-24, plus rent growth.

## How well it fits the targets

Median miss for each group of targets, before and after calibration:

| Targets | Number | Before | After | Worst after |
|---|---:|---:|---:|---:|
| HMRC people and income by income band | 48 | 19% | 1.9% | 7% |
| HMRC taxpayers and income by region | 24 | 7% | 3.3% | 22% |
| UC households and spending, family type × tenure | 24 | 76% | 3.9% | 20% |
| UC households by region and family type | 44 | 73% | 3.1% | 15% |
| UC households by number of children | 10 | 65% | 4.7% | 14% |
| UC households by health condition | 8 | 82% | 7.9% | 20% |
| UC households with a disabled child | 4 | 95% | 2.8% | 13% |
| UC households with a carer element | 4 | 29% | 12% | 36% |
| Child Benefit families by size | 5 | 5% | 5.1% | 6% |
| Child Benefit opt-outs | 1 | 115% | 20% | |
| Child Benefit charge revenue | 1 | 139% | 26% | |
| FRS households by region, children, tenure | 96 | 0% | 1.4% | 11% |
| FRS households by income and composition | 77 | 28% | 3.5% | 66% |

The worst misses come from sources disagreeing, not from errors:

- **Lone parents**: DWP counts 2.2 million lone-parent households on Universal Credit. The FRS has 1.5 million single-adult households with children in total, because surveys under-count, and many lone parents live with other adults (counted as one household in the FRS, but separate on UC). Calibration can't satisfy both, so the FRS lone-parent income cells are 30–66% off. We weight the administrative figure more heavily.
- **London incomes** are 22% short. The seed gives every region the same spread of pay, and calibration can only partly fix that. A regional pay difference in the seed would help.
- **Weights under strain**: 577 households (2%) hit the ×10 or ÷10 limit, meaning the seed has too few households like them. More seeds of those kinds would help.

## Checks against figures not used in calibration

| Measure | Seed | Calibrated | Published | Source | In calibration? |
|---|---:|---:|---:|---|---|
| Households | 28.97m | 29.21m | 28.97m | FRS 2024-25 | yes, indirectly |
| Income taxpayers | 35.7m | 37.2m | 36.7m | HMRC SPI 2023-24 | partly (bands from £15,000) |
| Employment income | £1,229bn | £1,296bn | £1,230bn | HMRC SPI, uprated | partly (bands from £15,000) |
| Self-employment profits | £129bn | £132bn | £122bn | HMRC SPI, uprated | partly |
| Pension income | £278bn | £304bn | £243bn | HMRC SPI, uprated | partly |
| **Income tax** | £319bn | **£341bn** | £360bn | OBR March 2026 | no |
| **Employee NICs** | £50.9bn | **£55.1bn** | £51.5bn | OBR | no |
| **Employer NICs** | £164bn | **£174bn** | £151bn | OBR | no |
| **Self-employed NICs** | £3.3bn | **£3.6bn** | £3.2bn | OBR | no |
| **Child Benefit spending** | £13.8bn | **£14.9bn** | £13.7bn | OBR | no |
| Families paid Child Benefit | 6.70m | 7.22m | 6.87m | HMRC Aug 2025 | yes |
| Child Benefit charge | £0.86bn | £0.45bn | £0.36bn | HMRC 2024-25 provisional | yes, low priority |
| Households on Universal Credit | 5.25m | 6.87m | 7.16m | DWP May 2026 | yes |
| Universal Credit spending | £55bn | £84bn | £88bn | OBR | yes, through DWP's averages |

What this says, plainly:

- **Income tax comes out at £341bn against the OBR's £360bn.** We'd expect to be short, because the OBR total includes tax on savings, dividends and property income, which we don't model yet. Whether £19bn is the right size for that gap still needs checking against HMRC's breakdown.
- **National Insurance is too high:** employees by 7%, employers by 15%. Earnings below £15,000 aren't pinned down by any target, and the population has slightly more households than the FRS. Employer NICs are also overstated because we ignore the £10,500 Employment Allowance. **This needs fixing before NICs costings are trusted.** The next step is to add earnings targets below £15,000 and an employee count.
- **Pension income is 25% above HMRC's figure**, but HMRC's figure only covers pensioners who pay tax, and most of the excess is State Pension paid to people below the tax threshold. The OBR's State Pension forecast (£154bn) would be a better check.
- **Universal Credit is 4–5% short** on both households and spending, after starting 27–38% short.

## Rebuilding it

```
.venv\Scripts\python.exe -I data\fetch.py
.venv\Scripts\python.exe -I data\build_targets.py
.venv\Scripts\python.exe -I data\pull_statxplore.py      (needs a Stat-Xplore key)
.venv\Scripts\python.exe -I data\build_seed.py
node tools\run_population.mjs data\build\seed.json data\build\seed_results.csv
.venv\Scripts\python.exe -I data\calibrate.py
.venv\Scripts\python.exe -I data\check_population.py data\build\population.json data\build\seed_results.csv
```

The engine results don't change with calibration (only the weights do), so the seed's results file serves for both.
