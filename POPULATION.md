# The synthetic population

**This population is made up.** No household in it is a real household. It's built so that, taken together, it matches published UK totals. Results from it are estimates, and they're labelled as such wherever they appear.

It replaces survey microdata (the Family Resources Survey), which can't be published. See RESEARCH.md, decision 1.

## How it's built

1. **Targets** (`data/targets/`, listed with sources in `targets.yaml`): published tables from HMRC, DWP, ONS, the OBR, the Scottish Fiscal Commission, and the Family Resources Survey via Stat-Xplore.
2. **Seed** (`data/build_seed.py`): 30,012 made-up private households, 2,000 people outside private households, and 600 extra top-income households (all below). That's 39,683 benefit units in all. Households are spread across all 12 regions, the four tenures, and households with and without children, in proportion to the FRS, with at least 40 in every combination. Each starts with a weight: how many real households it stands for.
3. **Calibration** (`data/calibrate.py`): the weights are scaled up or down to bring the weighted totals as close as possible to 811 published figures at once. Each household's scaling is kept as close to 1 as it can be, and never below ÷10 or above ×10. Published sources disagree with each other, so this minimises the misses rather than forcing an exact match. Every miss is reported in `data/build/calibration_report.csv`.
4. **Checks**: totals that were *not* used in calibration test the result (below).

**How much depends on the random draws.** The seed is made with random numbers. Rebuilding it from three different starting points moves income tax, NICs and Child Benefit by under 1% and Universal Credit spending by 2.4%; smaller figures move more (see "Stability" below).

A household is split into benefit units ("families"), because tax and benefits are worked out per family: a couple or a single adult, with any children. A household's families share a weight.

### Who lives where

- **Household type follows the FRS for each tenure.** For example, lone parents make up 13% of social-renting households but 1% of outright owners.
- **Families within households follow the FRS's family (benefit unit) data:**
  - **Lone parents sharing a home.** The FRS counts 1.90m lone-parent families but only 1.52m one-adult households with children. The other 375,000 or so live with other adults (their own parent, or a grown-up child). For each tenure, that share of households with children and two or more adults is made a lone parent plus another adult: 22% in social housing, 9% for outright owners, 3% for private renters, 2% for mortgagors.
  - **Adults sharing without being a couple** (flatmates, a grown-up child with a parent): the share of households of two or more adults without children that aren't a couple, from FRS families against households: 32% in social housing, 21% private renting, 5% owners.
  - **Married or cohabiting.** 94% of pensioner couples are married or in a civil partnership, 81% of couples with children and 71% without (FRS). Only married couples and civil partners can claim Marriage Allowance.
  - **Family size** by couple or lone parent (FRS): couples 1.92 children on average, lone parents 1.73. 14.6m children in all, matching HBAI.
- **Pensioners live where the FRS says they do**, by household type *and* tenure together (49% of outright owners' families are pensioners, 3% of mortgagors'). In families with children, a pensioner is a grandparent.

### What each person has

