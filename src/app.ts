// The budget page ("workbench"): levers on the left, results on the right, updating as you go.
// Costing runs in a worker: static figures and winners and losers arrive first, the behavioural figure after.
import { calculate, ruleSet } from "./engine";
import { readForm, renderForm, renderResult } from "./calculator";
import { LEVERS, LEVER, type Lever, type LeverValue } from "./policy/levers";
import { applyPolicy, policyFromQuery, policyToQuery, type Policy } from "./policy/policy";
import { CHECK_LABEL, CHECK_MEANING, COSTING_GRADE, GRADE_MEANING, leverCheck, policyCheck, type Check } from "./policy/grades";
import type { Group } from "./policy/distribution";
import type { Reply, Request } from "./costing.worker";

const rules = ruleSet("2026-27");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const $ = (id: string) => document.getElementById(id)!;

// ---- formatting --------------------------------------------------------------------------------
const bn = (x: number, sign = true) => (Math.abs(x) < 5e6 ? "£0.00bn" : `${x < 0 ? "−" : sign && x > 0 ? "+" : ""}£${Math.abs(x / 1e9).toFixed(2)}bn`);
const pounds = (x: number, sign = false) => `${x < 0 ? "−" : sign && x > 0 ? "+" : ""}£${Math.round(Math.abs(x)).toLocaleString("en-GB")}`;
const share = (x: number) => `${Math.round(x * 100)}%`;
const PER: Record<string, string> = { gbp_per_year: "", gbp_per_month: " a month", gbp_per_week: " a week" };

function showValue(l: Lever, v: LeverValue): string {
  if (l.unit === "flag") return v ? "On" : "Off";
  if (l.unit === "rate") return `${+((v as number) * 100).toFixed(2)}%`;
  const n = v as number;
  return `£${n.toLocaleString("en-GB", { maximumFractionDigits: n % 1 ? 2 : 0, minimumFractionDigits: n % 1 ? 2 : 0 })}${PER[l.unit]}`;
}

// ---- the policy, kept in the URL so a budget can be shared -------------------------------------
const policy = new Map<string, LeverValue>(policyFromQuery(location.search.slice(1)).map((c) => [c.lever, c.value]));
const currentPolicy = (): Policy => [...policy].map(([lever, value]) => ({ lever, value })).filter((c) => LEVER[c.lever]!.get(rules) !== c.value);

function setLever(id: string, value: LeverValue | undefined) {
  if (value === undefined || LEVER[id]!.get(rules) === value) policy.delete(id);
  else policy.set(id, value);
  const q = policyToQuery(currentPolicy());
  history.replaceState(null, "", q ? `?${q}` : location.pathname);
  refreshLeverRow(id);
  $("changed-count").textContent = policy.size ? `(${policy.size} changed)` : "";
  requestCosting();
  updateHousehold();
}

// ---- levers ------------------------------------------------------------------------------------
/** Slider range around today's value: ±10 points for rates, 0 to double for amounts. */
function range(l: Lever): { min: number; max: number; step: number; scale: number } {
  const today = l.get(rules) as number;
  if (l.unit === "rate") return { min: Math.max(0, Math.round(today * 100) - 10), max: Math.min(100, Math.round(today * 100) + 10), step: 0.5, scale: 100 };
  return { min: 0, max: Math.max(today * 2, l.step * 20), step: l.step, scale: 1 };
}

function leverRow(l: Lever): string {
  const today = l.get(rules);
  const v = policy.get(l.id) ?? today;
  const name = `<div class="name"><span title="${esc(l.note ?? "")}">${esc(l.label)}</span><span class="today">today ${esc(showValue(l, today))}</span></div>`;
  const undo = `<button type="button" class="undo" data-undo="${l.id}" aria-label="Reset ${esc(l.label)}" title="Back to today's value">×</button>`;
  if (l.unit === "flag") {
    return `<div class="lever" data-id="${l.id}">${name}<label class="check flag"><input type="checkbox" data-flag="${l.id}"${v ? " checked" : ""}> ${esc(l.label)} in force</label>${undo}</div>`;
  }
  const { min, max, step, scale } = range(l);
  const shown = +((v as number) * scale).toFixed(4);
  return `<div class="lever" data-id="${l.id}">${name}
    <input type="range" min="${min}" max="${max}" step="${step}" value="${shown}" data-range="${l.id}" aria-label="${esc(l.label)}">
    <input type="number" step="${step}" value="${shown}" data-number="${l.id}" aria-label="${esc(l.label)}${l.unit === "rate" ? ", %" : ", £"}">
    ${undo}</div>`;
}

