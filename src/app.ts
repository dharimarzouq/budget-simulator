// The budget page ("workbench"): levers on the left, results on the right, updating as you go.
// Costing runs in a worker: static figures and winners and losers arrive first, the behavioural figure after.
import { calculate, ruleSet } from "./engine";
import { readForm, renderForm, renderResult } from "./calculator";
import { LEVERS, LEVER, type Lever, type LeverValue } from "./policy/levers";
import { applyPolicy, coveredLevers, effectiveChanges, policyFromQuery, policyToQuery, type Policy } from "./policy/policy";
import { REMOVAL, REMOVAL_FOR } from "./policy/removals";
import { LIBRARY, NAMED, resolve, status } from "./policy/library";
import { initTaxChart } from "./taxchart";
import { FORECAST, baseline, fiscalPath, type Path } from "./economy/fiscal";
import { CHECK_LABEL, CHECK_MEANING, COSTING_GRADE, GRADE_MEANING, costingGrade, leverCheck, policyCheck, type Check } from "./policy/grades";
import { isReckonerLever, type Fit } from "./policy/reckoner";
import type { Group } from "./policy/distribution";
import type { Reply, Request } from "./costing.worker";

const rules = ruleSet("2026-27");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const $ = (id: string) => document.getElementById(id)!;

// ---- formatting --------------------------------------------------------------------------------
/** £ a year in billions to one decimal place; under £1bn in millions, so small costings don't show as nothing. */
function bn(x: number, sign = true): string {
  const s = x < 0 ? "−" : sign && x > 0 ? "+" : "";
  const a = Math.abs(x);
  if (a >= 0.95e9) return `${s}£${(a / 1e9).toFixed(1)}bn`;
  if (a >= 0.5e6) return `${s}£${Math.round(a / 1e6).toLocaleString("en-GB")}m`;
  return "£0";
}
const pounds = (x: number, sign = false) => `${x < 0 ? "−" : sign && x > 0 ? "+" : ""}£${Math.round(Math.abs(x)).toLocaleString("en-GB")}`;
const share = (x: number) => `${Math.round(x * 100)}%`;
/** A % change with a real minus sign, and no sign on zero. */
const signedPct = (x: number) => (Math.abs(x) < 0.005 ? "0.00%" : `${x < 0 ? "−" : "+"}${Math.abs(x).toFixed(2)}%`);

// ---- explanations that open in place -----------------------------------------------------------
let infoCount = 0;
/** A small "i" button and the explanation it opens. Put `panel` where the text should appear (it can be apart from the button). */
function info(about: string, text: string): { button: string; panel: string } {
  const id = `info-${++infoCount}`;
  return {
    button: `<button type="button" class="info" aria-expanded="false" aria-controls="${id}" aria-label="About ${esc(about)}">i</button>`,
    panel: `<span class="info-text" id="${id}" hidden>${esc(text)}</span>`,
  };
}
document.addEventListener("click", (ev) => {
  const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("button.info");
  if (!b) return;
  const panel = document.getElementById(b.getAttribute("aria-controls")!);
  if (!panel) return;
  const open = b.getAttribute("aria-expanded") !== "true";
  b.setAttribute("aria-expanded", String(open));
  panel.hidden = !open;
});
const PER: Record<string, string> = { gbp: "", gbp_per_year: "", gbp_per_month: " a month", gbp_per_week: " a week", change_gbp: "" };

function showValue(l: Lever, v: LeverValue): string {
  if (l.unit === "flag") return v ? "On" : "Off";
  if (l.unit === "rate") return `${+((v as number) * 100).toFixed(2)}%`;
  if (l.unit === "change_share" || l.unit === "change_gbp") {
    const n = v as number;
    if (Math.abs(n) < 1e-9) return "no change";
    const sign = n > 0 ? "+" : "−";
    return l.unit === "change_share" ? `${sign}${+Math.abs(n * 100).toFixed(2)}%` : `${sign}£${Math.abs(n).toLocaleString("en-GB")}`;
  }
  const n = v as number;
  return `£${n.toLocaleString("en-GB", { maximumFractionDigits: n % 1 ? 2 : 0, minimumFractionDigits: n % 1 ? 2 : 0 })}${PER[l.unit]}`;
}

// ---- the policy, kept in the URL so a budget can be shared -------------------------------------
const policy = new Map<string, LeverValue>(policyFromQuery(location.search.slice(1)).map((c) => [c.lever, c.value]));
const currentPolicy = (): Policy => effectiveChanges(rules, [...policy].map(([lever, value]) => ({ lever, value })));

function policyChanged() {
  const q = policyToQuery(currentPolicy());
  history.replaceState(null, "", q ? `?${q}` : location.pathname);
  showCount();
  renderPolicies();
  requestCosting();
  updateHousehold();
}

function setLever(id: string, value: LeverValue | undefined) {
  if (value === undefined || LEVER[id]!.get(rules) === value) policy.delete(id);
  else policy.set(id, value);
  refreshLeverRow(id);
  policyChanged();
}

