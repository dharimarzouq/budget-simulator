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

   Progress, 28 October 2026: 6e is done. Winners and losers by income tenth (households ranked by HBAI-style equivalised income), family type and the 12 regions: average change in £ and as a % of income, and shares gaining, losing or seeing no real change (under £1 a week). See COSTING.md.

   Progress, 28 October 2026: 6f is built in the Workbench style. Levers on the left (search, "changed only", per-lever reset), results on the right: static and behavioural figures with the range, the breakdown by tax and benefit and by lever, winners and losers (chart by tenth in £ or %, tables by family and region), and the household calculator under today's rules and the budget. Costing runs in a background worker: static figures first, behaviour a moment later. The budget lives in the address bar, so a link shares it. Rules and population checks moved to a "How we know" page. Confidence follows CLAUDE.md's grades (everything here is B, our microsimulation), with a separate "checks against HMRC" label per lever: close, fair or known gap.

   Progress, 28 October 2026: after Ari found the page finicky: a live chart of one person's marginal or average tax rate from £0 to £200,000, today and under the budget (employee in England or Scotland, self-employed, or pensioner), with a box at the cursor giving both rates and the change in take-home pay. Three columns on wide screens. Sliders show a box with the new value and the change while dragging, move rates in whole points, and the results stay on screen with an "Updating…" note. Taxes, allowances and charges can be removed altogether, hiding the levers that no longer mean anything; removals go in the share link and are marked "known gap" (see COSTING.md).

   **Levers in the first version** (all already in the rules):
   - **Income tax:** basic, higher and additional rates (England, Wales and NI separately from Scotland), personal allowance, higher-rate threshold, additional-rate threshold, personal allowance taper.
   - **National Insurance:** employee main and additional rates, employer rate, primary and secondary thresholds, upper earnings limit, self-employed rates.
   - **Universal Credit:** standard allowances, child element, the two-child limit on or off, work allowances, the taper rate, health element rates, the benefit cap.
   - **Child Benefit:** both rates, and the charge threshold and taper width.

