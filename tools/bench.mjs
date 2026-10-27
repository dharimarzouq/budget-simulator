// How long the engine takes over a population, phase by phase. Usage: node tools/bench.mjs data/build/seed.json
import { readFileSync } from "node:fs";
import { createServer } from "vite";

let t = performance.now();
const lap = (label) => {
  const now = performance.now();
  console.log(`${label}: ${(now - t).toFixed(0)} ms`);
  t = now;
};

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
lap("start Vite");
try {
  const { calculate, household, ruleSet } = await server.ssrLoadModule("/src/engine/index.ts");
  lap("load engine");
  const r = ruleSet("2026-27");
  const raw = JSON.parse(readFileSync(process.argv[2], "utf-8"));
  lap("read population");
  const units = raw.units.map((u) => household(u.data));
  // Twice: the second run shows the speed once the JavaScript engine has warmed up.
  for (const run of [1, 2]) {
    let net = 0;
    for (const h of units) net += calculate(h, r).netIncome;
    lap(`run ${run}: ${units.length} units, net income checksum ${net.toFixed(2)}`);
  }
} finally {
  await server.close();
  lap("close Vite");
}
