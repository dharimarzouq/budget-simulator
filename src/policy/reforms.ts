// Reform packs: structural reforms that bring in a new tax (or change how one works) and replace existing ones. A pack
// plugs in like everything else: it has options, says which of today's taxes it replaces (as lever settings and
// removals, so they're costed the usual way), and costs its own new parts, each with its sources and grade.
//
// A part's `raises` is a static costing (nobody changes what they do), with how people respond given separately in
// `responses`; or, when the part comes from a costing that already allows for responses (HMRC's), `responses` is left
// out and `raisesInclude` says so. Never blended silently.
import type { RuleSet } from "../engine";
import { applyPolicy, coveredLevers, type Policy } from "./policy";
import { LEVER } from "./levers";
import { reckonerCosts } from "./reckoner";
import { leverCheck, type Check, type Grade } from "./grades";
import { taxShares } from "./indirect";

export type OptionValue = number | boolean;
export type Options = Record<string, OptionValue>;

export interface ReformOption {
  id: string;
  label: string;
  kind: "number" | "flag";
  default: OptionValue;
  min?: number;
  max?: number;
  step?: number;
  /** How a number is shown: "points" (percentage points), "rate" (a share shown as %), "gbp". */
  unit?: "points" | "rate" | "gbp";
  about: string;
}

export interface Source {
  label: string;
  url: string;
  publisher: string;
  licence: string;
  date: string;
}

export interface ReformPart {
  pack: string;
  label: string;
  /** £ a year raised (positive) or lost, in the first three years of the budget. */
  raises: number[];
  /** "static": nobody responds, and `responses` holds the change from that; "responses": the costing already allows for them. */
  raisesInclude: "static" | "responses";
  /** How people's responses change the first year's figure, £ (a change from `raises`). Only with raisesInclude "static". */
  responses?: { low: number; central: number; high: number };
  /** The OBR forecast line that carries it on after the third year (forecasts/obr-2026-10.yaml). */
  receipts: string;
  grade: Grade;
  check: Check;
  why: string;
  /** Each income tenth's share of the first year's figure, poorest first (adds up to 1); left out if it isn't shared out to households. */
  byTenth?: number[];
}

export interface ReformPack {
  id: string;
  name: string;
  about: string;
  options: ReformOption[];
  sources: Source[];
  /** Today's taxes the pack replaces, as lever settings and removals. These are costed the usual way, as their own rows. */
  replaces(options: Options, rules: RuleSet): Policy;
  /** The pack's own new parts, costed. */
  cost(options: Options, rules: RuleSet): ReformPart[];
}

/** A pack on the page: which pack, with which options. */
export interface ActiveReform {
  pack: string;
  options: Options;
}

// ---- a test pack: replacing a tax with an identical one must change nothing ------------------------------------
/**
 * Cuts VAT by a number of points and brings in a new tax that is VAT under another name at the same rate: it raises
 * exactly what the cut gives away, from the same people. Only on the development site; the tests use it to check that
 * the slot adds up (zero in every year, nobody gaining or losing).
 */
export const TEST_SWAP: ReformPack = {
  id: "test_swap",
  name: "Swap VAT for an identical tax (test)",
  about: "A check of the reform slot, only on the development site: VAT is cut and a new tax, identical to the slice of VAT it replaces, is brought in. It should cost nothing and leave every household as it is.",
  options: [{ id: "points", label: "Points of VAT swapped", kind: "number", default: 1, min: 1, max: 5, step: 1, unit: "points", about: "How many percentage points of the standard rate move to the new tax." }],
  sources: [{ label: "HMRC ready reckoner (the VAT line)", url: "https://www.gov.uk/government/statistics/direct-effects-of-illustrative-tax-changes", publisher: "HM Revenue and Customs", licence: "OGL v3.0", date: "2025-06" }],
  replaces: (o, rules) => [{ lever: "vat_standard", value: +((LEVER.vat_standard!.get(rules) as number) - (o.points as number) / 100).toFixed(6) }],
  cost(o, rules) {
    // The slice of VAT given up, costed as HMRC costs it, with the sign turned round.
    const given = reckonerCosts(rules, applyPolicy(rules, this.replaces(o, rules)));
    return given.map((c) => {
      const g = leverCheck(c.lever, c.fit);
      return {
        pack: this.id, label: "The new tax (VAT under another name)", raises: c.raises.map((x) => -x), raisesInclude: "responses", receipts: c.receipts,
        grade: c.fit === "exact" ? "A" : "B", check: g.check, why: g.why, byTenth: taxShares(c.lever),
      };
    });
  },
};

