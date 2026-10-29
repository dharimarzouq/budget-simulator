// Costs policies off the main thread, so the page never freezes. For each policy it sends the static costing and
// winners and losers first, then each change on its own, then the behavioural figures, which take longer. Only the
// latest request is finished.
import { ruleSet } from "./engine";
import { decodePopulation, type Population } from "./population";
import { behaviouralEffect, difference, firstYear, marginalRatesFor, netRevenue, run, type Behaviour, type Effects, type Run } from "./policy/costing";
import { isReckonerLever, reckonerCosts, type ReckonerCost } from "./policy/reckoner";
import { indirectByTenth, sharedOut } from "./policy/indirect";
import { distribution, type Distribution } from "./policy/distribution";
import { applyPolicy, effectiveChanges, type Policy } from "./policy/policy";

export type Request = { type: "load"; url: string } | { type: "cost"; id: number; policy: Policy };

export type Reply =
  | { type: "ready"; units: number; households: number }
  | { type: "static"; id: number; change: Effects; reckoner: ReckonerCost[]; netRevenue: number; distribution: Distribution }
  | { type: "levers"; id: number; perLever: { lever: string; netRevenue: number }[]; interaction: number }
  | { type: "behaviour"; id: number; behaviour: Behaviour }
  /** How far through the behavioural figure, 0 to 1. */
  | { type: "progress"; id: number; done: number }
  /** While the population loads, what's happening. */
  | { type: "loading"; stage: string }
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
      const reformedRules = applyPolicy(rules, changes);
      // The package as a whole first: one run of the population (not needed if only taxes it doesn't cover change).
      const household = changes.filter((c) => !isReckonerLever(c.lever));
      const reformed = household.length ? run(pop, reformedRules) : base;
      const change = difference(reformed.totals, base.totals);
      // A setting the engine can't work with should say so, never show up as "NaN".
      const broken = Object.entries(change).filter(([, v]) => !Number.isFinite(v)).map(([k]) => k);
      if (broken.length) throw new Error(`these settings give a result that can't be worked out (${broken.join(", ")}). Please report it.`);
      const reckoner = reckonerCosts(rules, reformedRules);
      const total = netRevenue(change) + firstYear(reckoner);
      // VAT and duties shared out to households by income tenth, as the ONS finds they pay them now.
      const indirect = reckoner.some((c) => sharedOut(c.lever)) ? indirectByTenth(reckoner) : undefined;
      post({ type: "static", id, change, reckoner, netRevenue: total, distribution: distribution(pop, base, reformed, indirect) });
      await tick(); // let a newer request in before the slower parts
      if (latest) continue;
      // Then each change on its own, one run each, stopping if a newer request comes in.
      const perLever: { lever: string; netRevenue: number }[] = [];
      if (changes.length === 1) perLever.push({ lever: changes[0]!.lever, netRevenue: total });
      else {
        for (const ch of changes) {
          const own = isReckonerLever(ch.lever)
            ? firstYear(reckonerCosts(rules, applyPolicy(rules, [ch])))
            : netRevenue(difference(run(pop, applyPolicy(rules, [ch])).totals, base.totals));
          perLever.push({ lever: ch.lever, netRevenue: own });
          await tick();
          if (latest) break;
        }
        if (latest) continue;
      }
      post({ type: "levers", id, perLever, interaction: total - perLever.reduce((s, l) => s + l.netRevenue, 0) });
      await tick();
      if (latest) continue;
      // HMRC's costings already allow for responses: only the household model's changes need working out.
      if (!household.length) {
        post({ type: "behaviour", id, behaviour: { central: 0, low: 0, high: 0 } });
        continue;
      }
      // The first time, today's marginal rates have to be worked out too: that's the first half of the progress.
      const first = !baseRates;
      const report = (from: number, size: number) => (done: number) => post({ type: "progress", id, done: from + done * size });
      baseRates ??= marginalRatesFor(pop, rules, report(0, 0.5));
      await tick();
      if (latest) continue;
      const b = behaviouralEffect(pop, rules, reformedRules, baseRates, first ? report(0.5, 0.5) : report(0, 1));
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
      post({ type: "loading", stage: `Working out today's figures for ${pop.units.length.toLocaleString("en-GB")} made-up families…` });
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
