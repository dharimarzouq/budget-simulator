import { describe, expect, it } from "vitest";
import { ruleSet } from "../src/engine";
import { LIBRARY, NAMED, resolve, status } from "../src/policy/library";
import { effectiveChanges } from "../src/policy/policy";
import { sources } from "../src/rules";

const r = ruleSet("2026-27");

describe("named policies", () => {
  it("every policy resolves to real levers or removals, actually changes something, and names known sources", () => {
    const ids = new Set<string>();
    for (const p of LIBRARY) {
      expect(ids.has(p.id), p.id).toBe(false);
      ids.add(p.id);
      const changes = resolve(p, r);
      expect(effectiveChanges(r, changes).length, p.id).toBe(changes.length);
      if (p.source) expect(sources[p.source], p.id).toBeDefined();
    }
  });

  it("adds work from today's value; status follows the sliders", () => {
    expect(resolve(NAMED["basic-rate-up-1p"]!, r)).toEqual([{ lever: "it_basic", value: 0.21 }]);
    const p = NAMED["uc-standard-allowance-up-50"]!;
    const on = resolve(p, r);
    expect(status(p, r, on)).toBe("on");
    expect(status(p, r, [on[0]!])).toBe("adjusted");
    expect(status(p, r, [{ lever: "it_basic", value: 0.21 }])).toBe("off");
    // Moving the same slider somewhere else isn't "adjusting" a policy: it's a different setting.
    expect(status(NAMED["basic-rate-down-1p"]!, r, [{ lever: "it_basic", value: 0.21 }])).toBe("off");
    expect(status(NAMED["keep-allowance-over-100k"]!, r, [{ lever: "no_taper", value: true }])).toBe("on");
  });
});
