# The synthetic population

**This population is made up.** No household in it is a real household. It's built so that, taken together, it matches published UK totals. Results from it are estimates, and they're labelled as such wherever they appear.

It replaces survey microdata (the Family Resources Survey), which can't be published. See RESEARCH.md, decision 1.

## How it's built

1. **Targets** (`data/targets/`, listed with sources in `targets.yaml`): published tables from HMRC, DWP, the Family Resources Survey via Stat-Xplore, and the OBR.
2. **Seed** (`data/build_seed.py`): 30,012 made-up private households, plus 2,000 people outside private households (below). That's 37,700 benefit units in all. Households are spread across all 12 regions, the four tenures, and households with and without children, in proportion to the FRS, with at least 40 in every combination. Each starts with a weight: how many real households it stands for.
3. **Calibration** (`data/calibrate.py`): the weights are scaled up or down to bring the weighted totals as close as possible to 506 published figures at once. Each household's scaling is kept as close to 1 as it can be, and never below ÷10 or above ×10. Published sources disagree with each other slightly, so this minimises the misses rather than forcing an exact match. Every miss is reported in `data/build/calibration_report.csv`.
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
- **Ages fit together.** A parent's age is their oldest child's age plus their age at that birth (about 31 on average), so parents are mostly 30–55. Other working-age adults fill in the rest of the FRS's age bands. Pensioners' ages follow the FRS's 65–74, 75–84 and 85+ bands. Children's ages follow HMRC's Child Benefit records year by year, up to 19 (young people still in education count as children).
- **Pay rises and falls with age, and varies by region.** Both come from HMRC's own figures for taxpayers: median income by age (Table 3.2) and by region (Table 3.11). Very high pay is rarer at 25 than at 50, and twice as common in London as in Wales, following the gap between mean and median income in the same tables.
- **Household type follows the FRS for each tenure.** For example, lone parents make up 13% of social-renting households but 1% of outright owners.
- **Pensioners live where the FRS says they do.** For example, 56% of women living alone are pensioners, but only 22% of households of three or more adults include one. In families with children, a pensioner is a grandparent.
- **Property, savings and dividend income** is drawn separately, following HMRC's figures for who has each kind and how much, by income band (Table 3.7). The engine taxes it by the real rules.
- **Pension contributions** deducted before tax follow HMRC's figures by band (Table 3.8: £40bn a year through workplace and personal pensions). They cut income tax but not National Insurance.
- **Side self-employment.** Some employees and pensioners also have a small business. HMRC counts more people with self-employment income than have it as their main job.
- **Child Benefit: claiming, opted out, or never claimed.** HMRC counts 11.7 million children in paid families and 1.0 million in families who opted out of payment. HBAI counts 14.7 million children. The other 2 million or so are in families who never claimed: many higher earners who would only pay it back through the charge, and some families who aren't eligible. HMRC's opt-out figures don't count them.

### People outside private households

HMRC counts everyone with a UK income tax liability during the year, from tax records. The FRS, which the households are built from, is a snapshot of private households. HMRC's count therefore includes people the households can't: students in halls, armed forces in barracks, care home residents, people here or working for only part of the year, and non-residents with UK income.

The population includes a separate group of single adults for them:
- They have earnings, and some have property, savings and dividend income and pension contributions.
- They count in HMRC's targets (taxpayers, income bands, NICs thresholds).
- They're left out of every household-based target and check (FRS, LFS employees, HBAI, Universal Credit, Child Benefit).
- **Calibration sizes the group: 2.6 million people.** No published figure gives the size directly, so treat it as an estimate.

A test of the size: HMRC's payroll records show 30.3 million people on a payroll in September 2026, and the population has 32.4 million people paid during the year (29.8 million in households plus this group). The two aren't the same measure. The payroll figure is one month, and more people than that are paid at some point in a year, through job changes, seasonal and temporary work, and people arriving or leaving. A gap of about 2 million is plausible, but no published figure confirms it.

## Assumptions in the seed

These are starting values. Calibration corrects the totals, but guesses about *how things combine* partly survive it. Where a value was tuned to bring a published figure into line, the table says so.

