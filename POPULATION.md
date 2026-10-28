# The synthetic population

**This population is made up.** No household in it is a real household. It's built so that, taken together, it matches published UK totals. Results from it are estimates, and they're labelled as such wherever they appear.

It replaces survey microdata (the Family Resources Survey), which can't be published. See RESEARCH.md, decision 1.

## How it's built

1. **Targets** (`data/targets/`, listed with sources in `targets.yaml`): published tables from HMRC, DWP, the Family Resources Survey via Stat-Xplore, and the OBR.
2. **Seed** (`data/build_seed.py`): 30,012 made-up households (35,464 benefit units). They're spread across all 12 regions, the four tenures, and households with and without children, in proportion to the FRS, with at least 40 in every combination. Each starts with a weight: how many real households it stands for.
3. **Calibration** (`data/calibrate.py`): the weights are scaled up or down to bring the weighted totals as close as possible to 430 published figures at once. Each household's scaling is kept as close to 1 as it can be, and never below ÷10 or above ×10. Published sources disagree with each other slightly, so this minimises the misses rather than forcing an exact match. Every miss is reported in `data/build/calibration_report.csv`.
4. **Checks**: totals that were *not* used in calibration test the result (below).

Households with three or more adults are split into benefit units: a couple (with any children) and one or two more adults, each on their own. That's because tax and benefits are worked out per benefit unit. A household's units share a weight.

**Property, savings and dividend income.** Each adult can have rental profit, savings interest and dividends, drawn separately using HMRC's figures for who has each kind and how much, by income band (Personal Incomes Statistics, Table 3.7). The engine taxes them by the real rules: the savings allowances, the starting rate for savings, the dividend allowance and dividend rates. They're calibrated to HMRC's amounts and numbers of people for each kind, band by band. They matter twice over: for the tax itself, and because HMRC sorts people into income bands by *total* income. Without them, the made-up people needed too much pay to reach each band, which inflated National Insurance.

## Assumptions in the seed

These are starting guesses, not published figures. Calibration corrects the totals, but guesses about *how things combine* (such as who has the health element, or whether high earners opt out of Child Benefit) partly survive it. Each will be replaced by a published figure where one exists.

| Assumption | Value | Why |
|---|---|---|
| Working-age adults who are employees / self-employed | 72% / 10% (lone parents 62% employees) | Roughly the UK employment rate |
| Employee pay | Median £31,000, wide spread, plus a 4% top tail from £80,000 | Roughly ONS pay statistics, 2026-27 terms |
| Employees with a second job | 6%, median £5,000 | ONS: about 1.29m people (3.7% of the employed) in 2026 |
| Self-employed profits | Median £20,000, wide spread, plus a 4% top tail from £80,000 | Raised from £14,000: HMRC shows most self-employed people pay tax, with mean profits around £29,000 |
| Property, interest, dividends | Who has each and the average amount follow HMRC's Table 3.7 for the person's income band; spread around the average is a guess (wider for dividends) | HMRC Personal Incomes Statistics 2023-24, uprated |
| Pensioners on the new State Pension | 60% (rest on the old basic pension) | Rough; new pension £241.30 a week, old £184.90 (DWP) |
| Pensioners with a private pension | 65%, median £7,000, 3% tail from £50,000 | Rough |
| Pensioners under 75 with a job | 20%, median pay £13,000 | Set so their NICs exemption comes near HMRC's £1.2bn |
| Working-age adults not working who get the UC health element | 45% (90% of them at the protected rate) | Rough; DWP tables show half of single UC claimants have it |
| Carers | 25% of other non-working adults, 3% of working adults | Rough |
| Disabled children | 12% (30% at the higher rate) | DWP shows 19% of lone parents on UC have a disabled child |
| Households of 3+ adults | 40% have a fourth adult; a quarter of the extra adults are older relatives (55–89) | Rough; makes the adult total match the FRS (53.6m) |
| Rents | FRS 2024-25 average by region and tenure, uprated with OBR rent growth, with a spread | FRS, OBR |
| Childcare | 35% of working households with a child under 5, median £700 a month | Rough |
| Universal Credit take-up | 85% | Rough; DWP doesn't publish a current take-up rate |
| Child Benefit opt-out | 40% where the higher earner is on £60,000–£80,000, 80% above £80,000 | Rough |
| Savings | FRS 2024-25 savings bands | FRS |
| Ages | Working-age adults follow the FRS's count of adults in each age band (18–24, 25–34, … 60–65); pensioners 66+ | FRS 2024-25 |
| Where pensioners live | The share of each kind of household with someone over State Pension age follows the FRS. For example, 56% of women living alone but only 22% of households of three or more adults. In families with children it's a grandparent | FRS 2024-25. Before this, every kind of household had the same share, which doubled the pensioners in large households |
| Pensioner couples | 70% both over State Pension age; otherwise the partner is 55–65 | Rough |
| Extra adults in large households | Grown-up children (25–49 if the parents are pensioners, otherwise 18–30); 5% other older relatives | Rough |

