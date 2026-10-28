// The household calculator: a form, the result with its working, and a marginal rate chart.
import { adult, calculate, child, marginalRate, type Household, type Region, type RuleSet } from "./engine";

const gbp = (n: number, dp = 2) => (n < 0 ? "−" : "") + "£" + Math.abs(n).toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const pct = (r: number) => `${(r * 100).toFixed(1)}%`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const num = (name: string, label: string, value: number, step = 100) =>
  `<label>${label}<input type="number" name="${name}" value="${value}" min="0" step="${step}"></label>`;
const check = (name: string, label: string, checked = false) =>
  `<label class="check"><input type="checkbox" name="${name}"${checked ? " checked" : ""}>${label}</label>`;

function adultFields(i: number, defaults: { age: number; employment: number }) {
  return `
    ${num(`a${i}_age`, "Age", defaults.age, 1)}
    ${num(`a${i}_employment`, "Pay from employment, a year", defaults.employment, 500)}
    ${num(`a${i}_secondJob`, "Pay from a second job, a year", 0, 500)}
    ${num(`a${i}_selfEmployment`, "Self-employment profits, a year", 0, 500)}
    ${num(`a${i}_pension`, "Pension income, a year", 0, 500)}
    ${num(`a${i}_propertyIncome`, "Rental profit, a year", 0, 500)}
    ${num(`a${i}_savingsInterest`, "Savings interest (outside ISAs), a year", 0, 100)}
    ${num(`a${i}_dividends`, "Dividends (outside ISAs), a year", 0, 500)}
    ${num(`a${i}_pensionContributions`, "Own pension contributions, a year", 0, 100)}
    <label>Health condition (Universal Credit)<select name="a${i}_health">
      <option value="none">None</option>
      <option value="lcwra">Can't work, new claim</option>
      <option value="lcwra_protected">Can't work, protected rate</option>
    </select></label>
    ${check(`a${i}_carer`, "Carer for 35+ hours a week")}`;
}

export function renderForm(form: HTMLFormElement) {
  form.innerHTML = `
    <fieldset><legend>Where</legend>
      <label>Nation<select name="region">
        <option value="england">England outside London</option><option value="london">London</option><option value="wales">Wales</option>
        <option value="scotland">Scotland</option><option value="northern_ireland">Northern Ireland</option>
      </select></label>
    </fieldset>
    <fieldset><legend>You</legend>${adultFields(0, { age: 30, employment: 15000 })}</fieldset>
    <fieldset><legend>Partner</legend>
      ${check("partner", "Living with a partner")}
      <div id="partner-fields" hidden>${adultFields(1, { age: 30, employment: 0 })}</div>
    </fieldset>
    <fieldset><legend>Children and home</legend>
      ${num("children", "Children", 1, 1)}
      ${check("pre2017", "Eldest born before 6 April 2017")}
      ${num("rentMonthly", "Rent, a month", 800, 10)}
      ${num("childcareMonthly", "Childcare costs, a month", 0, 10)}
      ${num("savings", "Savings", 0, 500)}
    </fieldset>`;
}

export function readForm(form: HTMLFormElement): Household {
  const f = new FormData(form);
  const n = (k: string) => Math.max(0, Number(f.get(k)) || 0);
  const readAdult = (i: number) =>
    adult({
      age: n(`a${i}_age`),
      employment: n(`a${i}_employment`),
      secondJob: n(`a${i}_secondJob`),
      selfEmployment: n(`a${i}_selfEmployment`),
      pension: n(`a${i}_pension`),
      propertyIncome: n(`a${i}_propertyIncome`),
      savingsInterest: n(`a${i}_savingsInterest`),
      dividends: n(`a${i}_dividends`),
      pensionContributions: n(`a${i}_pensionContributions`),
      health: f.get(`a${i}_health`) as "none" | "lcwra" | "lcwra_protected",
      carer: f.has(`a${i}_carer`),
    });
  const partner = f.has("partner");
  (form.querySelector("#partner-fields") as HTMLElement).hidden = !partner;
  const kids = Math.min(12, Math.floor(n("children")));
  return {
    region: f.get("region") as Region,
    adults: partner ? [readAdult(0), readAdult(1)] : [readAdult(0)],
    children: Array.from({ length: kids }, (_, i) => child({ bornBefore2017: i === 0 && f.has("pre2017") })),
    rentMonthly: n("rentMonthly"),
    childcareMonthly: n("childcareMonthly"),
    savings: n("savings"),
  };
}

