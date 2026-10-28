// Break a policy's static and behavioural income tax effect down by income band.
// Usage: node tools/behaviour_by_band.mjs it_higher 0.41
import { readFileSync } from "node:fs";
import { createServer } from "vite";

const [lever, value] = process.argv.slice(2);
const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const { ruleSet, calculate } = await server.ssrLoadModule("/src/engine/index.ts");
  const { decodePopulation } = await server.ssrLoadModule("/src/population.ts");
  const { applyPolicy } = await server.ssrLoadModule("/src/policy/policy.ts");
  const r = ruleSet("2026-27");
  const after = applyPolicy(r, [{ lever, value: Number(value) }]);
  const pop = decodePopulation(JSON.parse(readFileSync("public/data/population-2026-27.json", "utf-8")));
  const SOURCES = ["employment", "selfEmployment", "pension", "propertyIncome", "dividends", "savingsInterest"];
  const mtr = (data, i, rules, now) => {
    const a = data.adults[i];
    const kind = SOURCES.reduce((best, k) => ((a[k] ?? 0) > (a[best] ?? 0) ? k : best), SOURCES[0]);
    const adults = data.adults.map((x, j) => (j === i ? { ...x, [kind]: (x[kind] ?? 0) + 100 } : x));
    const more = calculate({ ...data, adults }, rules).adults[i];
    return { it: (more.incomeTax - now.incomeTax) / 100, ni: (more.employeeNI + more.selfEmployedNI - now.employeeNI - now.selfEmployedNI) / 100 };
  };
  const tie = after.behaviour.taxableIncomeElasticity;
  const e = (x) => tie.reduce((v, b) => (x >= b.threshold ? b.rate : v), tie[0].rate);
  const bands = [0, 50270, 60000, 80000, 100000, 125140, 150000, 1e12];
  const out = bands.slice(0, -1).map((lo, k) => ({ lo, hi: bands[k + 1], people: 0, staticIT: 0, behaviourIT: 0, t0: 0, t1: 0 }));
  for (const { weight: w, data } of pop.units) {
    const was = calculate(data, r);
    const now = calculate(data, after);
    data.adults.forEach((_, i) => {
      const y = now.adults[i].totalIncome;
      const row = out.find((o) => y >= o.lo && y < o.hi);
      row.staticIT += w * (now.adults[i].incomeTax - was.adults[i].incomeTax);
      if (y <= 0) return;
      const m0 = mtr(data, i, r, was.adults[i]);
      const m1 = mtr(data, i, after, now.adults[i]);
      const t0 = m0.it + m0.ni, t1 = m1.it + m1.ni;
      if (Math.abs(t1 - t0) < 1e-9 || t0 >= 1 || t1 >= 1) return;
      const dy = e(y) * y * Math.log((1 - t1) / (1 - t0));
      row.people += w;
      row.behaviourIT += w * dy * m1.it;
      row.t0 += w * t0;
      row.t1 += w * t1;
    });
  }
  console.log("band | people whose marginal rate changed | static IT £m | behaviour IT £m | avg marginal before -> after");
  for (const o of out) {
    console.log(`${o.lo}-${o.hi} | ${(o.people / 1e3).toFixed(0)}k | ${(o.staticIT / 1e6).toFixed(0)} | ${(o.behaviourIT / 1e6).toFixed(0)} | ${o.people ? (o.t0 / o.people).toFixed(3) + " -> " + (o.t1 / o.people).toFixed(3) : ""}`);
  }
} finally {
  await server.close();
}
