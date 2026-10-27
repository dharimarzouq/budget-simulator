# Budget simulator (working name)

A UK budget simulator for policy nerds: pick specific policies and structural reforms, fund them, and see costings, winners and losers, economy and debt effects, and real-world outcomes. Every number shows its source, method and confidence grade.
Read RESEARCH.md first for decisions and sources, and PLAN.md for the current milestone.

## Decided
- UK only. No political layer (markets, rebellions, polls).
- Own rules engine in TypeScript, running in the browser; static site.
- Synthetic household population for now, clearly labelled. FRS microdata only if the UK Data Service confirms a public tool may serve aggregates, and never shipped to the browser or committed.
- Data build scripts (synthetic population, PolicyEngine check) are Python; the site and engine are TypeScript.
- Every policy, small tweak or structural reform, plugs in the same way: options, costing, distribution, macro effect, sources, confidence grade (A official costing, B our microsimulation, C international evidence, D informed guess).

## Rules
- Every parameter and dataset records its source (URL, publisher, licence, date) and, for tax and benefit rules, the legislation or guidance it comes from.
- Show static and behavioural costings separately; never blend them silently.
- Say plainly when something is synthetic, approximate or missing data.
- Check the engine against PolicyEngine UK and gov.uk calculators; a mismatch is a bug until explained.
- The owner is Ari; explain choices in plain language, show a plan before each piece of work and wait for "go", and ask before anything hard to undo.
