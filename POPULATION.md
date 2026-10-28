# The synthetic population

**This population is made up.** No household in it is a real household. It's built so that, taken together, it matches published UK totals. Results from it are estimates, and they're labelled as such wherever they appear.

It replaces survey microdata (the Family Resources Survey), which can't be published. See RESEARCH.md, decision 1.

## How it's built

1. **Targets** (`data/targets/`, listed with sources in `targets.yaml`): published tables from HMRC, DWP, the Family Resources Survey via Stat-Xplore, and the OBR.
2. **Seed** (`data/build_seed.py`): 30,012 made-up private households, plus 2,000 people outside private households (below). With 600 extra top-income households (below), that's 38,328 benefit units in all. Households are spread across all 12 regions, the four tenures, and households with and without children, in proportion to the FRS, with at least 40 in every combination. Each starts with a weight: how many real households it stands for.
3. **Calibration** (`data/calibrate.py`): the weights are scaled up or down to bring the weighted totals as close as possible to 773 published figures at once. Each household's scaling is kept as close to 1 as it can be, and never below ÷10 or above ×10. Published sources disagree with each other slightly, so this minimises the misses rather than forcing an exact match. Every miss is reported in `data/build/calibration_report.csv`.
4. **Checks**: totals that were *not* used in calibration test the result (below).

**How much depends on the random draws.** The seed is made with random numbers. Rebuilding it from three different starting points (`POPULATION_SEED=2027` and `2028`, against the standard 2026) moves every tax and benefit total by under 1%: income tax by 0.3%, NICs by 0.7%, Universal Credit by 0.1%, Child Benefit by 0.4%. Smaller figures move more: the Marriage Allowance cost by 4%, the working-pensioner NICs exemption by 4%, people with a second job by 9%.

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
- **Employees' pay comes from ONS's Annual Survey of Hours and Earnings (ASHE 2026)**, for full- and part-time workers in their age group. Pay is drawn between ASHE's percentiles (10th to 90th). Above the 90th it follows a Pareto tail sized so each group's average matches ASHE's. After calibration, employees' pay matches ASHE: average £44,233 against ASHE's £44,286 (uprated one year), and every percentile within 5%.
- **Pay varies by region**, by HMRC's median income of taxpayers in each region (Table 3.11). Regions with more very high earners (London most) get a heavier top tail. Self-employed profits rise and fall with age by HMRC's taxpayer medians (Table 3.2).
- **Household type follows the FRS for each tenure.** For example, lone parents make up 13% of social-renting households but 1% of outright owners.
- **Pensioners' work follows the FRS for their age band.** Among 65–74-year-olds, 13% are employees and 6% self-employed; among 75–84-year-olds, 2% and 3%. Their pay comes from ASHE's 60+ group. This brings the cost of their NICs exemption to £1.18bn, against HMRC's £1.2bn, with nothing tuned.
- **Self-employed profits are calibrated to HMRC's count of self-employed taxpayers in each range of profits** (Table 3.10), which is what the Class 4 rates and limits apply to.
- **Pensioners live where the FRS says they do.** For example, 56% of women living alone are pensioners, but only 22% of households of three or more adults include one. In families with children, a pensioner is a grandparent.
- **Property, savings and dividend income** is drawn separately, following HMRC's figures for who has each kind and how much, by income band (Table 3.7). The engine taxes it by the real rules.
- **Pension contributions** deducted before tax follow HMRC's figures by band (Table 3.8: £40bn a year through workplace and personal pensions). They cut income tax but not National Insurance.
- **Other deductions** before tax (trading and property losses, qualifying interest and similar: £6.3bn in 2023-24) follow HMRC's figures by band (Table 3.8). A third of the total belongs to people on over £1m.
- **Tax reductions** (reliefs that cut the tax bill directly, like EIS and VCT relief or relief for tax paid abroad) go to some higher and additional-rate taxpayers, calibrated to HMRC's totals for each: £1.1bn and £3.7bn in 2026-27 (Table 2.6).
- **Marriage Allowance.** Half of couples are set to claim it when it would help: about 78% of couples are married or in a civil partnership, and take-up is a guess.
- **Extra households at the very top.** 150 extra households in each of HMRC's ranges from £200,000 (to £500,000, £1m, £2m, and above), each with one very high earner. Their region follows HMRC's count of taxpayers on £200,000 or more in each region, and their mix of pay, profits, pensions and investment income follows HMRC's figures for their range. Without them, how many very rich people the population had depended on a handful of lucky draws, and income tax moved by £12bn from one set of draws to another.
- **Side self-employment.** Some employees and pensioners also have a small business. HMRC counts more people with self-employment income than have it as their main job.
- **Child Benefit: claiming, opted out, or never claimed.** HMRC counts 11.7 million children in paid families and 1.0 million in families who opted out of payment. HBAI counts 14.7 million children. The other 2 million or so are in families who never claimed: many higher earners who would only pay it back through the charge, and some families who aren't eligible. HMRC's opt-out figures don't count them.

