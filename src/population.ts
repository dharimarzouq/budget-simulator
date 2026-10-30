// The synthetic population: made-up households weighted to match published UK totals (see POPULATION.md).
// Loaded from public/data/population-2026-27.json, written by data/export_population.py.
import { calculate, type CouncilTaxBand, type Household, type Region, type RuleSet } from "./engine";

export type { CouncilTaxBand };
export type Tenure = "owned_outright" | "mortgage" | "private_rent" | "social_rent";

/**
 * A household's home (synthetic, grade C: POPULATION.md, "Homes"). Money in £, at the population's house price date,
 * rounded to the nearest £1,000.
 */
export interface Home {
  tenure: Tenure;
  value: number;
  /** The land under it: the value less the building's depreciated cost. */
  land: number;
  /** The value at the council tax valuation date (1991 England and Scotland, 2003 Wales); Northern Ireland's 2005 capital value. */
  valuation: number;
  /** No band in Northern Ireland, which has domestic rates on capital values instead. */
  band?: CouncilTaxBand;
}

export interface PopulationUnit {
  weight: number;
  household: number;
  data: Household;
  /** One of the 12 UK regions, for breakdowns. */
  regionDetail?: string;
  /** People outside private households (students in halls, part-year workers...): in tax totals, not in household tables. */
  outside?: boolean;
  /** The household's home, on its first family only. */
  home?: Home;
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

type RawAdult = [number, number, number, number, number, number, number, number, number, number, number, number, number];
type RawChild = [number, number, number];
type RawHome = [number, number, number, number, number];
type RawUnit = [number, number, number, number, number, number, number, RawAdult[], RawChild[], number?, RawHome?];

/** The tenures in the file, in its order (data/export_population.py). */
const TENURE: Tenure[] = ["owned_outright", "mortgage", "private_rent", "social_rent"];

interface RawPopulation {
  about: string;
  year: string;
  codes: { region: Region[]; regionDetail?: string[]; health: Household["adults"][number]["health"][]; disability: Household["children"][number]["disability"][]; band?: CouncilTaxBand[] };
  published: Record<string, PublishedFigure>;
  units: RawUnit[];
}

const decodeHome = ([t, value, land, valuation, band]: RawHome, bands: CouncilTaxBand[]): Home => ({
  tenure: TENURE[t]!,
  value: value * 1000,
  land: land * 1000,
  valuation: valuation * 1000,
  ...(band >= 0 ? { band: bands[band]! } : {}),
});

/**
 * A fixed number from 0 to 1 for a household, the same on every load, used to decide who claims Council Tax Reduction
 * (rules/2026-27/council_tax.yaml). A hash of the household's number, so it doesn't follow income or anything else.
 */
export function takeUpDraw(household: number): number {
  let x = (household + 0x9e3779b9) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 2 ** 32;
}

export function decodePopulation(raw: RawPopulation): Population {
  const { region, health, disability } = raw.codes;
  // Adults in each household, across its families, for the single person discount.
  const adultsIn = new Map<number, number>();
  for (const u of raw.units) adultsIn.set(u[1], (adultsIn.get(u[1]) ?? 0) + u[7].length);
  const units = raw.units.map(([weight, hh, reg, rentMonthly, childcareMonthly, savings, flags, adults, children, reg12, rawHome]) => {
    const regionDetail = reg12 === undefined ? undefined : raw.codes.regionDetail?.[reg12];
    const home = rawHome ? decodeHome(rawHome, raw.codes.band ?? []) : undefined;
    // The family with the home pays its council tax (the export puts the home on each household's first family).
    const dwelling = home && regionDetail
      ? { area: regionDetail, ...(home.band ? { band: home.band } : { capitalValue: home.valuation }), adultsInHome: adultsIn.get(hh)!, takeUpDraw: takeUpDraw(hh) }
      : undefined;
    return {
      weight,
      household: hh,
      regionDetail,
      outside: (flags & 8) !== 0,
      ...(home ? { home } : {}),
      data: {
        region: region[reg]!,
        ...(dwelling ? { home: dwelling } : {}),
        rentMonthly,
        childcareMonthly,
        savings,
        claimsUniversalCredit: (flags & 1) !== 0,
        claimsChildBenefit: (flags & 2) !== 0,
        claimsMarriageAllowance: (flags & 4) !== 0,
        adults: adults.map(([age, employment, secondJob, selfEmployment, pension, h, carer, propertyIncome, savingsInterest, dividends, pensionContributions, otherDeductions, taxReductions]) => ({
          age, employment, secondJob, selfEmployment, pension, propertyIncome, savingsInterest, dividends,
          pensionContributions, otherDeductions, taxReductions, health: health[h]!, carer: carer === 1,
        })) as Household["adults"],
        children: children.map(([age, pre, d]) => ({ age, bornBefore2017: pre === 1, disability: disability[d]! })),
      },
    };
  });
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
