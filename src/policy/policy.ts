// A policy is a list of lever settings. Applying it to a RuleSet gives a changed copy; the original is untouched.
import type { RuleSet } from "../engine";
import { LEVER, type LeverValue } from "./levers";

export interface Change {
  lever: string;
  value: LeverValue;
}

export type Policy = Change[];

export function applyPolicy(base: RuleSet, policy: Policy): RuleSet {
  const r = structuredClone(base);
  for (const { lever, value } of policy) {
    const l = LEVER[lever];
    if (!l) throw new Error(`Unknown lever ${lever}`);
    l.set(r, value);
  }
  return r;
}

/** Only the changes that actually differ from the base rules. */
export function effectiveChanges(base: RuleSet, policy: Policy): Policy {
  return policy.filter(({ lever, value }) => LEVER[lever]!.get(base) !== value);
}

/** A policy as a URL query string, e.g. "it_basic=0.21&uc_two_child_limit=1", so a package can be shared. */
export function policyToQuery(policy: Policy): string {
  return policy.map(({ lever, value }) => `${lever}=${typeof value === "boolean" ? Number(value) : value}`).join("&");
}

export function policyFromQuery(query: string): Policy {
  const out: Policy = [];
  for (const [lever, raw] of new URLSearchParams(query)) {
    const l = LEVER[lever];
    if (!l) continue; // ignore anything that isn't a lever
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    out.push({ lever, value: l.unit === "flag" ? n !== 0 : n });
  }
  return out;
}