/** Remove a tax or allowance (dropping changes to the levers it makes meaningless), or bring it back. */
function setRemoval(id: string, removed: boolean) {
  const x = REMOVAL[id]!;
  if (removed) {
    for (const l of [x.lever, ...x.hides]) policy.delete(l);
    policy.set(id, true);
  } else policy.delete(id);
  renderLevers();
  filterLevers();
  policyChanged();
}

// ---- levers ------------------------------------------------------------------------------------
/**
 * Slider range around today's value: ±10 points for rates, in whole points from today's rate (the number box takes
 * anything finer), and 0 to double for amounts.
 */
function range(l: Lever): { min: number; max: number; step: number; scale: number } {
  const today = +((l.get(rules) as number) * 100).toFixed(4);
  // Changes from today's duties: either way, up to 20% or ten steps.
  if (l.unit === "change_share") return { min: -20, max: 20, step: 1, scale: 100 };
  if (l.unit === "change_gbp") return { min: -10 * l.step, max: 10 * l.step, step: l.step, scale: 1 };
  if (l.unit === "rate") return { min: today - Math.min(10, Math.floor(today)), max: Math.min(100, today + 10), step: 1, scale: 100 };
  return { min: 0, max: Math.max((l.get(rules) as number) * 2, l.step * 20), step: l.step, scale: 1 };
}

function leverRow(l: Lever): string {
  const today = l.get(rules);
  const v = policy.get(l.id) ?? today;
  const removal = REMOVAL_FOR[l.id];
  const removeButton = removal
    ? `<button type="button" class="remove" data-remove="${removal.id}" aria-label="Remove: ${esc(removal.label)}" title="${esc(removal.means)}">Remove</button>`
    : "";
  const note = l.note ? info(l.label, l.note) : undefined;
  const name = `<div class="name"><span>${esc(l.label)}${note?.button ?? ""}</span><span class="today">today ${esc(showValue(l, today))}${removeButton}</span></div>${note?.panel ?? ""}`;
  if (removal && policy.get(removal.id)) {
    return `<div class="lever removed" data-id="${l.id}"><div class="name"><span>${esc(l.label)}</span><span class="today">today ${esc(showValue(l, today))}</span></div>
      <div class="removed-note"><strong>Removed.</strong> ${esc(removal.means)}</div>
      <button type="button" data-restore="${removal.id}">Bring back</button></div>`;
  }
  const undo = `<button type="button" class="undo" data-undo="${l.id}" aria-label="Reset ${esc(l.label)}" title="Back to today's value">×</button>`;
  if (l.unit === "flag") {
    return `<div class="lever" data-id="${l.id}">${name}<label class="check flag"><input type="checkbox" data-flag="${l.id}"${v ? " checked" : ""}> ${esc(l.label)} in force</label>${undo}</div>`;
  }
  const { min, max, step, scale } = range(l);
  const shown = +((v as number) * scale).toFixed(4);
  return `<div class="lever" data-id="${l.id}">${name}
    <input type="range" min="${min}" max="${max}" step="${step}" value="${shown}" data-range="${l.id}" aria-label="${esc(l.label)}" aria-valuetext="${esc(showValue(l, v))}">
    <input type="number" step="${scale === 100 ? "any" : step}" value="${shown}" data-number="${l.id}" aria-label="${esc(l.label)}${scale === 100 ? ", %" : ", £"}">
    ${undo}</div>`;
}

function renderLevers() {
  const groups = [...new Set(LEVERS.map((l) => l.group))];
  const open = new Set([...document.querySelectorAll<HTMLDetailsElement>(".group[open]")].map((d) => d.dataset.group));
  const touched = (g: string) => LEVERS.some((l) => l.group === g && (policy.has(l.id) || (REMOVAL_FOR[l.id] && policy.has(REMOVAL_FOR[l.id]!.id))));
  // Levers hidden by a removal, other than the removed lever itself (whose row says "Removed").
  const covered = coveredLevers(currentPolicy());
  for (const id of policy.keys()) if (REMOVAL[id]) covered.delete(REMOVAL[id]!.lever);
  $("levers").innerHTML = groups
    .map((g, i) => `<details class="group" data-group="${esc(g)}"${open.has(g) || (!open.size && i === 0) || touched(g) ? " open" : ""}><summary>${esc(g)}</summary>
      ${LEVERS.filter((l) => l.group === g).map((l) => leverRow(l).replace('class="lever', covered.has(l.id) ? 'data-gone class="lever' : 'class="lever')).join("")}</details>`)
    .join("");
  for (const id of policy.keys()) if (LEVER[id]) refreshLeverRow(id);
  showCount();
}

function refreshLeverRow(id: string) {
  const row = document.querySelector<HTMLElement>(`.lever[data-id="${id}"]`);
  if (!row || row.classList.contains("removed")) return;
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
    row.querySelector("[data-range]")!.setAttribute("aria-valuetext", showValue(l, v)); // read out as "21%", not "21"
  }
}

