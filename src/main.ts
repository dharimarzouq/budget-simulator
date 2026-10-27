import { checkRules, rules, sources } from "./rules";
import type { Parameter } from "./rules/schema";
import { ruleSet } from "./engine";
import { readForm, renderForm, renderResult } from "./calculator";
import { loadPopulation, populationTotals } from "./population";

const gbp = (n: number) => "£" + n.toLocaleString("en-GB", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const pct = (n: number) => `${+(n * 100).toFixed(2)}%`;
const PER = { gbp: "", gbp_per_year: " a year", gbp_per_month: " a month", gbp_per_week: " a week", gbp_per_hour: " an hour" } as const;
// Rules that are lump sums of billions read better in billions.
const money = (n: number) => (n >= 1e8 ? `£${+(n / 1e9).toFixed(2)}bn` : gbp(n));
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

function show(p: Parameter): string {
  if (p.bands) return p.bands.map((b) => `${pct(b.rate)} from ${gbp(b.threshold)}`).join("<br>");
  if (p.unit === "flag") return p.value ? "Yes" : "No";
  if (p.unit === "rate") return pct(p.value as number);
  if (p.unit === "years") return `${p.value} years`;
  if (p.unit === "hours_per_week") return `${p.value} hours a week`;
  return money(p.value as number) + PER[p.unit];
}

function renderRules(el: HTMLElement) {
  const problems = checkRules();
  let html = problems.length ? `<p><strong>Problems in the rules files:</strong><br>${problems.map(esc).join("<br>")}</p>` : "";
  for (const file of Object.values(rules)) {
    html += `<h3>${esc(file.label)}</h3>`;
    if (file.limits?.length) html += `<ul class="limits">${file.limits.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
    html += "<table><tr><th>Rule</th><th>Value</th><th>Source</th></tr>";
    for (const p of Object.values(file.parameters)) {
      const s = sources[p.source];
      html += `<tr><td>${esc(p.label)}${p.note ? `<div class="small">${esc(p.note)}</div>` : ""}</td>
        <td class="value">${show(p)}</td>
        <td><a href="${esc(s?.url ?? "#")}">${esc(s?.title ?? p.source)}</a>${p.legal ? `<div class="small">${esc(p.legal)}</div>` : ""}</td></tr>`;
    }
    html += "</table>";
  }
  el.innerHTML = html;
}

// Why each total differs from the published figure, where we know (see POPULATION.md).
const GAPS: Record<string, string> = {
  "Income tax": "We don't yet tax savings, dividends or property income.",
  "Employer NICs": "After taking off the Employment Allowance and apprentice relief as HMRC's published costs.",
  "Child Benefit": "Not a calibration target yet.",
  "Universal Credit spending": "Ours includes Northern Ireland; the published figure is Great Britain only.",
  "Households on Universal Credit": "Ours includes Northern Ireland; the published figure is Great Britain only.",
};

async function renderPopulation(el: HTMLElement, r: ReturnType<typeof ruleSet>) {
  try {
    const pop = await loadPopulation();
    const start = performance.now();
    const t = populationTotals(pop, r);
    const ms = performance.now() - start;
    const rows: [string, number, string][] = [
      ["Income tax", t.incomeTax / 1e9, "£bn"],
      ["Employee NICs", t.employeeNI / 1e9, "£bn"],
      ["Employer NICs", t.employerNI / 1e9, "£bn"],
      ["Self-employed NICs", t.selfEmployedNI / 1e9, "£bn"],
      ["Universal Credit spending", t.universalCredit / 1e9, "£bn"],
      ["Households on Universal Credit", t.ucHouseholds / 1e6, "m"],
      ["Child Benefit", t.childBenefit / 1e9, "£bn"],
      ["Families paid Child Benefit", t.cbFamilies / 1e6, "m"],
      ["Child Benefit charge", t.childBenefitCharge / 1e9, "£bn"],
    ];
    const fmt = (v: number, unit: string) => (unit === "£bn" ? `£${v.toFixed(v < 10 ? 2 : 1)}bn` : `${v.toFixed(2)}m`);
    let html = `<table><tr><th>A year</th><th class="num">These households</th><th class="num">Published</th><th class="num">Difference</th><th>Source</th></tr>`;
    for (const [name, ours, unit] of rows) {
      const p = pop.published[name];
      const diff = p ? `${ours >= p.value ? "+" : ""}${((ours / p.value - 1) * 100).toFixed(0)}%` : "";
      html += `<tr><td>${esc(name)}${GAPS[name] ? `<div class="small">${esc(GAPS[name]!)}</div>` : ""}</td>
        <td class="num">${fmt(ours, unit)}</td><td class="num">${p ? fmt(p.value, unit) : ""}</td><td class="num">${diff}</td>
        <td class="small">${p ? esc(p.source) : ""}</td></tr>`;
    }
    el.innerHTML = html + `</table><p class="small">${pop.units.length.toLocaleString("en-GB")} benefit units, worked out in your browser in ${ms.toFixed(0)} ms.</p>`;
  } catch (e) {
    el.innerHTML = `<p class="small">Couldn't load the population: ${esc(String(e))}</p>`;
  }
}

const r = ruleSet("2026-27");
const form = document.getElementById("form") as HTMLFormElement;
const result = document.getElementById("result")!;
renderForm(form);
const update = () => renderResult(result, readForm(form), r);
form.addEventListener("input", update);
update();
renderRules(document.getElementById("rules")!);
renderPopulation(document.getElementById("population")!, r);
