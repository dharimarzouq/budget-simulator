# Handoff: where things stand (30 October 2026)

Start here if you're picking this up in a new chat. Then read CLAUDE.md, RESEARCH.md and COSTING.md as needed.

## State
- **Live:** https://dharimarzouq.github.io/budget-simulator/ (repo github.com/dharimarzouq/budget-simulator, public, MIT).
  - Pushing to `main` republishes the site through `.github/workflows/pages.yml`.
  - Last published commit: "Milestone 3 step 2: the reform slot" (bed8ab6), 30 October 2026.
- **Milestone 1:** done (rules engine, synthetic population, costing, behaviour, borrowing and fiscal rules).
- **Milestone 2:**
  - Step 1 (taxes and named policies, 1a–1c): done and published. 1d waits on DWP (see below).
  - Step 2 (spending, with Barnett): done and published.
  - Step 3 (history and the impact chart): done and published.
  - Step 4 (design pass, "Budget box"): done and published 29 October 2026; the keyboard pass and wide sizes were checked and fixed 30 October. Details are under "Step 4 in detail" below.
- **Milestone 3** (reform packs, starting with a land value tax): planned 30 October 2026, and Ari's decisions on it are recorded. Steps 1 (gov.uk check) and 2 (the reform slot) done and published; step 3 (homes) built, not committed.
- **Tests:** 210 unit tests pass (`npx vitest run`). `npx tsc --noEmit` and `npx vite build` are clean.

## What's next, in order
1. **Milestone 3** (see "Milestone 3 plan" below). Steps 1 (the gov.uk check) and 2 (the reform slot) are done (30 October 2026). Step 3, homes in the population, is built, not yet committed. Then council tax and business rates, and the land value tax pack. Show Ari the plan for each step and wait for go.
2. **1d, the 2027-28 rules,** once DWP publishes the 2027-28 benefit and State Pension rates (usually late November). Show Ari a plan first. What's already known:
   - The income tax and NICs thresholds are frozen to 2031.
   - Budget 2026 adds 2p on property and savings income from April 2027, an income tax exemption for low-income pensioners, and a bigger trading allowance.
   - When this lands, `START_YEAR` (2027-28) should be costed on these rules rather than carried forward from 2026-27.
