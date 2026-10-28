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
| Basic rate +1p | 7,133 | 8,073 | 0.88 | 2.7m too few taxpayers, all under 65 (see POPULATION.md); also uncertainty in the comparison, which mixes liabilities and receipts |
| Higher rate +1p | 2,325 | 2,104 | 1.11 | Some behaviour in HMRC's figure |
| Additional rate +1p (yield) | 1,622 | 259 | 6.3 | HMRC's includes behaviour: top earners shift and defer income. **Ours is static and overstates this.** See 6d |
| Additional rate −1p (cost) | −1,622 | −328 | 4.9 | Same |
| Personal allowance +£100 | −900 | −1,027 | 0.88 | Worth about £20 to each taxpayer, so it scales with the number of taxpayers, which is 7% short |
| Personal allowance +1% | −1,131 | −1,174 | 0.96 | |
| Basic rate band +1% | −641 | −651 | 0.98 | |
| Basic rate band +10% | −6,003 | −6,116 | 0.98 | |
| Basic rate band −10% | 7,015 | 7,046 | 1.00 | |
| Employee NICs main rate +1pp | 5,865 | 5,350 | 1.10 | Pay between the thresholds is a little high in the population |
| Employee NICs additional rate +1pp | 2,988 | 2,000 | 1.49 | Behaviour, plus pay at the top that's taxable but not liable to NICs (share schemes, some benefits in kind) |
| Employer NICs rate +1pp | 10,635 | 11,150 | 0.95 | HMRC's includes employer NICs on benefits in kind (Class 1A), which we don't model |
| Class 4 main rate +1pp | 442 | 514 | 0.86 | |
| Class 4 additional rate +1pp | 502 | 347 | 1.45 | Self-employed profits at the top are too high in the population |
| Employee threshold +£2 a week | −221 | −210 | 1.05 | |
| Employer threshold +£2 a week | −443 | −420 | 1.05 | |
| Upper earnings limit +£10 a week | 200 | 220 | 0.91 | |
| Lower profits limit +£104 | −15 | −15 | 1.03 | |
| Upper profits limit +£520 | 9 | 10 | 0.91 | |
| Child Benefit first child +£1 a week | −361 | −335 | 1.08 | The population has 5% too many families paid Child Benefit |
| Child Benefit other children +£1 a week | −255 | −230 | 1.11 | Same |

(Updated 28 October 2026, after property, savings and dividend income began to be taxed and the population was calibrated to HMRC's 2026-27 taxpayer projections. Before the first change, the basic rate band lines were 14% low; now they match HMRC to within 2%.)

### What this means for trusting a costing

- **National Insurance thresholds and limits, the basic rate band, the personal allowance by 1%:** within 5% of HMRC. Trustworthy.
- **Higher rate, employee and employer NICs main rates:** within 11%. Good.
- **Basic rate, personal allowance in pounds:** about 12% low, because the population has 2.7m too few taxpayers under 65. Treat as an underestimate until the household structure is fixed.
- **Additional rate, NICs above the upper earnings limit, Class 4 at the top:** static figures are far above HMRC's behavioural ones. **Don't use these without behaviour (6d).** On the page they'll be flagged until then.
- **Child Benefit:** about 10% high, because of too many families in the population.

## Universal Credit: check against an OBR costing

There's no ready reckoner for Universal Credit, so UC costings are checked against the OBR's costings of real measures. The first is the removal of the two-child limit, which the OBR costed in November 2025 (Economic and fiscal outlook, table 3.2, as reported): £2.3bn in 2026-27, rising to about £3bn by 2029-30 as claims build up, for about 560,000 families gaining around £5,310 a year each.

| | Ours (2026-27, full effect) | OBR |
|---|---:|---:|
| Cost | £3.33bn | £3.0bn (2029-30, mature) |
| Families gaining | 691,000 | 560,000 |
| Average gain | £4,819 | £5,310 |

Ours is about 10% high on cost and 23% high on families, with a smaller average. That's consistent with the population having somewhat too many larger families on low incomes (the Child Benefit checks point the same way). Ours is also a full, immediate effect; the OBR's first year is lower because new claims take time to come through. A source note: I found the OBR figures via news reports quoting the EFO, not in the EFO itself; they should be confirmed against the document before being shown on the page.
