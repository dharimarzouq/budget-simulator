# The synthetic population

**This population is made up.** No household in it is a real household. It's built so that, taken together, it matches published UK totals. Results from it are estimates, and they're labelled as such wherever they appear.

It replaces survey microdata (the Family Resources Survey), which can't be published. See RESEARCH.md, decision 1.

## How it's built

1. **Targets** (`data/targets/`, listed with sources in `targets.yaml`): published tables from HMRC, DWP, the Family Resources Survey via Stat-Xplore, and the OBR.
2. **Seed** (`data/build_seed.py`): 30,012 made-up private households, plus 2,000 people outside private households (below). That's 37,552 benefit units in all. Households are spread across all 12 regions, the four tenures, and households with and without children, in proportion to the FRS, with at least 40 in every combination. Each starts with a weight: how many real households it stands for.
3. **Calibration** (`data/calibrate.py`): the weights are scaled up or down to bring the weighted totals as close as possible to 479 published figures at once. Each household's scaling is kept as close to 1 as it can be, and never below ÷10 or above ×10. Published sources disagree with each other slightly, so this minimises the misses rather than forcing an exact match. Every miss is reported in `data/build/calibration_report.csv`.
4. **Checks**: totals that were *not* used in calibration test the result (below).

Households with three or more adults are split into benefit units: a couple (with any children) and one or two more adults, each on their own. That's because tax and benefits are worked out per benefit unit. A household's units share a weight.

### What each person has

- **Work and health follow the FRS for their tenure and age band.** Each working-age adult's status comes from the FRS 2024-25 figures for people with the same tenure and age:
  - full- or part-time employee
  - full- or part-time self-employed
  - unemployed
  - permanently or temporarily sick
  - looking after family
  - student, retired, or other inactive

  This matters: 32% of working-age social renters work full-time, against 68% of people with a mortgage, and 25% are permanently sick or disabled. Pay is drawn separately for full-time and part-time workers. Health conditions (the UC health element) and caring come from each person's status.
- **Household type follows the FRS for each tenure.** For example, lone parents make up 13% of social-renting households but 1% of outright owners.
- **Pensioners live where the FRS says they do.** For example, 56% of women living alone are pensioners, but only 22% of households of three or more adults include one. In families with children, a pensioner is a grandparent.
- **Property, savings and dividend income** is drawn separately, following HMRC's figures for who has each kind and how much, by income band (Table 3.7). The engine taxes it by the real rules.
- **Pension contributions** deducted before tax follow HMRC's figures by band (Table 3.8: £40bn a year through workplace and personal pensions). They cut income tax but not National Insurance.
- **Side self-employment.** Some employees and pensioners also have a small business. HMRC counts more people with self-employment income than have it as their main job.

### People outside private households

HMRC counts everyone with a UK income tax liability during the year, from tax records. The FRS, which the households are built from, is a snapshot of private households. HMRC's count therefore includes people the households can't: students in halls, armed forces in barracks, care home residents, people here or working for only part of the year, and non-residents with UK income.

The population includes a separate group of single adults for them:
- They have earnings, and some have property, savings and dividend income and pension contributions.
- They count in HMRC's targets (taxpayers, income bands, NICs thresholds).
- They're left out of every household-based target and check (FRS, LFS employees, HBAI, Universal Credit, Child Benefit).
- **Calibration sizes the group: 2.5 million people.** No published figure gives the size directly, so treat it as an estimate.

## Assumptions in the seed

These are starting values. Calibration corrects the totals, but guesses about *how things combine* partly survive it. Where a value was tuned to bring a published figure into line, the table says so.

