// A policy is a list of lever settings and removals. Applying it to a RuleSet gives a changed copy; the original is
// untouched. Removals are applied after every lever setting, in the order REMOVALS lists them (see removals.ts).
import type { RuleSet } from "../engine";
import { LEVER, type LeverValue } from "./levers";
import { REMOVAL, REMOVALS } from "./removals";

export interface Change {
  lever: string;
  value: LeverValue;
}

export type Policy = Change[];

export function applyPolicy(base: RuleSet, policy: Policy): RuleSet {
  const r = structuredClone(base);
  for (const { lever, value } of policy) {
    if (REMOVAL[lever]) continue;
    const l = LEVER[lever];
    if (!l) throw new Error(`Unknown lever ${lever}`);
    l.set(r, value);
  }
  for (const x of REMOVALS) if (policy.some((c) => c.lever === x.id && c.value)) x.apply(r);
  return r;
}

/** Levers made meaningless by a removal in the policy: the removed lever itself and the ones it hides. */
export function coveredLevers(policy: Policy): Set<string> {
  return new Set(policy.flatMap((c) => (REMOVAL[c.lever] && c.value ? [REMOVAL[c.lever]!.lever, ...REMOVAL[c.lever]!.hides] : [])));
}

/** Only the changes that actually differ from the base rules, leaving out levers a removal has made meaningless. */
export function effectiveChanges(base: RuleSet, policy: Policy): Policy {
  const covered = coveredLevers(policy);
  return policy.filter(({ lever, value }) => (REMOVAL[lever] ? value === true : !covered.has(lever) && LEVER[lever]!.get(base) !== value));
}

/** A policy as a URL query string, e.g. "it_basic=0.21&no_higher=1", so a package can be shared. */
export function policyToQuery(policy: Policy): string {
  return policy.map(({ lever, value }) => `${lever}=${typeof value === "boolean" ? Number(value) : value}`).join("&");
}

export function policyFromQuery(query: string): Policy {
  const out: Policy = [];
  for (const [lever, raw] of new URLSearchParams(query)) {
    const l = LEVER[lever];
    if (!l && !REMOVAL[lever]) continue; // ignore anything that isn't a lever or a removal
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    out.push({ lever, value: !l || l.unit === "flag" ? n !== 0 : n });
  }
  return out;
}