// ---- named policies --------------------------------------------------------------------------------
const STATUS_LABEL = { on: "Added", adjusted: "Adjusted", off: "" } as const;

function renderPolicies() {
  const current = currentPolicy();
  $("policies").innerHTML = LIBRARY.map((p) => {
    const s = status(p, rules, current);
    const i = info(p.name, p.about);
    return `<div class="policy ${s}" data-policy="${p.id}">
      <div class="policy-name"><span>${esc(p.name)}${i.button}</span><span class="small">${esc(p.area)}</span></div>${i.panel}
      <div class="policy-actions">${s === "off" ? "" : `<span class="small">${STATUS_LABEL[s]}</span>`}
        ${s !== "on" ? `<button type="button" data-add-policy="${p.id}">${s === "off" ? "Add" : "Set as named"}</button>` : ""}
        ${s !== "off" ? `<button type="button" data-drop-policy="${p.id}">Take out</button>` : ""}</div>
    </div>`;
  }).join("");
  filterPolicies();
}

/** Add a named policy: move its levers to its values (a removal takes out the levers it makes meaningless). */
function addPolicy(id: string) {
  for (const c of resolve(NAMED[id]!, rules)) {
    const x = REMOVAL[c.lever];
    if (x) {
      for (const l of [x.lever, ...x.hides]) policy.delete(l);
      policy.set(c.lever, true);
    } else if (LEVER[c.lever]!.get(rules) === c.value) policy.delete(c.lever);
    else policy.set(c.lever, c.value);
  }
  renderLevers();
  filterLevers();
  policyChanged();
}

/** Take a named policy out: its levers go back to today's values. */
function dropPolicy(id: string) {
  for (const c of resolve(NAMED[id]!, rules)) policy.delete(c.lever);
  renderLevers();
  filterLevers();
  policyChanged();
}

function filterPolicies() {
  const q = (($("lever-search") as HTMLInputElement).value || "").toLowerCase();
  const changedOnly = ($("changed-only") as HTMLInputElement).checked;
  document.querySelectorAll<HTMLElement>(".policy").forEach((el) => {
    const p = NAMED[el.dataset.policy!]!;
    el.hidden = (!!q && !`${p.name} ${p.area} ${p.about}`.toLowerCase().includes(q)) || (changedOnly && el.classList.contains("off"));
  });
}

/** How many changes, beside the levers and on the phone's Levers button. */
function showCount() {
  const n = currentPolicy().length;
  const text = n ? `(${n} changed)` : "";
  $("changed-count").textContent = text;
  $("changed-count-phone").textContent = text;
  $("open-levers").textContent = document.body.classList.contains("levers-open") ? "Show results" : n ? `Levers (${n})` : "Levers";
}

function filterLevers() {
  const q = (($("lever-search") as HTMLInputElement).value || "").toLowerCase();
  const changedOnly = ($("changed-only") as HTMLInputElement).checked;
  document.querySelectorAll<HTMLElement>(".lever").forEach((row) => {
    const l = LEVER[row.dataset.id!]!;
    const removed = row.classList.contains("removed");
    const hit = (!q || `${l.label} ${l.group} ${l.note ?? ""} ${l.id.replace(/_/g, " ")}`.toLowerCase().includes(q)) && (!changedOnly || policy.has(l.id) || removed);
    row.hidden = !hit || row.hasAttribute("data-gone");
  });
  document.querySelectorAll<HTMLDetailsElement>(".group").forEach((g) => {
    const any = [...g.querySelectorAll<HTMLElement>(".lever")].some((r) => !r.hidden);
    g.hidden = !any;
    if ((q || changedOnly) && any) g.open = true;
  });
}

// ---- the box that follows a slider while it's dragged ------------------------------------------
let bubbleTimer: number | undefined;

function showBubble(input: HTMLInputElement, l: Lever, value: number) {
  const bubble = $("bubble");
  const today = l.get(rules) as number;
  const d = value - today;
  const diff =
    Math.abs(d) < 1e-9
      ? "today's value"
      : l.unit === "change_share" || l.unit === "change_gbp"
        ? "on today's rates" // the value is already the change
      : l.unit === "rate"
        ? `${d > 0 ? "+" : "−"}${+Math.abs(d * 100).toFixed(2)} ${Math.abs(d * 100) === 1 ? "point" : "points"}`
        : `${d > 0 ? "+" : "−"}${showValue(l, Math.abs(d))}`;
  bubble.innerHTML = `<strong>${esc(showValue(l, value))}</strong> <span>(${esc(diff)})</span>`;
  bubble.style.display = "block";
  // Over the slider's thumb: its centre runs from half a thumb in from each end.
  const box = input.getBoundingClientRect();
  const min = Number(input.min), max = Number(input.max);
  const thumb = 16;
  const cx = box.left + thumb / 2 + ((Number(input.value) - min) / (max - min || 1)) * (box.width - thumb);
  const w = bubble.offsetWidth;
  bubble.style.left = `${Math.max(4, Math.min(window.innerWidth - w - 4, cx - w / 2))}px`;
  bubble.style.top = `${box.top - bubble.offsetHeight - 6}px`;
  clearTimeout(bubbleTimer);
}