function renderLevers() {
  const groups = [...new Set(LEVERS.map((l) => l.group))];
  $("levers").innerHTML = groups
    .map((g, i) => `<details class="group"${i === 0 || LEVERS.some((l) => l.group === g && policy.has(l.id)) ? " open" : ""}><summary>${esc(g)}</summary>
      ${LEVERS.filter((l) => l.group === g).map(leverRow).join("")}</details>`)
    .join("");
  for (const id of policy.keys()) refreshLeverRow(id);
  $("changed-count").textContent = policy.size ? `(${policy.size} changed)` : "";
}

function refreshLeverRow(id: string) {
  const row = document.querySelector<HTMLElement>(`.lever[data-id="${id}"]`);
  if (!row) return;
  const l = LEVER[id]!;
  const v = policy.get(id) ?? l.get(rules);
  row.classList.toggle("changed", policy.has(id));
  if (l.unit === "flag") (row.querySelector("[data-flag]") as HTMLInputElement).checked = Boolean(v);
  else {
    const shown = String(+((v as number) * range(l).scale).toFixed(4));
    for (const sel of ["[data-range]", "[data-number]"]) {
      const input = row.querySelector(sel) as HTMLInputElement;
      if (document.activeElement !== input) input.value = shown;
    }
  }
}

function filterLevers() {
  const q = (($("lever-search") as HTMLInputElement).value || "").toLowerCase();
  const changedOnly = ($("changed-only") as HTMLInputElement).checked;
  document.querySelectorAll<HTMLElement>(".lever").forEach((row) => {
    const l = LEVER[row.dataset.id!]!;
    const hit = (!q || `${l.label} ${l.group} ${l.note ?? ""} ${l.id.replace(/_/g, " ")}`.toLowerCase().includes(q)) && (!changedOnly || policy.has(l.id));
    row.hidden = !hit;
  });
  document.querySelectorAll<HTMLDetailsElement>(".group").forEach((g) => {
    const any = [...g.querySelectorAll<HTMLElement>(".lever")].some((r) => !r.hidden);
    g.hidden = !any;
    if ((q || changedOnly) && any) g.open = true;
  });
}

function wireLevers() {
  const panel = $("levers");
  panel.addEventListener("input", (ev) => {
    const t = ev.target as HTMLInputElement;
    const id = t.dataset.range ?? t.dataset.number;
    if (id) {
      const l = LEVER[id]!;
      const n = Number(t.value);
      if (t.value === "" || !Number.isFinite(n) || n < 0) return;
      const value = l.unit === "rate" ? Math.round(Math.min(n, 100) * 100) / 10000 : n;
      // Keep the twin control in step while typing or dragging.
      const twin = t.dataset.range ? t.parentElement!.querySelector<HTMLInputElement>("[data-number]") : t.parentElement!.querySelector<HTMLInputElement>("[data-range]");
      if (twin) twin.value = t.value;
      setLever(id, value);
    }
    if (t.dataset.flag) setLever(t.dataset.flag, t.checked);
  });
  panel.addEventListener("click", (ev) => {
    const id = (ev.target as HTMLElement).dataset.undo;
    if (id) setLever(id, undefined);
  });
  $("lever-search").addEventListener("input", filterLevers);
  $("changed-only").addEventListener("change", filterLevers);
  $("reset").addEventListener("click", () => {
    for (const id of [...policy.keys()]) setLever(id, undefined);
  });
  $("share").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      ($("share") as HTMLButtonElement).textContent = "Link copied";
    } catch {
      ($("share") as HTMLButtonElement).textContent = "Copy the address bar to share";
    }
    setTimeout(() => (($("share") as HTMLButtonElement).textContent = "Copy link to this budget"), 2000);
  });
  if (window.matchMedia("(max-width: 900px)").matches) ($("levers-drawer") as HTMLDetailsElement).open = false;
}