| Assumption | Value | Why |
|---|---|---|
| Work status (working age) | FRS 2024-25 by tenure and age band | FRS |
| Full-time pay | Median £36,000, spread 0.5, 6% top tail from £80,000 | Below ASHE's median (about £39,000, 2025), because the FRS's full-time group includes younger and newer workers. Tuned so NICs and the employee count both come close |
| Part-time pay | Median £13,000 | ASHE 2025 |
| Full-time self-employed profits | Median £20,000, 2% top tail from £80,000 | Tuned to HMRC's self-employment figures |
| Part-time self-employed profits | Median £8,000 | Rough |
| Side self-employment | 7% of employees and pensioners, median £4,000 | HMRC counts more people with self-employment income than have it as their main job |
| Second jobs | 6% of employees, median £5,000 | ONS: about 1.29m people in 2026 |
| Health element | 85% of permanently sick, 30% of temporarily sick, 10% of unemployed (90% at the protected rate) | Rough, then checked against DWP's UC health tables |
| Carers | 25% of those looking after family, 15% of other inactive, 3% of workers; 60% of parents of a disabled child and 50% of partners of someone with the health element, if not in well-paid work | Rough; checked against DWP's carer-element tables |
| Retired before State Pension age | Private pension, median £12,000 | Rough |
| Pensioners on the new State Pension | 60% (rest on the old basic pension) | Rough; new pension £241.30 a week, old £184.90 (DWP) |
| Pensioners with a private pension | 65%, median £7,000, 3% tail from £50,000 | Rough |
| Pensioners under 75 with a job | 20%, median pay £13,000 | Tuned so their NICs exemption comes near HMRC's £1.2bn |
| Pensioner couples | 70% both over State Pension age; otherwise the partner is 55–65 | Rough |
| Extra adults in large households | Grown-up children (25–49 if the parents are pensioners, otherwise 18–30); grandparents per the FRS; 5% other older relatives | Rough |
| Ages | Working-age adults follow the FRS's age bands; pensioners 66+ | FRS |
| Disabled children | 12% (30% at the higher rate) | DWP shows 19% of lone parents on UC have a disabled child |
| Property, interest, dividends | Who has each and the average amount by band from HMRC Table 3.7; spreads 0.8 / 2.2 / 1.5 | Spreads tuned to HMRC's tax on savings and dividends |
| Interest and dividend uprating to 2026-27 | Interest ×1.6, dividends ×1.03 (not earnings growth) | HMRC projects tax on savings up 48% from 2023-24 (higher interest, frozen allowances) and on dividends up 25% (mostly the April 2026 rate rise). Tuned to HMRC's 2026-27 tax by source |
| Pension contributions | Share contributing and average amount by band from HMRC Table 3.8 | HMRC |
| People outside private households | Single adults 18–64, pay median £24,000; starting total 2.5m | Sized by calibration |
| Rents | FRS 2024-25 average by region and tenure, uprated with OBR rent growth, with a spread | FRS, OBR |
| Childcare | 35% of working households with a child under 5, median £700 a month | Rough |
| Universal Credit take-up | 85% | Rough; DWP doesn't publish a current take-up rate |
| Child Benefit | Opt-out by 60% of families whose higher earner is on £60,000–£80,000, 90% above £80,000; 4% of other families don't claim | Tuned to HMRC's Child Benefit and charge figures |

Uprating to 2026-27 otherwise uses the OBR's March 2026 forecasts: average earnings +7.9% from 2024-25 and +13.9% from 2023-24, plus rent growth.

## How well it fits the targets

Median miss for each group of targets, before and after calibration:

| Targets | Number | Before | After | Worst after |
|---|---:|---:|---:|---:|
| **HMRC 2026-27 taxpayers and income by income range** (weighted ×2) | 22 | 9% | 1.9% | 6% |
| **HMRC 2026-27 income tax by source** | 3 | 15% | 3.0% | 10% |
| HMRC 2023-24 pay, profits, pensions and self-employed counts by band, uprated (pay and pensions weighted ×0.3) | 60 | 15% | 2.1% | 24% |
| HMRC property, interest and dividends by band (amounts and people) | 72 | 26% | 1.1% | 14% |
| HMRC pension contributions by band | 12 | 13% | 0.6% | 7% |
| HMRC taxpayers and income by region | 24 | 15% | 9.0% | 18% |
| HMRC costs of the NICs thresholds | 2 | 3% | 1.5% | 2% |
| OBR employee count | 1 | 5% | 3.9% | |
| FRS adults by age | 9 | 13% | 6.5% | 15% |
| UC households and spending, family type × tenure | 24 | 67% | 3.8% | 18% |
| UC households by region and family type | 44 | 76% | 2.3% | 16% |
| UC households by number of children | 10 | 62% | 5.5% | 15% |
| UC households by health condition | 8 | 91% | 7.9% | 18% |
| UC households with a disabled child | 4 | 97% | 2.3% | 13% |
| UC households with a carer element | 4 | 57% | 4.7% | 15% |
| Child Benefit families by size (weighted ×2) | 5 | 8% | 4.1% | 5% |
| Child Benefit opt-outs | 1 | 176% | 31% | |
| Child Benefit charge revenue | 1 | 90% | 19% | |
| FRS households by region, children, tenure | 96 | 0% | 1.5% | 6% |
| FRS households by income and composition | 77 | 23% | 4.4% | 65% |

HMRC's own projections for 2026-27 (Income Tax liabilities statistics, July 2026) count taxpayers and income in each band for this exact year, so they carry more weight than 2023-24 figures uprated with earnings. Uprating assumes everyone's income rose together, so it misses frozen thresholds pulling more people into tax. HMRC's band tables count only people who actually owe tax, so the targets do the same (using each person's tax from the engine).

The worst misses:
- **Lone parents**: DWP counts 2.2 million lone-parent households on Universal Credit. The FRS has 1.5 million single-adult households with children in total, because surveys under-count, and many lone parents live with other adults (counted as one household in the FRS, but separate on UC). The FRS lone-parent income cells absorb the difference.
- **Regional incomes** miss by 9% on the median. Pay is drawn the same way in every region; a regional pay difference in the seed would help.
- **Child Benefit opt-outs** are 31% high, while the charge is 19% high. Who opts out among higher earners is still a guess.

## Checks against published figures

