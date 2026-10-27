// The shipped population file loads, decodes, and still matches the published totals it was built to.
// If a rule or the population changes and a total drifts, this says so.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ruleSet } from "../src/engine";
import { decodePopulation, populationTotals } from "../src/population";

const pop = decodePopulation(JSON.parse(readFileSync("public/data/population-2026-27.json", "utf-8")));
const totals = populationTotals(pop, ruleSet("2026-27"));
const published = (name: string) => pop.published[name]!.value;

describe("shipped population", () => {
  it("decodes every unit, all with positive weights", () => {
    expect(pop.units.length).toBeGreaterThan(30_000);
    expect(pop.units.every((u) => u.weight > 0 && u.data.adults.length >= 1)).toBe(true);
  });

  it("labels itself as made up", () => {
    expect(pop.about).toMatch(/made-up households, not real people/);
  });

  // Tolerances are the gaps we know about and have explained in POPULATION.md.
  it.each([
    ["Employee NICs", (t: typeof totals) => t.employeeNI / 1e9, 0.03],
    ["Employer NICs", (t: typeof totals) => t.employerNI / 1e9, 0.03],
    ["Universal Credit spending", (t: typeof totals) => t.universalCredit / 1e9, 0.08],
    ["Households on Universal Credit", (t: typeof totals) => t.ucHouseholds / 1e6, 0.06],
    ["Families paid Child Benefit", (t: typeof totals) => t.cbFamilies / 1e6, 0.07],
  ])("%s is within the explained gap of the published figure", (name, get, tolerance) => {
    expect(Math.abs(get(totals) / published(name) - 1)).toBeLessThan(tolerance);
  });

  it("income tax is below the OBR, by about the tax on savings and dividends we don't model yet", () => {
    const ratio = totals.incomeTax / 1e9 / published("Income tax");
    expect(ratio).toBeGreaterThan(0.85);
    expect(ratio).toBeLessThan(0.95);
  });
});