### People outside private households

HMRC counts everyone with a UK income tax liability during the year, from tax records. The FRS, which the households are built from, is a snapshot of private households. HMRC's count therefore includes people the households can't: students in halls, armed forces in barracks, care home residents, people here or working for only part of the year, and non-residents with UK income.

The population includes a separate group of single adults for them:
- They have earnings, and some have property, savings and dividend income and pension contributions.
- They count in HMRC's targets (taxpayers, income bands, NICs thresholds).
- They're left out of every household-based target and check (FRS, LFS employees, HBAI, Universal Credit, Child Benefit).
- **Calibration sizes the group: 2.8 million people.** No published figure gives the size directly, so treat it as an estimate. Their pay is drawn around £16,000, lower than a full year's, because most are taken to be part-year workers.

A test of the size: HMRC's payroll records show 30.3 million people on a payroll in September 2026, and the population has 31.5 million people paid during the year (28.7 million in households plus this group). The two aren't the same measure. The payroll figure is one month, and more people than that are paid at some point in a year, through job changes, seasonal and temporary work, and people arriving or leaving. A gap of about 2 million is plausible, but no published figure confirms it.

## Assumptions in the seed

These are starting values. Calibration corrects the totals, but guesses about *how things combine* partly survive it. Where a value was tuned to bring a published figure into line, the table says so.