function hideBubble() {
  clearTimeout(bubbleTimer);
  bubbleTimer = window.setTimeout(() => ($("bubble").style.display = "none"), 700);
}

function wireLevers() {
  const panel = $("levers");
  panel.addEventListener("input", (ev) => {
    const t = ev.target as HTMLInputElement;
    const id = t.dataset.range ?? t.dataset.number;
    if (id) {
      const l = LEVER[id]!;
      const n = Number(t.value);
      const signed = l.unit === "change_share" || l.unit === "change_gbp"; // a change from today can go below zero
      if (t.value === "" || t.value === "-" || !Number.isFinite(n) || (n < 0 && !signed)) return;
      const value = range(l).scale === 100 ? Math.round(Math.min(n, 100) * 100) / 10000 : n;
      // Keep the twin control in step while typing or dragging.
      const twin = t.dataset.range ? t.parentElement!.querySelector<HTMLInputElement>("[data-number]") : t.parentElement!.querySelector<HTMLInputElement>("[data-range]");
      if (twin) twin.value = t.value;
      setLever(id, value);
      if (t.dataset.range) showBubble(t, l, value);
    }
    if (t.dataset.flag) setLever(t.dataset.flag, t.checked);
  });
  panel.addEventListener("click", (ev) => {
    const d = (ev.target as HTMLElement).dataset;
    if (d.undo) setLever(d.undo, undefined);
    if (d.remove) setRemoval(d.remove, true);
    if (d.restore) setRemoval(d.restore, false);
  });
  for (const end of ["pointerup", "change", "blur"]) panel.addEventListener(end, hideBubble, true);
  $("lever-search").addEventListener("input", () => (filterLevers(), filterPolicies()));
  $("changed-only").addEventListener("change", () => (filterLevers(), filterPolicies()));
  $("policies").addEventListener("click", (ev) => {
    const d = (ev.target as HTMLElement).dataset;
    if (d.addPolicy) addPolicy(d.addPolicy);
    if (d.dropPolicy) dropPolicy(d.dropPolicy);
  });
  $("reset").addEventListener("click", () => {
    policy.clear();
    renderLevers();
    filterLevers();
    policyChanged();
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
  $("copy-summary").addEventListener("click", async () => {
    const button = $("copy-summary") as HTMLButtonElement;
    try {
      await navigator.clipboard.writeText(summaryText());
      button.textContent = "Summary copied";
    } catch {
      button.textContent = "Couldn't copy";
    }
    setTimeout(() => (button.textContent = "Copy summary"), 2000);
  });

  // Phones: the levers open over the page; the bar at the bottom keeps the result in view.
  const openLevers = (open: boolean) => {
    document.body.classList.toggle("levers-open", open);
    $("open-levers").setAttribute("aria-expanded", String(open));
    showCount();
    // Not the search box: on a phone that would pop up the keyboard.
    $(open ? "close-levers" : "open-levers").focus({ preventScroll: true });
  };
  $("open-levers").addEventListener("click", () => openLevers(!document.body.classList.contains("levers-open")));
  $("close-levers").addEventListener("click", () => openLevers(false));
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && document.body.classList.contains("levers-open")) openLevers(false);
  });
}

// ---- where the tax chart goes ----------------------------------------------------------------------
// Wide screens: a column of its own. Otherwise inside the results, after the headline figures (on phones, after
// borrowing too), so what the budget raises or costs is always the first thing in view.
const phone = window.matchMedia("(max-width: 900px)");
const wide = window.matchMedia("(min-width: 1600px)");
function placeTaxChart() {
  const panel = $("tax-panel");
  if (wide.matches) $("results").before(panel);
  else if (phone.matches) $("fiscal").closest("section")!.after(panel);
  else $("headline").after(panel);
}
wide.addEventListener("change", placeTaxChart);
phone.addEventListener("change", () => {
  placeTaxChart();
  if (!phone.matches) document.body.classList.remove("levers-open");
});

// ---- costing, via the worker -------------------------------------------------------------------
const worker = new Worker(new URL("./costing.worker.ts", import.meta.url), { type: "module" });
let requestId = 0;
let lastStatic: Extract<Reply, { type: "static" }> | undefined;
let lastBehaviour: Extract<Reply, { type: "behaviour" }>["behaviour"] | undefined;
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
    $("results").classList.remove("pending");
    $("headline").innerHTML = `<div class="empty">Something went wrong working out the costing: ${esc(m.message.replace(/^Error: /, ""))}</div>`;
    return;
  }
  if (m.type === "loading") {
    if (!currentPolicy().length) return; // the empty-state message stays
    $("headline").innerHTML = `<div class="empty">${esc(m.stage)}</div>`;
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
    lastBehaviour = undefined;
    $("results").classList.remove("pending");
    renderHeadline(m, undefined);
    renderFiscal(m, undefined);
    renderBreakdown(m, undefined);
    renderWinners(m.distribution.deciles, m.distribution.familyTypes, m.distribution.regions, m.distribution.all);
  } else if (m.type === "levers" && lastStatic) {
    renderBreakdown(lastStatic, m);
  } else if (m.type === "progress") {
    const el = document.getElementById("behaviour-progress");
    if (el) el.textContent = `${Math.round(m.done * 100)}% done`;
  } else if (m.type === "behaviour" && lastStatic) {
    lastBehaviour = m.behaviour;
    renderHeadline(lastStatic, m.behaviour);
    renderFiscal(lastStatic, m.behaviour);
  }
};
worker.postMessage({ type: "load", url: new URL("./data/population-2026-27.json", location.href).href } satisfies Request);