Uprating to 2026-27 uses the OBR's March 2026 forecasts: average earnings +7.9% from 2024-25 and +13.9% from 2023-24, plus rent growth.

## How well it fits the targets

Median miss for each group of targets, before and after calibration:

| Targets | Number | Before | After | Worst after |
|---|---:|---:|---:|---:|
| **HMRC 2026-27 taxpayers and total income by income range** (weighted ×2) | 22 | 18% | 1.6% | 8% |
| HMRC 2023-24 pay, profits and pensions by band, uprated (weighted ×0.3) | 48 | 20% | 2.4% | 22% |
| HMRC property, interest and dividends by income band (amounts and people) | 72 | 29% | 1.4% | 21% |
| HMRC taxpayers and income by region | 24 | 15% | 7.4% | 17% |
| HMRC costs of the NICs thresholds | 2 | 2% | 3.4% | 4% |
| OBR employee count | 1 | 3% | 1.3% | |
| FRS adults by age | 9 | 13% | 8.2% | 14% |
| UC households and spending, family type × tenure | 24 | 78% | 4.7% | 26% |
| UC households by region and family type | 44 | 72% | 3.6% | 15% |
| UC households by number of children | 10 | 67% | 5.1% | 15% |
| UC households by health condition | 8 | 94% | 9.9% | 23% |
| UC households with a disabled child | 4 | 96% | 3.3% | 14% |
| UC households with a carer element | 4 | 25% | 18% | 33% |
| Child Benefit families by size | 5 | 4% | 5.9% | 10% |
| Child Benefit opt-outs | 1 | 126% | 21% | |
| Child Benefit charge revenue | 1 | 251% | 46% | |
| FRS households by region, children, tenure | 96 | 0% | 1.9% | 13% |
| FRS households by income and composition | 77 | 28% | 2.7% | 68% |

HMRC's own projections for 2026-27 (Income Tax liabilities statistics, July 2026) count taxpayers and income in each band for this exact year, so they carry more weight than 2023-24 figures uprated with earnings. Uprating assumes everyone's income rose together, so it misses frozen thresholds pulling more people into tax.

The worst misses come from sources disagreeing, or from the seed lacking the right kind of household:

- **Lone parents**: DWP counts 2.2 million lone-parent households on Universal Credit. The FRS has 1.5 million single-adult households with children in total, because surveys under-count, and many lone parents live with other adults (counted as one household in the FRS, but separate on UC). Calibration can't satisfy both, so the FRS lone-parent income cells are 30–64% off. We weight the administrative figure more heavily.
- **Regional incomes** miss by 8% on the median. The seed gives every region the same spread of pay; a regional pay difference in the seed would help.
- **Jobs**: HMRC's threshold costs imply about 8% more jobs than we have, and the OBR's employee count about 4% more. The FRS's count of adults by age limits how many more workers calibration can add.
- **Weights under strain**: 591 households (2%) hit the ×10 or ÷10 limit, meaning the seed has too few households like them.

## Checks against published figures

| Measure | Population | Published | Source | In calibration? |
|---|---:|---:|---|---|
| Households | 29.30m | 28.97m | FRS 2024-25 | yes, indirectly |
| **Income taxpayers, 2026-27** | **38.1m** | 40.8m | HMRC liabilities 2026-27 | partly (by band of income) |
| of whom aged 65+ | 10.2m | 10.2m | HMRC liabilities 2026-27, table 2.1 | no |
| of whom under 65 | 27.9m | 30.6m | HMRC liabilities 2026-27, table 2.1 | no |
| Employees | 30.2m | 29.8m | OBR March 2026 | yes |
| People with a second job | 1.86m | 1.29m | ONS LFS mid-2026 (secondary reports) | no |
| Employment income | £1,273bn | £1,230bn | HMRC SPI, uprated | partly |
| Self-employment profits | £133bn | £122bn | HMRC SPI, uprated | partly |
| Pension income | £274bn | £243bn | HMRC SPI, uprated | partly |
| **Income tax** | **£359.9bn** | £347.0bn liabilities (£359.6bn receipts) | HMRC liabilities 2026-27; OBR | no |
| of which on earnings, pensions and property | £332.5bn | £318.8bn | HMRC liabilities 2026-27, table 2.6 | no |
| of which on savings | £4.9bn | £8.2bn | HMRC liabilities 2026-27, table 2.6 | no |
| of which on dividends | £22.5bn | £19.8bn | HMRC liabilities 2026-27, table 2.6 | no |
| **Employee NICs** | **£52.3bn** | £51.5bn | OBR | no |
| **Employer NICs** (after the lump sums below) | **£152.7bn** | £151.0bn | OBR | no |
| Cost of the NICs primary threshold | £29.2bn | £30.4bn | HMRC tax relief statistics 2025-26 | yes |
| Cost of the NICs secondary threshold | £23.7bn | £24.4bn | HMRC tax relief statistics 2025-26 | yes |
| **Employee NICs exemption over State Pension age** | **£1.0bn** | £1.2bn | HMRC tax relief statistics 2025-26 | no |
| **Self-employed NICs** | **£3.6bn** | £3.2bn | OBR | no |
| **Child Benefit spending** | **£14.9bn** | £13.7bn | OBR | no |
| Families paid Child Benefit | 7.22m | 6.87m | HMRC Aug 2025 | yes |
| Child Benefit charge | £0.52bn | £0.36bn | HMRC 2024-25 provisional | yes, low priority |
| Households on Universal Credit | 6.89m | 7.16m | DWP May 2026 | yes |
| Universal Credit spending | £82bn | £88bn | OBR | yes, through DWP's averages |

