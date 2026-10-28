// The synthetic population: made-up households weighted to match published UK totals (see POPULATION.md).
// Loaded from public/data/population-2026-27.json, written by data/export_population.py.
import { calculate, type Household, type Region, type RuleSet } from "./engine";

export interface PopulationUnit {
  weight: number;
  household: number;
  data: Household;
}

export interface PublishedFigure {
  value: number;
  unit: string;
  source: string;
}

export interface Population {
  about: string;
  year: string;
  units: PopulationUnit[];
  published: Record<string, PublishedFigure>;
}

type RawAdult = [number, number, number, number, number, number, number, number, number, number, number];
type RawChild = [number, number, number];
type RawUnit = [number, number, number, number, number, number, number, RawAdult[], RawChild[]];

interface RawPopulation {
  about: string;
  year: string;
  codes: { region: Region[]; health: Household["adults"][number]["health"][]; disability: Household["children"][number]["disability"][] };
  published: Record<string, PublishedFigure>;
  units: RawUnit[];
}

export function decodePopulation(raw: RawPopulation): Population {
  const { region, health, disability } = raw.codes;
  const units = raw.units.map(([weight, hh, reg, rentMonthly, childcareMonthly, savings, flags, adults, children]) => ({
    weight,
    household: hh,
    data: {
      region: region[reg]!,
      rentMonthly,
      childcareMonthly,
      savings,
      claimsUniversalCredit: (flags & 1) !== 0,
      claimsChildBenefit: (flags & 2) !== 0,
      adults: adults.map(([age, employment, secondJob, selfEmployment, pension, h, carer, propertyIncome, savingsInterest, dividends, pensionContributions]) => ({
        age, employment, secondJob, selfEmployment, pension, propertyIncome, savingsInterest, dividends,
        pensionContributions, health: health[h]!, carer: carer === 1,
      })) as Household["adults"],
      children: children.map(([age, pre, d]) => ({ age, bornBefore2017: pre === 1, disability: disability[d]! })),
    },
  }));
  return { about: raw.about, year: raw.year, units, published: raw.published };
}

export async function loadPopulation(url = "./data/population-2026-27.json"): Promise<Population> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't load the population (${res.status})`);
  return decodePopulation(await res.json());
}

/** Pounds a year (or counts) across the whole population. */
export interface Totals {
  incomeTax: number;
  employeeNI: number;
  /** After the Employment Allowance and apprentice relief, which are taken off as lump sums. */
  employerNI: number;
  selfEmployedNI: number;
  childBenefit: number;
  childBenefitCharge: number;
  universalCredit: number;
  ucHouseholds: number;
  cbFamilies: number;
}

export function populationTotals(pop: Population, r: RuleSet): Totals {
  const t: Totals = { incomeTax: 0, employeeNI: 0, employerNI: 0, selfEmployedNI: 0, childBenefit: 0, childBenefitCharge: 0, universalCredit: 0, ucHouseholds: 0, cbFamilies: 0 };
  for (const { weight: w, data } of pop.units) {
    const res = calculate(data, r);
    for (const a of res.adults) {
      t.incomeTax += w * a.incomeTax;
      t.employeeNI += w * a.employeeNI;
      t.employerNI += w * a.employerNI;
      t.selfEmployedNI += w * a.selfEmployedNI;
    }
    t.childBenefit += w * res.childBenefit;
    t.childBenefitCharge += w * res.childBenefitCharge;
    t.universalCredit += w * res.universalCredit.award * 12;
    if (res.universalCredit.award > 0) t.ucHouseholds += w;
    if (res.childBenefit > 0) t.cbFamilies += w;
  }
  t.employerNI -= r.ni.employmentAllowanceCost + r.ni.apprenticeReliefCost;
  return t;
}
