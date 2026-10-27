# UK budget simulator: research and decisions

Working name only. Written 27 October 2026. For Ari to react to before any code is written.

## What we're building (agreed so far)

A UK budget simulator for policy nerds. You choose specific policies, including structural reforms like a land value tax or a different healthcare funding model, fund them, and see the effects. Every number shows its source, its method and how confident we are.

Four layers of effects:

1. **Costing**: what each policy raises or costs, with static and behavioural figures shown separately.
2. **Who wins and loses**: by income band, region, age and family type, plus a calculator for one household with a marginal tax rate chart.
3. **Economy and debt**: GDP effect, borrowing, debt path, and a check against the fiscal rules.
4. **Real-world outcomes**: what spending changes buy (prison places, waiting lists, class sizes). These are clearly graded estimates.

Not doing: a political layer (markets, rebellions, polls).

Every policy plugs in the same way: options, costing, distribution, macro effect, sources, confidence grade (A official costing, B our microsimulation, C international evidence, D informed guess).

---

## Decision 1: where the household data comes from (the big one)

Layer 2 needs microdata, meaning a large sample of real households with incomes, family make-up, housing and benefits. The standard UK source is the **Family Resources Survey (FRS)**, run by DWP.

**What I found:**

- FRS microdata comes from the UK Data Service under its End User Licence. Registration is open to non-academics, listed as including independent researchers, charities and think tanks. Commercial use needs the data owner's approval. A non-commercial open-source project should be fine, but that's my reading and needs confirming.
- The licence lets you use the data. It does **not** let you redistribute it. So the raw households can never ship to the browser or sit in a public repo.
- I couldn't confirm whether serving aggregate results interactively from a public website is allowed. Published research based on FRS aggregates is normal; a live tool answering arbitrary queries is less usual. **We need to ask the UK Data Service directly.**
- DWP publishes FRS summary tables openly under the Open Government Licence. These are useful for checking our results, but they're not microdata. The latest release is for 2023/24, published March 2025.
- **UKMOD**, the academic UK tax-benefit model, is free for non-commercial use. You have to prove FRS access to get its input data, so it has the same constraint.
- **PolicyEngine UK** is open source under AGPL-3.0. It encodes UK tax and benefit rules, and its parameters cite legislation. Its full FRS-based dataset needs private inputs. The only public dataset it ships is a US survey re-weighted to match UK totals, which its own docs say is not a substitute for the FRS.

**Options:**

| | A. Apply for FRS, run on a server | B. Synthetic population, browser only | C. Both, staged |
|---|---|---|---|
| How | Run the model on our own server and send only aggregate results to the page | Build a made-up population that matches published HMRC/DWP/ONS tables, ship it with the site | Start with B so we can build now; apply for FRS in parallel and switch layer 2 to it if the UK Data Service says yes |
| Accuracy | Best | Totals OK, but weaker on how things combine (e.g. renters with kids on UC) | Ends up as A |
| Openness | Data hidden, method open | Fully open and reproducible | Both: synthetic is downloadable, FRS isn't |
| Hosting | Needs a server that's always on (costs money) | Static site, free hosting | Static first |
| Risk | Licence answer could be no | Results may be challenged on accuracy | Two data paths to maintain |

**Recommendation: C.** Register with the UK Data Service and ask the publishing question this week, since it costs nothing and takes a while. Meanwhile build on a synthetic population, labelled plainly as synthetic, and validate it against published FRS and HMRC tables.

## Decision 2: write our own rules engine, or reuse one

The rules engine holds the tax and benefit rules: rates, thresholds, tapers, interactions.

- **Reuse PolicyEngine UK.** Thousands of rules already done, with legislative references. But it's Python, so it runs on a server or very heavily in the browser. AGPL means our project would be AGPL too, which is fine for an open project. We'd also be tied to their structure for adding reforms.
- **Write our own in TypeScript.** It runs instantly in the browser (sliders update live) and fits a static site. We control how reform packs plug in. But it's a lot of careful work, and every rule needs a test against official examples.

**Recommendation:** write our own, scoped to the first slice (income tax, NICs, Universal Credit, Child Benefit). Use PolicyEngine UK and the gov.uk calculators as independent checks, so a household run through both should match. This keeps the tool fast and transparent, and "our engine agrees with an independent engine to the penny" is a strong trust signal. Revisit if the rule count grows past what's maintainable.

## Decision 3: where the other layers come from

All of these are openly published under the Open Government Licence unless noted.