| Assumption | Value | Why |
|---|---|---|
| Work status (working age) | FRS 2024-25 by tenure and age band | FRS |
| Full- and part-time employees' pay | ASHE 2026 annual pay by age group (18–21, 22–29, 30–39, 40–49, 50–59, 60+): interpolated between the percentiles; below the 10th, a straight line down from half of it; above the 90th, a Pareto tail matching the group's mean (α about 2–3 full-time). Uprated one year with OBR earnings growth (3.2%) | ONS ASHE Table 6.7a. Only the shape below the 10th percentile is a guess |
| Pay by region | HMRC's median income of taxpayers by region, relative to the UK (London 1.21, Wales 0.94); the top tail's α divided by the square root of the region's mean-to-median spread relative to the UK's (London's 1.75 gives a heavier tail) | HMRC Table 3.11, interpolated within bands; the square root is a judgement |
| Self-employed profits by age and region | HMRC's median income of taxpayers by age and region relative to the average; the chance of the top tail scaled by the gap between mean and median | HMRC Tables 3.2 and 3.11 |
| Full-time self-employed profits | Median £20,000, 3% top tail from £80,000 with α 1.2 | Tuned to HMRC's self-employment figures; the heavy tail is for HMRC's 11,000 self-employed with over £1m (£22bn of profits) |
| Part-time self-employed profits | Median £8,000 | Rough |
| Side self-employment | 7% of employees, median £4,000 | HMRC counts more people with self-employment income than have it as their main job |
| Second jobs | 4.5% of employees, median £5,000 | ONS: about 1.29m people in 2026; tuned to come near it |
| Health element | 85% of permanently sick, 30% of temporarily sick, 10% of unemployed (90% at the protected rate) | Rough, then checked against DWP's UC health tables |
| Carers | 25% of those looking after family, 15% of other inactive, 3% of workers; 60% of parents of a disabled child and 50% of partners of someone with the health element, if not in well-paid work | Rough; checked against DWP's carer-element tables |
| Retired before State Pension age | Private pension, median £12,000 | Rough |
| Pensioners on the new State Pension | 60% (rest on the old basic pension) | Rough; new pension £241.30 a week, old £184.90 (DWP) |
| Pensioners with a private pension | 65%, median £8,500, spread 0.9, 2% tail from £50,000 | Tuned between HMRC's pension income by band (too little in the £20,000–£50,000 bands at £7,000) and HBAI's pensioner median (7% over at £10,000) |
| Pensioners' work | FRS 2024-25 work status by age band (65–74, 75–84, 85+); employees paid from ASHE's 60+ group, self-employed as other self-employed | FRS, ASHE (replaces a guessed 20% working, median £13,000) |
| Pensioner couples | 70% both over State Pension age; otherwise the partner is 55–65 | Rough |
| Extra adults in large households | Grown-up children (25–49 if the parents are pensioners, otherwise 18–30); grandparents per the FRS; 5% other older relatives | Rough |
| Ages | Parents: oldest child's age plus an age at birth averaging 31.5 (spread 5.5 years). Other working-age adults: what's left of the FRS's age bands (worked out in a first pass). Pensioners: the FRS's bands from 66. Children: HMRC's Child Benefit counts by single year of age, 0–19 | ONS births statistics put average ages at birth at about 31 for mothers and 34 for fathers; FRS; HMRC |
| Disabled children | 12% (30% at the higher rate) | DWP shows 19% of lone parents on UC have a disabled child |
| Property, interest, dividends | Who has each and the average amount by band from HMRC Table 3.7; spreads 0.8 / 2.2 / 1.5 | Spreads tuned to HMRC's tax on savings and dividends |
| Interest and dividend uprating to 2026-27 | Interest ×1.6, dividends ×1.03 (not earnings growth) | HMRC projects tax on savings up 48% from 2023-24 (higher interest, frozen allowances) and on dividends up 25% (mostly the April 2026 rate rise). Tuned to HMRC's 2026-27 tax by source |
| Pension contributions | Share contributing and average amount by band from HMRC Table 3.8 | HMRC |
| Other deductions | Share with them and average amount by band from HMRC Table 3.8, spread 1.2, at most half of income | HMRC; the spread is a guess |
| Tax reductions | 30% of additional-rate taxpayers (average £16,000) and 5% of higher-rate taxpayers (average £3,000), spread 1.2 | Guesses at who has them; calibration matches HMRC's totals by type of taxpayer |
| Marriage Allowance | 50% of couples claim when it helps | About 78% of couples are married or in a civil partnership (ONS), times a guessed 65% take-up. Comes to £0.48bn against HMRC's £0.59bn cost |
| Top-income households | 150 in each HMRC range from £200,000, starting at half of HMRC's 2026-27 count; income spread evenly (in logs) within the range, Pareto above £2m matching HMRC's mean; mix of sources drawn around the range's average (concentration 3) | HMRC Tables 2.5, 3.7 and 3.11; the numbers of seeds and the concentration are judgements |
| People outside private households | Single adults 18–64, pay median £16,000 (mostly part-year workers), scaled by region; starting total 2.5m | Sized by calibration. At £24,000 their pay pushed the population's total pay further over the national accounts |
| Rents | FRS 2024-25 average by region and tenure, uprated with OBR rent growth, with a spread | FRS, OBR |
| Childcare | 35% of working households with a child under 5, median £700 a month | Rough |
| Universal Credit take-up | 85% | Rough; DWP doesn't publish a current take-up rate |
| Child Benefit | Families whose higher earner is on £60,000–£80,000: 30% opted out, 30% never claimed. Above £80,000: 45% and 45%. Other families: 4% never claimed | Rough guesses; calibration balances them against HMRC's paid families, opt-outs and charge, and HBAI's children |

Uprating to 2026-27 otherwise uses the OBR's March 2026 forecasts: average earnings +7.9% from 2024-25 and +13.9% from 2023-24, plus rent growth.

## How well it fits the targets

Median miss for each group of targets, before and after calibration:

| Targets | Number | Before | After | Worst after |
|---|---:|---:|---:|---:|
| **HMRC 2026-27 taxpayers and income by income range** (weighted ×2) | 22 | 21% | 1.5% | 6% |
| **HMRC 2026-27 income tax by source and type of taxpayer** (earnings, savings, dividends × basic, higher, additional rate; weighted ×2) | 9 | 32% | 1.9% | 19% |
| HMRC 2023-24 pay, profits, pensions and self-employed counts by band, uprated (pay and pensions weighted ×0.3) | 60 | 24% | 2.3% | 15% |
| HMRC property, interest and dividends by band (amounts and people; interest amounts weighted ×0.3) | 72 | 41% | 2.6% | 23% |
| HMRC pension contributions by band | 12 | 27% | 0.8% | 6% |
| HMRC other deductions by band | 12 | 27% | 0.3% | 1% |
| HMRC self-employed taxpayers by range of profits (people and amounts) | 28 | 26% | 1.7% | 8% |
| HMRC taxpayers and income by region (as shares of the 2026-27 total) | 24 | 6% | 1.1% | 5% |
| HMRC taxpayers and income by region and income band (uprated, weighted ×0.3) | 216 | 16% | 2.0% | 6% |
| **Scottish Fiscal Commission: Scottish income tax 2026-27** | 1 | 44% | 5.4% | |
| HMRC 2026-27 tax reductions, higher and additional-rate taxpayers | 2 | 64% | 1.5% | 2% |
| HMRC taxpayers and income by age (as shares of the 2026-27 total) | 26 | 14% | 3.6% | 29% |
| HMRC costs of the NICs thresholds | 2 | 3% | 1.2% | 1% |
| HMRC employer NICs pay base (ready reckoner: £11,150m per 1p, so £1,115bn) | 1 | 14% | 3.4% | |
| OBR employee count (weighted ×2) | 1 | 5% | 4.4% | |
| OBR wages and salaries, £1,298bn (weighted ×2) | 1 | 12% | 2.2% | |
| FRS adults by age | 9 | 3% | 2.1% | 10% |
| UC households and spending, family type × tenure | 24 | 67% | 4.0% | 15% |
| UC households by region and family type | 44 | 68% | 2.2% | 16% |
| UC households by number of children | 10 | 68% | 3.4% | 16% |
| UC households by health condition | 8 | 74% | 8.0% | 18% |
| UC households with a disabled child | 4 | 69% | 2.1% | 14% |
| UC households with a carer element | 4 | 36% | 5.7% | 18% |
| Child Benefit families by size (weighted ×2) | 5 | 15% | 2.3% | 4% |
| Child Benefit opt-outs | 1 | 75% | 5.4% | |
| Child Benefit charge revenue | 1 | 196% | 31% | |
| HBAI children | 1 | 6% | 3.0% | |
| FRS households by region, children, tenure | 96 | 0% | 1.8% | 8% |
| FRS households by income and composition | 77 | 22% | 3.8% | 66% |

The national accounts' wages and salaries stand in for total taxable pay. In 2023-24 they were £1,108bn, close to HMRC's £1,080bn of taxable pay for taxpayers plus the pay of people below the personal allowance.

HMRC's region and age tables are for 2023-24. They're used only for how taxpayers and income divide between regions and ages: each is scaled to add up to HMRC's 2026-27 totals.

HMRC's own projections for 2026-27 (Income Tax liabilities statistics, July 2026) count taxpayers and income in each band for this exact year, so they carry more weight than 2023-24 figures uprated with earnings. Uprating assumes everyone's income rose together, so it misses frozen thresholds pulling more people into tax. HMRC's band tables count only people who actually owe tax, so the targets do the same (using each person's tax from the engine).

