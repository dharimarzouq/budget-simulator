# How costings are worked out, and how far to trust them

## Method (static costing)

A policy is a list of lever settings, such as "basic rate 20% → 21%" (`src/policy/`). To cost it, the engine runs over the whole synthetic population (see POPULATION.md) twice: once under today's 2026-27 rules, once under the policy. The difference in each tax and benefit is the cost.

- **Static** means nobody changes what they earn, how they're paid, or what they claim in response. Behavioural costing (allowing for that) is step 6d and will be shown side by side, never mixed in silently.
- **Tax and benefits interact.** A change to one shows up in others. For example, a basic rate rise also *raises* Universal Credit spending, because UC is withdrawn on pay after tax, so claimants get 55p of each extra £1 of tax back. The costing shows every line it moved, not just the one you changed.
- **Each lever is also costed on its own.** What's left over when several levers are combined is shown as "interaction".
- **It's one year (2026-27), full-year effect.** Real receipts lag for self-assessment taxpayers; the OBR-style multi-year profile comes in step 7.

## Check against HMRC's ready reckoner

HMRC publishes the effect of standard changes ("Direct effects of illustrative tax changes"). The latest edition is June 2025, on the OBR's March 2025 forecast; HMRC hasn't updated it since. `tools/ready_reckoner.mjs` runs the same changes through our population and compares.

Two things to know about HMRC's figures:

- **They include behavioural responses** (HMRC applies estimates of how taxable income responds to rates). Ours are static, so where people respond a lot, ours should come out larger.
- **They're receipts, and self-assessment income tax arrives a year late.** So for income tax and Class 4 we compare with HMRC's 2027-28 figure scaled back by a year's earnings growth (OBR, 2.2%), not its understated first year. NICs and Child Benefit are compared with 2026-27 directly.

| Change | Ours (£m) | HMRC (£m) | Ratio | Why they differ |
|---|---:|---:|---:|---|
| Basic rate +1p | 7,252 | 8,073 | 0.90 | Ours is static and HMRC's 2026-27 liabilities imply about 7.7bn (below); the rest is uncertainty in the comparison, which mixes liabilities and receipts |
| Higher rate +1p | 2,248 | 2,104 | 1.07 | Some behaviour in HMRC's figure |
| Additional rate +1p (yield) | 1,658 | 259 | 6.4 | HMRC's includes behaviour: top earners shift and defer income. **Ours is static and overstates this.** See 6d |
| Additional rate −1p (cost) | −1,658 | −328 | 5.1 | Same |
| Personal allowance +£100 | −945 | −1,027 | 0.92 | Worth about £20 to each taxpayer, so it scales with the number of taxpayers, which is 2% short |
| Personal allowance +1% | −1,188 | −1,174 | 1.01 | |
| Basic rate band +1% | −644 | −651 | 0.99 | |
| Basic rate band +10% | −5,981 | −6,116 | 0.98 | |
| Basic rate band −10% | 6,994 | 7,046 | 0.99 | |
| Employee NICs main rate +1pp | 6,120 | 5,350 | 1.14 | Employees' pay matches ASHE, but HMRC's figure implies less employee NICs than even the OBR forecasts; see POPULATION.md |
| Employee NICs additional rate +1pp | 3,064 | 2,000 | 1.53 | Behaviour, plus pay at the top that's taxable but not liable to NICs (share schemes, some benefits in kind) |
| Employer NICs rate +1pp | 11,446 | 11,150 | 1.03 | A calibration target; HMRC's includes employer NICs on benefits in kind (Class 1A), which we don't model |
| Class 4 main rate +1pp | 370 | 514 | 0.72 | Our profits match HMRC's own count of self-employed taxpayers by range of profits (SPI Table 3.10), which implies a main-rate base of about £40bn (ours £37bn); HMRC's figure implies £51bn. Total self-employed NICs match the OBR. So HMRC's ready-reckoner figure, not the population, is the odd one out, for reasons not published |
| Class 4 additional rate +1pp | 456 | 347 | 1.31 | Behaviour in HMRC's figure, and a heavier top tail of profits (to match HMRC's self-employed with over £1m) |
| Employee threshold +£2 a week | −227 | −210 | 1.08 | |
| Employer threshold +£2 a week | −469 | −420 | 1.12 | |
| Upper earnings limit +£10 a week | 210 | 220 | 0.95 | |
| Lower profits limit +£104 | −16 | −15 | 1.07 | |
| Upper profits limit +£520 | 7 | 10 | 0.72 | |
| Child Benefit first child +£1 a week | −331 | −335 | 0.99 | |
| Child Benefit other children +£1 a week | −238 | −230 | 1.04 | |

(Updated 28 October 2026, after employees' pay began to be drawn from ASHE 2026, and the engine gained other deductions and Marriage Allowance.)

### A second, static comparison for the rates

HMRC's 2026-27 liabilities (Table 2.6) give the tax charged at each rate. Dividing by the rate gives the income taxed at that rate, and so what 1p on the rate raises before anyone responds. That's a like-for-like check for our static figures, which the ready reckoner (with behaviour built in) isn't.

| 1p on the… | Ours | Implied by HMRC's 2026-27 liabilities | Ratio |
|---|---:|---:|---:|
| Basic rate | £7.33bn | £7.73bn (£154.7bn ÷ 20) | 0.95 |
| Higher rate | £2.22bn | £2.32bn (£92.9bn ÷ 40) | 0.96 |
| Additional rate | £1.65bn | £1.77bn (£79.5bn ÷ 45) | 0.93 |

All three are 4–7% low. The additional rate's static figure is close, so its 6× gap with the ready reckoner is HMRC's behavioural adjustment (top earners shifting and deferring income), which is step 6d. (A puzzle: these are a little low while total income tax is 2% high. Reliefs and the order income is taxed in move tax between rates, so the two checks don't have to agree exactly.)

### What this means for trusting a costing

- **The personal allowance by 1%, the basic rate band, employer NICs, the upper earnings limit, Child Benefit:** within 4% of HMRC. Trustworthy.
- **Basic rate, higher rate, personal allowance in pounds:** within 9%. Good.
- **Employee NICs main rate and thresholds, employer threshold:** 10–17% high. Treat as overestimates (see POPULATION.md for why this can't yet be settled).
- **Class 4 main rate:** 27% below HMRC's ready reckoner, but consistent with HMRC's profit statistics and the OBR's Class 4 total. Uncertain; show it with a wide range.
- **Additional rate, NICs above the upper earnings limit:** static figures are far above HMRC's behavioural ones. **Don't use these without behaviour (6d).** On the page they'll be flagged until then.

## Universal Credit: check against an OBR costing

There's no ready reckoner for Universal Credit, so UC costings are checked against the OBR's costings of real measures. The first is the removal of the two-child limit, which the OBR costed in November 2025 (Economic and fiscal outlook, table 3.2, as reported): £2.3bn in 2026-27, rising to about £3bn by 2029-30 as claims build up, for about 560,000 families gaining around £5,310 a year each.

| | Ours (2026-27, full effect) | OBR |
|---|---:|---:|
| Cost | £3.33bn | £3.0bn (2029-30, mature) |
| Families gaining | 691,000 | 560,000 |
| Average gain | £4,819 | £5,310 |

Ours is about 10% high on cost and 23% high on families, with a smaller average. That's consistent with the population having somewhat too many larger families on low incomes (the Child Benefit checks point the same way). Ours is also a full, immediate effect; the OBR's first year is lower because new claims take time to come through. A source note: I found the OBR figures via news reports quoting the EFO, not in the EFO itself; they should be confirmed against the document before being shown on the page.