| Assumption | Value | Why |
|---|---|---|
| Work status (working age) | FRS 2024-25 by tenure and age band | FRS |
| Full-time pay | Median £36,000, spread 0.5, 6% top tail from £80,000, before the age and region factors | Below ASHE's median (about £39,000, 2025), because the FRS's full-time group includes younger and newer workers. Tuned so NICs and the employee count both come close |
| Pay by age | HMRC's median income of taxpayers by age, relative to the working-age average, raised to the power 1.5 | HMRC Table 3.2. Taxpayer medians leave out low-paid young people, so they understate how much pay rises with age; the power 1.5 is tuned to HMRC's taxpayers' income by age |
| Pay by region | HMRC's median income of taxpayers by region, relative to the UK (London 1.21, Wales 0.94) | HMRC Table 3.11, interpolated within bands |
| Chance of very high pay | Scaled by age and region using the gap between mean and median income (London 1.75×, Wales 0.52×; age 25 0.46×, age 50 1.43×) | HMRC Tables 3.2 and 3.11 |
| Part-time pay | Median £13,000 | ASHE 2025 |
| Full-time self-employed profits | Median £20,000, 2% top tail from £80,000 | Tuned to HMRC's self-employment figures |
| Part-time self-employed profits | Median £8,000 | Rough |
| Side self-employment | 7% of employees and pensioners, median £4,000 | HMRC counts more people with self-employment income than have it as their main job |
| Second jobs | 6% of employees, median £5,000 | ONS: about 1.29m people in 2026 |
| Health element | 85% of permanently sick, 30% of temporarily sick, 10% of unemployed (90% at the protected rate) | Rough, then checked against DWP's UC health tables |
| Carers | 25% of those looking after family, 15% of other inactive, 3% of workers; 60% of parents of a disabled child and 50% of partners of someone with the health element, if not in well-paid work | Rough; checked against DWP's carer-element tables |
| Retired before State Pension age | Private pension, median £12,000 | Rough |
| Pensioners on the new State Pension | 60% (rest on the old basic pension) | Rough; new pension £241.30 a week, old £184.90 (DWP) |
| Pensioners with a private pension | 65%, median £8,500, spread 0.9, 2% tail from £50,000 | Tuned between HMRC's pension income by band (too little in the £20,000–£50,000 bands at £7,000) and HBAI's pensioner median (7% over at £10,000) |
| Pensioners under 75 with a job | 20%, median pay £13,000 | Tuned so their NICs exemption comes near HMRC's £1.2bn |
| Pensioner couples | 70% both over State Pension age; otherwise the partner is 55–65 | Rough |
| Extra adults in large households | Grown-up children (25–49 if the parents are pensioners, otherwise 18–30); grandparents per the FRS; 5% other older relatives | Rough |
| Ages | Parents: oldest child's age plus an age at birth averaging 31.5 (spread 5.5 years). Other working-age adults: what's left of the FRS's age bands (worked out in a first pass). Pensioners: the FRS's bands from 66. Children: HMRC's Child Benefit counts by single year of age, 0–19 | ONS births statistics put average ages at birth at about 31 for mothers and 34 for fathers; FRS; HMRC |
| Disabled children | 12% (30% at the higher rate) | DWP shows 19% of lone parents on UC have a disabled child |
| Property, interest, dividends | Who has each and the average amount by band from HMRC Table 3.7; spreads 0.8 / 2.2 / 1.5 | Spreads tuned to HMRC's tax on savings and dividends |
| Interest and dividend uprating to 2026-27 | Interest ×1.6, dividends ×1.03 (not earnings growth) | HMRC projects tax on savings up 48% from 2023-24 (higher interest, frozen allowances) and on dividends up 25% (mostly the April 2026 rate rise). Tuned to HMRC's 2026-27 tax by source |
| Pension contributions | Share contributing and average amount by band from HMRC Table 3.8 | HMRC |
| People outside private households | Single adults 18–64, pay median £24,000; starting total 2.5m | Sized by calibration |
| Rents | FRS 2024-25 average by region and tenure, uprated with OBR rent growth, with a spread | FRS, OBR |
| Childcare | 35% of working households with a child under 5, median £700 a month | Rough |
| Universal Credit take-up | 85% | Rough; DWP doesn't publish a current take-up rate |
| Child Benefit | Families whose higher earner is on £60,000–£80,000: 30% opted out, 30% never claimed. Above £80,000: 45% and 45%. Other families: 4% never claimed | Rough guesses; calibration balances them against HMRC's paid families, opt-outs and charge, and HBAI's children |

Uprating to 2026-27 otherwise uses the OBR's March 2026 forecasts: average earnings +7.9% from 2024-25 and +13.9% from 2023-24, plus rent growth.

## How well it fits the targets

Median miss for each group of targets, before and after calibration:

