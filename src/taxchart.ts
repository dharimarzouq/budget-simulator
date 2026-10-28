// The live tax chart: one made-up person's marginal (or average) tax rate across incomes, today and under the
// budget. It's one person, not the whole population, so it redraws on every slider movement without the worker.
import { adult, calculate, household, type Household, type RuleSet } from "./engine";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (r: number) => `${(r * 100).toFixed(1)}%`;
const pounds = (n: number) => `£${Math.round(Math.abs(n)).toLocaleString("en-GB")}`;

const PEOPLE = {
  employee: { label: "Employee, England", income: "Pay", make: (x: number) => household({ adults: [adult({ employment: x })] }) },
  scotland: { label: "Employee, Scotland", income: "Pay", make: (x: number) => household({ region: "scotland", adults: [adult({ employment: x })] }) },
  self: { label: "Self-employed, England", income: "Profits", make: (x: number) => household({ adults: [adult({ selfEmployment: x })] }) },
  pensioner: { label: "Pensioner, England", income: "Pension", make: (x: number) => household({ adults: [adult({ age: 70, pension: x })] }) },
} satisfies Record<string, { label: string; income: string; make: (x: number) => Household }>;
type Person = keyof typeof PEOPLE;

const MAX = 200000;
const STEP = 500;

/** Income tax plus the person's own National Insurance. No benefits, no children, nothing else. */
function taxes(h: Household, r: RuleSet): number {
  const a = calculate(h, r).adults[0]!;
  return a.incomeTax + a.employeeNI + a.selfEmployedNI;
}

/** Tax at each income from £0 to £200,000 in £500 steps. */
function curve(person: Person, r: RuleSet): number[] {
  const out: number[] = [];
  for (let x = 0; x <= MAX + STEP; x += STEP) out.push(taxes(PEOPLE[person].make(x), r));
  return out;
}

