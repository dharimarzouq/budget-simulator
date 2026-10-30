// The reform slot (src/policy/reforms.ts). The check from PLAN.md, milestone 3 step 2: a pack that replaces a tax with
// an identical tax costs exactly zero in every year, with nobody gaining or losing.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ruleSet } from "../src/engine";
import { decodePopulation } from "../src/population";
import { run } from "../src/policy/costing";
import { distribution } from "../src/policy/distribution";
import { indirectByTenth } from "../src/policy/indirect";
import { applyPolicy, effectiveChanges } from "../src/policy/policy";
import { reckonerCosts } from "../src/policy/reckoner";
import { TEST_SWAP, combine, packLevers, reformParts, reformsFromQuery, reformsToQuery, weakest, withDefaults, type ActiveReform } from "../src/policy/reforms";
import { fiscalPath } from "../src/economy/fiscal";

const r = ruleSet("2026-27");
const packs = { [TEST_SWAP.id]: TEST_SWAP };
const noChange = { incomeTax: 0, employeeNI: 0, employerNI: 0, selfEmployedNI: 0, childBenefitCharge: 0, childBenefit: 0, universalCredit: 0 };
const swap = (points: number): ActiveReform[] => [{ pack: TEST_SWAP.id, options: withDefaults(TEST_SWAP, { points }) }];

/** Cost a set of packs the way the worker does, for the taxes outside the household model. */
function cost(active: ActiveReform[]) {
  const policy = effectiveChanges(r, combine([], active, r, packs));
  const reckoner = reckonerCosts(r, applyPolicy(r, policy));
  const parts = reformParts(active, r, packs);
  return { policy, reckoner, parts };
}

describe("the reform slot", () => {
  for (const points of [1, 2, 5]) {
    it(`swapping ${points} point${points > 1 ? "s" : ""} of VAT for an identical tax costs exactly zero in every year`, () => {
      const { policy, reckoner, parts } = cost(swap(points));
      // VAT really is cut, and the new tax really raises something: the zero isn't from nothing happening.
      expect(policy).toEqual([{ lever: "vat_standard", value: +(0.2 - points / 100).toFixed(6) }]);
      expect(reckoner[0]!.raises[0]!).toBeLessThan(-1e9);
      expect(parts[0]!.raises[0]!).toBeGreaterThan(1e9);
      const path = fiscalPath(noChange, 0, { reckoner, reforms: parts });
      const econ = fiscalPath(noChange, 0, { economy: true, reckoner, reforms: parts });
      for (const y of [...path.years, ...econ.years]) {
        expect(y.taxRaised).toBe(0);
        expect(y.borrowing).toBe(0);
        expect(y.debt).toBe(0);
        expect(y.gdp).toBe(0);
      }
      // Without the pack's own tax, the cut does cost money: the reform parts are being counted.
      expect(fiscalPath(noChange, 0, { reckoner }).years.at(-1)!.borrowing).toBeGreaterThan(1);
    });
  }

  it("nobody gains or loses from the identical swap", () => {
    const { reckoner, parts } = cost(swap(1));
    const byTenth = indirectByTenth(reckoner, parts);
    expect(byTenth.every((x) => x === 0)).toBe(true);
    const pop = decodePopulation(JSON.parse(readFileSync("public/data/population-2026-27.json", "utf-8")));
    const base = run(pop, r);
    const d = distribution(pop, base, base, byTenth);
    for (const g of [d.all, ...d.deciles, ...d.familyTypes, ...d.regions]) {
      expect(g.meanChange).toBe(0);
      expect(g.gain).toBe(0);
      expect(g.lose).toBe(0);
    }
  });

  it("a pack takes over the levers it replaces, over your own setting of them", () => {
    const active = swap(2);
    expect(packLevers(active, r, packs)).toEqual(new Set(["vat_standard"]));
    const mine = [{ lever: "vat_standard", value: 0.25 }, { lever: "it_basic", value: 0.21 }];
    expect(combine(mine, active, r, packs)).toEqual([{ lever: "it_basic", value: 0.21 }, { lever: "vat_standard", value: 0.18 }]);
  });

  it("parts carry their grade and check; the weakest grade wins", () => {
    const [part] = reformParts(swap(1), r, packs);
    expect(part!.grade).toBe("A"); // HMRC costs exactly a 1p change
    expect(part!.raisesInclude).toBe("responses");
    expect(reformParts(swap(3), r, packs)[0]!.grade).toBe("B"); // scaled from it
    expect(weakest(["A", null, "C", "B"])).toBe("C");
    expect(weakest([null])).toBeNull();
  });

  it("packs and their options go in the link, and come back from it", () => {
    expect(reformsToQuery(swap(1), packs)).toBe("rf_test_swap=1"); // defaults are left out
    const q = reformsToQuery(swap(3), packs);
    expect(q).toBe("rf_test_swap=1&rf_test_swap_points=3");
    expect(reformsFromQuery(`it_basic=0.21&${q}`, packs)).toEqual(swap(3));
    expect(reformsFromQuery("rf_test_swap=1&rf_test_swap_points=99", packs)).toEqual(swap(5)); // brought into range
    expect(reformsFromQuery("rf_test_swap_points=3", packs)).toEqual([]); // options alone don't add the pack
    expect(reformsFromQuery("rf_nothing=1", packs)).toEqual([]);
  });
});
