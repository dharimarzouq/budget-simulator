# Tools

## Checking the engine against PolicyEngine UK

`policyengine_compare.py` runs every household in `test/fixtures/households.json` through
[PolicyEngine UK](https://github.com/PolicyEngine/policyengine-uk) (open source, AGPL-3.0) and saves
its answers to `test/fixtures/policyengine.json`. `test/policyengine.test.ts` then compares our engine
with them line by line. Any gap bigger than a pound or two fails, unless it's listed with a reason in
`test/fixtures/known-differences.json`.

PolicyEngine is only used to produce the saved answers, so the normal tests don't need Python.

Setup, once (Python 3.13; PolicyEngine doesn't support newer versions yet):

```
py -3.13 -m venv .venv-pe
.venv-pe\Scripts\python.exe -m pip install "policyengine-uk==2.162.12"
```

Re-run after adding households or changing the PolicyEngine version:

```
.venv-pe\Scripts\python.exe -I tools\policyengine_compare.py
npm test
```

## Results, 27 October 2026 (PolicyEngine UK 2.162.12)

All 45 households match on income tax, employee, employer and self-employed National Insurance, Child
Benefit, the Child Benefit charge, Universal Credit (maximum and award) and net income. Three households
differ only because of the benefit cap, which we don't apply yet; each gap equals the excess over the cap
to the penny.

Things we found along the way:

- PolicyEngine counts the Child Benefit charge as part of income tax, and rounds both the benefit and the charge down to whole pounds.
- PolicyEngine uses weekly National Insurance thresholds × 52 (£12,584), not the annual £12,570, so its employee NI is about £1 a year higher. Real payroll uses the period threshold too, so neither is "the" answer for a whole year.
- PolicyEngine applies Marriage Allowance automatically for a couple with one non-taxpayer. We don't model it yet, so it's switched off for the comparison.
- PolicyEngine's net income includes the TV licence, Winter Fuel Payment (£200 for our over-66 cases) and Scottish Child Payment. We don't model these yet, so they're taken out before comparing.
