# The synthetic population

**This population is made up.** No household in it is a real household. It's built so that, taken together, it matches published UK totals. Results from it are estimates, and they're labelled as such wherever they appear.

It replaces survey microdata (the Family Resources Survey), which can't be published. See RESEARCH.md, decision 1.

## How it's built

1. **Targets** (`data/targets/`, listed with sources in `targets.yaml`): published tables from HMRC, DWP, the Family Resources Survey via Stat-Xplore, and the OBR.
2. **Seed** (`data/build_seed.py`): 30,012 made-up households (35,497 benefit units). They're spread across all 12 regions, the four tenures, and households with and without children, in proportion to the FRS, with at least 40 in every combination. Each starts with a weight: how many real households it stands for.
3. **Calibration** (`data/calibrate.py`): the weights are scaled up or down to bring the weighted totals as close as possible to 370 published figures at once. Each household's scaling is kept as close to 1 as it can be, and never below ÷10 or above ×10. Published sources disagree with each other slightly, so this minimises the misses rather than forcing an exact match. Every miss is reported in `data/build/calibration_report.csv`.
4. **Checks**: totals that were *not* used in calibration test the result (below).

Households with three or more adults are split into benefit units: a couple (with any children) and one or two more adults, each on their own. That's because tax and benefits are worked out per benefit unit. A household's units share a weight.

**Other income.** Each adult can have property, savings and dividend income ("other income"). The engine doesn't tax it yet; that comes with savings and dividend tax in a later milestone. It's in the population because HMRC sorts people into income bands by *total* income, including this. Without it, the made-up people needed too much pay to reach each band, which inflated National Insurance.

## Assumptions in the seed

These are starting guesses, not published figures. Calibration corrects the totals, but guesses about *how things combine* (such as who has the health element, or whether high earners opt out of Child Benefit) partly survive it. Each will be replaced by a published figure where one exists.

| Assumption | Value | Why |
|---|---|---|
| Working-age adults who are employees / self-employed | 72% / 10% (lone parents 62% employees) | Roughly the UK employment rate |
| Employee pay | Median £31,000, wide spread, plus a 4% top tail from £80,000 | Roughly ONS pay statistics, 2026-27 terms |
| Employees with a second job | 6%, median £5,000 | ONS: about 1.29m people (3.7% of the employed) in 2026 |
| Self-employed profits | Median £14,000, wide spread, plus a 4% top tail from £80,000 | Rough; the tail is needed to cover HMRC's top bands |
| Other income (property, savings, dividends) | 60% of adults; median 5% of their other income, very wide spread | HMRC: 22.4m of 36.7m taxpayers have some, £125bn in 2023-24 |
| Pensioners on the new State Pension | 60% (rest on the old basic pension) | Rough; new pension £241.30 a week, old £184.90 (DWP) |
| Pensioners with a private pension | 65%, median £7,000, 3% tail from £50,000 | Rough |
| Pensioners under 75 with a job | 12%, median pay £13,000 | ONS puts employment at 65+ at about 12%; pay set so their NICs exemption comes near HMRC's £1.2bn |
| Working-age adults not working who get the UC health element | 45% (90% of them at the protected rate) | Rough; DWP tables show half of single UC claimants have it |
| Carers | 25% of other non-working adults, 3% of working adults | Rough |
| Disabled children | 12% (30% at the higher rate) | DWP shows 19% of lone parents on UC have a disabled child |
| Households of 3+ adults | 40% have a fourth adult; a quarter of the extra adults are older relatives (55–89) | Rough; makes the adult total match the FRS (53.6m) |
| Rents | FRS 2024-25 average by region and tenure, uprated with OBR rent growth, with a spread | FRS, OBR |
| Childcare | 35% of working households with a child under 5, median £700 a month | Rough |
| Universal Credit take-up | 85% | Rough; DWP doesn't publish a current take-up rate |
| Child Benefit opt-out | 40% where the higher earner is on £60,000–£80,000, 80% above £80,000 | Rough |
| Savings | FRS 2024-25 savings bands | FRS |
| Ages | Working age 18–65, pensioners 66+ | Rough |

Uprating to 2026-27 uses the OBR's March 2026 forecasts: average earnings +7.9% from 2024-25 and +13.9% from 2023-24, plus rent growth.

