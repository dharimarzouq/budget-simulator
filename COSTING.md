# How costings are worked out, and how far to trust them

## Method (static costing)

A policy is a list of lever settings, such as "basic rate 20% → 21%" (`src/policy/`). To cost it, the engine runs over the whole synthetic population (see POPULATION.md) twice: once under today's 2026-27 rules, once under the policy. The difference in each tax and benefit is the cost.

- **Static** means nobody changes what they earn, how they're paid, or what they claim in response. The behavioural costing (below) allows for that, and is always shown next to the static figure, never mixed in silently.
- **Tax and benefits interact.** A change to one shows up in others. For example, a basic rate rise also *raises* Universal Credit spending, because UC is withdrawn on pay after tax, so claimants get 55p of each extra £1 of tax back. The costing shows every line it moved, not just the one you changed.
- **Each lever is also costed on its own.** What's left over when several levers are combined is shown as "interaction".
- **It's one year (2026-27), full-year effect.** Real receipts lag for self-assessment taxpayers; the OBR-style multi-year profile comes in step 7.

## Behavioural costing

People respond to tax changes: they work more or less, pay more or less into pensions, take income as dividends through a company, or move income between years. The behavioural costing estimates how much that changes the yield.

**How it's worked out** (`behaviouralEffect` in `src/policy/costing.ts`), the way the Scottish Fiscal Commission and the OBR describe their own method:

1. For each adult, the marginal tax rate: the share of an extra £100 of their main kind of income that goes in income tax and their own National Insurance, under today's rules and under the policy.
2. Their taxable income changes by: elasticity × income × the change in the (log of the) share of an extra pound they keep.
3. The tax on that changed income, at the policy's marginal rate, is the behavioural effect. It's added to the static figure.

**The elasticities** (`rules/2026-27/behaviour.yaml`) are the Scottish Fiscal Commission's, rising with income, as published in the Scottish Government's 2022-23 ready reckoners. The OBR uses a similar 0.5 above £150,000, from HMRC's study of the 50p rate.

| Total income | Elasticity |
|---|---:|
| Up to £50,270 | 0.015 |
| £50,270 to £80,000 | 0.1 |
| £80,000 to £150,000 | 0.2 |
| £150,000 to £300,000 | 0.35 |
| £300,000 to £500,000 | 0.55 |
| Over £500,000 | 0.75 |

An elasticity of 0.5 means that if people keep 1% less of each extra pound, their taxable income falls by 0.5%.

**A range, because these are very uncertain.** Re-estimating HMRC's study of the 50p rate, the IFS got an elasticity of about 0.31 from one year's data and 0.83 from the next (Browne and Phillips, 2017). So every behavioural costing comes with a low figure (half the elasticities) and a high one (one and a half times).

**What it leaves out**, stated plainly:
- Benefits and employer NICs stay static. At the elasticity for incomes up to £50,270 (0.015), the effect through benefits would be tiny.
- No separate allowance for people moving into or out of the UK, or between Scotland and the rest of the UK. The OBR finds the evidence on tax-driven migration very small.
- No separate allowance for incorporation (people becoming companies to pay less tax); the elasticities partly capture it.
- One elasticity per person, by total income, applied to their whole taxable income.

## Check against HMRC's ready reckoner

HMRC publishes the effect of standard changes ("Direct effects of illustrative tax changes"). The latest edition is June 2025, on the OBR's March 2025 forecast; HMRC hasn't updated it since. `tools/ready_reckoner.mjs` runs the same changes through our population and compares.

Two things to know about HMRC's figures:

- **They include behavioural responses**, so the column to compare with them is "with behaviour". HMRC doesn't publish the elasticities it uses.
- **They're receipts, and self-assessment income tax arrives a year late.** So for income tax and Class 4 we compare with HMRC's 2027-28 figure scaled back by a year's earnings growth (OBR, 2.2%). NICs and Child Benefit are compared with 2026-27 directly.

For income tax lines, the behavioural column counts only the income tax effect; for NICs lines, only the NICs effect, as HMRC's lines do.

