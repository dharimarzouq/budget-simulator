// Who pays VAT and duties: a change in one of these taxes (costed from HMRC's figures, reckoner.ts) shared out across
// income tenths in proportion to what each tenth pays now, from the ONS (costings/ons-etb-2023-24.yaml). Approximate:
// every household in a tenth gets the same share. Taxes the ONS doesn't break down by tenth (corporation tax, capital
// gains, inheritance tax, stamp duty) aren't shared out.
import data from "../../costings/ons-etb-2023-24.yaml";
import type { ReckonerCost } from "./reckoner";

interface Tax {
  label: string;
  average: number[];
  levers: string[];
}
const ETB = data as { source: string; households_thousands: number[]; taxes: Record<string, Tax> };
export const ETB_SOURCE = ETB.source;

/** Each tenth's share of what households pay in a tax now, poorest first (adds up to 1). */
function shares(t: Tax): number[] {
  const totals = t.average.map((a, k) => a * ETB.households_thousands[k]!);
  const sum = totals.reduce((s, x) => s + x, 0);
  return totals.map((x) => x / sum);
}

const BY_LEVER = new Map<string, number[]>();
for (const t of Object.values(ETB.taxes)) for (const l of t.levers) BY_LEVER.set(l, shares(t));

/** Whether a change to this lever is shared out to households. */
export const sharedOut = (lever: string) => BY_LEVER.has(lever);

/**
 * How much more each tenth of households pays in a year (£, total for the tenth; negative is less), from HMRC's
 * first-year costing of each change shared out as households pay the tax now.
 */
export function indirectByTenth(costs: ReckonerCost[]): number[] {
  const out = new Array<number>(10).fill(0);
  for (const c of costs) {
    const s = BY_LEVER.get(c.lever);
    if (s) s.forEach((share, k) => (out[k]! += c.raises[0]! * share));
  }
  return out;
}