- **Work and health follow the FRS for their tenure and age band.** Each working-age adult's status comes from the FRS 2024-25 figures for people with the same tenure and age: full- or part-time employee or self-employed, unemployed, permanently or temporarily sick, looking after family, student, retired, or other inactive. 32% of working-age social renters work full-time, against 68% of people with a mortgage.
- **Ages fit together.** A parent's age is their oldest child's age plus their age at that birth (about 31 on average). Other working-age adults fill in the rest of the FRS's age bands. Pensioners' ages follow the FRS's 65–74, 75–84 and 85+ bands. Children's ages follow HMRC's Child Benefit records year by year, up to 19.
- **Employees' pay comes from ONS's Annual Survey of Hours and Earnings (ASHE 2026)**, for full- and part-time workers in their age group, smoothed by age between the groups (an 18-year-old earns less than a 21-year-old). Pay is drawn between ASHE's percentiles; above the 90th, a Pareto tail sized so each group's average matches ASHE's. Employees' pay after calibration matches ASHE: mean and every percentile within 5%.
- **Pay varies by region**, by HMRC's median income of taxpayers in each region (Table 3.11). Regions with more very high earners (London most) get a heavier top tail.
- **Pensioners' work follows the FRS for their age band** (13% of 65–74-year-olds are employees, 6% self-employed), with pay from ASHE's 60+ group.
- **Self-employed profits** are calibrated to HMRC's count of self-employed taxpayers in each range of profits (Table 3.10).
- **Property, savings and dividend income** follows HMRC's figures for who has each kind and how much, by income band (Table 3.7).
- **Pension contributions** deducted before tax follow HMRC's figures by band (Table 3.8: £40bn a year). They cut income tax but not National Insurance.
- **Other deductions** before tax (losses, qualifying interest and similar: £6.3bn in 2023-24) follow HMRC's figures by band (Table 3.8). A third of the total belongs to people on over £1m.
- **Tax reductions** (reliefs that cut the tax bill directly, like EIS and VCT relief, relief for tax paid abroad, landlords' finance-cost relief) go to some higher and additional-rate taxpayers, calibrated to HMRC's totals for each: £1.1bn and £3.7bn in 2026-27 (Table 2.6).
- **Marriage Allowance**: married couples and civil partners claim it when it helps, with a take-up guessed and then calibrated to HMRC's £590m cost.
- **Side self-employment.** Some employees also have a small business; HMRC counts more people with self-employment income than have it as their main job.
- **Child Benefit: claiming, opted out, or never claimed**, by the higher earner's adjusted net income (what the charge is worked out on). HMRC counts 11.7m children in paid families and 1.0m in families who opted out; HBAI counts 14.7m children. The rest are in families who never claimed, whom HMRC's figures don't count.

### Extra households at the very top

150 extra households in each of HMRC's ranges from £200,000 (to £500,000, £1m, £2m, and above), each with one working-age very high earner. Their region follows HMRC's count of taxpayers on £200,000 or more in each region, and their mix of pay, profits, pensions and investment income follows HMRC's figures for their range. Without them, the number of very rich people depended on a handful of lucky draws, and income tax moved by £12bn from one set of draws to another.

### People outside private households

HMRC counts everyone with a UK income tax liability during the year, from tax records. The FRS is a snapshot of private households. HMRC's count therefore includes people the households can't: students in halls, armed forces in barracks, care home residents, people here or working for only part of the year, and non-residents with UK income.

The population includes a separate group of single adults for them. They count in HMRC's targets but are left out of every household-based target and check (FRS, LFS employees, HBAI, Universal Credit, Child Benefit). **Calibration sizes the group: 2.7 million people.** No published figure gives the size directly, so treat it as an estimate. Their pay is drawn around £16,000, because most are taken to be part-year workers.

A test of the size: HMRC's payroll records show 30.3 million people on a payroll in September 2026, and the population has 31.3 million people paid during the year. The payroll figure is one month, and more people than that are paid at some point in a year, so a gap is expected; no published figure confirms its size.

## Homes

**Made up, grade C.** Each private household has a home: what it's worth, how much of that is land, and its council tax band (in Northern Ireland, its capital value for domestic rates instead). `data/build_homes.py` adds them after calibration and changes no weights, so nothing else in the population moves. Tenure (owned outright, mortgaged, private rent, social rent) comes from the seed, which follows the FRS. Values are at August 2026 prices, the latest UK House Price Index month.

- **Value.** In England, the Market Value Survey's mean value for the household's region and tenure (surveyors' valuations of English Housing Survey homes at 1 July 2024; Table 1.3), grown to August 2026 with the region's House Price Index. The survey doesn't split owners with and without a mortgage, so they share a mean. Wales, Scotland and Northern Ireland have no such survey: England's mean for the tenure, scaled by the nation's average price against England's.
- **Spread.** Around that mean, values follow a lognormal whose width for each tenure (owners 0.46, private renters 0.48, social renters 0.40) is fitted to the survey's count of England's homes in each value band (Table 1.2a). The fit is close: every band within 5 points, most within 1.
- **Income.** Households with higher incomes have dearer homes, but only partly: a correlation (owners 0.6, private renters 0.45, social renters 0.2) fitted to the survey's spread of joint income as a share of value (Table 3.3a). That fit is loose. Our renters have high incomes for their homes' values more often than the survey finds (14% of private renters with income over 40% of value, against 3%). Either our renters' incomes or the survey's income measure differ; we can't tell which from published tables.
- **Land.** The value less what the building is worth: its floor area times £813 per m². The cost per m² is the ONS balance sheet's value of households' dwellings, the buildings alone and depreciated (£1,961bn at the end of 2024), over the floor area of the homes households own. Floor area is the English Housing Survey's mean for the tenure (owners 108 m², private rented 76, social 66), larger for dearer homes in the same region (area rises with the square root of value against the regional mean: our judgement, as a dearer home is partly bigger and partly on dearer land). Land is never less than a tenth of a home's value. On these figures land is about 78% of the value of owners' and private renters' homes and 75% of social homes'. This is the ONS's own method (land as what's left after the depreciated building), but the share depends heavily on the building cost: with an undepreciated rebuild cost of about £2,000 per m², land would be nearer half.
- **Council tax band.** Homes are ranked by value within each region, and the bands filled to the published counts: the cheapest homes go in band A until it holds the region's share of homes in band A, then band B, and so on (VOA for English regions and Wales, which has bands A to I; Scottish Government for Scotland). Ari's choice, 30 October 2026, because banding the values directly puts far too many homes in band A (below). The published counts cover all dwellings, empty and second homes included; ours are lived-in homes, so we assume those are banded like the rest.
- **Value at the valuation date.** Each home also keeps its value taken back with the region's House Price Index (1 April 1991 in England and Scotland, 1 April 2003 in Wales). Regions whose UK HPI series starts later use their own price change back to where their series starts, and England's before that. It's what a revaluation would start from, but it doesn't set the band. Northern Ireland has no bands: there it's the value at 1 January 2005, the date domestic rates' capital values are set at.

### Homes against published figures

| Check | Ours | Published | Source |
|---|---:|---:|---|
| Homes households own (owned and privately rented), buildings and land, end of 2024 | £8.5tn | £6.5tn (dwellings £1.96tn plus all land households own £4.56tn) | ONS national balance sheet 2025, Table 9.11 |
| Land under them | £6.6tn | £4.56tn, all land households own, farmland included | same |
| England's homes by value band, July 2024 | every band within 5 points | | Market Value Survey 2024, Table 1.2a |
| Council tax bands, English regions and Wales: share in each band | within 0.3 points (matched by ranking) | | VOA stock of properties, 31 March 2025 |
| Council tax bands, Scotland | matched by ranking | | Scottish Government, September 2025 |
| Bands from the deflated values instead, English regions and Wales | median miss 1.7 points, worst 14 | | VOA, as above |
| Bands from the deflated values instead, Scotland | median miss 3.1 points, worst 6.5 | | Scottish Government, as above |

- **The ONS's figure is about 30% below ours.** Ours rests on surveyors' valuations of a sample of homes (the Market Value Survey); the ONS builds its total differently, with the buildings at depreciated cost and land as what's left of house-price-based values. We haven't yet pinned down which accounts for the gap. Not tuned away: a land value tax costed on these values will say so.
- **Banding the deflated values directly would put too many homes in band A outside the North East**, and too few in C and D: 8–14 points too many in band A in the North West, West Midlands, East, London, South East and South West. So either the values at the bottom are too low or prices rose less since 1991 for the homes in the stock than for the homes sold (the House Price Index follows sales). That's why bands are matched to the published counts instead. The cost: a home's band and its deflated value can disagree (a home valued at £35,000 in 1991 money may sit in band B), which matters only for a revaluation reform.

`test/homes.test.ts` checks the shipped file and holds these gaps where they are.

## Assumptions in the seed

These are starting values. Calibration corrects the totals, but guesses about *how things combine* partly survive it. Where a value was tuned to bring a published figure into line, the table says so.

| Assumption | Value | Why |
|---|---|---|
| Work status (working age) | FRS 2024-25 by tenure and age band | FRS |
| Employees' pay | ASHE 2026 annual pay by age group, interpolated between percentiles; below the 10th, a straight line down from half of it; above the 90th, a Pareto tail matching the group's mean. Smoothed by age between the groups' midpoints. Uprated one year (3.2%) | ONS ASHE Table 6.7a. Only the shape below the 10th percentile is a guess |
| Pay by region | HMRC's median income of taxpayers by region (London 1.21, Wales 0.94); top tail heavier by the square root of the region's mean-to-median spread | HMRC Table 3.11; the square root is a judgement |
| Self-employed profits | Full-time median £20,000, 3% tail from £80,000 (α 1.2); part-time median £8,000; by age and region from HMRC Tables 3.2 and 3.11 | Tuned to HMRC's self-employment figures, then calibrated to Table 3.10 |
| Side self-employment | 7% of employees, median £4,000 | Rough |
| Second jobs | 4.5% of employees, median £5,000 | Tuned to ONS's 1.29m |
| Health element | All permanently sick, half of temporarily sick and unemployed, 30% of other inactive (90% at the protected rate) | Tuned: single adults with the health element came out 20% under DWP's count. Many on it describe themselves in surveys as unemployed or inactive rather than sick |
| Carers | 25% of those looking after family, 15% of other inactive, 3% of workers; 60% of parents of a disabled child and 70% of partners of someone with the health element, if not in well-paid work | Rough; partners raised from 50% to come nearer DWP's carer-element count |
| Retired before State Pension age | Private pension, median £12,000 | Rough |
| Pensioners on the new State Pension | 60% (rest on the old basic pension) | Rough; new £241.30 a week, old £184.90 (DWP) |
| Pensioners with a private pension | 65%, median £8,500, spread 0.9, 2% tail from £50,000 | Tuned between HMRC's pension income by band and HBAI's pensioner median |
| Pensioners' work | FRS work status by age band; employees paid from ASHE's 60+ group | FRS, ASHE |
| Pensioner couples | 70% both over State Pension age | Rough |
| Lone parents sharing a home; adults sharing without being a couple; who's married; family size | From FRS families against FRS households, by tenure and family type | FRS (see above) |
| Ages | Parents: oldest child's age plus an age at birth averaging 31.5 (spread 5.5). Others: the rest of the FRS's age bands. Pensioners: the FRS's bands from 66. Children: HMRC's Child Benefit counts by year of age | ONS births statistics; FRS; HMRC |
| Disabled children | 12% (30% at the higher rate) | DWP shows 19% of lone parents on UC have a disabled child |
| Property, interest, dividends | Who has each and the average by band from HMRC Table 3.7; spreads 0.8 / 2.2 / 1.5 | Spreads tuned to HMRC's tax on savings and dividends |
| Interest and dividend uprating | Interest ×1.6, dividends ×1.03 | Tuned to HMRC's 2026-27 tax by source; interest amounts then carry low weight |
| Pension contributions, other deductions | Share and average by band from HMRC Table 3.8; spreads 0.8 and 1.2 | HMRC; spreads are guesses |
| Tax reductions | 30% of additional-rate taxpayers (average £16,000), 5% of higher-rate (£3,000) | Guesses at who has them; calibration matches HMRC's totals |
| Marriage Allowance take-up | 75% of married couples and civil partners, when it helps | Guess, raised from 65%; calibration matches HMRC's cost |
| Top-income households | 150 per HMRC range from £200,000, starting at half of HMRC's 2026-27 count; mix of sources around the range's average | HMRC Tables 2.5, 3.7, 3.11; the counts and spread are judgements |
| People outside private households | Single adults 18–64, pay median £16,000, starting total 2.5m | Sized by calibration |
| Rents | FRS 2024-25 average by region and tenure, uprated with OBR rent growth, with a spread | FRS, OBR |
| Childcare | 35% of working households with a child under 5, median £700 a month | Rough |
| Universal Credit take-up | 85% | Rough; DWP doesn't publish a current take-up rate |
| Child Benefit claiming | Higher earner on £60,000–£80,000 (adjusted net income): 20% opted out, 20% never claimed. Above £80,000: 35% and 40%. Others: 3% never claimed | Guesses; calibration balances them against HMRC's paid families, opt-outs and charge, and HBAI's children |

Uprating to 2026-27 otherwise uses the OBR's October 2026 forecast (`data/uprating.py`), published with Budget 2026. Until 28 October 2026 it used March 2026's. October's earnings growth for 2025-26 is lower, so incomes from 2023-24 tables are uprated 0.8% less, and ASHE 2026 pay 0.4% more.

## How well it fits the targets

Median miss for each group of targets, before and after calibration:

| Targets | Number | Before | After | Worst after |
|---|---:|---:|---:|---:|
| **HMRC 2026-27 taxpayers and income by income range** (weighted ×2) | 22 | 23% | 1.5% | 8% |
| **HMRC 2026-27 income tax by source and type of taxpayer** (weighted ×2) | 9 | 31% | 1.8% | 19% |
| HMRC 2026-27 tax reductions, higher and additional-rate taxpayers | 2 | 65% | 1.4% | 2% |
| **Scottish Fiscal Commission: Scottish income tax 2026-27** (weighted ×2) | 1 | 38% | 3.3% | |
| HMRC 2023-24 pay, profits, pensions and self-employed counts by band, uprated (pay and pensions ×0.3) | 60 | 27% | 3.0% | 20% |
| HMRC property, interest and dividends by band (interest amounts ×0.3) | 72 | 42% | 3.0% | 25% |
| HMRC pension contributions by band | 12 | 18% | 1.8% | 6% |
| HMRC other deductions by band | 12 | 38% | 0.2% | 1% |
| HMRC self-employed taxpayers by range of profits | 28 | 17% | 2.4% | 9% |
| HMRC taxpayers and income by region (shares of the 2026-27 total) | 24 | 6% | 0.5% | 4% |
| HMRC taxpayers and income by region and income band (×0.3) | 216 | 17% | 2.1% | 9% |
| HMRC taxpayers and income by age (shares of the 2026-27 total) | 26 | 13% | 3.8% | 25% |
| HMRC Marriage Allowance cost | 1 | 4% | 7.3% | |
| HMRC costs of the NICs thresholds | 2 | 2% | 1.3% | 2% |
| HMRC employer NICs pay base (ready reckoner) | 1 | 15% | 3.1% | |
| OBR employee count (×2) | 1 | 5% | 4.7% | |
| OBR wages and salaries, £1,293bn (×2) | 1 | 13% | 2.4% | |
| FRS adults by age | 9 | 3% | 1.4% | 9% |
| FRS families by type and tenure (×0.5) | 36 | 9% | 6.0% | 39% |
| FRS households by region, children, tenure | 96 | 0% | 1.3% | 15% |
| FRS households by income and composition | 77 | 20% | 2.6% | 42% |
| UC households and spending, family type × tenure | 24 | 56% | 5.6% | 18% |
| UC households by region and family type | 44 | 61% | 2.0% | 11% |
| UC households by number of children | 10 | 58% | 5.8% | 9% |
| UC households by health condition | 8 | 54% | 6.3% | 16% |
| UC households with a disabled child | 4 | 60% | 4.1% | 9% |
| UC households with a carer element | 4 | 53% | 6.0% | 16% |
| Child Benefit families by size (×2) | 5 | 5% | 3.2% | 10% |
| Child Benefit opt-outs | 1 | 51% | 4.3% | |
| Child Benefit charge: people and revenue (2024-25, uprated) | 2 | 228% | 18% | 22% |
| HBAI children | 1 | 0% | 2.9% | |

HMRC's 2023-24 tables (by band, region and age) are uprated or used only as shares of HMRC's 2026-27 totals. HMRC's own projections for 2026-27 count taxpayers, income and tax for this exact year, so they carry more weight. HMRC's band tables count only people who actually owe tax, so the targets do the same.

## Checks against published figures

| Measure | Population | Published | Source | In calibration? |
|---|---:|---:|---|---|
| Households | 28.98m | 28.97m | FRS 2024-25 | yes, indirectly |
| People outside private households | 2.67m | none published | | sized by calibration |
| **Income taxpayers, 2026-27** | **40.0m** | 40.8m | HMRC liabilities 2026-27 | by band |
| Employees (private households) | 28.5m | 29.9m (LFS); 28.1m (FRS) | OBR October 2026; FRS 2024-25 | yes |
| Everyone paid during the year | 31.2m | 30.3m on payrolls in one month | ONS/HMRC PAYE RTI, September 2026 | no; not the same measure |
| All pay | £1,324bn | £1,293bn wages and salaries | OBR October 2026 (national accounts) | yes |
| People with a second job | 1.26m | 1.29m | ONS LFS mid-2026 (secondary reports) | no |
| **Income tax** | **£346.5bn** | **£347.0bn liabilities** (£365.4bn receipts) | HMRC liabilities 2026-27; OBR October 2026 | by source and type |
| of which on earnings, pensions and property (before tax reductions) | £323.7bn | £318.8bn after them | HMRC 2026-27, table 2.6 | yes, grossed up |
| of which on savings (before tax reductions) | £7.4bn | £8.2bn after them | HMRC 2026-27, table 2.6 | yes, grossed up |
| of which on dividends (before tax reductions) | £20.4bn | £19.8bn after them | HMRC 2026-27, table 2.6 | yes, grossed up |
| **Scottish income tax** (earnings, pensions and property) | **£22.2bn** | £21.5bn | Scottish Fiscal Commission, January 2026 | yes |
| Marriage Allowance | £0.55bn | £0.59bn | HMRC tax relief statistics 2025-26 | yes |
| **Employee NICs** | **£55.5bn** | £51.8bn | OBR October 2026 | no |
| **Employer NICs** (after the lump sums below) | **£164.5bn** | £152.7bn | OBR October 2026 | through HMRC's pay base |
| Cost of the NICs primary threshold | £30.1bn | £30.4bn | HMRC tax relief statistics 2025-26 | yes |
| Cost of the NICs secondary threshold | £24.0bn | £24.4bn | HMRC tax relief statistics 2025-26 | yes |
| **Self-employed NICs** | **£3.12bn** | £3.32bn | OBR October 2026 (Class 4 and Class 2) | no |
| **Employee NICs exemption over State Pension age** | **£1.16bn** | £1.2bn | HMRC tax relief statistics 2025-26 | no |
| **Child Benefit spending** | **£13.7bn** | £13.7bn | OBR October 2026 | no |
| Families paid Child Benefit | 6.53m | 6.87m | HMRC Aug 2025 | yes |
| Child Benefit charge | £0.54bn | £0.44bn | HMRC 2024-25, uprated | yes |
| People paying the Child Benefit charge | 0.41m | 0.36m | HMRC 2024-25, uprated | yes |
| Children | 14.3m | 14.7m | HBAI 2024-25 | yes |
| Households on Universal Credit | 7.14m | 7.16m | DWP May 2026 | yes |
| **Universal Credit spending** | **£88.6bn** | £86.4bn (Great Britain) | OBR October 2026 | through DWP's averages |

**Employer NICs lump sums.** Two employer reliefs depend on the employer, not the household. Population totals take off HMRC's 2025-26 costs as one figure each: the Employment Allowance (£7.4bn) and the zero rate for apprentices under 25 (£0.57bn). The zero rate for employees under 21 *is* modelled.

## What's left, and why

Everything below has been looked into. Each is either a disagreement between published sources (no population can match both), something only microdata or HMRC's records could settle, or a small tuned guess. None is an unexplained error.

**Matches:**
- **Income tax is within 0.2% of HMRC's 2026-27 liabilities** (£346.5bn against £347.0bn). Getting there needed three things that cut tax, all from HMRC's figures: other deductions (about £3bn), Marriage Allowance (£0.5bn) and tax reductions (£4.8bn). HMRC's model treats pension contributions the same way as ours (its documentation: income after deductions is "total income minus contributions to occupational and private pensions" and charities, which "implies 100% tax relief"), so the comparison is like for like.
- **Child Benefit spending matches within 1%; Universal Credit comes out 2.6% over the OBR's October 2026 forecast.** Ours includes Northern Ireland and the OBR's doesn't, which accounts for roughly that. (Against March's forecast it was 1% under: the OBR has since lowered its forecast, while October's higher social rent growth raised ours.) The costs of the NICs thresholds and the working-pensioner NICs exemption match within 4%.
- **Self-employed NICs 6% under the OBR's October 2026 figure** (£3.12bn against £3.32bn). The OBR's figure also includes voluntary Class 2 contributions, which we don't model, and it rose from £3.16bn in March.
- **Household incomes match HBAI** (below), which was never a target.

**Disagreements between sources:**
- **Employee NICs 7% and employer NICs 8% over the OBR** (October 2026). Employees' pay matches ASHE, and employees in households alone pay more employee NICs than the OBR's total for everyone. HMRC's own ready-reckoner base implies employer NICs of about £159bn, already above the OBR's £153bn. Likely reasons, none confirmable without payroll data: NICs are charged each pay period (bonus months pay less), many people work part of the year, and the OBR's forecast allows for employers responding to the April 2025 rise. **Costings of the employee main rate and thresholds are likely 10–17% too high.**
- **Employees 5% short of the OBR's Labour Force Survey count** but above the FRS's own count (28.1m). The two surveys differ by 1.7m.
- **Lone parents.** DWP counts 2.2m lone-parent households on Universal Credit in Great Britain alone, more than the FRS's 1.9m lone parents in total. The administrative count wins, so FRS lone-parent cells come out 16–40% over, and FRS couples with children in rented homes 11–15% under.
- **Child Benefit.** HMRC's 6.87m paid families, its 1.0m children in opted-out families, HBAI's 14.7m children and the FRS's 7.97m families with children can't all hold at once: they'd leave about 2m children in 0.6m never-claiming families. Calibration compromises: families paid 5% short, the charge 18–20% over (both its payers and revenue), Child Benefit spending exact.
- **Scotland 3.3% over the Scottish Fiscal Commission's forecast.** The Commission's figure is after relief-at-source pension relief, Gift Aid and uncollected tax (about £0.45bn), so like for like the gap is about 1.2%. It was 13% over before each region's income was calibrated by band.

**Would need microdata or other data:**
- **Tax on savings 9% short, all among additional-rate taxpayers** (18% short there; others within 2%). Calibration can't add enough interest at the top without breaking HMRC's counts of who has interest. HMRC's "savings income" also covers things other than interest, such as gains on life insurance bonds, concentrated among the wealthiest. Likely, not confirmed.
- **Young taxpayers' income is 11–24% high** (under 30). ASHE covers only employees in the same job for over a year, which leaves out job-changers and part-year workers, who are disproportionately young. No published table corrects for that.
- **Class 4 main rate 0.72 against HMRC's ready reckoner**, though our profits match HMRC's own profit bands and the self-employed NICs total is within 6% of the OBR's; the ready reckoner's figure is the odd one out.
- **Universal Credit health and carer elements** are 6–9% out (median), up to 14% in some family types. The FRS doesn't record who gets these elements, so who has them is partly guessed.

## The income distribution, against HBAI (held back)

HBAI ("Households below average income") is DWP's official measure of household incomes. Its incomes were never calibration targets (only its count of children is), so they test whether the population's *spread* of incomes is right. Income is net household income before housing costs, after pension contributions, equivalised the way HBAI does it (modified OECD scale), counted per person, with HBAI's 2024-25 figures uprated to 2026-27 with OBR earnings growth. People outside private households are left out, as they are from HBAI.

| Group | Median, ours | Median, HBAI | Mean, ours | Mean, HBAI | People, ours | People, HBAI |
|---|---:|---:|---:|---:|---:|---:|
| Children | £700 | £677 | £862 | £822 | 14.3m | 14.7m |
| Working-age adults | £828 | £832 | £997 | £978 | 40.7m | 41.4m |
| Pensioners | £691 | £699 | £820 | £825 | 12.2m | 12.2m |

(£ a week, equivalised; HBAI uprated with the OBR's October 2026 earnings forecast.)

- **Medians are within 1–3% and means within 1–5% for all three groups.** Children's mean is the furthest out: 5% over, against 3% when uprated with March's forecast.
- **Two differences roughly cancel, and we can't yet separate them.** HBAI's net income takes off council tax, which we don't model (ours too high), and adds disability benefits, Carer's Allowance, Pension Credit and others, which we don't model either (ours too low).

## Stability

Rebuilding from three different sets of random draws (`POPULATION_SEED` 2026, 2027, 2028) moves:
- income tax, NICs, Child Benefit, taxpayers and total pay by 0.6% or less;
- Scottish income tax and Universal Credit households by 1–1.3%, and Universal Credit spending by 2.4%;
- household incomes against HBAI by 0.5–2.5%;
- smaller figures more: the Marriage Allowance cost and the Child Benefit charge by about 2%, the working-pensioner NICs exemption by 7%, people with a second job by 10%.

Differences smaller than these between the population and a published figure are noise.

## Rebuilding it

```
.venv\Scripts\python.exe -I data\fetch.py
.venv\Scripts\python.exe -I data\build_targets.py
.venv\Scripts\python.exe -I data\pull_statxplore.py      (needs a Stat-Xplore key)
.venv\Scripts\python.exe -I data\build_seed.py
node tools\run_population.mjs data\build\seed.json data\build\seed_results.csv
.venv\Scripts\python.exe -I data\calibrate.py
.venv\Scripts\python.exe -I data\check_population.py data\build\population.json data\build\seed_results.csv
.venv\Scripts\python.exe -I data\build_homes.py
.venv\Scripts\python.exe -I data\export_population.py
```

Set `POPULATION_SEED` before `build_seed.py` to rebuild from different random draws. The engine results don't change with calibration (only the weights do), so the seed's results file serves for both.

`build_homes.py` writes `data/build/homes.json` and its checks, `data/build/homes_check.csv`. The last step writes `public/data/population-2026-27.json`, the file the site loads: 4.0 MB (homes added 0.5 MB, with money in £ thousands). Money is rounded to whole pounds and weights to one decimal place, which moves totals by well under 0.1%. `test/population.test.ts` checks the shipped file still matches the published totals within the gaps explained here.