| Change | Static (£m) | With behaviour (£m) | HMRC (£m) | Static ratio | With behaviour ratio | Notes |
|---|---:|---:|---:|---:|---:|---|
| Basic rate +1p | 7,257 | 7,176 | 8,073 | 0.90 | 0.89 | HMRC's 2026-27 liabilities imply about £7.7bn static (below); the rest is uncertainty in the comparison, which mixes liabilities and receipts |
| Higher rate +1p | 2,241 | 1,478 | 2,104 | 1.06 | 0.70 | HMRC's figure implies almost no response; the evidence suggests more. See "The higher rate" below. HMRC's figure sits inside our range (low £1,860m, high £1,097m) |
| Additional rate +1p (yield) | 1,668 | 236 | 259 | 6.4 | **0.91** | Behaviour removes most of the static yield, as HMRC's does. Range: low £952m, high −£480m (at the high end, raising the rate loses money) |
| Additional rate −1p (cost) | −1,668 | −325 | −328 | 5.1 | **0.99** | Range: low −£997m, high +£347m |
| Personal allowance +£100 | −950 | −1,051 | −1,027 | 0.92 | 1.02 | |
| Personal allowance +1% | −1,192 | −1,305 | −1,174 | 1.02 | 1.11 | A bigger allowance also moves the taper zone, raising some marginal rates |
| Basic rate band +1% | −639 | −619 | −651 | 0.98 | 0.95 | |
| Basic rate band +10% | −5,981 | −5,668 | −6,116 | 0.98 | 0.93 | |
| Basic rate band −10% | 6,979 | 6,623 | 7,046 | 0.99 | 0.94 | |
| Employee NICs main rate +1pp | 6,182 | 6,160 | 5,350 | 1.16 | 1.15 | Employees' pay matches ASHE, but HMRC's figure implies less employee NICs than even the OBR forecasts; see POPULATION.md |
| Employee NICs additional rate +1pp | 3,043 | 2,933 | 2,000 | 1.52 | 1.47 | Pay at the top that's taxable but not liable to NICs (share schemes, some benefits in kind), and HMRC probably assumes a bigger response |
| Employer NICs rate +1pp | 11,531 | 11,531 | 11,150 | 1.03 | 1.03 | A calibration target; employer NICs stay static |
| Class 4 main rate +1pp | 375 | 374 | 514 | 0.73 | 0.73 | Our profits match HMRC's own profit statistics (Table 3.10) and the OBR's Class 4 total; HMRC's ready-reckoner figure is the odd one out |
| Class 4 additional rate +1pp | 451 | 433 | 347 | 1.30 | 1.25 | A heavier top tail of profits (to match HMRC's self-employed with over £1m) |
| Employee threshold +£2 a week | −229 | −229 | −210 | 1.09 | 1.09 | |
| Employer threshold +£2 a week | −474 | −474 | −420 | 1.13 | 1.13 | |
| Upper earnings limit +£10 a week | 213 | 208 | 220 | 0.97 | 0.94 | |
| Lower profits limit +£104 | −16 | −16 | −15 | 1.06 | 1.06 | |
| Upper profits limit +£520 | 7 | 7 | 10 | 0.75 | 0.74 | |
| Child Benefit first child +£1 a week | −328 | −328 | −335 | 0.98 | 0.98 | Benefits stay static |
| Child Benefit other children +£1 a week | −243 | −243 | −230 | 1.06 | 1.06 | |

(Updated 28 October 2026, with behavioural costing added.)

**The additional rate is the test that matters most**: its static figure was 6.4 times HMRC's, and with the SFC's published elasticities, with nothing tuned to HMRC, it comes within 1–9%.

### The higher rate: why ours responds more than HMRC's

With behaviour, 1p on the higher rate raises £1,478m against HMRC's £2,104m. `tools/behaviour_by_band.mjs` breaks it down:

| Total income | Static (£m) | Behaviour (£m) |
|---|---:|---:|
| £50,270–£60,000 | 79 | −83 |
| £60,000–£80,000 | 398 | −130 |
| £80,000–£100,000 | 368 | −139 |
| £100,000–£125,140 (the personal allowance taper) | 385 | −326 |
| £125,140–£150,000 | 309 | −67 |
| Over £150,000 | 701 | −18 |

Two things drive it:
- **The taper (43% of the effect).** On £100,000–£125,140, 1p on the higher rate adds 1.5p to the marginal rate (they're also losing allowance), and they already keep only about 38p of each extra pound, so the share they keep falls by 3%. HMRC's records show people bunching at £100,000 (often through pension contributions), so a strong response here is real.
- **The response is to all of a person's income,** not just the part above £50,270, as in the SFC's method and the standard economics. Just above the threshold, the response can exceed the extra tax.

**What the evidence says.** HMRC's own study of Scottish taxpayers after Scotland's 2018-19 rate changes estimated elasticities of 0.31–0.35 for incomes of £43,431–£80,000 (statistically solid) and 0.27–0.46 for £80,000–£123,700 (less certain). Those are *higher* than the SFC's 0.1 and 0.2 that we use. So the evidence doesn't suggest our response is too big; if anything the SFC's figures are cautious there.

**HMRC's figure implies almost no response** at the higher rate: £2,104m is close to the static yield. Its bulletin says the figures apply taxable income elasticities and allow for incorporation, but doesn't publish the values. In December 2025 the statistics regulator (OSR) asked HMRC to publish a fuller methodology. Until it does, the gap can't be explained further. Our low figure (half the elasticities, £1,860m) is near HMRC's.

### A second, static comparison for the rates

HMRC's 2026-27 liabilities (Table 2.6) give the tax charged at each rate. Dividing by the rate gives the income taxed at that rate, and so what 1p on the rate raises before anyone responds. That's a like-for-like check for our static figures.

| 1p on the… | Ours | Implied by HMRC's 2026-27 liabilities | Ratio |
|---|---:|---:|---:|
| Basic rate | £7.26bn | £7.73bn (£154.7bn ÷ 20) | 0.94 |
| Higher rate | £2.24bn | £2.32bn (£92.9bn ÷ 40) | 0.97 |
| Additional rate | £1.67bn | £1.77bn (£79.5bn ÷ 45) | 0.94 |

All three are 3–6% low. HMRC's lines here are after tax reductions (EIS relief and the like, £5.4bn in all) while a rate change in our engine works on tax before them, and the basic-rate line includes Scottish taxpayers, whose rates the basic-rate lever doesn't change, so the two aren't quite like for like.

### What this means for trusting a costing

- **Personal allowance, basic rate band, employer NICs, upper earnings limit, Child Benefit:** within 6% of HMRC. Trustworthy.
- **Additional rate, with behaviour:** within 9% of HMRC, but the range is wide (a 1p rise could raise up to £1bn or lose money). Always show the range.
- **Basic rate:** about 10% below HMRC, static or with behaviour.
- **Higher rate, with behaviour:** 30% below HMRC, which implies almost no response; HMRC's own evidence suggests responses at least as big as ours. HMRC's figure is inside our low-to-high range. Show the range.
- **Employee NICs main rate and thresholds, employer threshold:** 9–16% high. Treat as overestimates (see POPULATION.md for why this can't yet be settled).
- **Class 4 main rate:** 27% below HMRC's ready reckoner, but consistent with HMRC's profit statistics and the OBR's Class 4 total. Uncertain; show it with a wide range.
- **Benefit changes:** static only, labelled as such.

**Speed:** a costing with behaviour takes about 2.7 seconds over the whole population (static alone is much quicker). Fine for checks; to be made faster when the page is built (6f).

## Winners and losers

`distribution` in `src/policy/distribution.ts` shows how a policy changes households' incomes. `tools/winners_losers.mjs` prints it for any policy.

**How it's worked out:**
- **Households,** not families: the families (benefit units) in a household are added together. People outside private households are left out, as they are from DWP's household statistics (HBAI).
- **Income** is net household income before housing costs: earnings, pensions, other income and benefits, less income tax, National Insurance, pension contributions and the Child Benefit charge. That's HBAI's measure, except that council tax, disability benefits and some others aren't modelled yet (see POPULATION.md).
- **Ranking** is by income adjusted for household size the way HBAI does it (the modified OECD scale), before the policy. Each tenth ("decile") holds a tenth of households. HBAI ranks people instead; tenths of households are easier to read as "the average household in this tenth".
- **A gain or loss** is a change of more than £1 a week (£52 a year). Smaller changes count as no real change.
- **Static:** nobody's behaviour changes. That's the standard for these tables (HM Treasury's and the IFS's are static too); the behavioural costing changes the revenue total, not this picture.
- **Breakdowns** by family type (from the families in the household) and by the 12 UK regions.

**Two examples** (2026-27, static):

*1p on the basic rate* (raises £7.0bn): losses rise with income in pounds, up to £474 a year in the ninth tenth and £552 in the richest. As a share of income they peak at 0.6% in tenths 7–9, and the richest tenth loses less as a share (0.4%), because the basic rate only touches a fixed slice of a high income. Scotland is almost untouched: its rates on earnings are set by the Scottish Parliament.

*Bringing back the two-child limit* (saves £2.7bn): the losses fall on tenths 2 to 5 (up to 1.1% of income) and on lone parents (14% of them lose; £600 a year on average across all lone parents). Pensioners and households without children are untouched. The poorest tenth barely moves, because families with larger Universal Credit awards have incomes that rank them a little higher.

## Removing a tax, allowance or charge

`src/policy/removals.ts` lists what can be removed altogether and what each removal means: the higher and additional rates, the personal allowance and its taper, dividend tax, the savings allowances, the Scottish starter, intermediate, advanced and top rates, each kind of National Insurance, the benefit cap and the Child Benefit charge. A removal is applied after every lever, so it can tie one rate to another: with the higher rate removed, the higher band is taxed at whatever the basic rate is set to. Levers a removal makes meaningless (such as where the higher rate starts) are dropped from the policy. Removing employer National Insurance also removes the Employment Allowance and apprentice relief, which are otherwise netted off as lump sums.

These are much bigger changes than anything HMRC's ready reckoner checks, so every removal is marked "known gap". The static figure is mechanical and follows from the rules; the behavioural figure applies the same elasticities as for small changes, which is the least certain part. For example, removing the higher rate costs £44.7bn a year static.

## Borrowing, debt and the fiscal rules

`src/economy/fiscal.ts`, with the figures in `forecasts/obr-2026-10.yaml` (each with its OBR table).

**Baseline:** the OBR's Economic and fiscal outlook of 28 October 2026, published with Budget 2026. It already includes that Budget's policies; none of them changes a 2026-27 rule the engine models (most start in April 2027).

**A budget over the forecast years:**
- Changes start in April 2027, the next tax year, so 2026-27 is unchanged. This is a constant (`START_YEAR`) if that should change.
- Each part of the 2026-27 costing grows in line with the OBR's forecast for its tax or benefit (income tax, each kind of NICs, Universal Credit, Child Benefit). The behavioural effect grows with income tax. This is an approximation. It ignores interactions with policies announced for later years, such as the April 2027 rises in tax on property and savings income, and assumes the costing grows like the receipts or spending it sits in.
- Extra borrowing adds to debt interest at rates read off the OBR's debt interest ready reckoner (£10bn more borrowing a year adds £0.24bn in the first year, £0.77bn in the second, and so on). The extra interest is itself borrowed. Without that compounding, the method reproduces the ready reckoner exactly (tested).
- All the changes are to day-to-day receipts and spending, so the current budget changes by the same amount as borrowing.

**Fiscal rules,** from the Charter for Budget Responsibility (in force February 2026) and the OBR's Table 7.1:
- The current budget in surplus in 2029-30. The OBR's margin is £14.5bn; a budget's extra borrowing in 2029-30 comes off it.
- Public sector net financial liabilities falling as a share of GDP in 2029-30. The OBR's margin is £24.4bn: how much higher debt could be at end-March 2030 and still be falling. Extra debt at end-March 2029 raises that limit in proportion to GDP growth; extra debt at end-March 2030 uses it up. Recomputed from the rounded published figures, the margin comes out at £24.9bn, within rounding of the OBR's.

**Effect on the economy (grade C):** shown as a second line, never in the main figures, because official costings leave it out.
- It uses the OBR's published fiscal multipliers (Forecast evaluation report, June 2026, Table 2.1). A tax change worth 1% of GDP moves GDP by 0.33% in its first year, then 0.30, 0.23, 0.14, 0.05 and 0. For welfare (AME) the figures are 0.60, 0.57, 0.43, 0.23, 0.07 and 0.
- A smaller economy borrows more: 0.5% of GDP for each 1% of GDP the economy is below potential, plus 0.2% the year after (OBR Working paper No. 3). With the OBR's own output gaps these coefficients reproduce the cyclically adjusted borrowing in the October 2026 forecast (tested).
- The OBR calls its multipliers a starting point that it adjusts at each forecast, and highly uncertain. It publishes no range, so the low and high figures use half and one and a half times them, a judgement as for behaviour.

**Example:** a 2p cut in the basic rate (to 18%) costs £15.0bn in 2027-28 with behaviour, rising to £17.7bn by 2031-32. With interest, borrowing in 2029-30 is £18.5bn higher, and the main rule is missed by £4.0bn. Allowing for the effect on the economy, it's missed by £0.8bn (range: missed by £2.4bn to met by £0.8bn). Debt still falls in 2029-30, by a margin of £7.1bn.

## Universal Credit: check against an OBR costing

There's no ready reckoner for Universal Credit, so UC costings are checked against the OBR's costings of real measures. The first is the removal of the two-child limit, which the OBR costed in November 2025 (Economic and fiscal outlook, table 3.2, as reported): £2.3bn in 2026-27, rising to about £3bn by 2029-30 as claims build up, for about 560,000 families gaining around £5,310 a year each.

| | Ours (2026-27, full effect) | OBR |
|---|---:|---:|
| Cost | £3.33bn | £3.0bn (2029-30, mature) |
| Families gaining | 691,000 | 560,000 |
| Average gain | £4,819 | £5,310 |

Ours is about 10% high on cost and 23% high on families, with a smaller average. That's consistent with the population having somewhat too many larger families on low incomes (the Child Benefit checks point the same way). Ours is also a full, immediate effect; the OBR's first year is lower because new claims take time to come through. A source note: I found the OBR figures via news reports quoting the EFO, not in the EFO itself; they should be confirmed against the document before being shown on the page.

(These two-child limit figures are from an earlier population and haven't been re-run since.)