## How well it fits the targets

Median miss for each group of targets, before and after calibration:

| Targets | Number | Before | After | Worst after |
|---|---:|---:|---:|---:|
| HMRC people and income (pay, profits, pensions, other) by income band | 60 | 22% | 1.0% | 22% |
| HMRC taxpayers and income by region | 24 | 17% | 8.0% | 12% |
| HMRC costs of the NICs thresholds | 2 | 9% | 7.8% | 8% |
| OBR employee count | 1 | 5% | 3.7% | |
| FRS adults by age | 9 | 21% | 8.3% | 15% |
| UC households and spending, family type × tenure | 24 | 70% | 3.4% | 18% |
| UC households by region and family type | 44 | 73% | 3.2% | 16% |
| UC households by number of children | 10 | 62% | 3.4% | 15% |
| UC households by health condition | 8 | 88% | 7.8% | 19% |
| UC households with a disabled child | 4 | 92% | 2.2% | 13% |
| UC households with a carer element | 4 | 24% | 18% | 30% |
| Child Benefit families by size | 5 | 2% | 4.8% | 6% |
| Child Benefit opt-outs | 1 | 113% | 18% | |
| Child Benefit charge revenue | 1 | 144% | 26% | |
| FRS households by region, children, tenure | 96 | 0% | 1.7% | 11% |
| FRS households by income and composition | 77 | 30% | 3.9% | 64% |

The worst misses come from sources disagreeing, or from the seed lacking the right kind of household:

- **Lone parents**: DWP counts 2.2 million lone-parent households on Universal Credit. The FRS has 1.5 million single-adult households with children in total, because surveys under-count, and many lone parents live with other adults (counted as one household in the FRS, but separate on UC). Calibration can't satisfy both, so the FRS lone-parent income cells are 30–64% off. We weight the administrative figure more heavily.
- **Regional incomes** miss by 8% on the median. The seed gives every region the same spread of pay; a regional pay difference in the seed would help.
- **Jobs**: HMRC's threshold costs imply about 8% more jobs than we have, and the OBR's employee count about 4% more. The FRS's count of adults by age limits how many more workers calibration can add.
- **Weights under strain**: 591 households (2%) hit the ×10 or ÷10 limit, meaning the seed has too few households like them.

## Checks against published figures

| Measure | Population | Published | Source | In calibration? |
|---|---:|---:|---|---|
| Households | 28.77m | 28.97m | FRS 2024-25 | yes, indirectly |
| Income taxpayers | 37.2m | 36.7m | HMRC SPI 2023-24 | partly (bands from £15,000) |
| Employees | 28.7m | 29.8m | OBR March 2026 | yes |
| People with a second job | 1.70m | 1.29m | ONS LFS mid-2026 (secondary reports) | no |
| Employment income | £1,259bn | £1,230bn | HMRC SPI, uprated | partly |
| Self-employment profits | £131bn | £122bn | HMRC SPI, uprated | partly |
| Pension income | £292bn | £243bn | HMRC SPI, uprated | partly |
| **Income tax** | **£321bn** | £360bn | OBR March 2026 | no |
| **Employee NICs** | **£52.3bn** | £51.5bn | OBR | no |
| **Employer NICs** (after the lump sums below) | **£151.4bn** | £151.0bn | OBR | no |
| Cost of the NICs primary threshold | £28.0bn | £30.4bn | HMRC tax relief statistics 2025-26 | yes |
| Cost of the NICs secondary threshold | £22.5bn | £24.4bn | HMRC tax relief statistics 2025-26 | yes |
| **Employee NICs exemption over State Pension age** | **£1.0bn** | £1.2bn | HMRC tax relief statistics 2025-26 | no |
| **Self-employed NICs** | **£3.5bn** | £3.2bn | OBR | no |
| **Child Benefit spending** | **£14.8bn** | £13.7bn | OBR | no |
| Families paid Child Benefit | 7.20m | 6.87m | HMRC Aug 2025 | yes |
| Child Benefit charge | £0.45bn | £0.36bn | HMRC 2024-25 provisional | yes, low priority |
| Households on Universal Credit | 6.93m | 7.16m | DWP May 2026 | yes |
| Universal Credit spending | £84bn | £88bn | OBR | yes, through DWP's averages |

