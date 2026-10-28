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
| Higher rate +1p | 2,241 | 1,478 | 2,104 | 1.06 | 0.70 | The SFC's elasticities give a bigger response than HMRC's figure implies, mostly from people on £100,000–£125,140, whose marginal rate in the personal allowance taper is already 62%. HMRC's figure sits inside our range (low £1,860m, high £1,097m) |
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
- **Higher rate, with behaviour:** 30% below HMRC; HMRC's figure is inside our low-to-high range. Show the range.
- **Employee NICs main rate and thresholds, employer threshold:** 9–16% high. Treat as overestimates (see POPULATION.md for why this can't yet be settled).
- **Class 4 main rate:** 27% below HMRC's ready reckoner, but consistent with HMRC's profit statistics and the OBR's Class 4 total. Uncertain; show it with a wide range.
- **Benefit changes:** static only, labelled as such.

**Speed:** a costing with behaviour takes about 2.7 seconds over the whole population (static alone is much quicker). Fine for checks; to be made faster when the page is built (6f).

## Universal Credit: check against an OBR costing

There's no ready reckoner for Universal Credit, so UC costings are checked against the OBR's costings of real measures. The first is the removal of the two-child limit, which the OBR costed in November 2025 (Economic and fiscal outlook, table 3.2, as reported): £2.3bn in 2026-27, rising to about £3bn by 2029-30 as claims build up, for about 560,000 families gaining around £5,310 a year each.

| | Ours (2026-27, full effect) | OBR |
|---|---:|---:|
| Cost | £3.33bn | £3.0bn (2029-30, mature) |
| Families gaining | 691,000 | 560,000 |
| Average gain | £4,819 | £5,310 |

Ours is about 10% high on cost and 23% high on families, with a smaller average. That's consistent with the population having somewhat too many larger families on low incomes (the Child Benefit checks point the same way). Ours is also a full, immediate effect; the OBR's first year is lower because new claims take time to come through. A source note: I found the OBR figures via news reports quoting the EFO, not in the EFO itself; they should be confirmed against the document before being shown on the page.

(These two-child limit figures are from an earlier population and haven't been re-run since.)