**Employer NICs lump sums.** Two employer reliefs depend on the employer, not the household, so they can't be given to a household in the population. Population totals take off HMRC's 2025-26 cost estimates (tax relief statistics, January 2026) as one figure each:

- the Employment Allowance (£7.4bn)
- the zero rate for apprentices under 25 (£0.57bn)

The zero rate for employees under 21 *is* modelled, because age is known.

What this says, plainly:

- **Income tax: £358.9bn, 3% above HMRC's £347bn of liabilities for 2026-27.** HMRC's liabilities are the like-for-like comparison: the OBR's £359.6bn is cash *receipts*, which include tax we'll never model person by person (trusts, timing, repayments). By source, tax on earnings, pensions and property is 4% high, on dividends 14% high, and on savings 39% low. Interest is probably too thinly spread among higher-rate taxpayers.
- **National Insurance matches:** employee NICs 1% short, employer NICs 2% short. Getting there took five changes:
  1. the under-21 employer zero rate (modelled)
  2. the Employment Allowance and apprentice relief (taken off as HMRC's published costs)
  3. people working past State Pension age (they pay no employee NICs)
  4. second jobs, each with its own thresholds (modelled)
  5. property, savings and dividend income, so pay isn't inflated to fill HMRC's income bands

  Salary sacrifice turned out not to be a cause: HMRC's income figures are already after it.
- **There are 2.7 million too few income taxpayers (38.1m against HMRC's 40.8m), all of them under 65.** Taxpayers aged 65 and over match exactly (10.2m). Fixing where pensioners live, using realistic working-age ages, and calibrating to HMRC's 2026-27 projections made the population's age mix and pensioner incomes right. For example, pensioners' median income now matches HBAI within 2%. But it barely moved the taxpayer count. The most likely reason is a real difference between the sources, not a fault in the population:
  - HMRC counts everyone with a UK income tax liability during the year, from tax records. That includes people outside private households (students in halls, armed forces in barracks, care home residents), people here or working for only part of the year, and non-residents with UK income.
  - The FRS, which the population is built from, is a snapshot of private households.
  - HMRC doesn't publish how many taxpayers fall in that gap, so this explanation isn't confirmed.

  The cost is that **basic rate and personal allowance costings come out about 12% low** (COSTING.md). If the gap is people outside private households, they're mostly low-paid, so the missing tax is mainly basic-rate tax and the effect on other costings is small.
- **Pension income is 20% above HMRC's figure**, but HMRC's figure only covers pensioners who pay tax, and most of the excess is State Pension paid to people below the tax threshold. The OBR's State Pension forecast (£154bn) would be a better check.
- **Universal Credit is 3–4% short** on both households and spending.
- **Child Benefit spending is 8% high**, though it isn't a target. It would make a good one.

## The income distribution, against HBAI (held back)

HBAI ("Households below average income") is DWP's official measure of household incomes. Its figures were never calibration targets, so they test whether the population's *spread* of incomes is right, not just its totals. Income is net household income before housing costs, adjusted for household size the way HBAI does it (the modified OECD scale), counted per person. HBAI's 2024-25 figures are uprated to 2026-27 with OBR earnings growth.

| Group | Median, ours | Median, HBAI | Mean, ours | Mean, HBAI | People, ours | People, HBAI |
|---|---:|---:|---:|---:|---:|---:|
| Children | £677 | £681 | £810 | £827 | 13.5m | 14.7m |
| Working-age adults | £851 | £837 | £1,023 | £984 | 39.3m | 41.4m |
| Pensioners | £732 | £704 | £865 | £830 | 13.5m | 12.2m |

(£ a week, equivalised.)

- **Typical incomes match closely.** Medians are within 1–4% for all three groups (ours now include property, savings and dividend income, as HBAI's do). That's a strong sign the population is realistic in the middle of the distribution.
- **Two differences roughly cancel, and we can't yet separate them.** HBAI's net income takes off council tax, which we don't model; that makes ours too high. It also adds disability benefits, Carer's Allowance, Pension Credit and others, which we don't model either; that makes ours too low.
- **Means are 2% below HBAI's for children and 4% above for working-age adults and pensioners.** Ours include all dividend income at the top, while HBAI's survey under-records it; the missing council tax deduction also pushes ours up.
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
