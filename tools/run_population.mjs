// Run the engine over a population file and write one row of results per benefit unit.
// Uses Vite to load the engine, so it reads the rules exactly as the website does.
//
// Usage: node tools/run_population.mjs data/build/seed.json data/build/seed_results.csv
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "vite";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("Usage: node tools/run_population.mjs <population.json> <results.csv>");
  process.exit(1);
}

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const { calculate, household, ruleSet } = await server.ssrLoadModule("/src/engine/index.ts");
  const r = ruleSet("2026-27");
  const { units } = JSON.parse(readFileSync(input, "utf-8"));

  const columns = [
    "id", "gross", "employment", "self_employment", "pension", "income_tax", "employee_ni", "self_employed_ni", "employer_ni",
    "child_benefit", "child_benefit_charge", "uc_award_month", "uc_maximum_month", "benefit_cap_month", "net",
    "taxpayers", "top_income",
  ];
  const lines = [columns.join(",")];
  for (const u of units) {
    const h = household(u.data);
    const res = calculate(h, r);
    const sum = (f) => res.adults.reduce((s, a) => s + f(a), 0);
    const row = [
      u.id,
      res.grossIncome,
      h.adults.reduce((s, a) => s + a.employment, 0),
      h.adults.reduce((s, a) => s + a.selfEmployment, 0),
      h.adults.reduce((s, a) => s + a.pension, 0),
      sum((a) => a.incomeTax),
      sum((a) => a.employeeNI),
      sum((a) => a.selfEmployedNI),
      sum((a) => a.employerNI),
      res.childBenefit,
      res.childBenefitCharge,
      res.universalCredit.award,
      res.universalCredit.maximum,
      res.universalCredit.benefitCap.reduction,
      res.netIncome,
      res.adults.filter((a) => a.incomeTax > 0).length,
      Math.max(...res.adults.map((a) => a.totalIncome)),
    ];
    lines.push(row.map((v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v)).join(","));
  }
  writeFileSync(output, lines.join("\n") + "\n");
  console.log(`${units.length} benefit units → ${output}`);
} finally {
  await server.close();
}
