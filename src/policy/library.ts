// Named policies (policies/library.yaml): plain-English measures that set one or more levers. They sit alongside the
// sliders: choosing one moves them, and moving them yourself still works.
import libraryData from "../../policies/library.yaml";
import type { RuleSet } from "../engine";
import { LEVER, type LeverValue } from "./levers";
import type { Policy } from "./policy";
import { REMOVAL_FOR } from "./removals";

interface Step {
  lever: string;
  set?: LeverValue;
  add?: number;
  remove?: boolean;
}

export interface NamedPolicy {
  id: string;
  name: string;
  area: string;
  about: string;
  /** For figures the policy brings in itself (not from the rules files). */
  source?: string;
  changes: Step[];
}

export const LIBRARY = libraryData as NamedPolicy[];
export const NAMED = Object.fromEntries(LIBRARY.map((p) => [p.id, p])) as Record<string, NamedPolicy>;

/** The policy's changes as lever settings and removals, worked out against today's rules. */
export function resolve(p: NamedPolicy, rules: RuleSet): Policy {
  return p.changes.map((s) => {
    if (s.remove) {
      const removal = REMOVAL_FOR[s.lever];
      if (!removal) throw new Error(`${p.id}: ${s.lever} can't be removed`);
      return { lever: removal.id, value: true };
    }
    const l = LEVER[s.lever];
    if (!l) throw new Error(`${p.id}: no lever ${s.lever}`);
    if (s.set !== undefined) return { lever: s.lever, value: s.set };
    if (s.add !== undefined) return { lever: s.lever, value: +((l.get(rules) as number) + s.add).toFixed(6) };
    throw new Error(`${p.id}: a change needs set, add or remove`);
  });
}

/**
 * Whether a policy is in the current settings: "on" if every one of its changes is there as it sets it, "adjusted" if
 * some are and others have been moved or taken out, "off" otherwise (including when its levers were moved elsewhere).
 */
export function status(p: NamedPolicy, rules: RuleSet, current: Policy): "on" | "adjusted" | "off" {
  const mine = resolve(p, rules);
  const value = new Map(current.map((c) => [c.lever, c.value]));
  const matching = mine.filter((c) => value.get(c.lever) === c.value).length;
  return matching === mine.length ? "on" : matching > 0 ? "adjusted" : "off";
}