| Targets | Number | Before | After | Worst after |
|---|---:|---:|---:|---:|
| **HMRC 2026-27 taxpayers and income by income range** (weighted ×2) | 22 | 8% | 1.0% | 7% |
| **HMRC 2026-27 income tax by source** | 3 | 11% | 5.7% | 10% |
| HMRC 2023-24 pay, profits, pensions and self-employed counts by band, uprated (pay and pensions weighted ×0.3) | 60 | 12% | 2.2% | 28% |
| HMRC property, interest and dividends by band (amounts and people) | 72 | 18% | 1.2% | 16% |
| HMRC pension contributions by band | 12 | 13% | 1.3% | 8% |
| HMRC taxpayers and income by region (as shares of the 2026-27 total) | 24 | 7% | 2.1% | 12% |
| HMRC taxpayers and income by age (as shares of the 2026-27 total) | 26 | 15% | 3.9% | 13% |
| HMRC costs of the NICs thresholds | 2 | 3% | 2.6% | 3% |
| OBR employee count | 1 | 5% | 0.2% | |
| FRS adults by age | 9 | 2% | 1.5% | 8% |
| UC households and spending, family type × tenure | 24 | 67% | 4.0% | 16% |
| UC households by region and family type | 44 | 72% | 2.3% | 16% |
| UC households by number of children | 10 | 63% | 3.6% | 15% |
| UC households by health condition | 8 | 72% | 8.3% | 19% |
| UC households with a disabled child | 4 | 77% | 2.6% | 13% |
| UC households with a carer element | 4 | 50% | 5.8% | 18% |
| Child Benefit families by size (weighted ×2) | 5 | 13% | 1.5% | 5% |
| Child Benefit opt-outs | 1 | 57% | 5.7% | |
| Child Benefit charge revenue | 1 | 147% | 25% | |
| HBAI children | 1 | 6% | 3.2% | |
| FRS households by region, children, tenure | 96 | 0% | 1.3% | 8% |
| FRS households by income and composition | 77 | 29% | 3.5% | 66% |

HMRC's region and age tables are for 2023-24. They're used only for how taxpayers and income divide between regions and ages: each is scaled to add up to HMRC's 2026-27 totals.

HMRC's own projections for 2026-27 (Income Tax liabilities statistics, July 2026) count taxpayers and income in each band for this exact year, so they carry more weight than 2023-24 figures uprated with earnings. Uprating assumes everyone's income rose together, so it misses frozen thresholds pulling more people into tax. HMRC's band tables count only people who actually owe tax, so the targets do the same (using each person's tax from the engine).

The worst misses:
- **Lone parents**: DWP counts 2.2 million lone-parent households on Universal Credit. The FRS has 1.5 million single-adult households with children in total, because surveys under-count, and many lone parents live with other adults (counted as one household in the FRS, but separate on UC). The FRS lone-parent income cells absorb the difference.
- **London's taxpayers' income** is still 12% short, and Wales's 10% over. Both are closer than before pay varied by region (London was 17% short, the median region 9% out; now 2%).
- **Income by age** is still too flat: taxpayers under 35 have 8–13% too much income, and those aged 50–64 have 8–9% too little. Young adults are also 8% too few, because calibration trims them for being too well paid. A published pay-by-age table (ASHE) in the seed, in place of HMRC's taxpayer medians, should help.
- **The Child Benefit charge** is 25% high. Opt-outs now fit (6%), but who keeps claiming among higher earners is still a guess.

## Checks against published figures

| Measure | Population | Published | Source | In calibration? |
|---|---:|---:|---|---|
| Households | 29.38m | 28.97m | FRS 2024-25 | yes, indirectly |
| People outside private households | 2.63m | none published | | sized by calibration |
| **Income taxpayers, 2026-27** | **40.1m** | 40.8m | HMRC liabilities 2026-27 | by band |
| Employees (private households) | 29.8m | 29.8m | OBR March 2026 | yes |
| **Everyone paid during the year** | **32.4m** | 30.3m on payrolls in one month | ONS/HMRC PAYE RTI, September 2026 | no; not the same measure (see above) |
| People with a second job | 1.72m | 1.29m | ONS LFS mid-2026 (secondary reports) | no |
| **Income tax** | **£354.7bn** | **£347.0bn liabilities** (£359.6bn receipts) | HMRC liabilities 2026-27; OBR | by source |
| of which on earnings, pensions and property | £326.4bn | £318.8bn | HMRC 2026-27, table 2.6 | yes |
| of which on savings | £7.4bn | £8.2bn | HMRC 2026-27, table 2.6 | yes |
| of which on dividends | £20.9bn | £19.8bn | HMRC 2026-27, table 2.6 | yes |
| **Employee NICs** | **£54.5bn** | £51.5bn | OBR | no |
| **Employer NICs** (after the lump sums below) | **£164.1bn** | £151.0bn | OBR | no |
| Cost of the NICs primary threshold | £31.0bn | £30.4bn | HMRC tax relief statistics 2025-26 | yes |
| Cost of the NICs secondary threshold | £25.2bn | £24.4bn | HMRC tax relief statistics 2025-26 | yes |
| **Self-employed NICs** | **£3.07bn** | £3.16bn | OBR | no |
| **Employee NICs exemption over State Pension age** | **£0.8bn** | £1.2bn | HMRC tax relief statistics 2025-26 | no |
| **Child Benefit spending** | **£13.7bn** | £13.7bn | OBR | no |
| Families paid Child Benefit | 6.61m | 6.87m | HMRC Aug 2025 | yes |
| Child Benefit charge | £0.45bn | £0.36bn | HMRC 2024-25 provisional | yes, low priority |
| Children | 14.2m | 14.7m | HBAI 2024-25 | yes |
| Households on Universal Credit | 7.02m | 7.16m | DWP May 2026 | yes |
| **Universal Credit spending** | **£87.9bn** | £87.7bn | OBR | through DWP's averages |

