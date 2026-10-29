// The impact chart: one headline measure at a time (current budget, borrowing, debt, tax, spending, investment,
// growth) as history, the OBR's forecast, and your choices, as a share of GDP.
import { FIRST_FORECAST, MEASURES, YEARS, baselineSeries, yoursSeries, type Measure } from "./economy/history";
import type { Path } from "./economy/fiscal";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const pc = (x: number) => `${x < 0 ? "−" : ""}${Math.abs(x).toFixed(1)}%`;

/** A round step for an axis covering `span`, giving about five gridlines. */
function niceStep(span: number): number {
  const raw = span / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 5, 10].find((k) => k * mag >= raw) ?? 10) * mag;
}

export function initImpact(el: HTMLElement): (standard: Path, economy: Path, changed: boolean, economyByDefault?: boolean) => void {
  let measure: Measure = "borrowing";
  let since = "1995-96";
  let withEconomy = false;
  let byDefault: boolean | undefined; // the Assumptions setting, which the checkbox follows when it changes
  let standard: Path | undefined, economy: Path | undefined, changed = false;

  el.innerHTML = `
    <div class="impact-tabs toggle" role="group" aria-label="Measure">${MEASURES.map((m) => `<button type="button" data-measure="${m.id}" aria-pressed="${m.id === measure}">${esc(m.tab)}</button>`).join("")}</div>
    <div class="chart-controls">
      <div class="toggle" role="group" aria-label="From"><button type="button" data-since="1995-96" aria-pressed="true">From 1995</button><button type="button" data-since="${YEARS[0]}" aria-pressed="false">From ${YEARS[0]!.slice(0, 4)}</button></div>
      <label class="check"><input type="checkbox" data-economy> Include the effect on the economy (grade C)</label>
    </div>
    <p class="small" data-about></p>
    <div class="legend small"><span class="key key-outturn"></span> Outturn <span class="key key-forecast"></span> OBR forecast <span class="key key-budget"></span> Your budget</div>
    <div class="chart" data-chart></div>`;
  const chart = el.querySelector<HTMLElement>("[data-chart]")!;

  const draw = () => {
    const m = MEASURES.find((x) => x.id === measure)!;
    el.querySelector("[data-about]")!.textContent = m.about;
    const base = baselineSeries(measure).filter((p) => p.year >= since && p.value !== null) as { year: string; value: number; forecast: boolean }[];
    const path = withEconomy ? economy : standard;
    const yours = changed && path ? yoursSeries(measure, path) : new Map<string, number>();
    const years = base.map((p) => p.year);
    const values = [...base.map((p) => p.value), ...yours.values()];
    let lo = Math.min(0, ...values), hi = Math.max(...values);
    const step = niceStep(hi - lo || 1);
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;

    const W = 640, H = 300, mg = { l: 44, r: 12, t: 12, b: 30 };
    const x = (i: number) => mg.l + (i / Math.max(1, years.length - 1)) * (W - mg.l - mg.r);
    const y = (v: number) => mg.t + ((hi - v) / (hi - lo)) * (H - mg.t - mg.b);
    const at = (yr: string) => years.indexOf(yr);
    const line = (pts: [number, number][]) => pts.map(([i, v]) => `${x(i)},${y(v)}`).join(" ");

    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" tabindex="0" aria-label="${esc(m.label)}: outturn, OBR forecast${yours.size ? " and your budget" : ""}. Use the left and right arrow keys to read each year.">`;
    // The forecast years, lightly shaded.
    const f0 = at(FIRST_FORECAST);
    if (f0 >= 0) svg += `<rect x="${x(f0 - 0.5)}" y="${mg.t}" width="${x(years.length - 1) - x(f0 - 0.5)}" height="${H - mg.t - mg.b}" fill="var(--surface-2)"/>`;
    for (let v = lo; v <= hi + 1e-9; v += step) {
      svg += `<line x1="${mg.l}" x2="${W - mg.r}" y1="${y(v)}" y2="${y(v)}" stroke="${Math.abs(v) < 1e-9 ? "var(--ink-2)" : "var(--grid)"}"/>`;
      svg += `<text x="${mg.l - 6}" y="${y(v) + 4}" text-anchor="end">${+v.toFixed(1)}%</text>`;
    }
    const every = years.length > 50 ? 10 : 5;
    years.forEach((yr, i) => {
      const start = Number(yr.slice(0, 4));
      if (start % every === 0) svg += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${start}</text>`;
    });
    const outturn = base.filter((p) => !p.forecast).map((p): [number, number] => [at(p.year), p.value]);
    const lastOut = outturn[outturn.length - 1];
    const forecast = base.filter((p) => p.forecast).map((p): [number, number] => [at(p.year), p.value]);
    svg += `<polyline fill="none" stroke="var(--ink)" stroke-width="1.8" points="${line(outturn)}"/>`;
    svg += `<polyline fill="none" stroke="var(--ink-2)" stroke-width="1.8" stroke-dasharray="5 3" points="${line(lastOut ? [lastOut, ...forecast] : forecast)}"/>`;
    if (yours.size) {
      const pts = [...yours.entries()].filter(([yr]) => at(yr) >= 0).map(([yr, v]): [number, number] => [at(yr), v]);
      svg += `<polyline fill="none" stroke="var(--series)" stroke-width="2.5" points="${line(lastOut ? [lastOut, ...pts] : pts)}"/>`;
    }
    svg += `<line data-cross y1="${mg.t}" y2="${H - mg.b}" stroke="var(--ink-2)" visibility="hidden"/>`;
    svg += `<rect x="${mg.l}" y="${mg.t}" width="${W - mg.l - mg.r}" height="${H - mg.t - mg.b}" fill="transparent"/></svg>`;

    let table = `<details><summary class="small">Show as a table</summary><div class="scroll-x"><table><tr><th>Year</th><th class="num">Outturn or forecast</th>${yours.size ? `<th class="num">Your budget</th>` : ""}</tr>`;
    for (const p of [...base].reverse()) {
      table += `<tr><td>${p.year}${p.forecast ? " (forecast)" : ""}</td><td class="num">${pc(p.value)}</td>${yours.size ? `<td class="num">${yours.has(p.year) ? pc(yours.get(p.year)!) : ""}</td>` : ""}</tr>`;
    }
    chart.innerHTML = svg + `<div class="tip" aria-live="polite"></div>` + table + `</table></div></details>`;

    const svgEl = chart.querySelector("svg")!;
    const tip = chart.querySelector<HTMLElement>(".tip")!;
    const cross = svgEl.querySelector("[data-cross]")!;
    let cur = years.length - 1;
    const showAt = (i: number) => {
      cur = Math.max(0, Math.min(years.length - 1, i));
      const p = base[cur]!;
      const box = svgEl.getBoundingClientRect();
      cross.setAttribute("x1", String(x(cur)));
      cross.setAttribute("x2", String(x(cur)));
      cross.setAttribute("visibility", "visible");
      tip.style.display = "block";
      tip.innerHTML = `<strong>${p.year}</strong><br>${p.forecast ? "OBR forecast" : "Outturn"} ${pc(p.value)}${yours.has(p.year) ? `<br>Your budget <strong>${pc(yours.get(p.year)!)}</strong>` : ""}`;
      const left = (x(cur) / W) * box.width;
      tip.style.left = `${left + 12 + tip.offsetWidth > box.width ? left - tip.offsetWidth - 12 : left + 12}px`;
      tip.style.top = `${Math.max(0, (y(Math.max(p.value, yours.get(p.year) ?? -Infinity)) / H) * box.height - tip.offsetHeight - 8)}px`;
    };
    const hide = () => {
      cross.setAttribute("visibility", "hidden");
      tip.style.display = "none";
    };
    svgEl.addEventListener("pointermove", (ev) => {
      const box = svgEl.getBoundingClientRect();
      const sx = ((ev.clientX - box.left) / box.width) * W;
      showAt(Math.round(((sx - mg.l) / (W - mg.l - mg.r)) * (years.length - 1)));
    });
    svgEl.addEventListener("pointerleave", hide);
    svgEl.addEventListener("focus", () => showAt(cur));
    svgEl.addEventListener("blur", hide);
    svgEl.addEventListener("keydown", (ev) => {
      const next = { ArrowRight: cur + 1, ArrowLeft: cur - 1, Home: 0, End: years.length - 1 }[ev.key];
      if (next === undefined) return;
      ev.preventDefault();
      showAt(next);
    });
  };

  el.addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!b) return;
    if (b.dataset.measure) {
      measure = b.dataset.measure as Measure;
      el.querySelectorAll("[data-measure]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    } else if (b.dataset.since) {
      since = b.dataset.since;
      el.querySelectorAll("[data-since]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    } else return;
    draw();
  });
  el.querySelector("[data-economy]")!.addEventListener("change", (ev) => {
    withEconomy = (ev.target as HTMLInputElement).checked;
    draw();
  });
  return (s, e, c, d) => {
    standard = s;
    economy = e;
    changed = c;
    if (d !== undefined && d !== byDefault) {
      byDefault = withEconomy = d;
      el.querySelector<HTMLInputElement>("[data-economy]")!.checked = d;
    }
    draw();
  };
}
