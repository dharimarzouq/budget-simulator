// Homes in the shipped population (data/build_homes.py; POPULATION.md, "Homes"). Synthetic, grade C. These check the
// file is whole and sensible, and hold the gaps against published figures to what POPULATION.md says they are.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodePopulation, type PopulationUnit } from "../src/population";

const pop = decodePopulation(JSON.parse(readFileSync("public/data/population-2026-27.json", "utf-8")));
const homes = pop.units.filter((u): u is PopulationUnit & { home: NonNullable<PopulationUnit["home"]> } => !!u.home);
const sum = (us: typeof homes, f: (u: (typeof homes)[number]) => number) => us.reduce((s, u) => s + u.weight * f(u), 0);
const count = (us: typeof homes) => sum(us, () => 1);
const meanValue = (us: typeof homes) => sum(us, (u) => u.home.value) / count(us);
const inRegion = (r: string) => homes.filter((u) => u.regionDetail === r);

describe("homes in the population", () => {
  it("every private household has one home, on its first family; people outside private households have none", () => {
    const households = new Set(pop.units.filter((u) => !u.outside).map((u) => u.household));
    expect(homes.length).toBe(households.size);
    expect(new Set(homes.map((u) => u.household)).size).toBe(homes.length);
    expect(pop.units.some((u) => u.outside && u.home)).toBe(false);
    expect(count(homes) / 1e6).toBeCloseTo(28.97, 1); // FRS 2024-25 households
  });

  it("tenure follows the FRS: 10.5m owned outright, 8.0m mortgaged, 5.4m private rent, 5.1m social rent", () => {
    const by = (t: string) => count(homes.filter((u) => u.home.tenure === t)) / 1e6;
    expect(by("owned_outright")).toBeCloseTo(10.55, 1);
    expect(by("mortgage")).toBeCloseTo(7.99, 1);
    expect(by("private_rent")).toBeCloseTo(5.39, 1);
    expect(by("social_rent")).toBeCloseTo(5.06, 1);
  });

  it("land is part of the value, never less than a tenth of it", () => {
    for (const { home: h } of homes) {
      expect(h.value).toBeGreaterThan(0);
      expect(h.land).toBeLessThanOrEqual(h.value);
      expect(h.land).toBeGreaterThanOrEqual(0.1 * h.value - 1000); // rounding to £1,000
    }
  });

  it("bands: A to H in England and Scotland, A to I in Wales, none in Northern Ireland (domestic rates)", () => {
    const bands = (r: string) => new Set(inRegion(r).map((u) => u.home.band));
    expect(bands("Northern Ireland")).toEqual(new Set([undefined]));
    expect(bands("Wales").has("I")).toBe(true);
    for (const r of ["London", "Scotland", "North East"]) {
      expect(bands(r).has(undefined)).toBe(false);
      expect(bands(r).has("I")).toBe(false);
    }
  });

  it("values follow the Market Value Survey: London's owners about three times the North East's", () => {
    const owners = (r: string) => inRegion(r).filter((u) => u.home.tenure === "owned_outright" || u.home.tenure === "mortgage");
    // MVS 2024, Annex Table 1.3: £741k and £221k at July 2024; grown with each region's house prices to August 2026.
    expect(meanValue(owners("London")) / 1000).toBeCloseTo((741.1 * 554430) / 557831, -1);
    expect(meanValue(owners("North East")) / 1000).toBeCloseTo((221.0 * 165640) / 151703, -1);
  });

  it("owners' homes are dearer for higher incomes, but only partly (income correlation fitted to the survey)", () => {
    const owners = homes.filter((u) => u.home.tenure !== "private_rent" && u.home.tenure !== "social_rent" && u.regionDetail === "South East");
    const income = (u: (typeof homes)[number]) => u.data.adults.reduce((s, a) => s + a.employment + a.selfEmployment + a.pension, 0);
    const sorted = [...owners].sort((a, b) => income(a) - income(b));
    const half = Math.floor(sorted.length / 2);
    const lower = meanValue(sorted.slice(0, half)), upper = meanValue(sorted.slice(half));
    expect(upper / lower).toBeGreaterThan(1.3);
    expect(upper / lower).toBeLessThan(3);
  });

  it("the documented gap with the ONS balance sheet: our homes households own come out about 30% above it", () => {
    // ONS 2025 Table 9.11, end of 2024: dwellings £1,961bn plus all households' land £4,560bn. Ours are at August
    // 2026 prices; UK house prices rose about 3% between. POPULATION.md explains the gap.
    const owned = homes.filter((u) => u.home.tenure !== "social_rent");
    const ratio = sum(owned, (u) => u.home.value) / 1.03 / (1960.7e9 + 4559.8e9);
    expect(ratio).toBeGreaterThan(1.2);
    expect(ratio).toBeLessThan(1.4);
    const landShare = sum(owned, (u) => u.home.land) / sum(owned, (u) => u.home.value);
    expect(landShare).toBeGreaterThan(0.7);
    expect(landShare).toBeLessThan(0.85);
  });

  it("bands are filled to the published counts in each region, cheapest homes in the lowest bands", () => {
    // VOA council tax stock of properties, 31 March 2025: band A is 14% of the East's homes, 9% of the South East's and
    // 52% of the North East's. Ranking leaves under half a point of rounding.
    const shareA = (r: string) => count(inRegion(r).filter((u) => u.home.band === "A")) / count(inRegion(r));
    expect(shareA("East")).toBeCloseTo(0.14, 2);
    expect(shareA("South East")).toBeCloseTo(0.088, 2);
    expect(shareA("North East")).toBeCloseTo(0.52, 2);
    const order = "ABCDEFGHI";
    // Values are rounded to £1,000 in the file, so homes at the same value can sit either side of a band line.
    const london = [...inRegion("London")].sort((a, b) => a.home.value - b.home.value || order.indexOf(a.home.band!) - order.indexOf(b.home.band!));
    for (let i = 1; i < london.length; i++) expect(order.indexOf(london[i]!.home.band!)).toBeGreaterThanOrEqual(order.indexOf(london[i - 1]!.home.band!));
  });
});