function row(label: string, amount: number, working: string, cls = "") {
  return `<tr class="${cls}"><td>${esc(label)}${working ? `<div class="working">${esc(working)}</div>` : ""}</td><td class="num">${gbp(amount)}</td></tr>`;
}

export function renderResult(el: HTMLElement, h: Household, r: RuleSet) {
  const res = calculate(h, r);
  const mr = marginalRate(h, r);
  let html = `<div class="headline">
      <div>Net income, a year<strong>${gbp(res.netIncome, 0)}</strong></div>
      <div>Net income, a month<strong>${gbp(res.netIncome / 12, 0)}</strong></div>
      <div>Keeps of the next £1,000 earned<strong>${gbp(1000 * (1 - mr), 0)}</strong></div>
    </div>`;

  html += `<table><tr><th>A year</th><th class="num">£</th></tr>`;
  for (const line of res.lines) html += row(line.label, line.amount, line.working);
  html += row("Net income", res.netIncome, "", "total") + `</table>`;

  res.adults.forEach((a, i) => {
    html += `<h3>${res.adults.length > 1 ? (i === 0 ? "You" : "Partner") : "Tax working"}</h3><table>`;
    for (const line of a.lines) html += row(line.label, line.amount, line.working);
    if (a.employerNI) html += row("Employer National Insurance (paid on top of pay)", a.employerNI, a.employerNIWorking);
    html += `</table>`;
  });

  const uc = res.universalCredit;
  if (uc.elements.length) {
    html += `<h3>Universal Credit, a month</h3><table>`;
    for (const e of uc.elements) html += row(e.label, e.amount, e.working);
    html += row("Maximum", uc.maximum, "", "total");
    html += row("Earnings after tax and NI", uc.earnings, "");
    html += row("Work allowance", uc.workAllowance, uc.workAllowance ? "Earnings up to this don't reduce Universal Credit." : "None: only for households with children or a health condition.");
    html += row("Taper deduction", -uc.taperDeduction, `${pct(r.uc.taperRate)} of earnings above the work allowance.`);
    if (uc.unearnedIncome) html += row("Pension income", -uc.unearnedIncome, "Counted in full, before tax.");
    if (uc.savingsIncome) html += row("Assumed income from savings", -uc.savingsIncome, "");
    html += row("Benefit cap", -uc.benefitCap.reduction, uc.benefitCap.working);
    html += row("Universal Credit", uc.award, "", "total") + `</table>`;
  }

  html += `<h3>Marginal rate as your pay changes</h3>
    <p class="small">Share of the next £1,000 of pay lost to tax, National Insurance, the Child Benefit charge and Universal Credit withdrawal, with everything else held as entered.</p>
    <div class="chart" id="mr-chart"></div>`;
  el.innerHTML = html;
  drawChart(el.querySelector("#mr-chart")!, h, r);
}