// ---- costing, via the worker -------------------------------------------------------------------
const worker = new Worker(new URL("./costing.worker.ts", import.meta.url), { type: "module" });
let requestId = 0;
let lastStatic: Extract<Reply, { type: "static" }> | undefined;
let timer: number | undefined;
let ready = false;

function requestCosting() {
  clearTimeout(timer);
  timer = window.setTimeout(() => {
    if (!ready) return;
    $("results").classList.add("pending");
    worker.postMessage({ type: "cost", id: ++requestId, policy: currentPolicy() } satisfies Request);
  }, 120);
}

worker.onmessage = (ev: MessageEvent<Reply>) => {
  const m = ev.data;
  if (m.type === "error") {
    $("headline").innerHTML = `<div class="empty">Something went wrong working out the costing: ${esc(m.message)}</div>`;
    return;
  }
  if (m.type === "ready") {
    ready = true;
    requestCosting();
    return;
  }
  if (m.id !== requestId) return; // an older request; a newer one is on its way
  if (m.type === "static") {
    lastStatic = m;
    $("results").classList.remove("pending");
    renderHeadline(m, undefined);
    renderBreakdown(m);
    renderWinners(m.distribution.deciles, m.distribution.familyTypes, m.distribution.regions, m.distribution.all);
  } else if (m.type === "behaviour" && lastStatic) {
    renderHeadline(lastStatic, m.behaviour);
  }
};
worker.postMessage({ type: "load", url: new URL("./data/population-2026-27.json", location.href).href } satisfies Request);

// ---- results -----------------------------------------------------------------------------------
type Static = Extract<Reply, { type: "static" }>;
type BehaviourFigures = Extract<Reply, { type: "behaviour" }>["behaviour"];

const SOURCES = {
  rr: `<a href="https://www.gov.uk/government/statistics/direct-effects-of-illustrative-tax-changes">HMRC's ready reckoner</a>`,
  sfc: `<a href="https://gov.scot/publications/scottish-income-tax-ready-reckoners-2022-23">the Scottish Fiscal Commission's elasticities</a>`,
  how: `<a href="./how.html">How we know</a>`,
};

function checkBadge(c: Check) {
  return `<span class="check-badge check-${c}" title="${esc(CHECK_MEANING[c])}">${CHECK_LABEL[c]}</span>`;
}

function renderHeadline(s: Static, b: BehaviourFigures | undefined) {
  const changes = currentPolicy();
  if (!changes.length) {
    $("headline").innerHTML = `<div class="empty">This is the budget as it stands for 2026-27. Change a lever on the left to see what it raises or costs, and who gains and loses.</div>`;
    return;
  }
  const check = policyCheck(changes);
  const raised = (x: number) => `<span class="${x < 0 ? "neg" : "pos"}">${bn(x)}</span>`;
  const behaviour = !b
    ? `<div class="value small">working it out…</div><div class="sub">takes a few seconds</div>`
    : b.low === 0 && b.high === 0
      ? `<div class="value">${raised(s.netRevenue)}</div><div class="sub">no tax rates change; benefits are costed static</div>`
      : `<div class="value">${raised(s.netRevenue + b.central)}</div><div class="sub">range ${bn(s.netRevenue + Math.min(b.low, b.high), false)} to ${bn(s.netRevenue + Math.max(b.low, b.high), false)}</div>`;
  const all = s.distribution.all;
  $("headline").innerHTML = `
    <div class="metric"><div class="label">Raised a year, nobody responding (static)</div><div class="value">${raised(s.netRevenue)}</div><div class="sub">positive raises money, negative costs it</div></div>
    <div class="metric"><div class="label">Allowing for how people respond</div>${behaviour}</div>
    <div class="metric"><div class="label">Households losing / gaining</div><div class="value">${share(all.lose)} / ${share(all.gain)}</div><div class="sub">by more than £1 a week</div></div>
    <div class="metric"><div class="label">How far to trust it</div><div class="value"><span class="grade" title="${esc(GRADE_MEANING[COSTING_GRADE])}">${COSTING_GRADE}</span> ${checkBadge(check)}</div><div class="sub">grade B: our microsimulation; checks against HMRC: ${CHECK_LABEL[check]}</div></div>`;
}

