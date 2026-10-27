import { checkRules, rules, sources } from "./rules";
import type { Parameter } from "./rules/schema";
import { ruleSet } from "./engine";
import { readForm, renderForm, renderResult } from "./calculator";

const gbp = (n: number) => "£" + n.toLocaleString("en-GB", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const pct = (n: number) => `${+(n * 100).toFixed(2)}%`;
const PER = { gbp: "", gbp_per_year: " a year", gbp_per_month: " a month", gbp_per_week: " a week" } as const;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

function show(p: Parameter): string {
  if (p.bands) return p.bands.map((b) => `${pct(b.rate)} from ${gbp(b.threshold)}`).join("<br>");
  if (p.unit === "flag") return p.value ? "Yes" : "No";
  if (p.unit === "rate") return pct(p.value as number);
  if (p.unit === "years") return `${p.value} years`;
  return gbp(p.value as number) + PER[p.unit];
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

const r = ruleSet("2026-27");
const form = document.getElementById("form") as HTMLFormElement;
const result = document.getElementById("result")!;
renderForm(form);
const update = () => renderResult(result, readForm(form), r);
form.addEventListener("input", update);
update();
renderRules(document.getElementById("rules")!);
