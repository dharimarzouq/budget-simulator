// Costs policies off the main thread, so the page never freezes. For each policy it sends the static costing and
// winners and losers first, then the behavioural figures, which take longer. Only the latest request is finished.
import { ruleSet } from "./engine";
import { decodePopulation, type Population } from "./population";
import { behaviouralEffect, costPolicy, marginalRatesFor, run, type Behaviour, type Effects, type Run } from "./policy/costing";
import { distribution, type Distribution } from "./policy/distribution";
import { applyPolicy, effectiveChanges, type Policy } from "./policy/policy";

export type Request = { type: "load"; url: string } | { type: "cost"; id: number; policy: Policy };

export type Reply =
  | { type: "ready"; units: number; households: number }
  | { type: "static"; id: number; change: Effects; netRevenue: number; perLever: { lever: string; netRevenue: number }[]; interaction: number; distribution: Distribution }
  | { type: "behaviour"; id: number; behaviour: Behaviour }
  | { type: "error"; message: string };

const rules = ruleSet("2026-27");
let pop: Population | undefined;
let base: Run | undefined;
let baseRates: ReturnType<typeof marginalRatesFor> | undefined;
let latest: { id: number; policy: Policy } | undefined;
let busy = false;

const post = (r: Reply) => (self as unknown as Worker).postMessage(r);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function work() {
  if (busy || !pop || !base) return;
  busy = true;
  try {
    while (latest) {
      const { id, policy } = latest;
      latest = undefined;
      const changes = effectiveChanges(rules, policy);
      const c = costPolicy(pop, rules, changes, base, { behaviour: false });
      post({ type: "static", id, change: c.change, netRevenue: c.netRevenue, perLever: c.perLever, interaction: c.interaction, distribution: distribution(pop, base, c.reformed) });
      await tick(); // let a newer request in before the slower part
      if (latest) continue;
      baseRates ??= marginalRatesFor(pop, rules);
      await tick();
      if (latest) continue;
      const b = changes.length ? behaviouralEffect(pop, rules, applyPolicy(rules, changes), baseRates) : { central: 0, low: 0, high: 0 };
      if (!latest) post({ type: "behaviour", id, behaviour: { central: b.central, low: b.low, high: b.high } });
    }
  } catch (e) {
    post({ type: "error", message: String(e) });
  } finally {
    busy = false;
  }
}

self.onmessage = async (ev: MessageEvent<Request>) => {
  const msg = ev.data;
  if (msg.type === "load") {
    try {
      const res = await fetch(msg.url);
      if (!res.ok) throw new Error(`Couldn't load the population (${res.status})`);
      pop = decodePopulation(await res.json());
      base = run(pop, rules);
      post({ type: "ready", units: pop.units.length, households: new Set(pop.units.filter((u) => !u.outside).map((u) => u.household)).size });
      void work();
    } catch (e) {
      post({ type: "error", message: String(e) });
    }
  } else {
    latest = { id: msg.id, policy: msg.policy };
    void work();
  }
};