3. **Ideas raised but not planned** (each needs a plan and Ari's go):
   - who benefits from public services by income tenth (ONS);
   - sharing spending changes out to households;
   - a light/dark switch on the page.
4. **Ari's decisions:**
   - The name, which also sets the web address. Still "budget-simulator".
   - Sending the UK Data Service request in UKDS-REQUEST.md is Ari's to do.

## Working agreements (from Ari)
- Show a plan before each piece of work and wait for "go". Ask before anything hard to undo. **Ask before every push to main**, because a push publishes the site.
- Plain language. Say when something is synthetic, approximate or missing. Static and with-responses figures are always shown separately.
- Ari keeps published-table inputs even when the fit gets worse. Document the gap rather than tuning it away.
- No Co-Authored-By line on commits (Ari, 30 October 2026). Never put Ari's personal email address in commits.
- `data/statxplore.key` (git-ignored) is an API key: never print, log or commit it.

## Practical notes
- **Running it:**
  - Dev server: `npx vite --port 5174 --strictPort`. In the Claude desktop app, `.claude/launch.json` starts it on port 5173 for the browser pane. If a CSS change doesn't show up, restart the server: Vite once kept serving a stale copy after two quick edits.
  - Build: `npx vite build`.
  - Python data builds: `.venv`, plus `.venv-pe` for the PolicyEngine check.
- **Windows PowerShell gotchas:**
  - Write commit messages with `[IO.File]::WriteAllText(path, text, (New-Object Text.UTF8Encoding $false))` and `git commit -F path`, because Set-Content adds a BOM.
  - Write `${id}:` rather than `$id:` inside strings.
- If Vitest misses a new YAML file, delete `node_modules\.vitest-cache`.
- **Where the main code is:**
  - `src/app.ts`: the page: scoreboard (`renderHeadline`), tabs, assumptions, scorecard (`scorecard`), share picture (`savePicture`).
  - `src/costing.worker.ts`: costing off the main thread. It sends each lever's costing parts for the scorecard.
  - `src/economy/fiscal.ts`: the borrowing and debt path, and the fiscal rules.
  - `src/impact.ts`: the history chart.
  - `src/sharepic.ts`: the share picture.
  - `src/policy/*`: levers, removals, named policies, HMRC's ready reckoner, spending and Barnett, grades.
  - `src/style.css`: theme tokens on `:root`, light and dark.
- **Assumptions** live in the URL as `respond=none|low|central|high` (central by default) and `economy=1`. They change which figures are shown, never a costing.

# Milestone 1 plan: income tax, NICs, Universal Credit, Child Benefit

Status: steps 1–4 done (27 October 2026), plus an early household calculator page and the benefit cap. Step 4 covered PolicyEngine UK (all 50 test households match; see tools/README.md); the gov.uk worked examples followed on 30 October 2026 (milestone 3, step 1). Step 5, the synthetic population, is next. I'll check in with results after each step.

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

## Step 3 in detail: history (proposed 29 October 2026, waiting for go)

The aim: every result shown as history, the official forecast, and your choices, so you can see whether a number is high or low against the past.

- **3a. History.** The OBR's public finances databank (updated monthly, Open Government Licence) has outturn back to 1946-47: borrowing, the current budget, debt, receipts, total spending and net investment, in £bn and as a share of GDP. Real GDP growth comes from the ONS. The newest outturn year must match the OBR's own figure for it in the October 2026 forecast (2025-26), or the gap is explained.
- **3b. The forecast,** joined on from 2026-27 to 2031-32: the October 2026 figures already in the simulator, as a share of GDP.
- **3c. Your choices:** the borrowing and debt path the simulator already works out, turned into the same measures (receipts plus what your budget raises, spending plus what it adds, and so on). The version with the effect on the economy can be switched on, labelled grade C.
- **3d. An impact chart with seven tabs:** current budget, borrowing, debt, tax, total spending, investment, and growth. Each shows history as a solid line, the OBR forecast dashed, and your choices in colour, from 1995 by default with a switch to go back to 1946. Hover, tap or the arrow keys give the year's three figures, and each tab has a table version for screen readers. For now it sits in the borrowing and debt section; step 4 gives it its proper place.

Progress, 29 October 2026: done (see COSTING.md). The impact chart sits at the top of the borrowing and debt section, with seven tabs, history from 1995 (or 1948), the OBR's forecast and your budget, an economy switch, a cursor box, arrow keys and a table version.

Checks: history matches the OBR's published figures for the years they overlap; with nothing changed, "your choices" lies exactly on the forecast; a hand-worked year for each tab; readable at phone width and by keyboard.

## Step 4 in detail: the design pass (proposed 29 October 2026, waiting for go)

Look chosen by Ari: "Budget box", warm and editorial, like a Budget document. Layout as agreed: scoreboard on top, four places to make changes, results in order of importance.

- **4a. The look.** Cream paper, deep ink, a deep red for headings, active tabs and the scoreboard; serif headings (Source Serif 4, an openly licensed font served with the site, falling back to Georgia) and plain sans-serif text, with figures in tabular numerals. A dark version: deep brown-black paper, cream text, a lighter red. Red is the look's colour, so it isn't also used to mean "loss": your budget's line on charts is deep blue, gains green and losses a distinct burnt orange, always with a sign. Every colour pair is checked for contrast in both versions.
- **4b. The scoreboard,** pinned to the top: what your budget raises or costs a year against existing plans (the headline figure); a bar for the room left under the main fiscal rule, and whether the debt rule is met; households losing and gaining. On phones it is the bar at the bottom, as now.
- **4c. Four places to make changes,** as tabs: Policies (the named measures), Taxes (all the tax sliders), Spending (departments as bars against their plans, which you drag or type into; the benefits outside the household model), and Assumptions (whether to allow for how people respond, and the low, central or high figure; whether to include the effect on the economy). The assumptions set what the scoreboard and charts show, so there is one headline figure rather than several side by side; the others stay a click away in the working.
- **4d. Results in order:** the impact chart; who gains and loses; where the money comes from, laid out like the Treasury's scorecard table (each measure, its cost by year, its grade and check); tax on one person; a household like yours.
- **4e. First visit:** a three-step "how to play", shown once (remembered in the browser) and reopenable from the header.
- **4f. Sharing:** a picture of your plan (scoreboard, your changes, the impact chart) to save or share, as well as the link and the copied summary.
- **4g. How we know** in the same look.

Checks: every existing test passes; the page is tried at phone, laptop and wide sizes, light and dark, and by keyboard alone; contrast is measured; nothing in the costing changes (the same budget gives the same figures before and after).

Progress, 29 October 2026: 4a–4g done and published.
- Every text colour measures at least 4.5:1 in both themes.
- The scoreboard's big figure follows Assumptions, with the static figure always shown under it.
- The scorecard rows add up exactly to the change in borrowing in every year.
- Departments show a bar against their 2027-28 plan.
- The picture is a 1200×630 PNG.
- Assumptions are kept in the link (`respond=`, `economy=1`).
- Keyboard pass and wide sizes checked 30 October 2026, in both themes and at 1440, 1600, 1920 and 2560 wide. Fixed: focus now stays in place after Add, Take out, reset, Remove and Bring back (before, it dropped to the top of the page); a "Skip to results" link; the header comes first after the guide closes on a first visit; day-to-day and investment sliders (and the UK and Scottish income tax ones) have different names for screen readers, and spending boxes say £bn; the page stops at 1840px wide, centred, and charts at 800px.

# Milestone 3 plan: reform packs, starting with a land value tax (proposed 30 October 2026, waiting for go)

The simulator so far changes taxes and spending that already exist. A **reform pack** is a structural change: a new tax base, or a new way of funding something, that may replace existing taxes. A land value tax (LVT) was meant to be the first one in milestone 2 (RESEARCH.md); it slipped while taxes, spending and the design took priority. 1d (the 2027-28 rules) is blocked until DWP publishes in late November, so there's room now.

An LVT is a big step because it needs three things the simulator doesn't have yet: a place for reforms to plug in, homes in the population (who owns, what their home and its land are worth), and the taxes most LVT proposals replace (council tax, business rates, stamp duty). The steps below build those in order, then the LVT on top.

## Step 1: check the engine against gov.uk (before anything else)

CLAUDE.md asks for checks against PolicyEngine UK *and* gov.uk; only PolicyEngine is done (milestone 1, step 4). Step 4 below changes the engine, so this goes first.

- Collect worked examples published on gov.uk by HMRC and DWP (income tax, National Insurance, the High Income Child Benefit Charge, Universal Credit, the benefit cap), each recorded with its URL and date.
- Run each through the engine as a test. A mismatch is a bug until explained (CLAUDE.md).
- Where gov.uk has a calculator but no published worked example, a handful of households run by hand through the calculator, with the inputs and answers saved.

Check: every example matches to the penny, or the difference is written down with its reason.

Progress, 30 October 2026: done, in `test/govuk.test.ts` (15 tests, all passing first time; no engine changes needed).
- **HMRC on gov.uk:** dividends at 2026-27 rates; the starting rate for savings; the Personal Savings Allowance; Marriage Allowance (the couple saves £214); the Child Benefit charge under today's rules and the pre-2024 ones (from HMRC's PAYE manual, run on a copy of the rules with that year's figures).
- **DWP:** three Universal Credit awards at 2026-27 rates from the decision makers' guide (ADM chapter E2): Bella (no work allowance, £232.40), Roy (lower work allowance, £1,052.76) and Ben (pay under the work allowance, £1,150.91).
- **Rates as gov.uk states them for 2026-27:** income tax in the rest of the UK and in Scotland, employee and self-employed National Insurance, Universal Credit's work allowances and taper, and the benefit cap.
- **One difference, explained:** HMRC's manual (PAYE14015) gives the charge on £1,331.20 at 40% as £453; 40% of £1,331.20 is £532.48, so the manual has a slip. Its older example rounds £700.80 down to £700; we keep the pence.
- **Not found:** gov.uk publishes no worked examples for the benefit cap, the childcare element or Universal Credit with tax and National Insurance taken off pay. Gov.uk's benefits calculators are run by outside companies, so they're not used as a check.

## Step 2: the reform slot

How every structural reform plugs in, so the LVT is the first of many rather than a one-off.

- **2a. A reform pack** is data plus a costing function, like the named policies. It has a plain-English name and description; its options (rates, what it covers, what it replaces, how fast it's phased in); and the existing taxes it replaces, which are switched off through the levers and removals that already exist, so their costings come from the same place as everywhere else.
- **2b. What each pack reports,** in the same shape as every other measure: what it raises or costs each year (static and with responses, separately); who gains and loses, where it reaches households; the effect on the economy; sources; and a grade for each part, not one grade for the whole. Most reforms have no official costing, so most parts will be B, C or D, and the page says so.
- **2c. On the page:** a fifth tab, Reforms, beside Policies, Taxes, Spending and Assumptions. A pack's options open in place. The pack is one row in the scorecard, with the taxes it replaces shown as rows under it, so the net figure can be traced. The pack and its options go in the link like everything else.

Check: a test pack that "replaces" a tax with an identical tax costs exactly zero in every year, with nobody gaining or losing.

Progress, 30 October 2026: done, not yet committed or published.
- `src/policy/reforms.ts`: the pack type (options, sources, what it replaces, its own parts each with a grade, check, static-or-with-responses flag and share by income tenth), the link format, and a test pack ("Swap VAT for an identical tax"), registered only on the development site (`import.meta.env.DEV`). The published site's Reforms tab says none are ready yet.
- The costing worker adds packs' parts to the total, to who gains and loses, and to the responses; the borrowing path carries them on like HMRC's costings (`fiscalPath`'s `reforms` option).
- The page: the Reforms tab (add, take out, options in place, what it replaces); the levers a pack takes over are hidden; the scorecard has a row per pack with its parts and replaced taxes under it; the first-year table, winners notes, show-working, summary and picture include packs.
- `test/reforms.test.ts` (7 tests): zero in every year for 1, 2 and 5 points, with and without the economy; nobody gains or loses; a pack wins over your own lever; grades; the link. Checked in the browser too, alongside an income tax change, on a phone width, and with the pack taken out again.
- Not done: How we know doesn't describe reforms yet (step 6).

## Step 3: homes in the population

- **3a. Tenure in the browser.** The population build already gives each household a tenure from the FRS (owned outright, mortgaged, social rent, private rent), but it isn't exported. Export it.
- **3b. What owners' homes are worth.** A home value for each owner-occupier household, drawn to match published figures by region and by income: the ONS House Price Index (average prices by region) and the ONS Wealth and Assets Survey (property wealth by income and region). Labelled synthetic, grade C.
- **3c. How much of that is land.** The ONS national balance sheet splits land from buildings for the whole country (land was about £7.0 trillion in 2021; get the latest edition). How that varies by region needs our own estimate, because the ONS says it doesn't publish small-area residential land values. Candidate source: MHCLG's land value estimates for policy appraisal, if there's a recent edition. Grade C.
- **3d. A council tax band for each home,** from its value deflated back to the valuation date (1 April 1991 in England and Scotland; 2003 in Wales, which has nine bands), using the regional House Price Index.

Checks: owner numbers by region match the FRS; band counts match the Valuation Office Agency's council tax stock of properties by region; the population's total owner-occupied land value is close to the ONS balance sheet's figure for household land, with any gap written down rather than tuned away.

**Built 30 October 2026, not yet committed** (method and checks in POPULATION.md, "Homes"):
- `data/build_homes.py`, run after calibration (it changes no weights). Every private household gets a home, renters included, since an LVT and council tax fall on rented homes too. Values follow the Market Value Survey 2024 (not the Wealth and Assets Survey: the MVS gives values by region and tenure, with spread and income tables to fit to), grown with the UK HPI to August 2026. Land by the residual method with the ONS's depreciated building cost (£813/m²).
- Exported in the population file (now 4.0 MB, was 3.5 MB); `src/population.ts` decodes it (`PopulationUnit.home`). Nothing on the page uses it yet; the calculator's tenure box waits for step 4, where it changes something.
- `test/homes.test.ts` (8 tests).
- Gaps, written down not tuned away: homes 30% above the ONS balance sheet; land share about 77%, and much lower with an undepreciated building cost; renters' incomes high for their homes' values. Bands: Ari chose (30 October) to rank homes by value within each region and fill bands to the VOA's and Scottish Government's counts, since banding deflated values put up to 14 points too many homes in band A.

## Step 4: the taxes an LVT would replace

- **4a. Council tax in the engine.** Each household pays its band's charge, from published Band D levels for 2026-27 (by region in England; Scotland's and Wales's own figures), with the 25% single-person discount. Northern Ireland has domestic rates on capital values instead: modelled the same way from its own rate. This also fixes a known gap: household incomes currently leave out council tax, which HBAI takes off (POPULATION.md).
- **4b. Council Tax Reduction,** approximated. It's a local scheme in England (most councils' schemes are different) and a national one in Scotland and Wales, with a national scheme for pensioners everywhere. One simplified scheme per nation, labelled approximate. Without it, an LVT replacing council tax would look harsher on low-income households than it is.
- **4c. A council tax lever and named policies** follow for free: "Revalue council tax", "Add bands above H" and so on can come later as named policies.
- **4d. Business rates** as a national total from the OBR's receipts forecast, not modelled firm by firm. Like corporation tax, not shared out to households; the page says so.
- **4e. Stamp duty** is already a slider (HMRC's ready reckoner); the pack switches it off through that.

Checks: council tax receipts from the population against the OBR's forecast, and against MHCLG's published total for England; HBAI income match rechecked with council tax taken off; existing tests keep passing.

## Step 5: the land value tax pack

- **5a. Options:** the rate (% of land value a year); what it covers (homes, commercial land, farmland, each on or off); an allowance (the first £X of land value per home tax-free, optional); what it replaces (council tax, business rates, stamp duty, each on or off); phasing (in full at once, or over a number of years); and, for owners with low incomes, the option to defer payment until the home is sold.
- **5b. The base:** the ONS balance sheet land values, split by type, carried forward with the OBR's house price forecast.
- **5c. Land prices respond.** The textbook result is that a tax on land is "capitalised": land prices fall by roughly the present value of the tax, which shrinks the base. An option shows the costing with and without this, using a published net rental yield to value land. This is the main behavioural effect, and it is shown separately from the static figure, as with every other tax.
- **5d. Who pays:**
  - Owner-occupiers pay on their home's land and stop paying whatever the pack replaces.
  - Private renters stop paying council tax if it's replaced. Standard theory says landlords can't pass an LVT on in rents; an option sets how much they pass on (0% by default), labelled as an assumption.
  - Social landlords, commercial land and farmland: not shared out to households. The page says where the money comes from rather than guessing who bears it.
- **5e. The effect on the economy:** there is no OBR multiplier for an LVT and little direct evidence. With the economy switch on, it gets the OBR's general tax multiplier as a placeholder, grade D (decided below).
- **5f. Devolution:** council tax and business rates are devolved. The pack covers the whole UK by default and the page says that would need the devolved governments to agree; an option limits it to England. Council tax is local government money, but the OBR counts the public sector as a whole, so the swap is scored that way; who gets the money (councils or the Treasury) is noted, not modelled.

Checks: with the rate set to raise exactly what council tax raises and council tax replaced, receipts net to zero; hand-worked households (an owner in London, an owner in the North East, a private renter, a pensioner on Council Tax Reduction); gains and losses add up to the pack's total for households; our figures compared with published LVT estimates where their assumptions can be matched, with differences explained rather than tuned away.

## Step 6: on the page and in How we know

The Reforms tab, the scorecard rows, the household calculator (home value and tenure as new inputs, with council tax and LVT lines in the working), and a How we know section for each new source, with its grade.

## Decisions for milestone 3 (Ari, 30 October 2026)

- **What the LVT replaces by default:** council tax, business rates *and* stamp duty. Each stays a switch.
- **Farmland:** out by default, with a switch to bring it in.
- **Land prices falling (5c):** counted like other taxes' responses: the scoreboard follows the Assumptions tab (on unless "Nobody responds" is picked), and the static figure is always shown under it.
- **The effect on the economy (5e):** when the economy switch is on, the OBR's general tax multiplier, labelled a placeholder, grade D.
- **Northern Ireland:** its domestic rates are modelled in step 4, so the LVT covers the whole UK consistently.

## Not in milestone 3

Revaluing or reforming council tax itself (easy to add as named policies once 4a exists); a proportional property tax on whole home values rather than land (a second pack on the same groundwork); modelling individual firms or farms; second homes and empty homes premiums.

## Decisions I'll need from you along the way

- Name (still "budget-simulator"; it's part of the web address, so settle it before sharing widely)
- ~~Code licence.~~ Decided 29 October 2026: MIT.
- ~~Whether and when to create a GitHub repo.~~ Done 29 October 2026: public at github.com/dharimarzouq/budget-simulator, published with GitHub Pages.
- ~~Look-and-feel direction, before 6f (the page).~~ Decided 28 October 2026: "Workbench": levers on the left, live results on the right, dense numbers (monospace figures) and compact charts.
- ~~Which behavioural estimates to use in 6d.~~ Decided: the Scottish Fiscal Commission's, with a low/high range.
