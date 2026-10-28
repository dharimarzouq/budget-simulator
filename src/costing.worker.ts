// Costs policies off the main thread, so the page never freezes. For each policy it sends the static costing and
// winners and losers first, then each change on its own, then the behavioural figures, which take longer. Only the
// latest request is finished.
import { ruleSet } from "./engine";
import { decodePopulation, type Population } from "./population";
import { behaviouralEffect, difference, marginalRatesFor, netRevenue, run, type Behaviour, type Effects, type Run } from "./policy/costing";
import { distribution, type Distribution } from "./policy/distribution";
import { applyPolicy, effectiveChanges, type Policy } from "./policy/policy";

export type Request = { type: "load"; url: string } | { type: "cost"; id: number; policy: Policy };

export type Reply =
  | { type: "ready"; units: number; households: number }
  | { type: "static"; id: number; change: Effects; netRevenue: number; distribution: Distribution }
  | { type: "levers"; id: number; perLever: { lever: string; netRevenue: number }[]; interaction: number }
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
      // The package as a whole first: one run of the population.
      const reformed = changes.length ? run(pop, applyPolicy(rules, changes)) : base;
      const change = difference(reformed.totals, base.totals);
      // A setting the engine can't work with should say so, never show up as "NaN".
      const broken = Object.entries(change).filter(([, v]) => !Number.isFinite(v)).map(([k]) => k);
      if (broken.length) throw new Error(`these settings give a result that can't be worked out (${broken.join(", ")}). Please report it.`);
      const total = netRevenue(change);
      post({ type: "static", id, change, netRevenue: total, distribution: distribution(pop, base, reformed) });
      await tick(); // let a newer request in before the slower parts
      if (latest) continue;
      // Then each change on its own, one run each, stopping if a newer request comes in.
      const perLever: { lever: string; netRevenue: number }[] = [];
      if (changes.length === 1) perLever.push({ lever: changes[0]!.lever, netRevenue: total });
      else {
        for (const ch of changes) {
          perLever.push({ lever: ch.lever, netRevenue: netRevenue(difference(run(pop, applyPolicy(rules, [ch])).totals, base.totals)) });
          await tick();
          if (latest) break;
        }
        if (latest) continue;
      }
      post({ type: "levers", id, perLever, interaction: total - perLever.reduce((s, l) => s + l.netRevenue, 0) });
      await tick();
      if (latest) continue;
      baseRates ??= marginalRatesFor(pop, rules);
      await tick();
      if (latest) continue;
      const b = changes.length ? behaviouralEffect(pop, rules, applyPolicy(rules, changes), baseRates) : { central: 0, low: 0, high: 0 };
      if (![b.central, b.low, b.high].every(Number.isFinite)) throw new Error("these settings give a behavioural figure that can't be worked out. Please report it.");
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