function drawChart(el: HTMLElement, h: Household, r: RuleSet) {
  const maxPay = 150000;
  const stepPay = 500;
  const pts: { pay: number; rate: number; net: number }[] = [];
  for (let pay = 0; pay <= maxPay; pay += stepPay) {
    const hh = withPay(h, pay);
    pts.push({ pay, rate: marginalRate(hh, r), net: calculate(hh, r).netIncome });
  }
  // Axis in whole 20% steps; the small allowance stops float noise like -0.0000001 adding a step.
  const yMin = Math.min(0, Math.floor(Math.min(...pts.map((p) => p.rate)) * 5 + 1e-6) / 5);
  const yMax = Math.max(1, Math.ceil(Math.max(...pts.map((p) => p.rate)) * 5 - 1e-6) / 5);

  const W = 640, H = 300, m = { l: 44, r: 12, t: 12, b: 32 };
  const x = (pay: number) => m.l + (pay / maxPay) * (W - m.l - m.r);
  const y = (rate: number) => m.t + ((yMax - rate) / (yMax - yMin)) * (H - m.t - m.b);

  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Marginal rate by pay from £0 to £150,000">`;
  for (let v = yMin; v <= yMax + 1e-9; v += 0.2) {
    svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)" stroke-width="1"/>`;
    svg += `<text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v * 100)}%</text>`;
  }
  for (let p = 0; p <= maxPay; p += 25000) {
    svg += `<text x="${x(p)}" y="${H - 10}" text-anchor="middle">£${p / 1000}k</text>`;
  }
  svg += `<polyline fill="none" stroke="var(--series)" stroke-width="2" stroke-linejoin="round" points="${pts.map((p) => `${x(p.pay)},${y(p.rate)}`).join(" ")}"/>`;

  const current = h.adults[0].employment;
  if (current <= maxPay) {
    const rate = marginalRate(h, r);
    svg += `<circle cx="${x(current)}" cy="${y(rate)}" r="5" fill="var(--series)" stroke="var(--surface)" stroke-width="2"/>`;
    svg += `<text x="${x(current) + 8}" y="${y(rate) - 8}" style="fill: var(--ink)">You: ${pct(rate)}</text>`;
  }
  svg += `<line id="cross" y1="${m.t}" y2="${H - m.b}" stroke="var(--ink-2)" stroke-width="1" visibility="hidden"/>`;
  svg += `<rect x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent"/></svg>`;

  let table = `<details><summary class="small">Show as a table</summary><table><tr><th class="num">Pay</th><th class="num">Marginal rate</th><th class="num">Net income</th></tr>`;
  for (const p of pts.filter((p) => p.pay % 10000 === 0)) {
    table += `<tr><td class="num">${gbp(p.pay, 0)}</td><td class="num">${pct(p.rate)}</td><td class="num">${gbp(p.net, 0)}</td></tr>`;
  }
  el.innerHTML = svg + `<div class="tip"></div>` + table + `</table></details>`;

  const svgEl = el.querySelector("svg")!;
  const cross = el.querySelector("#cross")!;
  const tip = el.querySelector(".tip") as HTMLElement;
  svgEl.addEventListener("pointermove", (ev) => {
    const box = svgEl.getBoundingClientRect();
    const sx = ((ev.clientX - box.left) / box.width) * W;
    const pay = Math.round((((sx - m.l) / (W - m.l - m.r)) * maxPay) / stepPay) * stepPay;
    const p = pts[Math.max(0, Math.min(pts.length - 1, pay / stepPay))];
    if (!p) return;
    cross.setAttribute("x1", String(x(p.pay)));
    cross.setAttribute("x2", String(x(p.pay)));
    cross.setAttribute("visibility", "visible");
    tip.style.display = "block";
    tip.innerHTML = `Pay ${gbp(p.pay, 0)}<br>Marginal rate <strong>${pct(p.rate)}</strong><br>Net income ${gbp(p.net, 0)}`;
    const left = (x(p.pay) / W) * box.width;
    tip.style.left = `${Math.min(left + 12, box.width - tip.offsetWidth)}px`;
    tip.style.top = `${(y(p.rate) / H) * box.height - tip.offsetHeight - 8}px`;
  });
  svgEl.addEventListener("pointerleave", () => {
    cross.setAttribute("visibility", "hidden");
    tip.style.display = "none";
  });
}

function withPay(h: Household, pay: number): Household {
  const [first, ...rest] = h.adults;
  return { ...h, adults: [{ ...first, employment: pay }, ...rest] as Household["adults"] };
}
