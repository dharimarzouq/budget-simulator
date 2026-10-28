// Compare our static costings with HMRC's ready reckoner ("Direct effects of illustrative tax changes",
// June 2025). Usage: node tools/ready_reckoner.mjs  → prints a table and writes data/build/ready_reckoner.csv
//
// What's compared: only the tax (or benefit) the line is about, as HMRC's "direct effects" are.
// HMRC's income tax figures are receipts, and self-assessment tax arrives a year late, so the first year
// (2026-27) is understated; we compare with 2027-28 scaled back by a year's earnings growth (OBR: 2.2%).
// NICs and Child Benefit have no such lag, so they're compared with 2026-27 directly.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "vite";

const EARNINGS_2027_28 = 172.704 / 169.0; // OBR average weekly earnings index, EFO March 2026 table 1.6

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const { ruleSet } = await server.ssrLoadModule("/src/engine/index.ts");
  const { decodePopulation } = await server.ssrLoadModule("/src/population.ts");
  const { run, difference } = await server.ssrLoadModule("/src/policy/costing.ts");
  const { applyPolicy } = await server.ssrLoadModule("/src/policy/policy.ts");
  const r = ruleSet("2026-27");
  const pop = decodePopulation(JSON.parse(readFileSync("public/data/population-2026-27.json", "utf-8")));
  const base = run(pop, r);

  const it = (d) => d.incomeTax;
  const lines = [
    // [HMRC line, our change, which effect, HMRC 2026-27, HMRC 2027-28 (£m), receipts lag?]
    ["Basic rate +1p", [["it_basic", 0.21]], it, 6900, 8250, true],
    ["Higher rate +1p", [["it_higher", 0.41]], it, 1600, 2150, true],
    ["Additional rate +1p (yield)", [["it_additional", 0.46]], it, 145, 265, true],
    ["Additional rate -1p (cost)", [["it_additional", 0.44]], it, -175, -335, true],
    ["Personal allowance +£100 (cost)", [["it_pa", 12670]], it, -810, -1050, true],
    ["Personal allowance +1% (cost)", [["it_pa", 12570 * 1.01]], it, -1000, -1200, true],
    ["Basic rate limit +1% (cost)", [["it_basic_band", 37700 * 1.01]], it, -495, -665, true],
    ["Basic rate limit +10% (cost)", [["it_basic_band", 37700 * 1.1]], it, -4600, -6250, true],
    ["Basic rate limit -10% (yield)", [["it_basic_band", 37700 * 0.9]], it, 5400, 7200, true],
    ["Employee NICs main rate +1pp", [["ni_main", 0.09]], (d) => d.employeeNI, 5350, 5300, false],
    ["Employee NICs additional rate +1pp", [["ni_additional", 0.03]], (d) => d.employeeNI, 2000, 2000, false],
    ["Employer NICs rate +1pp", [["ni_employer", 0.16]], (d) => d.employerNI, 11150, 11250, false],
    ["Class 4 main rate +1pp", [["ni_c4_main", 0.07]], (d) => d.selfEmployedNI, 440, 525, true],
    ["Class 4 additional rate +1pp", [["ni_c4_additional", 0.03]], (d) => d.selfEmployedNI, 295, 355, true],
    ["Employee threshold +£2 a week (cost)", [["ni_pt", 12570 + 104]], (d) => d.employeeNI, -210, -230, false],
    ["Employer threshold +£2 a week (cost)", [["ni_st", 5000 + 104]], (d) => d.employerNI, -420, -430, false],
    ["Upper earnings limit +£10 a week (yield)", [["ni_uel", 50270 + 520]], (d) => d.employeeNI, 220, 220, false],
    ["Lower profits limit +£104 (cost)", [["ni_lpl", 12570 + 104]], (d) => d.selfEmployedNI, -15, -15, true],
    ["Upper profits limit +£520 (yield)", [["ni_upl", 50270 + 520]], (d) => d.selfEmployedNI, 10, 10, true],
    ["Child Benefit first child +£1 a week (cost)", [["cb_eldest", 28.05]], (d) => d.childBenefitCharge - d.childBenefit, -335, -335, false],
    ["Child Benefit other children +£1 a week (cost)", [["cb_other", 18.9]], (d) => d.childBenefitCharge - d.childBenefit, -230, -240, false],
  ];

  const rows = [];
  for (const [name, changes, pick, h2627, h2728, lag] of lines) {
    const after = run(pop, applyPolicy(r, changes.map(([lever, value]) => ({ lever, value }))));
    const ours = pick(difference(after.totals, base.totals)) / 1e6;
    const hmrc = lag ? h2728 / EARNINGS_2027_28 : h2627;
    rows.push({ name, ours: Math.round(ours), hmrc: Math.round(hmrc), ratio: ours / hmrc, basis: lag ? "2027-28 scaled to 2026-27" : "2026-27" });
  }
  mkdirSync("data/build", { recursive: true });
  writeFileSync("data/build/ready_reckoner.csv", "line,ours_gbp_m,hmrc_gbp_m,ratio,hmrc_basis\n" +
    rows.map((x) => `"${x.name}",${x.ours},${x.hmrc},${x.ratio.toFixed(2)},${x.basis}`).join("\n") + "\n");
  for (const x of rows) console.log(`${x.name.padEnd(48)} ours ${String(x.ours).padStart(7)}  HMRC ${String(x.hmrc).padStart(7)}  ×${x.ratio.toFixed(2)}`);
} finally {
  await server.close();
}