The worst misses:
- **Lone parents**: DWP counts 2.2 million lone-parent households on Universal Credit. The FRS has 1.5 million single-adult households with children in total, because surveys under-count, and many lone parents live with other adults (counted as one household in the FRS, but separate on UC). The FRS lone-parent income cells absorb the difference.
- **Regions** are now all within 5% (London was 17% short before pay varied by region).
- **Taxpayers under 25** have 14–28% too much income, and young adults are 10% too few. ASHE's youngest group is 18–21, so 18- and 19-year-olds, many of them students working part-time, get the pay of 20- and 21-year-olds. Ages 25 to 64 are mostly within 5%.
- **The Child Benefit charge** is 29% over HMRC's 2024-25 figure. Part of that is the year: with the £60,000–£80,000 range frozen and pay up about 8% since, more parents pay it in 2026-27, but HMRC publishes no projection to say how much. Who keeps claiming among higher earners is still a guess.

## Checks against published figures

| Measure | Population | Published | Source | In calibration? |
|---|---:|---:|---|---|
| Households | 29.46m | 28.97m | FRS 2024-25 | yes, indirectly |
| People outside private households | 2.80m | none published | | sized by calibration |
| **Income taxpayers, 2026-27** | **40.0m** | 40.8m | HMRC liabilities 2026-27 | by band |
| Employees (private households) | 28.3m | 29.8m | OBR March 2026 | yes |
| **Everyone paid during the year** | **31.3m** | 30.3m on payrolls in one month | ONS/HMRC PAYE RTI, September 2026 | no; not the same measure (see above) |
| All pay | £1,327bn | £1,298bn wages and salaries | OBR March 2026 (national accounts) | yes |
| People with a second job | 1.15m | 1.29m | ONS LFS mid-2026 (secondary reports) | no |
| **Income tax** | **£348.3bn** | **£347.0bn liabilities** (£359.6bn receipts) | HMRC liabilities 2026-27; OBR | by source and type |
| of which on earnings, pensions and property (before tax reductions) | £325.6bn | £318.8bn after them | HMRC 2026-27, table 2.6 | yes, grossed up |
| of which on savings (before tax reductions) | £7.5bn | £8.2bn after them | HMRC 2026-27, table 2.6 | yes, grossed up |
| of which on dividends (before tax reductions) | £20.1bn | £19.8bn after them | HMRC 2026-27, table 2.6 | yes, grossed up |
| **Scottish income tax** (earnings, pensions and property) | **£22.7bn** | £21.5bn | Scottish Fiscal Commission, January 2026 | yes |
| **Marriage Allowance** | **£0.48bn** | £0.59bn | HMRC tax relief statistics 2025-26 | no |
| **Employee NICs** | **£55.1bn** | £51.5bn | OBR | no |
| **Employer NICs** (after the lump sums below) | **£163.7bn** | £151.0bn | OBR | through HMRC's pay base |
| Cost of the NICs primary threshold | £29.8bn | £30.4bn | HMRC tax relief statistics 2025-26 | yes |
| Cost of the NICs secondary threshold | £23.8bn | £24.4bn | HMRC tax relief statistics 2025-26 | yes |
| **Self-employed NICs** | **£3.13bn** | £3.16bn | OBR | no |
| **Employee NICs exemption over State Pension age** | **£1.11bn** | £1.2bn | HMRC tax relief statistics 2025-26 | no |
| **Child Benefit spending** | **£13.7bn** | £13.7bn | OBR | no |
| Families paid Child Benefit | 6.61m | 6.87m | HMRC Aug 2025 | yes |
| Child Benefit charge | £0.49bn | £0.36bn | HMRC 2024-25 provisional | yes, low priority |
| Children | 14.2m | 14.7m | HBAI 2024-25 | yes |
| Households on Universal Credit | 6.95m | 7.16m | DWP May 2026 | yes |
| **Universal Credit spending** | **£87.4bn** | £87.7bn | OBR | through DWP's averages |