// ---- results -----------------------------------------------------------------------------------
type Static = Extract<Reply, { type: "static" }>;
type BehaviourFigures = Extract<Reply, { type: "behaviour" }>["behaviour"];
type Levers = Extract<Reply, { type: "levers" }>;

const SOURCES = {
  rr: `<a href="https://www.gov.uk/government/statistics/direct-effects-of-illustrative-tax-changes">HMRC's ready reckoner</a>`,
  sfc: `<a href="https://gov.scot/publications/scottish-income-tax-ready-reckoners-2022-23">the Scottish Fiscal Commission's elasticities</a>`,
  how: `<a href="./how.html">How we know</a>`,
};

/** A check label with its explanation, which opens in place: the general meaning, then why for this change. */
function checkBadge(c: Check, why?: string) {
  const i = info(`the check: ${CHECK_LABEL[c]}`, why ? `${why} (${CHECK_LABEL[c]}: ${CHECK_MEANING[c]})` : CHECK_MEANING[c]);
  return `<span class="check-badge check-${c}">${CHECK_LABEL[c]}</span>${i.button}${i.panel}`;
}

const EMPTY = `<div class="empty">This is the budget as it stands for 2026-27. Change a lever to see what it raises or costs, and who gains and loses.</div>`;

function renderHeadline(s: Static, b: BehaviourFigures | undefined) {
  const changes = currentPolicy();
  if (!changes.length) {
    $("headline").innerHTML = EMPTY;
    return;
  }
  const fits = fitsOf(s);
  const household = changes.some((c) => !isReckonerLever(c.lever)); // anything the household model works out
  const check = policyCheck(changes, fits);
  const g = costingGrade(changes, fits);
  const grade = info(`grade ${g}`, `Grade ${g}: ${GRADE_MEANING[g]} The scale: A ${GRADE_MEANING.A} B ${GRADE_MEANING.B} C ${GRADE_MEANING.C} D ${GRADE_MEANING.D}`);
  const hmrc = s.reckoner.length ? "; other taxes are HMRC's costings, which already allow for responses" : "";
  const raised = (x: number) => `<span class="${x < 0 ? "neg" : "pos"}">${bn(x)}</span>`;
  const behaviour = !b
    ? `<div class="value small">working it out… <span id="behaviour-progress"></span></div><div class="sub">the other figures don't wait for it</div>`
    : b.low === 0 && b.high === 0
      ? `<div class="value">${raised(s.netRevenue)}</div><div class="sub">${
          !household
            ? "responses are already in HMRC's costings"
            : changes.some((c) => !isReckonerLever(c.lever) && !/^(uc|cb)_/.test(REMOVAL[c.lever]?.lever ?? c.lever)) // a household tax change
              ? "responses make no difference to what's raised here"
              : "no household tax changes; benefits are costed static"
        }</div>`
      : `<div class="value">${raised(s.netRevenue + b.central)}</div><div class="sub">range ${bn(s.netRevenue + Math.min(b.low, b.high), false)} to ${bn(s.netRevenue + Math.max(b.low, b.high), false)}</div>`;
  const all = s.distribution.all;
  $("headline").innerHTML = `
    <div class="metric"><div class="label">Raised a year, nobody responding (static)</div><div class="value">${raised(s.netRevenue)}</div><div class="sub">positive raises money, negative costs it${hmrc}</div></div>
    <div class="metric"><div class="label">Allowing for how people respond</div>${behaviour}</div>
    <div class="metric"><div class="label">Households losing / gaining</div>${
      household
        ? `<div class="value">${share(all.lose)} / ${share(all.gain)}</div><div class="sub">by more than £1 a week${s.reckoner.length ? "; doesn't yet include taxes costed from HMRC's figures" : ""}</div>`
        : `<div class="value small">not worked out</div><div class="sub">who pays these taxes isn't shared out to households yet</div>`
    }</div>
    <div class="metric"><div class="label">How far to trust it</div><div class="value small"><span class="grade">${g}</span>${grade.button} ${checkBadge(check)}</div>${grade.panel}<div class="sub">grade ${g}: ${g === "A" ? "HMRC's own costing" : "our own model, or HMRC's costings scaled"}; checks: ${CHECK_LABEL[check]}</div></div>`;
}

/** How well HMRC's figures cover each change costed from them. */
const fitsOf = (s: Static): Record<string, Fit> => Object.fromEntries(s.reckoner.map((c) => [c.lever, c.fit]));

/** A few plain lines describing the budget, for pasting into a message. */
function summaryText(): string {
  const changes = currentPolicy();
  const lines = ["UK budget simulator, 2026-27 (estimates from made-up households weighted to published UK totals)"];
  if (!changes.length || !lastStatic) {
    lines.push(changes.length ? "Still working out the figures." : "No changes: today's budget.");
  } else {
    lines.push(`Changes: ${changes.map((c) => (REMOVAL[c.lever] ? changeLabel(c.lever) : `${LEVER[c.lever]!.label} ${showValue(LEVER[c.lever]!, LEVER[c.lever]!.get(rules))} → ${showValue(LEVER[c.lever]!, c.value)}`)).join("; ")}`);
    const s = lastStatic.netRevenue;
    const total = s + (lastBehaviour?.central ?? 0);
    lines.push(`${total < 0 ? "Costs" : "Raises"} ${bn(Math.abs(total), false)} a year${lastBehaviour ? `, allowing for how people respond (${bn(Math.abs(s), false)} before that)` : " before allowing for how people respond"}`);
    const path = fiscalPath(lastStatic.change, lastBehaviour?.central ?? 0, { reckoner: lastStatic.reckoner });
    const m = path.stabilityMargin;
    lines.push(`Main fiscal rule (current budget in surplus in 2029-30): ${m < 0 ? "missed" : "met"} by £${Math.abs(m).toFixed(1)}bn (OBR forecast: met by £${FORECAST.fiscal_rules.stability.margin.toFixed(1)}bn)`);
    const all = lastStatic.distribution.all;
    lines.push(`Households: ${share(all.lose)} lose and ${share(all.gain)} gain more than £1 a week`);
  }
  lines.push(location.href);
  return lines.join("\n");
}

/** Phones: one line on the bar at the bottom. */
function showSummary(text: string) {
  $("summary-text").innerHTML = text;
}

// ---- borrowing and debt ------------------------------------------------------------------------
const bnFixed = (x: number, dp = 1) => `${x < 0 ? "−" : ""}£${Math.abs(x).toFixed(dp)}bn`;
const signedBn = (x: number) => (Math.abs(x) < 0.05 ? "£0.0bn" : `${x > 0 ? "+" : "−"}£${Math.abs(x).toFixed(1)}bn`);

function renderFiscal(s: Static, b: BehaviourFigures | undefined) {
  const changed = currentPolicy().length > 0;
  const behaviour = b?.central ?? 0;
  const path = fiscalPath(s.change, behaviour, { reckoner: s.reckoner });
  const econ = fiscalPath(s.change, behaviour, { economy: true, reckoner: s.reckoner });
  const lowHigh = [FORECAST.multipliers.range_low, FORECAST.multipliers.range_high].map((k) => fiscalPath(s.change, behaviour, { economy: true, multiplierScale: k, reckoner: s.reckoner }));
  const psnb = baseline("psnb"), psnfl = baseline("psnfl"), centred = baseline("gdp_centred");
  const years = path.years.map((y) => y.year);
  const rules = FORECAST.fiscal_rules;

  const marginText = (x: number) => (x < 0 ? `missed by ${bnFixed(-x)}` : `met by ${bnFixed(x)}`);
  const margin = (x: number) => `<span class="${x < 0 ? "neg" : "pos"}">${marginText(x)}</span>`;
  const range = (pick: (p: Path) => number) => {
    const [a, c] = lowHigh.map(pick).sort((x, y) => x - y);
    return `between ${marginText(a!)} and ${marginText(c!)}`;
  };
  const raised = changed ? s.netRevenue + behaviour : 0;
  showSummary(
    changed
      ? `${raised < 0 ? "Costs" : "Raises"} <strong>${bn(Math.abs(raised), false)}</strong> a year${b ? "" : " (static)"}<br>Main fiscal rule: <span class="${path.stabilityMargin < 0 ? "neg" : "pos"}">${marginText(path.stabilityMargin)}</span>`
      : `Today's budget<br>Main fiscal rule: ${marginText(rules.stability.margin)}`,
  );
  const rule = (label: string, obr: number, ours: number, withEconomy: number, pick: (p: Path) => number) => `
    <div class="metric rule">
      <div class="label">${esc(label)}</div>
      <div class="value">${changed ? margin(ours) : margin(obr)}</div>
      <div class="sub">${changed ? `OBR forecast: ${marginText(obr)}` : "OBR forecast, today's policies"}</div>
      ${changed ? `<div class="sub">with the effect on the economy: ${margin(withEconomy)} (${range(pick)})</div>` : ""}
    </div>`;

  let html = `<div class="rules">
    ${rule("Current budget in surplus in 2029-30 (the main fiscal rule)", rules.stability.margin, path.stabilityMargin, econ.stabilityMargin, (p) => p.stabilityMargin)}
    ${rule("Debt falling as a share of GDP in 2029-30", rules.debt.margin, path.debtMargin, econ.debtMargin, (p) => p.debtMargin)}
  </div>`;
  if (changed && !b) html += `<p class="small">Allowing for how people respond: working it out. Until then these use the static costing.</p>`;

  const row = (label: string, xs: (string | number)[], cls = "") => `<tr class="${cls}"><td>${label}</td>${xs.map((x) => `<td class="num">${x}</td>`).join("")}</tr>`;
  const debtPct = (y: string, extra: number) => `${(((psnfl[y]! + extra) / centred[y]!) * 100).toFixed(1)}%`;
  let table = `<div class="scroll-x"><table class="fiscal"><tr><th>£ billion a year</th>${years.map((y) => `<th class="num">${y}</th>`).join("")}</tr>`;
  if (changed) {
    table += row("Your budget raises (+) or costs (−)", path.years.map((y) => signedBn(y.taxRaised + y.benefitsCut + y.behaviour)));
    table += row("Extra interest on the debt", path.years.map((y) => signedBn(-y.debtInterest)));
  }
  table += row("Borrowing, OBR forecast", years.map((y) => bnFixed(psnb[y]!)));
  if (changed) table += row("Borrowing with your budget", path.years.map((y) => bnFixed(psnb[y.year]! + y.borrowing)), "total");
  table += row("Debt, % of GDP (net financial liabilities), OBR", years.map((y) => debtPct(y, 0)));
  if (changed) {
    table += row("Debt, % of GDP, with your budget", path.years.map((y) => debtPct(y.year, y.debt)), "total");
    table += `<tr><th colspan="${years.length + 1}">Including the effect on the economy (approximate, grade C)</th></tr>`;
    table += row("Effect on the size of the economy (GDP)", econ.years.map((y) => `${y.gdp > 0 ? "+" : y.gdp < 0 ? "−" : ""}${Math.abs(y.gdp).toFixed(2)}%`));
    table += row("Borrowing with your budget", econ.years.map((y) => bnFixed(psnb[y.year]! + y.borrowing)));
  }
  table += `</table></div>`;

  html += table + `<details class="show-working"><summary>Show working</summary>
    <p>The starting point is the OBR's forecast published with Budget 2026 on 28 October 2026, which already includes that Budget's policies. Your changes are assumed to start in April 2027, the next tax year, so 2026-27 is unchanged. Each part of the 2026-27 costing (income tax, each kind of National Insurance, Universal Credit, Child Benefit) is carried forward in line with the OBR's forecast for that tax or benefit; the response to tax changes grows with income tax. That's an approximation: it doesn't allow for how your changes would interact with policies announced for later years, or for thresholds the OBR assumes will change.</p>
    <p>Extra borrowing adds to the debt, and that adds to interest costs, at the rates implied by the OBR's debt interest ready reckoner. All the changes here are to day-to-day taxes and spending, so the current budget changes by the same amount as borrowing. Debt here is public sector net financial liabilities, the measure the rule uses.</p>
    <p>Grade ${COSTING_GRADE} for the standard figures, which leave the economy as the OBR forecasts it, as official costings do. The lines "with the effect on the economy" use the OBR's published fiscal multipliers (a tax change worth 1% of GDP moves GDP by 0.33% in its first year, fading to nothing by the fifth; benefits 0.60%), and the OBR's rule that borrowing rises by 0.5% of GDP for each 1% the economy is below its potential, plus 0.2% the year after. The OBR calls its multipliers a highly uncertain starting point, so this part is grade C, with a range from half to one and a half times them (our judgement; the OBR doesn't publish a range). These effects are temporary: by 2031-32 they have all but gone.</p>
    <p>Sources: <a href="https://obr.uk/efo/economic-and-fiscal-outlook-october-2026/">OBR Economic and fiscal outlook, October 2026</a> (Tables 7.1, A.9 and the detailed forecast tables); <a href="https://www.gov.uk/government/publications/forecast-evaluation-report-june-2026/forecast-evaluation-report-june-2026">OBR Forecast evaluation report, June 2026</a> (Table 2.1); <a href="https://obr.uk/working-paper-no-3-cyclically-adjusting-the-public-finances/">OBR Working paper No. 3</a>.</p>
  </details>`;
  $("fiscal").innerHTML = html;
}

