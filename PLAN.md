# Milestone 1 plan: income tax, NICs, Universal Credit, Child Benefit

Status: steps 1–3 done (27 October 2026), plus an early household calculator page. Step 4, checking against PolicyEngine UK, is next. I'll check in with results after each step.

Tax year: 2026/27, the current year. Every rate and threshold is stored as data with its source and legal basis, not hard-coded. That matters because the rules change. For example, the Universal Credit two-child limit was removed from 6 April 2026 by the Universal Credit (Removal of Two Child Limit) Act 2026.

## Steps

1. **Project setup.** TypeScript, a fast dev server, unit tests, static build output. Local git repo only; no GitHub repo until you say so.

2. **Rules as data.** For 2026/27:
   - Income tax: England/Wales/NI bands and Scottish bands, personal allowance and its taper above £100k
   - National Insurance: employee and employer Class 1, self-employed Class 4
   - Universal Credit: standard allowances, child and childcare elements, work allowances, the 55% taper, housing element from a rent you enter
   - Child Benefit and the High Income Child Benefit Charge

   Each value records the source URL, publisher and the legislation or guidance behind it.

3. **The engine.** Takes one household (earnings, self-employment, pension income, children, rent, region) and returns net income with a line-by-line breakdown. It also works out the marginal rate at any income, meaning how much of the next £1 earned the household keeps.

4. **Checking the engine.** 30–50 test households covering the awkward cases: the £100k taper, the Child Benefit charge, the Universal Credit taper meeting income tax, Scotland. Each runs through PolicyEngine UK (installed locally) and is checked against gov.uk worked examples. Every mismatch gets fixed or written down with a reason.

5. **Synthetic population, version 0.** Generate households and weight them so totals match open tables:
   - HMRC income distribution statistics
   - DWP Universal Credit and Child Benefit caseloads (Stat-Xplore)
   - published FRS household tables
   - ONS household types

   Labelled "synthetic" everywhere it's used. The doc will state plainly what it gets right (totals by income band, caseloads) and what it can't (fine combinations of characteristics).

6. **Costing.** Static cost of any change, then a behavioural version using published estimates of how taxable income responds to rates, shown side by side. Checked against HMRC's ready reckoner; large gaps are explained or fixed.

7. **Economy and debt.** OBR's latest forecast as the baseline, OBR multipliers for GDP effects, borrowing and debt over 5 years, and a pass/fail check against both fiscal rules with the margin shown.

8. **The page.**
   - A policy panel to change any rule
   - Results: cost, winners and losers by income band, borrowing and debt
   - A household calculator with the marginal rate chart
   - A "show working" drawer on every number with its source, method and grade

## Not in milestone 1 (written down so it isn't forgotten)

Savings and dividend income, council tax and Council Tax Reduction, Local Housing Allowance caps by area, the benefit cap, disability benefits, pensioner benefits, VAT and other indirect taxes, spending departments (layer 4), and reform packs (land value tax comes in milestone 2).

## Decisions I'll need from you along the way

- Name and code licence (before any public repo)
- Whether and when to create a GitHub repo (it's public, so that's your call)
- Look-and-feel direction, before step 8