**Employer NICs lump sums.** Two employer reliefs depend on the employer, not the household, so they can't be given to a household in the population. Population totals take off HMRC's 2025-26 cost estimates (tax relief statistics, January 2026) as one figure each:

- the Employment Allowance (£7.4bn)
- the zero rate for apprentices under 25 (£0.57bn)

The zero rate for employees under 21 *is* modelled, because age is known.

What this says, plainly:

- **Tax on savings is 9% under HMRC's 2026-27 figure, all of it among additional-rate taxpayers** (18% short there; basic and higher-rate taxpayers' tax on savings is within 2%). Calibration can't put more interest at the top without breaking HMRC's counts of people with interest. HMRC's "savings income" also includes things other than bank and building society interest, such as gains on life insurance bonds, which are concentrated among the wealthiest. That's the likely explanation, not a confirmed one. Interest is uprated from 2023-24 by one factor (×1.6) for every band, so those 2023-24 amounts now carry low weight and HMRC's 2026-27 tax by type of taxpayer leads.
- **Income tax matches HMRC's 2026-27 liabilities to within 0.4%** (£348.3bn against £347.0bn). HMRC's liabilities are the like-for-like comparison: the OBR's £359.6bn is cash received, which includes tax not owed by individuals in the year. Getting here took three things that cut tax, all from HMRC's own figures:
  - **Other deductions** (losses, qualifying interest): about £3bn of tax.
  - **Marriage Allowance**: £0.5bn.
  - **Tax reductions**: £4.8bn. HMRC's Table 2.6 shows £5.4bn of reliefs given as a cut in the tax bill (EIS, SEIS and VCT relief, relief for tax paid abroad and similar; £0.6bn of it, for basic-rate taxpayers, is essentially Marriage Allowance). Our tax before them was £352.4bn, which is HMRC's £347.0bn plus £5.4bn almost exactly.
  - **Pension contributions are treated the same way as HMRC's.** About half (£19bn) are "relief at source", where the pension provider claims the basic-rate relief. The engine takes every contribution off income before tax, and so does HMRC's model behind these figures: its supporting documentation says income after deductions is "total income minus contributions to occupational and private pensions" and charities, which "implies 100% tax relief on such contributions". So the comparison is like for like.
  - **Scotland is 5% over the official forecast** (£22.6bn against the Scottish Fiscal Commission's £21.5bn for tax on earnings, pensions and property). It was 13% over (£24.3bn), and the cause was how income was spread within Scotland: HMRC's 2024-25 Scottish statistics count 115,000 advanced-rate and 41,000 top-rate taxpayers, and the population had about 60% more. Each region's taxpayers and income are now calibrated by income band (HMRC SPI Table 3.11), and the Commission's forecast is a target. Part of what's left is definitional: the Commission's figure is revenue after relief-at-source pension relief, Gift Aid and uncollected tax (about £0.45bn in HMRC's 2024-25 Scottish figures), so like for like the gap is nearer 3%.
- **Universal Credit and Child Benefit spending match** within 1%.
- **Self-employed NICs match** (£3.15bn against £3.16bn), and so do the costs of the NICs thresholds (within 2%).
- **Taxpayers are 2% short** (40.0m against 40.8m).
- **Employees in households are 5% short of the OBR's count, but match the FRS's.** The OBR's 29.8m comes from the Labour Force Survey; the FRS, which the households are built from, counts 28.1m employees, and the population has 28.3m. The two surveys differ by about 1.7m. Calibration leans towards the LFS figure but can't reach it without breaking the FRS's household figures.
- **Employer NICs are 9% over the OBR's receipts but within 4% of HMRC's pay base.** HMRC's ready reckoner puts 1p on employer NICs at £11.15bn; ours gives £11.52bn. HMRC's own base implies about £159bn of employer NICs after the lump sums, already above the OBR's £151bn. The OBR's forecast probably allows for employers responding to the April 2025 rise; that's likely, not confirmed.
- **Employee NICs are 8% over the OBR's.** This is a conflict between sources, not a known error in pay:
  - Employees' pay matches ASHE (average and every percentile within 5%).
  - Employees in households alone, 1.1m fewer than the LFS counts, pay £54.4bn, already more than the OBR's £51.5bn for everyone.
  - Something the population can't see must lower real NICs: they're charged each pay period (a bonus month pays 2% above the monthly limit), many people work part of the year, and the OBR allows for responses to the April 2025 rise.
  - HMRC's ready-reckoner figure for 1p on the main rate (£5,350m) implies even less (about £47bn in all), so it isn't a plain static base either and isn't used as a target.
  - Settling it needs HMRC's payroll data or FRS microdata. Until then, **costings of the employee main rate and thresholds are likely 10–17% too high.**
- **The employee NICs exemption for working pensioners matches** (£1.11bn against £1.2bn), now that pensioners' work comes from the FRS and their pay from ASHE.

## The income distribution, against HBAI (held back)

HBAI ("Households below average income") is DWP's official measure of household incomes. Its incomes were never calibration targets (only its count of children is), so they test whether the population's *spread* of incomes is right, not just its totals. Income is net household income before housing costs, after pension contributions, adjusted for household size the way HBAI does it (the modified OECD scale), counted per person. HBAI's 2024-25 figures are uprated to 2026-27 with OBR earnings growth. People outside private households are left out, as they are from HBAI.

| Group | Median, ours | Median, HBAI | Mean, ours | Mean, HBAI | People, ours | People, HBAI |
|---|---:|---:|---:|---:|---:|---:|
| Children | £674 | £681 | £801 | £827 | 14.2m | 14.7m |
| Working-age adults | £821 | £837 | £995 | £984 | 40.6m | 41.4m |
| Pensioners | £721 | £704 | £832 | £830 | 12.4m | 12.2m |

(£ a week, equivalised.)

- **Incomes match closely:** medians within 1–3% for all three groups; means within 1% for working-age adults and pensioners. Children's mean is 3% low (it moves by about 1% with the random draws).
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