// ---- the registry ---------------------------------------------------------------------------------------------------
export const PACKS: ReformPack[] = import.meta.env.DEV ? [TEST_SWAP] : [];
export const PACK = Object.fromEntries(PACKS.map((p) => [p.id, p])) as Record<string, ReformPack>;

/** A pack's options, its defaults filled in and anything out of range brought back into it. */
export function withDefaults(pack: ReformPack, given: Partial<Options> = {}): Options {
  const out: Options = {};
  for (const o of pack.options) {
    const v = given[o.id];
    if (o.kind === "flag") out[o.id] = typeof v === "boolean" ? v : o.default;
    else out[o.id] = typeof v === "number" && Number.isFinite(v) ? Math.min(o.max ?? Infinity, Math.max(o.min ?? -Infinity, v)) : o.default;
  }
  return out;
}

/** What the packs replace, as one policy (later packs win where two set the same lever). */
export function replacements(active: ActiveReform[], rules: RuleSet, packs = PACK): Policy {
  const out = new Map<string, Policy[number]>();
  for (const r of active) for (const c of packs[r.pack]!.replaces(r.options, rules)) out.set(c.lever, c);
  return [...out.values()];
}

/** Levers a pack takes over: the ones it sets, and the ones its removals make meaningless. Hidden on the page. */
export function packLevers(active: ActiveReform[], rules: RuleSet, packs = PACK): Set<string> {
  const policy = replacements(active, rules, packs);
  // A removal's own id too, so your own "Remove" of the same thing gives way to the pack's.
  return new Set([...policy.map((c) => c.lever), ...coveredLevers(policy)]);
}

/**
 * Your levers and the packs' replacements as one policy. A pack wins over your own setting of a lever it takes over:
 * that lever is hidden on the page while the pack is in.
 */
export function combine(own: Policy, active: ActiveReform[], rules: RuleSet, packs = PACK): Policy {
  const taken = packLevers(active, rules, packs);
  return [...own.filter((c) => !taken.has(c.lever)), ...replacements(active, rules, packs)];
}

/** Every part of every pack in, costed. */
export const reformParts = (active: ActiveReform[], rules: RuleSet, packs = PACK): ReformPart[] => active.flatMap((r) => packs[r.pack]!.cost(r.options, rules));

/** The packs in a URL query: "rf_<pack>=1" for each, and "rf_<pack>_<option>=<value>" for options changed from their defaults. */
export function reformsToQuery(active: ActiveReform[], packs = PACK): string {
  return active
    .flatMap((r) => {
      const pack = packs[r.pack]!;
      const opts = pack.options.filter((o) => r.options[o.id] !== o.default).map((o) => `rf_${r.pack}_${o.id}=${typeof r.options[o.id] === "boolean" ? Number(r.options[o.id]) : r.options[o.id]}`);
      return [`rf_${r.pack}=1`, ...opts];
    })
    .join("&");
}

export function reformsFromQuery(query: string, packs = PACK): ActiveReform[] {
  const q = new URLSearchParams(query);
  return Object.values(packs)
    .filter((p) => q.get(`rf_${p.id}`) === "1")
    .map((p) => {
      const given: Partial<Options> = {};
      for (const o of p.options) {
        const raw = q.get(`rf_${p.id}_${o.id}`);
        if (raw === null || !Number.isFinite(Number(raw))) continue;
        given[o.id] = o.kind === "flag" ? Number(raw) !== 0 : Number(raw);
      }
      return { pack: p.id, options: withDefaults(p, given) };
    });
}

/** The grade of a set of parts and other figures together: the weakest (D is weaker than A). */
export const weakest = (grades: (Grade | null)[]): Grade | null => grades.reduce<Grade | null>((w, g) => (g && (!w || g > w) ? g : w), null);
