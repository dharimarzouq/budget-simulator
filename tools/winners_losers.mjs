// Print winners and losers for a policy: by income decile, family type and region.
// Usage: node tools/winners_losers.mjs it_basic=0.21 [uc_two_child_limit=true ...]
import { readFileSync } from "node:fs";
import { createServer } from "vite";

const changes = process.argv.slice(2).map((a) => {
  const [lever, v] = a.split("=");
  return { lever, value: v === "true" ? true : v === "false" ? false : Number(v) };
});
const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const { ruleSet } = await server.ssrLoadModule("/src/engine/index.ts");
  const { decodePopulation } = await server.ssrLoadModule("/src/population.ts");
  const { applyPolicy } = await server.ssrLoadModule("/src/policy/policy.ts");
  const { run, costPolicy } = await server.ssrLoadModule("/src/policy/costing.ts");
  const { distribution } = await server.ssrLoadModule("/src/policy/distribution.ts");
  const r = ruleSet("2026-27");
  const pop = decodePopulation(JSON.parse(readFileSync("public/data/population-2026-27.json", "utf-8")));
  const base = run(pop, r);
  const c = costPolicy(pop, r, changes, base);
  const d = distribution(pop, base, run(pop, applyPolicy(r, changes)));
  const pct = (x) => `${(100 * x).toFixed(0)}%`.padStart(5);
  const show = (title, groups) => {
    console.log(`\n${title}`);
    console.log("group".padEnd(40), "households".padStart(11), "avg income".padStart(11), "avg change".padStart(11), "% income".padStart(9), "gain".padStart(5), "lose".padStart(5));
    for (const g of groups) {
      console.log(g.label.padEnd(40), `${(g.households / 1e6).toFixed(2)}m`.padStart(11), `£${Math.round(g.meanIncome).toLocaleString("en-GB")}`.padStart(11),
        `£${Math.round(g.meanChange).toLocaleString("en-GB")}`.padStart(11), `${g.percentOfIncome.toFixed(2)}%`.padStart(9), pct(g.gain), pct(g.lose));
    }
  };
  console.log(`Policy: ${changes.map((x) => `${x.lever}=${x.value}`).join(", ")}. Static: £${(c.netRevenue / 1e9).toFixed(2)}bn a year raised (negative is a cost).`);
  show("By income decile (households ranked by equivalised net income)", [...d.deciles, d.all]);
  show("By family type", d.familyTypes);
  show("By region", d.regions);
} finally {
  await server.close();
}