| Layer | Source | Notes |
|---|---|---|
| 1. Costing | HMRC *Direct effects of illustrative tax changes* (ready reckoner) | Latest edition I found: June 2025, on the March 2025 OBR forecast. Check for newer. |
| 1. Costing | OBR policy costings and Policy Measures Database | Official costings of past measures, with behavioural adjustments |
| 1. Behaviour | HMRC/OBR estimates of how taxable income responds to rates | Needed for "static vs behavioural" |
| 1. Benefits | DWP benefit expenditure and caseload tables, Stat-Xplore | |
| 3. Macro | OBR fiscal multipliers | Values used in October 2024: 1% of GDP tightening cuts output by 0.33% (tax rises), 0.6% (welfare cuts), 0.45% (day-to-day spending cuts), 1% (investment cuts), fading to zero over five years. Check the latest EFO. |
| 3. Baseline | OBR Economic and Fiscal Outlook | The baseline everything is measured against |
| 3. Fiscal rules | Current rules (October 2024 framework) | Day-to-day budget balanced by 2029/30 (from 2026/27 within ±0.5% of GDP). Debt measured as public sector net financial liabilities falling as a share of GDP. Get headroom from the latest OBR EFO, not secondary sources. |
| 4. Spending | HM Treasury PESA (spending by function) | PESA 2026 exists (July 2026) |
| 4. Unit costs | e.g. cost per prison place (MoJ), per pupil (DfE), health and social care unit costs (PSSRU) | Each with its own grade |
| Land value tax | ONS national balance sheet land values | Land was about £7.0 trillion in 2021, nearly three-fifths of UK net worth. ONS says it doesn't publish small-area residential land values, so regional land value tax effects need our own estimate (grade C). |

## First milestone

Income tax, NICs, Universal Credit, Child Benefit, with:

- a costing (static and behavioural), checked against the HMRC ready reckoner
- winners and losers by income band (synthetic population, labelled)
- a household calculator with a marginal tax rate chart, checked against PolicyEngine and gov.uk calculators
- a 5-year borrowing and debt effect using OBR multipliers, with a fiscal rules check

**Second milestone:** a land value tax as the first reform pack.

## Decided (27 October 2026)

1. Data: option C. Synthetic population now, labelled as such. Ari applies for FRS access in parallel (see UKDS-REQUEST.md).
2. Engine: our own, in TypeScript, checked household by household against PolicyEngine UK and gov.uk calculators.
3. Hosting: static site.

## Still open

4. A name? "budget-simulator" is a placeholder; the folder is easy to rename.
5. Licence for the code (MIT, or AGPL)?

## Not yet confirmed

- Whether the FRS licence allows a public interactive tool serving aggregates. Ask the UK Data Service.
- Whether there's a ready reckoner newer than June 2025.
- The latest OBR multipliers and fiscal headroom.

## Sources

- UK Data Service, safeguarded access: https://ukdataservice.ac.uk/get-data/data-access-policy/safeguarded-data
- UK Data Service, access conditions: https://ukdataservice.ac.uk/conditions
- DWP, Family Resources Survey 2023/24: https://www.gov.uk/government/statistics/family-resources-survey-financial-year-2023-to-2024
- UKMOD access: https://www.microsimulation.ac.uk/ukmod/access/
- PolicyEngine UK: https://github.com/PolicyEngine/policyengine-uk
- PolicyEngine UK data: https://github.com/PolicyEngine/policyengine-uk-data
- HMRC ready reckoner: https://www.gov.uk/government/statistics/direct-effects-of-illustrative-tax-changes
- OBR multipliers (FOI response): https://obr.uk/docs/dlm_uploads/FOI06112024.pdf
- OBR dynamic scoring: https://obr.uk/docs/dlm_uploads/Dynamic-scoring-of-policy-measures-in-OBR-forecasts.pdf
- Fiscal framework (HM Treasury): https://assets.publishing.service.gov.uk/media/67211bf34da1c0d41942a8bf/A_strong_fiscal_framework.pdf
- Institute for Government, current fiscal rules: https://www.instituteforgovernment.org.uk/explainer/current-fiscal-rules
- HM Treasury PESA 2025: https://www.gov.uk/government/statistics/public-expenditure-statistical-analyses-2025
- ONS national balance sheet 2025: https://www.ons.gov.uk/economy/grossdomesticproductgdp/compendium/unitedkingdomnationalaccountsthebluebook/2025/nationalbalancesheet
- ONS FOI on small-area land values: https://www.ons.gov.uk/aboutus/transparencyandgovernance/freedomofinformationfoi/smallareaestimatesforresidentiallandvaluesinthenationalbalancesheet