**Employer NICs lump sums.** Two employer reliefs depend on the employer, not the household, so they can't be given to a household in the population. Population totals take off HMRC's 2025-26 cost estimates (tax relief statistics, January 2026) as one figure each:

- the Employment Allowance (£7.4bn)
- the zero rate for apprentices under 25 (£0.57bn)

The zero rate for employees under 21 *is* modelled, because age is known.

What this says, plainly:

- **National Insurance now matches:** employer NICs within 0.3%, employee NICs 1.5% high. Getting there took five changes:
  1. the under-21 employer zero rate (modelled)
  2. the Employment Allowance and apprentice relief (taken off as HMRC's published costs)
  3. people working past State Pension age (they pay no employee NICs)
  4. second jobs, each with its own thresholds (modelled)
  5. property, savings and dividend income, so pay isn't inflated to fill HMRC's income bands

  Salary sacrifice turned out not to be a cause: HMRC's income figures are already after it.
- **Income tax is £321bn against the OBR's £360bn.** That's expected, because we don't yet tax the £152bn of other income. Taxing it at ordinary rates would add at most £51bn; real tax on it is lower, because of the savings and dividend allowances and lower dividend rates. So the £39bn gap is consistent with what's missing. It closes when savings and dividend tax is modelled.
- **Pension income is 20% above HMRC's figure**, but HMRC's figure only covers pensioners who pay tax, and most of the excess is State Pension paid to people below the tax threshold. The OBR's State Pension forecast (£154bn) would be a better check.
- **Universal Credit is 3–4% short** on both households and spending.
- **Child Benefit spending is 8% high**, though it isn't a target. It would make a good one.

## The income distribution, against HBAI (held back)

HBAI ("Households below average income") is DWP's official measure of household incomes. Its figures were never calibration targets, so they test whether the population's *spread* of incomes is right, not just its totals. Income is net household income before housing costs, adjusted for household size the way HBAI does it (the modified OECD scale), counted per person. HBAI's 2024-25 figures are uprated to 2026-27 with OBR earnings growth.

| Group | Median, ours | Median, HBAI | Mean, ours | Mean, HBAI | People, ours | People, HBAI |
|---|---:|---:|---:|---:|---:|---:|
| Children | £665 | £681 | £762 | £827 | 13.4m | 14.7m |
| Working-age adults | £828 | £837 | £978 | £984 | 38.8m | 41.4m |
| Pensioners | £699 | £704 | £801 | £830 | 13.0m | 12.2m |

(£ a week, equivalised.)

- **Typical incomes match closely.** Medians are within 1–2% for all three groups. That's a strong sign the population is realistic in the middle of the distribution.
- **Two differences roughly cancel, and we can't yet separate them.** HBAI's net income takes off council tax, which we don't model; that makes ours too high. It also adds disability benefits, Carer's Allowance, Pension Credit and others, which we don't model either; that makes ours too low.
- **Means are lower than HBAI's for children (8%) and pensioners (3%).** Better-off families with children may be too few, and pensioners are missing the benefits above.
- **Head-counts differ by 6–9%.** HBAI counts 16–19 year-olds in education as children and 16–17 year-olds as working age; ours start adults at 18 and don't have the older children. We have 7% more pensioners than HBAI, partly because our State Pension age is 66 throughout.

## Rebuilding it

```
.venv\Scripts\python.exe -I data\fetch.py
.venv\Scripts\python.exe -I data\build_targets.py
.venv\Scripts\python.exe -I data\pull_statxplore.py      (needs a Stat-Xplore key)
.venv\Scripts\python.exe -I data\build_seed.py
node tools\run_population.mjs data\build\seed.json data\build\seed_results.csv
.venv\Scripts\python.exe -I data\calibrate.py
.venv\Scripts\python.exe -I data\check_population.py data\build\population.json data\build\seed_results.csv
.venv\Scripts\python.exe -I data\export_population.py
```

The last step writes `public/data/population-2026-27.json`, the file the site loads: 2.4 MB, or 0.6 MB compressed. Money is rounded to whole pounds and weights to one decimal place, which moves totals by well under 0.1%. `test/population.test.ts` checks the shipped file still matches the published totals within the gaps explained here.

The engine results don't change with calibration (only the weights do), so the seed's results file serves for both.