**Employer NICs lump sums.** Two employer reliefs depend on the employer, not the household, so they can't be given to a household in the population. Population totals take off HMRC's 2025-26 cost estimates (tax relief statistics, January 2026) as one figure each:

- the Employment Allowance (£7.4bn)
- the zero rate for apprentices under 25 (£0.57bn)

The zero rate for employees under 21 *is* modelled, because age is known.

What this says, plainly:

- **Income tax is 2.2% over HMRC's 2026-27 liabilities.** HMRC's liabilities are the like-for-like comparison: the OBR's £359.6bn is cash received, which includes tax not owed by individuals in the year. Taxpayers and their income match HMRC band by band, so the gap is in how the tax is worked out. Reliefs the engine doesn't model yet explain perhaps £2bn of the £8bn. HMRC's tax relief statistics cost Marriage Allowance at £0.6bn and investment reliefs (EIS, SEIS and VCTs) at £0.9bn. Charitable reliefs cost £2.9bn, but only the higher-rate part of that reduces donors' own tax. The rest isn't explained yet. (Before this round's changes, income tax matched to 0.3%, but with 1.6m too few taxpayers. The two errors cancelled.)
- **Universal Credit and Child Benefit spending match** within 0.3%.
- **Self-employed NICs match** (within 3%), and so do the costs of the NICs thresholds (within 3%).
- **Taxpayers are 2% short** (40.1m against 40.8m) and employees match.
- **Employer NICs are 9% over the OBR's receipts but match HMRC's pay base.** HMRC's ready reckoner puts 1p on employer NICs at £11.15bn, and ours gives £11.47bn (3% more). The difference is probably the OBR's forecast allowing for employers responding to the April 2025 rise (through lower pay, for example), which a static population doesn't. That's a likely explanation, not a confirmed one.
- **Employee NICs are 6% high** (13% on the ready reckoner's main rate). There's too much pay between £12,570 and £50,270. This is the clearest remaining problem for costings.
- **The employee NICs exemption for working pensioners is £0.8bn against HMRC's £1.2bn.**

## The income distribution, against HBAI (held back)

HBAI ("Households below average income") is DWP's official measure of household incomes. Its incomes were never calibration targets (only its count of children is), so they test whether the population's *spread* of incomes is right, not just its totals. Income is net household income before housing costs, after pension contributions, adjusted for household size the way HBAI does it (the modified OECD scale), counted per person. HBAI's 2024-25 figures are uprated to 2026-27 with OBR earnings growth. People outside private households are left out, as they are from HBAI.

| Group | Median, ours | Median, HBAI | Mean, ours | Mean, HBAI | People, ours | People, HBAI |
|---|---:|---:|---:|---:|---:|---:|
| Children | £678 | £681 | £816 | £827 | 14.2m | 14.7m |
| Working-age adults | £819 | £837 | £974 | £984 | 41.0m | 41.4m |
| Pensioners | £736 | £704 | £837 | £830 | 12.2m | 12.2m |

(£ a week, equivalised.)

- **Incomes match closely:** medians and means within 2% for children and working-age adults. Pensioners' mean is within 1% and their median is 5% high.
- **Children's mean was 8% low and is now 1% low.** The missing better-off families with children were the ones who never claimed Child Benefit, whom HMRC's figures don't count.
- **Two differences roughly cancel, and we can't yet separate them.** HBAI's net income takes off council tax, which we don't model; that makes ours too high. It also adds disability benefits, Carer's Allowance, Pension Credit and others, which we don't model either; that makes ours too low.
- **Head-counts are within 3%.** HBAI counts 16–17 year-olds who've left education as working age; ours start adults at 18.

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
