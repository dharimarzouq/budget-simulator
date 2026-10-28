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

   Progress, 27 October 2026: 5a is done; see data/targets/targets.yaml. It covers HMRC incomes, UC households (May 2026), FRS households (2024-25, via Stat-Xplore, which also covers people who don't pay tax), Child Benefit (August 2025) and OBR totals (March 2026). ONS tables weren't needed yet, because the FRS is already weighted to ONS population totals. Still to find: Northern Ireland Universal Credit, which isn't in Stat-Xplore.

   Progress, 27 October 2026: 5b is done; see POPULATION.md for the seed, its assumptions and how far it is from the targets before calibration. Found along the way: running the engine over the 34,000 benefit units took about 60 seconds. Fixed: Vite was scanning the Python environments, and number formatting built a new formatter on every call. Now the whole population runs in about 0.3 seconds and a page update takes about 20ms, so no separate fast mode is needed.

   Progress, 27 October 2026: 5d and 5e are done. Held-back check: median household incomes match HBAI within 1–2% for children, working-age adults and pensioners (POPULATION.md). The population ships as public/data/population-2026-27.json. The page has a "whole country" section that runs the engine over it in the browser (about 0.2 seconds) and compares the totals with the published figures. **Step 5 is complete.** Step 6, costing, is next.

   Progress, 27 October 2026: 5c first version done; see POPULATION.md. Universal Credit is now within 5% and income tax within the expected gap. National Insurance came out 7–15% high. It now matches the OBR within 1.5% (see POPULATION.md). The fixes were the under-21 zero rate, Employment Allowance and apprentice relief as lump sums, working pensioners, second jobs, and other income for HMRC band placement. The engine now models second jobs.

6. **The budget view: levers, costings, winners and losers.** Proposed 28 October 2026, waiting for go. The page is reorganised around the national budget, because the old page showed the machinery and it wasn't clear what it was for.

   **New layout, top to bottom:**
   1. **Your budget, headline.** What the package raises or costs a year, static and with behaviour, and what that does to borrowing (borrowing comes in step 7).
   2. **Levers.** Grouped by tax and benefit: income tax, National Insurance, Universal Credit, Child Benefit. Each lever shows today's value, a control to change it, and its cost on its own.
   3. **Winners and losers.** Average gain or loss by income decile, in £ a year and as a % of income. Also: how many households gain, lose, or see no change, plus breakdowns by family type and by region.
   4. **A household like yours.** The existing calculator, moved down and reframed: enter a household and see it before and after your package, with its marginal rate chart.
   5. **How we know** (a separate page). The rules and their sources, and the population checks against published figures.

   **The work:**
   - **6a. Policies as data.** A policy is a list of changes to the rules (e.g. "basic rate 20% → 21%"). Applying it gives a changed RuleSet; the engine itself doesn't change. Policies can be shared as a link.
   - **6b. Static costing.** Run the population under today's rules and under the package, and the difference is the cost. Also report each lever's cost on its own, and the package's interactions (levers can overlap, e.g. a tax rise reduces Universal Credit spending).
   - **6c. Check against HMRC's ready reckoner.** HMRC publishes the cost of standard changes: 1p on each rate, £100 or 1% on thresholds and allowances. Run the same changes and compare. Explain big gaps or fix them before anything is published.
   - **6d. Behavioural costing.** For income tax rate changes, use published estimates of how much reported income responds to rates (HMRC's and the OBR's figures), applied by income band. Shown side by side with the static cost and graded. Benefit changes stay static for now, labelled as such.
   - **6e. Winners and losers.** Household-level before and after across the population, grouped by equivalised income decile.
   - **6f. The page**, in the layout above. Each number gets a "show working" drawer with its method, sources and grade.

   Progress, 28 October 2026: 6a–6c are done; see COSTING.md. Costings for NICs thresholds, the higher rate and the employer rate are within 5% of HMRC. The basic rate, personal allowance and basic rate band come out about 14% low, because property, savings and dividend income isn't taxed yet. Top-rate costings are far above HMRC's, because HMRC's include behaviour, which is 6d. Removing the two-child limit costs £3.3bn against the OBR's £3bn.

   Progress, 28 October 2026: property, savings and dividend income is now taxed by the real 2026-27 rules: allowances, the starting rate for savings, dividend rates, the legal order, and UK bands for savings and dividends in Scotland. It's checked by hand-worked tests (including GOV.UK's examples) and 11 PolicyEngine households. Income tax across the population is now £357.7bn against the OBR's £359.6bn. Six new levers cover dividend rates, the dividend allowance, savings allowances and the starting rate band.

   Progress, 28 October 2026: the population was refined until the remaining gaps were source disagreements or needed microdata (see POPULATION.md); income tax is within 0.3% of HMRC's 2026-27 liabilities.

   Progress, 28 October 2026: 6d is done. Behavioural costing uses the Scottish Fiscal Commission's elasticities by income (Ari's choice), with low and high figures at half and 1.5 times, shown next to the static figure. On HMRC's ready reckoner, the additional rate now comes within 1–9% (static was 6.4 times); the higher rate comes out 30% below HMRC, with HMRC's figure inside our range. See COSTING.md.

   **Levers in the first version** (all already in the rules):
   - **Income tax:** basic, higher and additional rates (England, Wales and NI separately from Scotland), personal allowance, higher-rate threshold, additional-rate threshold, personal allowance taper.
   - **National Insurance:** employee main and additional rates, employer rate, primary and secondary thresholds, upper earnings limit, self-employed rates.
   - **Universal Credit:** standard allowances, child element, the two-child limit on or off, work allowances, the taper rate, health element rates, the benefit cap.
   - **Child Benefit:** both rates, and the charge threshold and taper width.

7. **Economy and debt.** OBR's latest forecast as the baseline, OBR multipliers for GDP effects, borrowing and debt over 5 years, and a pass/fail check against both fiscal rules with the margin shown. This fills in the headline's borrowing line.

8. **Polish.** Look-and-feel pass, phone layout, accessibility, sharing links, and a methods write-up for the "how we know" page.

## Not in milestone 1 (written down so it isn't forgotten)

Separate property income rates (from April 2027), finance cost relief for landlords, investment reliefs (EIS, SEIS, VCTs) and Gift Aid as rules of their own (they're in the population only as a total of tax reductions), council tax and Council Tax Reduction, Local Housing Allowance caps by area, disability benefits, pensioner benefits (Pension Credit, Winter Fuel Payment), Scottish Child Payment, the TV licence, VAT and other indirect taxes, spending departments (layer 4), and reform packs (land value tax comes in milestone 2).

## Decisions I'll need from you along the way

- Name and code licence (before any public repo)
- Whether and when to create a GitHub repo (it's public, so that's your call)
- Look-and-feel direction, before 6f (the page)
- ~~Which behavioural estimates to use in 6d.~~ Decided: the Scottish Fiscal Commission's, with a low/high range.