7. **Economy and debt.** OBR's latest forecast as the baseline, OBR multipliers for GDP effects, borrowing and debt over 5 years, and a pass/fail check against both fiscal rules with the margin shown. This fills in the headline's borrowing line.

   Progress, 28 October 2026: loose ends. Scottish Marriage Allowance is now given at the Scottish basic rate (20%), as Income Tax Act 2007 s55B(3) says, not the starter rate. The two-child limit costing was re-run and checked against the OBR's own Table 3.2 (November 2025): 25% over its 2026-27 static cost, with the right average gain but 15% too many families, so it's now marked "known gap". The How we know page no longer shows "−0%".

   Progress, 28 October 2026: the population is now uprated with, and checked against, the OBR's October 2026 forecast too (`data/uprating.py`), and recalibrated. Income tax is within 0.2% of HMRC's 2026-27 liabilities. Universal Credit is now 2.6% over the OBR (theirs excludes Northern Ireland, ours doesn't), and self-employed NICs 6% under. Ready reckoner comparisons moved by about 1% at most. See POPULATION.md.

   Progress, 28 October 2026: done; see COSTING.md. The baseline is the OBR's October 2026 forecast, published today with Budget 2026, not March's. A "Borrowing and debt" section shows the margin against both fiscal rules (current budget in surplus in 2029-30, net financial liabilities falling in 2029-30), and borrowing and debt year by year to 2031-32, including extra debt interest. Changes are assumed to start in April 2027. The effect on the economy is a separate line (grade C), as Ari chose: it uses the OBR's multipliers and its rule for how GDP feeds into borrowing, with a half-to-1.5-times range.

8. **Polish.** Look-and-feel pass, phone layout, accessibility, sharing links, and a methods write-up for the "how we know" page.

   Progress, 28 October 2026: done, to the plan Ari approved.
   - **Phones:** a bar pinned to the bottom shows what the budget raises or costs and whether the main fiscal rule is met; the levers open over the page, with Done or Escape to close.
   - **Layout:** three columns only from 1600px wide. Narrower, the tax chart sits under the headline figures (a change from the plan, which put it at the top: there it pushed the headline off the first screen). On phones it comes after borrowing.
   - **Explanations:** lever notes, checks and grades open in place from an "i" button instead of only on hover.
   - **Accessibility:** visible keyboard focus; the tax chart can be read with the arrow keys; sliders read out their value ("21%"); contrast measured in both themes, with light mode's green darkened to pass.
   - **Numbers:** £bn to one decimal place, £m under £1bn, real minus signs throughout.
   - **Sharing:** link previews have a title and description (the same for every budget: the site has no server to tailor them), and "Copy summary" gives a few plain lines.
   - **Progress:** the response figure shows how far it has got, and loading says what it's doing. With no changes, the response figure is skipped instead of computed.
   - **How we know:** a plain-language "How it works" section.

## Not in milestone 1 (written down so it isn't forgotten)

Separate property income rates (from April 2027), finance cost relief for landlords, investment reliefs (EIS, SEIS, VCTs) and Gift Aid as rules of their own (they're in the population only as a total of tax reductions), council tax and Council Tax Reduction, Local Housing Allowance caps by area, disability benefits, pensioner benefits (Pension Credit, Winter Fuel Payment), Scottish Child Payment, the TV licence, VAT and other indirect taxes, spending departments (layer 4), and reform packs (land value tax comes in milestone 2).

# Milestone 2 plan: taxes and policies, spending, history, then the design

Agreed 29 October 2026. Ari found the page unintuitive; the design gets redone once the back end it has to show exists. The order:

1. **Taxes and policies** (detailed below; waiting for go).
2. **Spending.** Departmental budgets (day-to-day and capital, from the OBR's October 2026 tables 5.7 and 5.8) and the big spending lines (welfare, the State Pension, debt interest), each change carrying the OBR's multiplier for its kind of spending.
3. **History.** The public finances back to about 1995 (OBR historical tables, Open Government Licence), so each result can be shown as history, the official forecast, and your choices.
4. **The design pass.** Separate places to adjust taxes, spending and economic assumptions; one headline figure against existing plans; an "impact" panel with a tab per measure (current budget, borrowing, debt, tax, spending, investment, growth), each a chart of history, forecast and your choices; a coherent theme of our own; a first-time "how to play"; a shareable picture of your plan.

## Step 1 in detail: taxes and policies (proposed 29 October 2026, waiting for go)

- **1a. Policies as named measures.** A policy is a plain-English measure ("Raise the basic rate by 1p", "Scrap the two-child limit", "Tax capital gains like income") with a description, its options, how it's costed, and its sources and grade. Kept as data in a policy library. Each reports what it raises or costs (static and with responses, separately), who gains and loses where households are affected, its grade and its check. The existing levers stay for people who want them; a policy is a named setting of them, or a costing of its own for taxes the engine doesn't model.
- **1b. The other big taxes,** costed from HMRC's ready reckoner, which lists standard changes for VAT, corporation tax, capital gains tax, inheritance tax, stamp duty land tax, fuel duty, alcohol and tobacco duties, vehicle excise duty and insurance premium tax. We can't model companies, estates or shopping baskets ourselves, so for these the costing is HMRC's own (it already allows for responses), scaled to the size of the change. Exactly the changes HMRC lists are an official costing (grade A); sizes in between are scaled (B); changes far beyond them are marked a known gap. Each is carried over the forecast years with the OBR's forecast for that tax.
- **1c. Who pays VAT and duties.** Households pay these through what they buy. ONS's "Effects of taxes and benefits on household income" publishes, by income tenth and household type, how much VAT and each duty households pay (Open Government Licence), so a VAT change can be shared out the same way in winners and losers. That's approximate and labelled so. Corporation tax, capital gains and inheritance tax aren't shared out to households: the page will say so rather than guess.
- **1d. The 2027-28 rules.** The Budget 2026 changes from April 2027 (2p more on property and savings income, the income tax exemption for low-income pensioners, the bigger trading allowance) as a second rules year, so later years are costed on the rules that will apply rather than carried forward.

Checks: every tax costing reproduces HMRC's figures exactly for the changes HMRC lists; VAT and duty shares add up to ONS's totals; the 2027-28 rules go through the same PolicyEngine and hand-worked checks as 2026-27; existing tests keep passing.

Order within the step: 1a, then 1b (VAT, corporation tax, capital gains and inheritance tax first, then the duties), then 1c, then 1d.

Progress, 29 October 2026: 1a, 1b and 1c are done (see COSTING.md). Seventeen named policies sit above the sliders. Twenty-five new sliders cover VAT, duties, insurance premium tax, corporation tax, capital gains and inheritance tax, and stamp duty, costed from HMRC's ready reckoner. VAT and duties are shared out to households by income tenth from the ONS. 1d is waiting: the income tax and NICs thresholds for 2027-28 are known (frozen to 2031), but DWP's 2027-28 benefit rates usually come out in late November.

## Step 2 in detail: spending (proposed 29 October 2026, waiting for go)

- **2a. The plans to start from.** Each department's day-to-day budget (RDEL) and investment budget (CDEL) in the OBR's October 2026 forecast (tables 5.7 and 5.8: Health, Education, Defence, Home Office, Justice, Transport and so on, plus the Scottish, Welsh and Northern Ireland block grants). Day-to-day plans run to 2028-29 and investment to 2029-30; after that each department grows in line with the OBR's total, an assumption the page will state.
- **2b. Spending sliders.** For each department, a change to day-to-day and to investment spending in £bn a year from April 2027, growing with the department's plans after that. The cost is exactly what you set, so there's no costing uncertainty; the uncertainty is in the effect on the economy.
- **2c. Benefits the household model doesn't cover,** as a % change on the OBR's forecast for each: the State Pension, disability benefits (PIP, DLA, Attendance Allowance), Pension Credit, Housing Benefit, Carer's Allowance. Costed directly from the forecast. Not shared out to households in this step.
- **2d. Scotland, Wales and Northern Ireland.** Changing an England-only budget, such as the NHS in England or schools, automatically changes the block grants by the Barnett formula, using HM Treasury's published comparability factors and population shares (Statement of Funding Policy). Without this, £10bn more for the NHS in England would look about £2bn cheaper than it really is.
- **2e. Borrowing and the rules.** Day-to-day spending and benefits count against the main rule (the current budget); investment doesn't, but it adds to borrowing and debt. The borrowing section will track the two separately. The effect on the economy uses the OBR's own multipliers for each: day-to-day departmental spending 0.45, investment 1.00 and benefits 0.60 in the first year, all fading.
- **2f. Named spending policies,** such as "£10bn more a year for the NHS in England" or "Defence to 3% of GDP", alongside the tax ones.

Checks: with nothing changed, the borrowing and rule margins are the OBR's; £1bn more day-to-day spending adds £1bn to borrowing and uses £1bn of the main rule's margin, while £1bn more investment adds £1bn to borrowing and leaves that margin alone (both hand-worked, with debt interest); the Barnett sums are checked by hand against HM Treasury's factors; the page is checked in the browser.

Progress, 29 October 2026: done (see COSTING.md). 23 departments with day-to-day and investment sliders, six benefits outside the household model, the Barnett formula (reproducing HM Treasury's worked example), borrowing split between the current budget and investment, the OBR's spending multipliers, and five named spending policies.

Not in this step: second-round effects (more public sector pay raising income tax, for example), which official costings usually leave out too; and showing who benefits from public services (the ONS publishes this by income tenth), which can come with the design pass.

## Decisions I'll need from you along the way

- Name (still "budget-simulator"; it's part of the web address, so settle it before sharing widely)
- ~~Code licence.~~ Decided 29 October 2026: MIT.
- ~~Whether and when to create a GitHub repo.~~ Done 29 October 2026: public at github.com/dharimarzouq/budget-simulator, published with GitHub Pages.
- ~~Look-and-feel direction, before 6f (the page).~~ Decided 28 October 2026: "Workbench": levers on the left, live results on the right, dense numbers (monospace figures) and compact charts.
- ~~Which behavioural estimates to use in 6d.~~ Decided: the Scottish Fiscal Commission's, with a low/high range.
