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
- **They're receipts, and self-assessment income tax arrives a year late.** So for income tax and Class 4 we compare with HMRC's 2027-28 figure scaled back by a year's earnings growth (OBR October 2026, 2.9%). NICs and Child Benefit are compared with 2026-27 directly.

For income tax lines, the behavioural column counts only the income tax effect; for NICs lines, only the NICs effect, as HMRC's lines do.

| Change | Static (£m) | With behaviour (£m) | HMRC (£m) | Static ratio | With behaviour ratio | Notes |
|---|---:|---:|---:|---:|---:|---|
| Basic rate +1p | 7,229 | 7,156 | 8,021 | 0.90 | 0.89 | HMRC's 2026-27 liabilities imply about £7.7bn static (below); the rest is uncertainty in the comparison, which mixes liabilities and receipts |
| Higher rate +1p | 2,220 | 1,444 | 2,090 | 1.06 | 0.69 | HMRC's figure implies almost no response; the evidence suggests more. See "The higher rate" below. HMRC's figure sits inside our range (low £1,832m, high £1,056m) |
| Additional rate +1p (yield) | 1,665 | 227 | 258 | 6.5 | **0.88** | Behaviour removes most of the static yield, as HMRC's does. Range: low £946m, high −£492m (at the high end, raising the rate loses money) |
| Additional rate −1p (cost) | −1,665 | −315 | −326 | 5.1 | **0.97** | Range: low −£990m, high +£360m |
| Personal allowance +£100 | −940 | −1,003 | −1,021 | 0.92 | 0.98 | |
| Personal allowance +1% | −1,182 | −1,239 | −1,167 | 1.01 | 1.06 | A bigger allowance also moves the taper zone, raising some marginal rates |
| Basic rate band +1% | −625 | −659 | −647 | 0.97 | 1.02 | |
| Basic rate band +10% | −5,871 | −5,645 | −6,076 | 0.97 | 0.93 | |
| Basic rate band −10% | 6,871 | 6,497 | 7,000 | 0.98 | 0.93 | |
| Employee NICs main rate +1pp | 6,186 | 6,163 | 5,350 | 1.16 | 1.15 | Employees' pay matches ASHE, but HMRC's figure implies less employee NICs than even the OBR forecasts; see POPULATION.md |
| Employee NICs additional rate +1pp | 2,995 | 2,887 | 2,000 | 1.50 | 1.44 | Pay at the top that's taxable but not liable to NICs (share schemes, some benefits in kind), and HMRC probably assumes a bigger response |
| Employer NICs rate +1pp | 11,496 | 11,496 | 11,150 | 1.03 | 1.03 | A calibration target; employer NICs stay static |
| Class 4 main rate +1pp | 369 | 368 | 510 | 0.72 | 0.72 | Our profits match HMRC's own profit statistics (Table 3.10), and self-employed NICs come within 6% of the OBR's; HMRC's ready-reckoner figure is the odd one out |
| Class 4 additional rate +1pp | 450 | 431 | 345 | 1.30 | 1.25 | A heavier top tail of profits (to match HMRC's self-employed with over £1m) |
| Employee threshold +£2 a week | −230 | −230 | −210 | 1.09 | 1.09 | |
| Employer threshold +£2 a week | −471 | −471 | −420 | 1.12 | 1.12 | |
| Upper earnings limit +£10 a week | 210 | 206 | 220 | 0.96 | 0.93 | |
| Lower profits limit +£104 | −16 | −16 | −15 | 1.08 | 1.08 | |
| Upper profits limit +£520 | 7 | 7 | 10 | 0.73 | 0.71 | |
| Child Benefit first child +£1 a week | −327 | −327 | −335 | 0.97 | 0.97 | Benefits stay static |
| Child Benefit other children +£1 a week | −243 | −243 | −230 | 1.06 | 1.06 | |

(Updated 28 October 2026, on the population uprated with the OBR's October 2026 forecast. HMRC's income tax figures moved slightly because the scaling back from 2027-28 now uses October's earnings growth, 2.9%.)

**The additional rate is the test that matters most**: its static figure was 6.5 times HMRC's, and with the SFC's published elasticities, with nothing tuned to HMRC, it comes within 3–12%.

### The higher rate: why ours responds more than HMRC's

With behaviour, 1p on the higher rate raises £1,444m against HMRC's £2,090m. `tools/behaviour_by_band.mjs` breaks it down:

| Total income | Static (£m) | Behaviour (£m) |
|---|---:|---:|
| £50,270–£60,000 | 79 | −81 |
| £60,000–£80,000 | 386 | −126 |
| £80,000–£100,000 | 373 | −146 |
| £100,000–£125,140 (the personal allowance taper) | 379 | −333 |
| £125,140–£150,000 | 305 | −62 |
| Over £150,000 | 698 | −29 |

Two things drive it:
- **The taper (43% of the effect).** On £100,000–£125,140, 1p on the higher rate adds 1.5p to the marginal rate (they're also losing allowance), and they already keep only about 38p of each extra pound, so the share they keep falls by 3%. HMRC's records show people bunching at £100,000 (often through pension contributions), so a strong response here is real.
- **The response is to all of a person's income,** not just the part above £50,270, as in the SFC's method and the standard economics. Just above the threshold, the response can exceed the extra tax.

**What the evidence says.** HMRC's own study of Scottish taxpayers after Scotland's 2018-19 rate changes estimated elasticities of 0.31–0.35 for incomes of £43,431–£80,000 (statistically solid) and 0.27–0.46 for £80,000–£123,700 (less certain). Those are *higher* than the SFC's 0.1 and 0.2 that we use. So the evidence doesn't suggest our response is too big; if anything the SFC's figures are cautious there.

**HMRC's figure implies almost no response** at the higher rate: £2,090m is close to the static yield. Its bulletin says the figures apply taxable income elasticities and allow for incorporation, but doesn't publish the values. In December 2025 the statistics regulator (OSR) asked HMRC to publish a fuller methodology. Until it does, the gap can't be explained further. Our low figure (half the elasticities, £1,832m) is near HMRC's.

### A second, static comparison for the rates

HMRC's 2026-27 liabilities (Table 2.6) give the tax charged at each rate. Dividing by the rate gives the income taxed at that rate, and so what 1p on the rate raises before anyone responds. That's a like-for-like check for our static figures.

| 1p on the… | Ours | Implied by HMRC's 2026-27 liabilities | Ratio |
|---|---:|---:|---:|
| Basic rate | £7.23bn | £7.73bn (£154.7bn ÷ 20) | 0.94 |
| Higher rate | £2.22bn | £2.32bn (£92.9bn ÷ 40) | 0.96 |
| Additional rate | £1.67bn | £1.77bn (£79.5bn ÷ 45) | 0.94 |

All three are 4–6% low. HMRC's lines here are after tax reductions (EIS relief and the like, £5.4bn in all) while a rate change in our engine works on tax before them, and the basic-rate line includes Scottish taxpayers, whose rates the basic-rate lever doesn't change, so the two aren't quite like for like.

### What this means for trusting a costing

- **Personal allowance, basic rate band, employer NICs, upper earnings limit, Child Benefit:** within 6% of HMRC. Trustworthy.
- **Additional rate, with behaviour:** within 12% of HMRC, but the range is wide (a 1p rise could raise up to £1bn or lose money). Always show the range.
- **Basic rate:** about 10% below HMRC, static or with behaviour.
- **Higher rate, with behaviour:** 30% below HMRC, which implies almost no response; HMRC's own evidence suggests responses at least as big as ours. HMRC's figure is inside our low-to-high range. Show the range.
- **Employee NICs main rate and thresholds, employer threshold:** 9–16% high. Treat as overestimates (see POPULATION.md for why this can't yet be settled).
- **Class 4 main rate:** 28% below HMRC's ready reckoner, but consistent with HMRC's profit statistics, and self-employed NICs come within 6% of the OBR's total. Uncertain; show it with a wide range.
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

*1p on the basic rate* (raises £7.0bn): losses rise with income in pounds, up to £471 a year in the ninth tenth and £557 in the richest. As a share of income they peak at 0.6% in tenths 7–9, and the richest tenth loses less as a share (0.4%), because the basic rate only touches a fixed slice of a high income. Scotland is almost untouched: its rates on earnings are set by the Scottish Parliament.

*Bringing back the two-child limit* (saves £2.6bn): the losses fall on tenths 2 to 5 (up to 0.7% of income) and on lone parents (14% of them lose; £600 a year on average across all lone parents). Pensioners and households without children are untouched. The poorest tenth barely moves, because families with larger Universal Credit awards have incomes that rank them a little higher.

## Removing a tax, allowance or charge

`src/policy/removals.ts` lists what can be removed altogether and what each removal means: the higher and additional rates, the personal allowance and its taper, dividend tax, the savings allowances, the Scottish starter, intermediate, advanced and top rates, each kind of National Insurance, the benefit cap and the Child Benefit charge. A removal is applied after every lever, so it can tie one rate to another: with the higher rate removed, the higher band is taxed at whatever the basic rate is set to. Levers a removal makes meaningless (such as where the higher rate starts) are dropped from the policy. Removing employer National Insurance also removes the Employment Allowance and apprentice relief, which are otherwise netted off as lump sums.

These are much bigger changes than anything HMRC's ready reckoner checks, so every removal is marked "known gap". The static figure is mechanical and follows from the rules; the behavioural figure applies the same elasticities as for small changes, which is the least certain part. For example, removing the higher rate costs £44.3bn a year static, £37.8bn allowing for responses.

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

**Example:** a 2p cut in the basic rate (to 18%) costs £14.9bn in 2027-28 with behaviour, rising to £17.7bn by 2031-32. With interest, borrowing in 2029-30 is £18.4bn higher, and the main rule is missed by £3.9bn. Allowing for the effect on the economy, it's missed by £0.8bn (range: missed by £2.3bn to met by £0.8bn). Debt still falls in 2029-30, by a margin of £7.2bn.

## Named policies

`policies/library.yaml` and `src/policy/library.ts`. A named policy ("Raise VAT to 21%", "Scrap the two-child limit") is a plain-English measure that sets one or more sliders, to a value or by an amount from today's. The sliders stay: adding a policy moves them, and moving them yourself still works. A policy shows as added when all its settings are in place, adjusted when only some are, and neither when its sliders have been moved somewhere else.

## Taxes outside the household model: HMRC's ready reckoner

`costings/hmrc-ready-reckoner-2025-06.yaml`, `src/policy/reckoner.ts`. The household model can't cost VAT, duties, corporation tax, capital gains tax, inheritance tax, stamp duty or insurance premium tax: it has no companies, estates, property sales or shopping. HMRC publishes its own costings of standard changes to these taxes ("Direct effects of illustrative tax changes", June 2025), which allow for how people respond. Changes are costed from those:

- **Exactly a change HMRC costs** (1 point on VAT, £5,000 on the inheritance tax threshold): HMRC's own figure, grade A, check "close". Tests reproduce every HMRC figure exactly.
- **Another size:** scaled along straight lines from no change through HMRC's figures, grade B, check "fair". Where HMRC costs only a rise (corporation tax, capital gains, inheritance tax, vehicle and air passenger duty), a cut is the mirror image, which is less certain.
- **Far beyond HMRC's figures:** "known gap". For a line with one figure, beyond three times that change; the duties, which HMRC costs as a 1% change in their rates, beyond 10%. These limits are our judgement.

HMRC's figures already include responses, so these count the same in both headline figures. HMRC gives three years from a change; in the borrowing section they are the first three years of the budget (from April 2027), grown in line with the OBR's October 2026 forecast for that tax, and the third year then carries on with the forecast.

HMRC's capital gains figures stand out: raising either rate loses money in most years, because people hold on to assets. Stamp duty is similar at the top: raising the 12% rate or the surcharge on additional homes loses money.

Today's rates come from GOV.UK (`rules/2026-27/other_taxes.yaml`). For the duties, vehicle excise duty and air passenger duty, the sliders are a change from today's rates in HMRC's units (a share of today's duty, or pounds), so no rate of our own is needed.

## Who pays VAT and duties

`costings/ons-etb-2023-24.yaml`, `src/policy/indirect.ts`. A change in VAT, fuel, alcohol or tobacco duty, vehicle excise duty, insurance premium tax or air passenger duty is shared out across income tenths in proportion to what each tenth pays now, from the ONS's "Effects of taxes and benefits on household income" for 2023-24 (Table 2b: average paid by income decile, times households in it). Every household in a tenth gets the same share. Approximate: the ONS ranks individuals and the simulator ranks households, and within a tenth some households pay far more than others. Fuel and vehicle duty count both what households pay directly and what the ONS assigns to them through other prices.

Corporation tax, capital gains, inheritance tax and stamp duty aren't shared out: the ONS doesn't break them down by tenth, and who really bears corporation tax (shareholders, workers or customers) is disputed. The page says so rather than guess.

Example: VAT at 21% raises £8.8bn (HMRC). Shared out, the poorest tenth loses about £200 a year, 1.7% of its income; the richest loses about £540, a much smaller share of its income.

## Reforms

`src/policy/reforms.ts`. A reform pack brings in a new tax (or changes how one works) and replaces some of today's taxes. It plugs in like everything else:

- **What it replaces** is a set of lever settings and removals, so those taxes are costed exactly as they would be from the Taxes tab (the household model, HMRC's ready reckoner, and so on), each shown as its own row under the pack in the scorecard. While a pack is in, the levers it takes over leave the Taxes tab; a pack wins over your own setting of them.
- **Its own new taxes** are costed by the pack, part by part. Each part gives three years of figures, the OBR forecast line that carries it on after that, its grade (A to D) and check, and, if it reaches households, each income tenth's share of it. A part's figure is either static, with how people respond given separately (added to the responses row for the whole package, and grown with income tax: an approximation), or from a costing that already allows for responses, and it says which.
- **The headline grade and check** are the weakest of every change and every part.
- **The link** carries `rf_<pack>=1` for each pack in, and `rf_<pack>_<option>=<value>` for options changed from their defaults.

The household calculator includes what a pack replaces where it's in the engine, but not the pack's new taxes yet; the page says so.

**Check:** a test pack, only on the development site, cuts VAT and brings in a new tax identical to the slice cut (HMRC's costing of the cut, turned round, shared out as VAT is). It costs exactly zero in every year, with or without the effect on the economy, and nobody gains or loses (`test/reforms.test.ts`, for 1, 2 and 5 points). Without the new tax, the cut does cost money, so the zero isn't from nothing happening.

## Spending

`forecasts/departments-2026-10.yaml`, `src/policy/spending.ts`.

- **Departments.** Each department has two sliders: day-to-day spending (RDEL) and investment (CDEL), in £bn a year more or less than planned, from 2027-28. The plans are the OBR's October 2026 figures (tables 5.7 and 5.8): day-to-day to 2028-29, investment to 2029-30. After that a change grows in line with the OBR's total for that kind of spending, an assumption since the government hasn't set departmental plans that far ahead. A spending change costs exactly what's set, so there's no costing estimate to grade; the uncertainty is in its effect on the economy.
- **Benefits outside the household model:** the State Pension, Disability Living Allowance and PIP, Attendance Allowance, Pension Credit, Housing Benefit and Carer's Allowance, each as a % change on the OBR's forecast (Table 5.9). Not shared out to households yet.
- **The Barnett formula.** A change to a UK department's budget changes the Scottish, Welsh and Northern Ireland block grants by change × comparability × population share × factors, from HM Treasury's Statement of Funding Policy (June 2025): population shares of England's population of 9.52%, 5.49% and 3.33%; a 5% needs-based factor for Wales; a 24% needs-based factor and a 2.5% VAT abatement for Northern Ireland; and each department's comparability factor (Annex B). Tests reproduce the Treasury's worked example. Two simplifications: the OBR's combined "Business, Innovation, Science and Trade" line uses Science's factor, and small and independent bodies are taken as 0. HM Treasury notes a possible error in Transport's factor, to be corrected in its next edition.
- **Borrowing and the rules.** Day-to-day spending and benefits change the current budget (the main rule); investment adds to borrowing and debt but not to the current budget. The effect on the economy uses the OBR's multipliers for each: day-to-day departmental spending 0.45, investment 1.00 and benefits 0.60 in the first year, fading to nothing by the fifth.

Example: £10bn more a year for health and social care in England costs £11.9bn in 2027-28 with the Barnett share (£1.9bn). With £5bn more defence investment as well, the main rule is missed by £0.7bn in 2029-30 (met by £5.2bn allowing for the effect on the economy), and debt still falls, by a margin of £5.0bn.

Not included: second-round effects such as more public sector pay bringing in more income tax (official costings usually leave these out too), and who benefits from public services, which the ONS publishes by income tenth.

## History: the impact chart

`forecasts/history-2026-10.yaml` (built by `data/build_history.py`), `src/economy/history.ts`, `src/impact.ts`. Seven measures as a share of GDP: the current budget, borrowing, debt, tax (current receipts), total spending, net investment, and real GDP growth, each as outturn, the OBR's forecast and your budget.

- **History and forecast** come from one source, the OBR's public finances databank published with the October 2026 forecast, so they join without a seam. Borrowing and the other aggregates go back to 1948-49; net debt to 1974-75. Its forecast years match the forecast tables the simulator uses (tested). For 2025-26 its debt figures are about 0.2 points above the forecast report's Table A.9; the OBR doesn't say why, and the difference is small next to the changes a budget makes.
- **Debt** is public sector net debt, the familiar measure with the longer history. The debt rule uses net financial liabilities, published only from 2008-09; the rule's margin is shown separately.
- **Growth** is real GDP growth by financial year, from the ONS's quarterly GDP (ABMI) for outturn and the OBR's quarterly forecast after that. For 2025-26 the two differ by 0.1 points.
- **Your budget** is the OBR's forecast plus the budget's effect, from the same borrowing and debt path as the table: tax adds what the budget raises; spending adds day-to-day and investment spending, benefit changes and debt interest; the current budget is borrowing less investment. Shares use the OBR's GDP. Growth only changes in the version allowing for the effect on the economy (grade C), by the change in the GDP effect from one year to the next.

## Universal Credit: check against an OBR costing

There's no ready reckoner for Universal Credit, so UC costings are checked against the OBR's costings of real measures. The first is the removal of the two-child limit, which the OBR costed in its [November 2025 Economic and fiscal outlook](https://obr.uk/efo/economic-and-fiscal-outlook-november-2025/), Table 3.2 (checked against the document, 28 October 2026). It rises over the years because more families have a third child born after April 2017; 2026-27 is the like-for-like year.

| 2026-27 | Ours | OBR |
|---|---:|---:|
| Cost, static | £2.62bn | £2.1bn |
| Cost, with more families claiming | (not modelled) | £2.3bn |
| Families gaining | 589,000 | 510,000 |
| Average gain | £4,455 | £4,530 |

The average gain matches within 2%, but ours has 15% more families gaining, so the static cost comes out 25% over the OBR's (13% over its figure including the extra claims). That's consistent with the population having too many larger families on Universal Credit: lone parents are deliberately weighted up to match DWP's caseloads, and the Child Benefit checks point the same way (see POPULATION.md). So two-child limit costings are marked "known gap".

(Re-run 28 October 2026 on the population uprated with the October 2026 forecast. On an earlier population it came to £3.33bn for 691,000 families, compared then with the OBR's 2029-30 figures.)