| Measure | Population | Published | Source | In calibration? |
|---|---:|---:|---|---|
| Households | 29.04m | 28.97m | FRS 2024-25 | yes, indirectly |
| People outside private households | 2.49m | none published | | sized by calibration |
| **Income taxpayers, 2026-27** | **39.2m** | 40.8m | HMRC liabilities 2026-27 | by band |
| Employees (private households) | 28.7m | 29.8m | OBR March 2026 | yes |
| People with a second job | 1.61m | 1.29m | ONS LFS mid-2026 (secondary reports) | no |
| **Income tax** | **£347.9bn** | **£347.0bn liabilities** (£359.6bn receipts) | HMRC liabilities 2026-27; OBR | by source |
| of which on earnings, pensions and property | £320.2bn | £318.8bn | HMRC 2026-27, table 2.6 | yes |
| of which on savings | £7.3bn | £8.2bn | HMRC 2026-27, table 2.6 | yes |
| of which on dividends | £20.4bn | £19.8bn | HMRC 2026-27, table 2.6 | yes |
| **Employee NICs** | **£53.1bn** | £51.5bn | OBR | no |
| **Employer NICs** (after the lump sums below) | **£155.1bn** | £151.0bn | OBR | no |
| Cost of the NICs primary threshold | £29.7bn | £30.4bn | HMRC tax relief statistics 2025-26 | yes |
| Cost of the NICs secondary threshold | £24.2bn | £24.4bn | HMRC tax relief statistics 2025-26 | yes |
| **Self-employed NICs** | **£3.11bn** | £3.16bn | OBR | no |
| **Employee NICs exemption over State Pension age** | **£0.9bn** | £1.2bn | HMRC tax relief statistics 2025-26 | no |
| **Child Benefit spending** | **£14.6bn** | £13.7bn | OBR | no |
| Families paid Child Benefit | 7.09m | 6.87m | HMRC Aug 2025 | yes |
| Child Benefit charge | £0.43bn | £0.36bn | HMRC 2024-25 provisional | yes, low priority |
| Households on Universal Credit | 7.00m | 7.16m | DWP May 2026 | yes |
| **Universal Credit spending** | **£89.0bn** | £87.7bn | OBR | through DWP's averages |

**Employer NICs lump sums.** Two employer reliefs depend on the employer, not the household, so they can't be given to a household in the population. Population totals take off HMRC's 2025-26 cost estimates (tax relief statistics, January 2026) as one figure each:

- the Employment Allowance (£7.4bn)
- the zero rate for apprentices under 25 (£0.57bn)

The zero rate for employees under 21 *is* modelled, because age is known.

What this says, plainly:

- **Income tax matches HMRC's 2026-27 liabilities to within 0.3%,** and by source to within 1–11%. HMRC's liabilities are the like-for-like comparison: the OBR's £359.6bn is cash received, which includes tax not owed by individuals in the year.
- **Universal Credit matches:** spending within 1.5%, households within 2%.
- **Self-employed NICs match** (within 2%), and so do the costs of the NICs thresholds (within 3%).
- **Employee and employer NICs are about 3% high,** with 4% too few employees. Pay per employee is a little high.
- **Taxpayers are 4% short** (39.2m against 40.8m), even with the group outside private households.
- **Child Benefit spending is 6% high.** About half of that is structural: this year's rates applied to HMRC's exact count of families give £14.2bn, while the OBR's £13.7bn allows for timing and take-up.
- **The employee NICs exemption for working pensioners is £0.9bn against HMRC's £1.2bn.**

## The income distribution, against HBAI (held back)

HBAI ("Households below average income") is DWP's official measure of household incomes. Its figures were never calibration targets, so they test whether the population's *spread* of incomes is right, not just its totals. Income is net household income before housing costs, after pension contributions, adjusted for household size the way HBAI does it (the modified OECD scale), counted per person. HBAI's 2024-25 figures are uprated to 2026-27 with OBR earnings growth. People outside private households are left out, as they are from HBAI.

| Group | Median, ours | Median, HBAI | Mean, ours | Mean, HBAI | People, ours | People, HBAI |
|---|---:|---:|---:|---:|---:|---:|
| Children | £668 | £681 | £758 | £827 | 13.4m | 14.7m |
| Working-age adults | £827 | £837 | £995 | £984 | 39.8m | 41.4m |
| Pensioners | £718 | £704 | £828 | £830 | 12.5m | 12.2m |

(£ a week, equivalised.)

- **Typical incomes match closely:** medians within 1–2% for all three groups, and means for working-age adults and pensioners within 1%.
- **Children's mean is 8% low.** Better-off families with children seem too few, or too poor.
- **Two differences roughly cancel, and we can't yet separate them.** HBAI's net income takes off council tax, which we don't model; that makes ours too high. It also adds disability benefits, Carer's Allowance, Pension Credit and others, which we don't model either; that makes ours too low.
- **Head-counts differ by 3–9%.** HBAI counts 16–19 year-olds in education as children and 16–17 year-olds as working age; ours start adults at 18 and don't have the older children.

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

The engine results don't change with calibration (only the weights do), so the seed's results file serves for both.

The last step writes `public/data/population-2026-27.json`, the file the site loads: 3.1 MB, or about 0.7 MB compressed. Money is rounded to whole pounds and weights to one decimal place, which moves totals by well under 0.1%. `test/population.test.ts` checks the shipped file still matches the published totals within the gaps explained here.