const EFFECTS: [keyof Static["change"], string, 1 | -1][] = [
  ["incomeTax", "Income tax", 1], ["employeeNI", "Employee National Insurance", 1], ["employerNI", "Employer National Insurance", 1],
  ["selfEmployedNI", "Self-employed National Insurance", 1], ["childBenefitCharge", "Child Benefit charge", 1],
  ["childBenefit", "Child Benefit (spending)", -1], ["universalCredit", "Universal Credit (spending)", -1],
];

function renderBreakdown(s: Static) {
  const changes = currentPolicy();
  if (!changes.length) {
    $("breakdown").innerHTML = `<p class="small">Nothing changed yet.</p>`;
    return;
  }
  const signed = (x: number) => `<td class="num ${x < -5e5 ? "neg" : x > 5e5 ? "pos" : ""}">${bn(x)}</td>`;
  let html = `<div class="two"><table><tr><th>Effect on the public finances</th><th class="num">£ a year</th></tr>`;
  for (const [k, label, sign] of EFFECTS) {
    if (Math.abs(s.change[k]) < 5e5) continue;
    html += `<tr><td>${label}</td>${signed(sign * s.change[k])}</tr>`;
  }
  html += `<tr class="total"><td>Total (static)</td>${signed(s.netRevenue)}</tr></table>`;
  html += `<table><tr><th>Each change on its own</th><th class="num">£ a year</th><th>Checks against HMRC</th></tr>`;
  for (const p of s.perLever) {
    const l = LEVER[p.lever]!;
    const g = leverCheck(p.lever);
    html += `<tr><td>${esc(l.label)}<div class="working">${esc(l.group)}: ${esc(showValue(l, l.get(rules)))} → ${esc(showValue(l, policy.get(p.lever)!))}</div></td>${signed(p.netRevenue)}<td title="${esc(g.why)}">${checkBadge(g.check)}</td></tr>`;
  }
  if (changes.length > 1) html += `<tr><td>Interaction<div class="working">Changes overlap: e.g. a tax rise reduces Universal Credit, a rate rise on a bigger allowance raises less.</div></td>${signed(s.interaction)}<td></td></tr>`;
  html += `</table></div>`;
  html += `<details class="show-working"><summary>Show working</summary>
    <p>Every made-up household is run through the 2026-27 rules twice, as they are and with your changes, and the differences are added up, weighted to stand for the whole UK. "Static" means nobody changes what they earn or claim. The figure allowing for responses uses ${SOURCES.sfc}, rising with income, with a low and high figure at half and one and a half times them. Benefits and employer National Insurance stay static.</p>
    <p>Confidence grade ${COSTING_GRADE}: ${esc(GRADE_MEANING[COSTING_GRADE])} (A would be an official costing, C international evidence, D an informed guess.)</p>
    <p>How each change checks against ${SOURCES.rr} and other published figures:</p>
    <ul>${changes.map((ch) => `<li>${esc(LEVER[ch.lever]!.label)}: ${CHECK_LABEL[leverCheck(ch.lever).check]}. ${esc(leverCheck(ch.lever).why)}</li>`).join("")}</ul>
    <p>Close: ${esc(CHECK_MEANING.close)} Fair: ${esc(CHECK_MEANING.fair)} Known gap: ${esc(CHECK_MEANING.gap)} More in ${SOURCES.how}.</p></details>`;
  $("breakdown").innerHTML = html;
}

let winnersMode: "pounds" | "percent" = "pounds";

