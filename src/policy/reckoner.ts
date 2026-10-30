// Costing taxes the household model doesn't cover, from HMRC's ready reckoner (costings/hmrc-ready-reckoner-2025-06.yaml).
// HMRC costs standard changes (1p on VAT, £5,000 on the inheritance tax threshold, and so on), allowing for how people
// respond. A change of another size is scaled along the straight lines between HMRC's figures, starting from no change.
import data from "../../costings/hmrc-ready-reckoner-2025-06.yaml";
import forecast from "../../forecasts/obr-2026-10.yaml";
import type { RuleSet } from "../engine";
import { LEVER } from "./levers";

interface Point {
  change: number;
  raises: number[];
}
interface Line {
  symmetric?: boolean;
  receipts: string;
  /** How big a change HMRC's figures are scaled to before it counts as far beyond them (our judgement). */
  trusted_to?: number;
  points: Point[];
}
export const RECKONER = (data as { source: string; years: string[]; lines: Record<string, Line> }).lines;
export const RECKONER_YEARS = (data as { years: string[] }).years;
export const RECKONER_SOURCE = (data as { source: string }).source;

/**
 * How well HMRC's figures cover a change: "exact" is a change HMRC costs (an official costing), "scaled" is in between
 * or near them (scaled from an official costing), "beyond" is far outside what HMRC costs.
 */
export type Fit = "exact" | "scaled" | "beyond";

export interface ReckonerCost {
  lever: string;
  /** £ a year raised (positive) or lost, in HMRC's three years from the change (2026-27, 2027-28, 2028-29 for a change from April 2026). */
  raises: number[];
  fit: Fit;
  /** The OBR forecast line that carries it on (forecasts/obr-2026-10.yaml). */
  receipts: string;
  /** Scaled from the OBR's forecast with no allowance for responses, rather than HMRC's costing. */
  static?: boolean;
}

/** A single-figure line is trusted for up to this many times the change HMRC costs, unless the line says otherwise. */
const STRETCH = 3;

/** What changing a lever by `delta` (in its own units) raises, from HMRC's figures. */
export function reckon(id: string, delta: number): ReckonerCost {
  const line = RECKONER[id];
  if (!line) throw new Error(`No ready reckoner line for ${id}`);
  if (Math.abs(delta) < 1e-12) return { lever: id, raises: [0, 0, 0], fit: "exact", receipts: line.receipts };
  let points = line.points.filter((p) => Math.sign(p.change) === Math.sign(delta));
  let mirrored = false;
  if (!points.length) {
    // HMRC costs only the other direction: the mirror image (exact when HMRC words it as a "change" either way).
    points = line.points.filter((p) => Math.sign(p.change) !== Math.sign(delta)).map((p) => ({ change: -p.change, raises: p.raises.map((x) => -x) }));
    mirrored = !line.symmetric;
  }
  points.sort((a, b) => Math.abs(a.change) - Math.abs(b.change));
  const size = Math.abs(delta);
  // Straight lines from no change through each of HMRC's points; past the last, the last line carries on.
  const path: Point[] = [{ change: 0, raises: [0, 0, 0] }, ...points];
  let k = path.findIndex((p, i) => i > 0 && size <= Math.abs(p.change) + 1e-12);
  if (k < 0) k = path.length - 1;
  const lo = path[k - 1]!, hi = path[k]!;
  const t = (size - Math.abs(lo.change)) / (Math.abs(hi.change) - Math.abs(lo.change));
  const raises = hi.raises.map((h, y) => (lo.raises[y]! + t * (h - lo.raises[y]!)) * 1e6);
  const largest = Math.abs(points[points.length - 1]!.change);
  const exact = !mirrored && points.some((p) => Math.abs(Math.abs(p.change) - size) < 1e-9);
  const reach = line.trusted_to ?? largest * (points.length === 1 ? STRETCH : 1);
  const fit: Fit = exact ? "exact" : size <= reach + 1e-9 ? "scaled" : "beyond";
  return { lever: id, raises, fit, receipts: line.receipts };
}

/**
 * Taxes HMRC's ready reckoner doesn't cost, costed instead by scaling the OBR's receipts forecast (the sum of `receipts`)
 * by the change: static, as nobody's response is allowed for. Carried on by the first series. `trusted_to` is our
 * judgement of how far a straight scaling holds.
 */
const SCALED: Record<string, { receipts: string[]; trusted_to: number }> = {
  business_rates: { receipts: ["business_rates", "ni_business_rates"], trusted_to: 0.1 },
};
const FORECAST_SERIES = forecast as { years: string[]; series: Record<string, { values: number[] }> };

/** What a change of `delta` (a share of today's bills) in a tax costed from the OBR's forecast raises, static. */
export function scaled(id: string, delta: number): ReckonerCost {
  const s = SCALED[id]!;
  const first = FORECAST_SERIES.years.indexOf(RECKONER_YEARS[0]!);
  const raises = [0, 1, 2].map((y) => delta * s.receipts.reduce((t, name) => t + FORECAST_SERIES.series[name]!.values[first + y]!, 0) * 1e9);
  return { lever: id, raises, fit: Math.abs(delta) <= s.trusted_to + 1e-9 ? "scaled" : "beyond", receipts: s.receipts[0]!, static: true };
}

/** Every tax costed outside the household model (HMRC's ready reckoner, or the OBR's forecast scaled) that differs between two sets of rules. */
export function reckonerCosts(before: RuleSet, after: RuleSet): ReckonerCost[] {
  const out: ReckonerCost[] = [];
  for (const id of [...Object.keys(RECKONER), ...Object.keys(SCALED)]) {
    const delta = (LEVER[id]!.get(after) as number) - (LEVER[id]!.get(before) as number);
    if (Math.abs(delta) > 1e-12) out.push(id in SCALED ? scaled(id, delta) : reckon(id, delta));
  }
  return out;
}

export const isReckonerLever = (id: string) => id in RECKONER || id in SCALED;
/** Costed by scaling the OBR's forecast, static (not from HMRC's costings, which allow for responses). */
export const isScaledLever = (id: string) => id in SCALED;