const EFFECTS: [keyof Static["change"], string, 1 | -1][] = [
  ["incomeTax", "Income tax", 1], ["employeeNI", "Employee National Insurance", 1], ["employerNI", "Employer National Insurance", 1],
  ["selfEmployedNI", "Self-employed National Insurance", 1], ["childBenefitCharge", "Child Benefit charge", 1],
  ["childBenefit", "Child Benefit (spending)", -1], ["universalCredit", "Universal Credit (spending)", -1],
];

const changeLabel = (id: string) => (REMOVAL[id] ? `Removed: ${REMOVAL[id]!.label}` : LEVER[id]!.label);

/** A change's name with what it does underneath. */
function changeText(id: string): string {
  const x = REMOVAL[id];
  if (x) return `${esc(changeLabel(id))}<div class="working">${esc(x.means)}</div>`;
  const l = LEVER[id]!;
  return `${esc(l.label)}<div class="working">${esc(l.group)}: ${esc(showValue(l, l.get(rules)))} → ${esc(showValue(l, policy.get(id)!))}</div>`;
}

function renderBreakdown(s: Static, levers: Levers | undefined) {
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
  for (const c of s.reckoner) {
    html += `<tr><td>${esc(LEVER[c.lever]!.label)}<div class="working">HMRC's costing, allowing for responses</div></td>${signed(c.raises[0]!)}</tr>`;
  }
  html += `<tr class="total"><td>Total${s.reckoner.length ? "" : " (static)"}</td>${signed(s.netRevenue)}</tr></table>`;
  html += `<table><tr><th>Each change on its own</th><th class="num">£ a year</th><th>Checks against HMRC</th></tr>`;
  const fits = fitsOf(s);
  for (const ch of changes) {
    const g = leverCheck(ch.lever, fits[ch.lever]);
    const own = levers?.perLever.find((p) => p.lever === ch.lever);
    html += `<tr><td>${changeText(ch.lever)}</td>${own ? signed(own.netRevenue) : `<td class="num small">working…</td>`}<td>${checkBadge(g.check, g.why)}</td></tr>`;
  }
  if (changes.length > 1) html += `<tr><td>Interaction<div class="working">Changes overlap: e.g. a tax rise reduces Universal Credit, a rate rise on a bigger allowance raises less.</div></td>${levers ? signed(levers.interaction) : `<td class="num small">working…</td>`}<td></td></tr>`;
  html += `</table></div>`;
  html += `<details class="show-working"><summary>Show working</summary>
    <p>Every made-up household is run through the 2026-27 rules twice, as they are and with your changes, and the differences are added up, weighted to stand for the whole UK. "Static" means nobody changes what they earn or claim. The figure allowing for responses uses ${SOURCES.sfc}, rising with income, with a low and high figure at half and one and a half times them. Benefits and employer National Insurance stay static.</p>
    ${s.reckoner.length ? `<p>VAT, duties, corporation tax, capital gains and inheritance tax, stamp duty and insurance premium tax aren't in the household model. Changes to them are costed from ${SOURCES.rr}: HMRC's own costings of standard changes, which already allow for how people respond, scaled to the size of your change along straight lines between HMRC's figures. They count the same in both headline figures. HMRC gives its first year as 2026-27; later years are in the borrowing section.</p>` : ""}
    <p>Confidence grade ${COSTING_GRADE}: ${esc(GRADE_MEANING[COSTING_GRADE])} Changes HMRC costs exactly are grade A: ${esc(GRADE_MEANING.A)} (C would be international evidence, D an informed guess.)</p>
    <p>How each change checks against ${SOURCES.rr} and other published figures:</p>
    <ul>${changes.map((ch) => `<li>${esc(changeLabel(ch.lever))}: ${CHECK_LABEL[leverCheck(ch.lever, fits[ch.lever]).check]}. ${esc(leverCheck(ch.lever, fits[ch.lever]).why)}</li>`).join("")}</ul>
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
  const fmt = (x: number) => (winnersMode === "pounds" ? pounds(x, true) : signedPct(x));
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
    ${groups.map((g) => `<tr><td>${esc(g.label)}</td><td class="num ${g.meanChange < -26 ? "neg" : g.meanChange > 26 ? "pos" : ""}">${pounds(g.meanChange, true)}</td><td class="num">${signedPct(g.percentOfIncome)}</td><td class="num">${share(g.lose)}</td><td class="num">${share(g.gain)}</td></tr>`).join("")}</table>`;

  $("winners").innerHTML = `
    <div class="toggle" role="group" aria-label="Show change as">
      <button type="button" data-mode="pounds" aria-pressed="${winnersMode === "pounds"}">£ a year</button>
      <button type="button" data-mode="percent" aria-pressed="${winnersMode === "percent"}">% of income</button>
    </div>
    ${lastStatic?.reckoner.length ? `<p class="empty">Not included yet: changes to taxes costed from HMRC's figures (${esc(lastStatic.reckoner.map((c) => LEVER[c.lever]!.label).join("; "))}). Who pays them isn't shared out to households yet.</p>` : ""}
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
  redrawTaxChart?.();
}

let redrawTaxChart: (() => void) | undefined;
renderForm(form);
form.addEventListener("input", updateHousehold);
renderLevers();
filterLevers();
renderPolicies();
wireLevers();
redrawTaxChart = initTaxChart($("tax-chart"), rules, () => applyPolicy(rules, currentPolicy()));
placeTaxChart();
updateHousehold();
$("headline").innerHTML = currentPolicy().length ? `<div class="empty">Loading 39,000 made-up households to cost your budget…</div>` : EMPTY;
showSummary(currentPolicy().length ? "Working out your budget…" : `Today's budget<br>Main fiscal rule: met by £${FORECAST.fiscal_rules.stability.margin.toFixed(1)}bn`);