function renderWinners(deciles: Group[], family: Group[], regions: Group[], all: Group) {
  if (!currentPolicy().length) {
    $("winners").innerHTML = `<p class="small">Change a lever to see who gains and loses.</p>`;
    return;
  }
  const value = (g: Group) => (winnersMode === "pounds" ? g.meanChange : g.percentOfIncome);
  const fmt = (x: number) => (winnersMode === "pounds" ? pounds(x, true) : `${x > 0 ? "+" : ""}${x.toFixed(2)}%`);
  const W = 640, H = 220, m = { l: 56, r: 8, t: 12, b: 34 };
  const vals = deciles.map(value);
  const hi = Math.max(0, ...vals), lo = Math.min(0, ...vals);
  const span = hi - lo || 1;
  const y = (v: number) => m.t + ((hi - v) / span) * (H - m.t - m.b);
  const bw = (W - m.l - m.r) / 10;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Average change in household income by income tenth">`;
  for (const v of [lo, (lo + hi) / 2, hi]) svg += `<text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
  svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--ink-2)" stroke-width="1"/>`;
  deciles.forEach((g, i) => {
    const v = value(g);
    const top = Math.min(y(v), y(0)), h = Math.max(1, Math.abs(y(v) - y(0)));
    svg += `<rect x="${m.l + i * bw + 4}" y="${top}" width="${bw - 8}" height="${h}" fill="${v < 0 ? "var(--loss)" : "var(--gain)"}"><title>${esc(g.label)}: ${fmt(v)}, ${share(g.lose)} lose, ${share(g.gain)} gain</title></rect>`;
    svg += `<text x="${m.l + i * bw + bw / 2}" y="${H - 18}" text-anchor="middle">${i + 1}</text>`;
  });
  svg += `<text x="${m.l}" y="${H - 2}">poorest tenth</text><text x="${W - m.r}" y="${H - 2}" text-anchor="end">richest tenth</text></svg>`;

  const table = (title: string, groups: Group[]) => `<table><tr><th>${title}</th><th class="num">Average</th><th class="num">% income</th><th class="num">Lose</th><th class="num">Gain</th></tr>
    ${groups.map((g) => `<tr><td>${esc(g.label)}</td><td class="num ${g.meanChange < -26 ? "neg" : g.meanChange > 26 ? "pos" : ""}">${pounds(g.meanChange, true)}</td><td class="num">${g.percentOfIncome.toFixed(2)}%</td><td class="num">${share(g.lose)}</td><td class="num">${share(g.gain)}</td></tr>`).join("")}</table>`;

  $("winners").innerHTML = `
    <div class="toggle" role="group" aria-label="Show change as">
      <button type="button" data-mode="pounds" aria-pressed="${winnersMode === "pounds"}">£ a year</button>
      <button type="button" data-mode="percent" aria-pressed="${winnersMode === "percent"}">% of income</button>
    </div>
    <p class="small">Average change in net household income, by tenth of households ranked by income (adjusted for household size). All households: ${pounds(all.meanChange, true)} a year on average; ${share(all.lose)} lose and ${share(all.gain)} gain more than £1 a week.</p>
    <div class="chart">${svg}</div>
    ${table("By tenth", deciles)}
    <div class="two">${table("By family", family)}${table("By region", regions)}</div>
    <details class="show-working"><summary>Show working</summary>
      <p>Net household income before housing costs: earnings, pensions and other income plus benefits, less income tax, National Insurance, pension contributions and the Child Benefit charge (DWP's HBAI measure, though council tax and some benefits aren't modelled yet). Households are ranked by that income adjusted for their size (the modified OECD scale), before your changes; each tenth holds a tenth of households. Static: nobody's behaviour changes. People outside private households, such as students in halls, are left out, as in DWP's figures. More in ${SOURCES.how}.</p>
    </details>`;
  $("winners").querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((btn) =>
    btn.addEventListener("click", () => {
      winnersMode = btn.dataset.mode as typeof winnersMode;
      renderWinners(deciles, family, regions, all);
    }),
  );
}

// ---- a household like yours --------------------------------------------------------------------
const form = $("form") as HTMLFormElement;
function updateHousehold() {
  const h = readForm(form);
  const reformed = applyPolicy(rules, currentPolicy());
  const before = calculate(h, rules).netIncome;
  const after = calculate(h, reformed).netIncome;
  const d = after - before;
  $("household-change").innerHTML = currentPolicy().length
    ? `<div class="headline"><div>Today<strong>${pounds(before)}</strong></div><div>Under your budget<strong>${pounds(after)}</strong></div><div>Change, a year<strong class="${d < 0 ? "neg" : d > 0 ? "pos" : ""}">${pounds(d, true)}</strong></div></div>`
    : "";
  renderResult($("result"), h, reformed);
}

renderForm(form);
form.addEventListener("input", updateHousehold);
renderLevers();
wireLevers();
updateHousehold();
$("headline").innerHTML = currentPolicy().length
  ? `<div class="empty">Loading 39,000 made-up households to cost your budget…</div>`
  : `<div class="empty">This is the budget as it stands for 2026-27. Change a lever on the left to see what it raises or costs, and who gains and loses.</div>`;