export function initTaxChart(el: HTMLElement, rules: RuleSet, reformed: () => RuleSet): () => void {
  let person: Person = "employee";
  let mode: "marginal" | "average" = "marginal";
  let today = curve(person, rules);

  el.innerHTML = `
    <div class="chart-controls">
      <label>Who <select data-person>${Object.entries(PEOPLE).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join("")}</select></label>
      <div class="toggle" role="group" aria-label="Show">
        <button type="button" data-rate="marginal" aria-pressed="true">Marginal rate</button>
        <button type="button" data-rate="average" aria-pressed="false">Average rate</button>
      </div>
    </div>
    <p class="small" data-explain></p>
    <div class="legend small"><span class="key key-today"></span> Today <span class="key key-budget"></span> Your budget</div>
    <div class="chart" data-chart></div>`;
  const chart = el.querySelector<HTMLElement>("[data-chart]")!;

  const draw = () => {
    const budget = curve(person, reformed());
    const p = PEOPLE[person];
    el.querySelector("[data-explain]")!.textContent =
      mode === "marginal"
        ? `Share of the next pound of ${p.income.toLowerCase()} that goes in income tax and National Insurance, for one person with no other income, no partner or children, and no benefits.`
        : `Share of all their ${p.income.toLowerCase()} that goes in income tax and National Insurance, for one person with no other income, no partner or children, and no benefits.`;
    const n = MAX / STEP + 1;
    const rate = (t: number[], i: number) => (mode === "marginal" ? (t[i + 1]! - t[i]!) / STEP : i === 0 ? 0 : t[i]! / (i * STEP));
    const a = Array.from({ length: n }, (_, i) => rate(today, i));
    const b = Array.from({ length: n }, (_, i) => rate(budget, i));
    const top = Math.max(0.5, Math.ceil(Math.max(...a, ...b) * 10 - 1e-6) / 10);
    const bottom = Math.min(0, Math.floor(Math.min(...a, ...b) * 10 + 1e-6) / 10);

    const W = 640, H = 300, m = { l: 44, r: 12, t: 12, b: 30 };
    const x = (v: number) => m.l + (v / MAX) * (W - m.l - m.r);
    const y = (v: number) => m.t + ((top - v) / (top - bottom)) * (H - m.t - m.b);
    // Marginal rates are steps: each £500 slice has one rate. Average rates are a smooth line.
    const line = (rs: number[]) =>
      mode === "marginal"
        ? rs.slice(0, -1).map((v, i) => `${x(i * STEP)},${y(v)} ${x((i + 1) * STEP)},${y(v)}`).join(" ")
        : rs.map((v, i) => `${x(i * STEP)},${y(v)}`).join(" ");

    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${mode === "marginal" ? "Marginal" : "Average"} tax rate by ${p.income.toLowerCase()}, today and under your budget">`;
    for (let v = bottom; v <= top + 1e-9; v += 0.1) {
      svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/>`;
      svg += `<text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v * 100)}%</text>`;
    }
    for (let v = 0; v <= MAX; v += 50000) svg += `<text x="${x(v)}" y="${H - 8}" text-anchor="middle">£${v / 1000}k</text>`;
    svg += `<polyline fill="none" stroke="var(--ink-2)" stroke-width="2" stroke-dasharray="5 3" points="${line(a)}"/>`;
    svg += `<polyline fill="none" stroke="var(--series)" stroke-width="2.5" stroke-linejoin="round" points="${line(b)}"/>`;
    svg += `<line data-cross y1="${m.t}" y2="${H - m.b}" stroke="var(--ink-2)" visibility="hidden"/>`;
    svg += `<circle data-dot-a r="4" fill="var(--ink-2)" visibility="hidden"/><circle data-dot-b r="4" fill="var(--series)" stroke="var(--surface)" stroke-width="2" visibility="hidden"/>`;
    svg += `<rect x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent"/></svg>`;

    let table = `<details><summary class="small">Show as a table</summary><table><tr><th class="num">${p.income}</th><th class="num">Today</th><th class="num">Your budget</th><th class="num">Change in take-home, a year</th></tr>`;
    for (let i = 0; i < n; i += 20) {
      table += `<tr><td class="num">${pounds(i * STEP)}</td><td class="num">${pct(a[i]!)}</td><td class="num">${pct(b[i]!)}</td><td class="num">${change(today[i]! - budget[i]!)}</td></tr>`;
    }
    chart.innerHTML = svg + `<div class="tip"></div>` + table + `</table></details>`;

    const svgEl = chart.querySelector("svg")!;
    const tip = chart.querySelector<HTMLElement>(".tip")!;
    const cross = svgEl.querySelector("[data-cross]")!;
    const dotA = svgEl.querySelector("[data-dot-a]")!;
    const dotB = svgEl.querySelector("[data-dot-b]")!;
    const show = (clientX: number) => {
      const box = svgEl.getBoundingClientRect();
      const sx = ((clientX - box.left) / box.width) * W;
      const i = Math.max(0, Math.min(n - 1, Math.round((((sx - m.l) / (W - m.l - m.r)) * MAX) / STEP)));
      const cx = mode === "marginal" ? x(i * STEP + STEP / 2) : x(i * STEP);
      cross.setAttribute("x1", String(cx));
      cross.setAttribute("x2", String(cx));
      dotA.setAttribute("cx", String(cx));
      dotA.setAttribute("cy", String(y(a[i]!)));
      dotB.setAttribute("cx", String(cx));
      dotB.setAttribute("cy", String(y(b[i]!)));
      for (const e of [cross, dotA, dotB]) e.setAttribute("visibility", "visible");
      tip.style.display = "block";
      tip.innerHTML = `${p.income} <strong>${pounds(i * STEP)}</strong><br>Today ${pct(a[i]!)}<br>Your budget <strong>${pct(b[i]!)}</strong><br>${change(today[i]! - budget[i]!)} a year`;
      const left = (cx / W) * box.width;
      tip.style.left = `${left + 12 + tip.offsetWidth > box.width ? left - tip.offsetWidth - 12 : left + 12}px`;
      tip.style.top = `${Math.max(0, (y(Math.max(a[i]!, b[i]!)) / H) * box.height - tip.offsetHeight - 8)}px`;
    };
    svgEl.addEventListener("pointermove", (ev) => show(ev.clientX));
    svgEl.addEventListener("pointerdown", (ev) => show(ev.clientX));
    svgEl.addEventListener("pointerleave", () => {
      for (const e of [cross, dotA, dotB]) e.setAttribute("visibility", "hidden");
      tip.style.display = "none";
    });
  };

  el.querySelector<HTMLSelectElement>("[data-person]")!.addEventListener("change", (ev) => {
    person = (ev.target as HTMLSelectElement).value as Person;
    today = curve(person, rules);
    draw();
  });
  el.querySelectorAll<HTMLButtonElement>("[data-rate]").forEach((btn) =>
    btn.addEventListener("click", () => {
      mode = btn.dataset.rate as typeof mode;
      el.querySelectorAll<HTMLButtonElement>("[data-rate]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      draw();
    }),
  );
  draw();
  return draw;
}

function change(d: number): string {
  if (Math.abs(d) < 0.5) return "No change in take-home";
  return `<span class="${d < 0 ? "neg" : "pos"}">Takes home ${pounds(d)} ${d < 0 ? "less" : "more"}</span>`;
}
