import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ruleSet } from "../src/engine";
import { decodePopulation } from "../src/population";
import { run } from "../src/policy/costing";
import { distribution } from "../src/policy/distribution";
import { ETB_SOURCE, indirectByTenth, sharedOut } from "../src/policy/indirect";
import { reckon } from "../src/policy/reckoner";
import { sources } from "../src/rules";

describe("who pays VAT and duties", () => {
  it("shares out a change in full, and only for taxes the ONS breaks down by income", () => {
    expect(sources[ETB_SOURCE]).toBeDefined();
    const vat = reckon("vat_standard", 0.01);
    const byTenth = indirectByTenth([vat]);
    expect(byTenth.reduce((s, x) => s + x, 0)).toBeCloseTo(8800e6, 0);
    // The poorest tenth's share: £2,217 × 2,971 thousand households out of the total (ONS Table 2b).
    const totals = [2217 * 2971, 2270 * 2904, 3073 * 2977, 2655 * 2925, 2994 * 2802, 3426 * 2757, 3621 * 2654, 4637 * 2645, 4747 * 2774, 5887 * 3032];
    expect(byTenth[0]! / 8800e6).toBeCloseTo(totals[0]! / totals.reduce((s, x) => s + x, 0), 12);
    expect(sharedOut("fuel_duty")).toBe(true);
    expect(sharedOut("corporation_tax")).toBe(false);
    expect(indirectByTenth([reckon("corporation_tax", 0.01)]).every((x) => x === 0)).toBe(true);
  });

  it("winners and losers: a VAT rise is taken from households in full, and costs poorer tenths more of their income", () => {
    const r = ruleSet("2026-27");
    const pop = decodePopulation(JSON.parse(readFileSync("public/data/population-2026-27.json", "utf-8")));
    const base = run(pop, r);
    const d = distribution(pop, base, base, indirectByTenth([reckon("vat_standard", 0.01)]));
    expect(d.all.meanChange * d.all.households).toBeCloseTo(-8800e6, -3);
    expect(d.deciles[0]!.percentOfIncome).toBeLessThan(d.deciles[9]!.percentOfIncome); // more negative for the poorest
    expect(d.deciles[9]!.meanChange).toBeLessThan(d.deciles[0]!.meanChange); // but richer households pay more in pounds
  });
});
