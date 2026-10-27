# Milestone 1 plan: income tax, NICs, Universal Credit, Child Benefit

Status: steps 1–4 done (27 October 2026), plus an early household calculator page and the benefit cap. Step 4 covered PolicyEngine UK (all 50 test households match; see tools/README.md); checking against gov.uk worked examples is still to do. Step 5, the synthetic population, is next. I'll check in with results after each step.

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

   **Detailed plan for step 5 (proposed 27 October 2026, waiting for go):**

   - **5a. Collect target tables.** Each one goes into `data/targets/` with its source recorded like the rules are. All are Open Government Licence:
     - HMRC personal incomes statistics 2023-24 (released April 2026): people by income band, by income type, and income tax paid
     - DWP Universal Credit households by family type, work and housing (Stat-Xplore)
     - HMRC Child Benefit families by number of children, and Child Benefit charge payers
     - ONS households by region and type, and population by age
     - Tenure by region
     - OBR's forecast totals for income tax, NICs and Universal Credit spending in 2026-27
   - **5b. Seed households.** About 30,000 made-up households spread over family types, ages, regions, tenures and work patterns. Incomes are drawn from distributions fitted to the HMRC percentiles and uprated to 2026-27 with OBR earnings growth. Rents come from published regional averages.
   - **5c. Calibrate.** Adjust each household's weight (how many real households it stands for) as little as possible, so the totals match every target at once. This is standard "minimum-change reweighting", the same idea official microsimulation uses.
   - **5d. Check honestly.** Some published tables are held back from calibration and used only as a test, such as the DWP household income distribution by decile. We then run the engine over the population and compare total income tax, NICs and UC with OBR. The results are written up in `POPULATION.md`, covering what it gets right and what it can't.
   - **5e. Ship it.** A compact data file the page loads, around 1–2 MB.

   Decided by Ari: build scripts in Python (the site stays TypeScript). Ari will register for a free Stat-Xplore account for the detailed Universal Credit tables.

6. **Costing.** Static cost of any change, then a behavioural version using published estimates of how taxable income responds to rates, shown side by side. Checked against HMRC's ready reckoner; large gaps are explained or fixed.

7. **Economy and debt.** OBR's latest forecast as the baseline, OBR multipliers for GDP effects, borrowing and debt over 5 years, and a pass/fail check against both fiscal rules with the margin shown.

8. **The page.**
   - A policy panel to change any rule
   - Results: cost, winners and losers by income band, borrowing and debt
   - A household calculator with the marginal rate chart
   - A "show working" drawer on every number with its source, method and grade

## Not in milestone 1 (written down so it isn't forgotten)

Savings and dividend income, Marriage Allowance, council tax and Council Tax Reduction, Local Housing Allowance caps by area, disability benefits, pensioner benefits (Pension Credit, Winter Fuel Payment), Scottish Child Payment, the TV licence, VAT and other indirect taxes, spending departments (layer 4), and reform packs (land value tax comes in milestone 2).

## Decisions I'll need from you along the way

- Name and code licence (before any public repo)
- Whether and when to create a GitHub repo (it's public, so that's your call)
- Look-and-feel direction, before step 8
