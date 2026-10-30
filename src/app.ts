// The budget page ("workbench"): levers on the left, results on the right, updating as you go.
// Costing runs in a worker: static figures and winners and losers arrive first, the behavioural figure after.
import { calculate, ruleSet } from "./engine";
import { readForm, renderForm, renderResult } from "./calculator";
import { LEVERS, LEVER, type Lever, type LeverValue } from "./policy/levers";
import { applyPolicy, coveredLevers, effectiveChanges, policyFromQuery, policyToQuery, type Policy } from "./policy/policy";
import { REMOVAL, REMOVAL_FOR } from "./policy/removals";
import { LIBRARY, NAMED, resolve, status } from "./policy/library";
import { initTaxChart } from "./taxchart";
import { initImpact } from "./impact";
import { FORECAST, START_YEAR, baseline, fiscalPath, type Path } from "./economy/fiscal";
import { CHECK_LABEL, CHECK_MEANING, COSTING_GRADE, GRADE_MEANING, costingGrade, leverCheck, policyCheck, type Check } from "./policy/grades";
import { isReckonerLever, type Fit } from "./policy/reckoner";
import { sharedOut } from "./policy/indirect";
import { planFor } from "./policy/spending";
import { drawPicture, type Picture } from "./sharepic";
import { inHouseholdModel } from "./policy/costing";
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

/** A lever's name for screen readers: its label, with its group where another lever shares the label ("Health and Social Care, Investment spending"). */
const SHARED_LABELS = new Set(LEVERS.map((l) => l.label).filter((label, i, all) => all.indexOf(label) !== i));
const spokenName = (l: Lever) => (SHARED_LABELS.has(l.label) ? `${l.label}, ${l.group}` : l.label);

/** A slider that is a change from today, either way (so it can go below zero). */
const isChange = (l: Lever) => l.unit === "change_share" || l.unit === "change_gbp" || l.unit === "change_bn";

function showValue(l: Lever, v: LeverValue): string {
  if (l.unit === "flag") return v ? "On" : "Off";
  if (l.unit === "rate") return `${+((v as number) * 100).toFixed(2)}%`;
  if (isChange(l)) {
    const n = v as number;
    if (Math.abs(n) < 1e-9) return "no change";
    const sign = n > 0 ? "+" : "−";
    if (l.unit === "change_share") return `${sign}${+Math.abs(n * 100).toFixed(2)}%`;
    if (l.unit === "change_bn") return `${sign}£${+Math.abs(n).toFixed(2)}bn`;
    return `${sign}£${Math.abs(n).toLocaleString("en-GB")}`;
  }
  const n = v as number;
  return `£${n.toLocaleString("en-GB", { maximumFractionDigits: n % 1 ? 2 : 0, minimumFractionDigits: n % 1 ? 2 : 0 })}${PER[l.unit]}`;
}

// ---- the policy, kept in the URL so a budget can be shared -------------------------------------
const policy = new Map<string, LeverValue>(policyFromQuery(location.search.slice(1)).map((c) => [c.lever, c.value]));
const currentPolicy = (): Policy => effectiveChanges(rules, [...policy].map(([lever, value]) => ({ lever, value })));

// ---- assumptions, kept in the URL beside the policy ----------------------------------------------
type Respond = "none" | "low" | "central" | "high";
const params = new URLSearchParams(location.search);
const assume = {
  respond: (["none", "low", "central", "high"].includes(params.get("respond") ?? "") ? params.get("respond") : "central") as Respond,
  economy: params.get("economy") === "1",
};
const RESPOND_LABEL: Record<Respond, string> = { none: "nobody responding", low: "smaller responses", central: "allowing for responses", high: "larger responses" };
/** The response to household tax changes the assumptions pick (none: the static costing). */
const chosen = (b: { low: number; central: number; high: number } | undefined) => (!b || assume.respond === "none" ? 0 : b[assume.respond]);

function writeUrl() {
  const q = [policyToQuery(currentPolicy()), assume.respond !== "central" ? `respond=${assume.respond}` : "", assume.economy ? "economy=1" : ""].filter(Boolean).join("&");
  history.replaceState(null, "", q ? `?${q}` : location.pathname);
}

function policyChanged() {
  writeUrl();
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
  if (l.unit === "change_share") return { min: -100 * (l.limit ?? 0.2), max: 100 * (l.limit ?? 0.2), step: 1, scale: 100 };
  if (l.unit === "change_bn") return { min: -(l.limit ?? 5), max: l.limit ?? 5, step: l.step, scale: 1 };
  if (l.unit === "change_gbp") return { min: -10 * l.step, max: 10 * l.step, step: l.step, scale: 1 };
  if (l.unit === "rate") return { min: today - Math.min(10, Math.floor(today)), max: Math.min(100, today + 10), step: 1, scale: 100 };
  return { min: 0, max: Math.max((l.get(rules) as number) * 2, l.step * 20), step: l.step, scale: 1 };
}

/** A department's 2027-28 plan, £bn, for its day-to-day or investment slider. */
const DEPT = /^(rdel|cdel)_(.+)$/;
const deptPlan = (id: string) => {
  const m = DEPT.exec(id);
  return m ? planFor(m[2]!, m[1] as "rdel" | "cdel") : undefined;
};
const biggestPlan = (kind: string) => Math.max(...LEVERS.filter((l) => l.id.startsWith(`${kind}_`)).map((l) => deptPlan(l.id) ?? 0));
/** The plan with your change, against the biggest department's plan (with room to grow), so the bars compare departments too. */
const planWidth = (id: string, change: number) => `${Math.max(0, Math.min(100, ((deptPlan(id)! + change) / (1.25 * biggestPlan(id.slice(0, 4)))) * 100)).toFixed(1)}%`;

function leverRow(l: Lever): string {
  const today = l.get(rules);
  const plan = deptPlan(l.id);
  const v = policy.get(l.id) ?? today;
  const removal = REMOVAL_FOR[l.id];
  const removeButton = removal
    ? `<button type="button" class="remove" data-remove="${removal.id}" aria-label="Remove: ${esc(removal.label)}" title="${esc(removal.means)}">Remove</button>`
    : "";
  const note = l.note ? info(l.label, l.note) : undefined;
  const todayText = plan === undefined ? `today ${showValue(l, today)}` : `plan ${bnFixed(plan)}`;
  const name = `<div class="name"><span>${esc(l.label)}${note?.button ?? ""}</span><span class="today">${esc(todayText)}${removeButton}</span></div>${note?.panel ?? ""}`;
  if (removal && policy.get(removal.id)) {
    return `<div class="lever removed" data-id="${l.id}"><div class="name"><span>${esc(l.label)}</span><span class="today">today ${esc(showValue(l, today))}</span></div>
      <div class="removed-note"><strong>Removed.</strong> ${esc(removal.means)}</div>
      <button type="button" data-restore="${removal.id}">Bring back</button></div>`;
  }
  const spoken = esc(spokenName(l));
  const undo = `<button type="button" class="undo" data-undo="${l.id}" aria-label="Reset ${spoken}" title="Back to today's value">×</button>`;
  if (l.unit === "flag") {
    return `<div class="lever" data-id="${l.id}">${name}<label class="check flag"><input type="checkbox" data-flag="${l.id}"${v ? " checked" : ""}> ${esc(l.label)} in force</label>${undo}</div>`;
  }
  const { min, max, step, scale } = range(l);
  const shown = +((v as number) * scale).toFixed(4);
  const unit = scale === 100 ? "%" : l.unit === "change_bn" ? "£bn" : "£";
  return `<div class="lever" data-id="${l.id}">${name}
    <input type="range" min="${min}" max="${max}" step="${step}" value="${shown}" data-range="${l.id}" aria-label="${spoken}" aria-valuetext="${esc(showValue(l, v))}">
    <input type="number" step="${scale === 100 ? "any" : step}" value="${shown}" data-number="${l.id}" aria-label="${spoken}, ${unit}">
    ${undo}${plan === undefined ? "" : `<div class="plan-bar" aria-hidden="true"><span style="width:${planWidth(l.id, v as number)}"></span></div>`}</div>`;
}

/** The Spending tab's groups, in the order shown; every other group is a tax, in the order the levers list them. */
const SPENDING_GROUPS = ["Day-to-day spending", "Investment spending", "Universal Credit", "Child Benefit", "Benefits outside the household model"];
const TAX_GROUPS = [...new Set(LEVERS.map((l) => l.group))].filter((g) => !SPENDING_GROUPS.includes(g));
const tabOf = (lever: string): "taxes" | "spending" => (SPENDING_GROUPS.includes(LEVER[REMOVAL[lever]?.lever ?? lever]!.group) ? "spending" : "taxes");

function renderLevers() {
  const open = new Set([...document.querySelectorAll<HTMLDetailsElement>(".group[open]")].map((d) => d.dataset.group));
  const touched = (g: string) => LEVERS.some((l) => l.group === g && (policy.has(l.id) || (REMOVAL_FOR[l.id] && policy.has(REMOVAL_FOR[l.id]!.id))));
  // Levers hidden by a removal, other than the removed lever itself (whose row says "Removed").
  const covered = coveredLevers(currentPolicy());
  for (const id of policy.keys()) if (REMOVAL[id]) covered.delete(REMOVAL[id]!.lever);
  const groups = (gs: string[]) =>
    gs
      .map((g, i) => `<details class="group" data-group="${esc(g)}"${open.has(g) || (!open.size && i === 0) || touched(g) ? " open" : ""}><summary>${esc(g)}</summary>
      ${LEVERS.filter((l) => l.group === g).map((l) => leverRow(l).replace('class="lever', covered.has(l.id) ? 'data-gone class="lever' : 'class="lever')).join("")}</details>`)
      .join("");
  $("panel-taxes").innerHTML = groups(TAX_GROUPS);
  $("panel-spending").innerHTML = groups(SPENDING_GROUPS);
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
    const bar = row.querySelector<HTMLElement>(".plan-bar span");
    if (bar) bar.style.width = planWidth(id, v as number);
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
  const changes = currentPolicy();
  const n = changes.length;
  const text = n ? `(${n} changed)` : "";
  $("changed-count").textContent = text;
  $("changed-count-phone").textContent = text;
  const counts = {
    policies: LIBRARY.filter((p) => status(p, rules, changes) !== "off").length,
    taxes: changes.filter((c) => tabOf(c.lever) === "taxes").length,
    spending: changes.filter((c) => tabOf(c.lever) === "spending").length,
    assumptions: Number(assume.respond !== "central") + Number(assume.economy),
  };
  for (const [tab, k] of Object.entries(counts)) $(`tab-${tab}`).querySelector(".tab-count")!.textContent = k ? String(k) : "";
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
  // A search or "changed only" looks across every tab.
  $("levers-drawer").classList.toggle("searching", Boolean(q || changedOnly));
}

// ---- how to use: once on a first visit, then from the header -------------------------------------
function wireGuide() {
  const guide = $("guide") as HTMLDialogElement;
  $("open-guide").addEventListener("click", () => guide.showModal());
  let seen = true;
  try {
    seen = localStorage.getItem("guide-seen") === "1";
    localStorage.setItem("guide-seen", "1");
  } catch {}
  // Not for someone opening a shared budget: they came to see it.
  if (!seen && !currentPolicy().length) guide.showModal();
}

// ---- tabs: policies, taxes, spending, assumptions ----------------------------------------------
const TABS = ["policies", "taxes", "spending", "assumptions"] as const;
function selectTab(tab: (typeof TABS)[number], focus = false) {
  for (const t of TABS) {
    const button = $(`tab-${t}`);
    button.setAttribute("aria-selected", String(t === tab));
    button.tabIndex = t === tab ? 0 : -1;
    $(`panel-${t}`).hidden = t !== tab;
  }
  if (focus) $(`tab-${tab}`).focus();
  try {
    localStorage.setItem("tab", tab);
  } catch {}
}

function wireTabs() {
  const list = document.querySelector<HTMLElement>("[role=tablist]")!;
  list.addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLElement>("[role=tab]");
    if (b) selectTab(b.id.slice(4) as (typeof TABS)[number]);
  });
  // Arrow keys move between tabs, Home and End to the ends.
  list.addEventListener("keydown", (ev) => {
    const i = TABS.indexOf((document.activeElement as HTMLElement).id.slice(4) as (typeof TABS)[number]);
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[ev.key];
    if (to === undefined || i < 0) return;
    ev.preventDefault();
    selectTab(TABS[(to + TABS.length) % TABS.length]!, true);
  });
  let saved: string | null = null;
  try {
    saved = localStorage.getItem("tab");
  } catch {}
  selectTab(TABS.includes(saved as (typeof TABS)[number]) ? (saved as (typeof TABS)[number]) : "policies");

  // Assumptions change which figures are shown, not the costing, so the last costing is redrawn.
  const respond = document.querySelector<HTMLInputElement>(`input[name=respond][value=${assume.respond}]`)!;
  respond.checked = true;
  ($("assume-economy") as HTMLInputElement).checked = assume.economy;
  $("panel-assumptions").addEventListener("change", (ev) => {
    const t = ev.target as HTMLInputElement;
    if (t.name === "respond") assume.respond = t.value as Respond;
    if (t.id === "assume-economy") assume.economy = t.checked;
    writeUrl();
    showCount();
    if (lastStatic) {
      renderHeadline(lastStatic, lastBehaviour);
      renderFiscal(lastStatic, lastBehaviour);
      renderBreakdown(lastStatic, lastLevers);
    } else showSummary(todaySummary());
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
      : isChange(l)
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

/** Focus the first control matching `selector`, if there is one (after a redraw took the focused one away). */
function refocus(selector: string) {
  document.querySelector<HTMLElement>(selector)?.focus();
}

function wireLevers() {
  const panel = $("levers");
  panel.addEventListener("input", (ev) => {
    const t = ev.target as HTMLInputElement;
    const id = t.dataset.range ?? t.dataset.number;
    if (id) {
      const l = LEVER[id]!;
      const n = Number(t.value);
      const signed = isChange(l); // a change from today can go below zero
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
  // These buttons go once pressed (the row is redrawn, or the reset button hides), so focus moves to what
  // takes their place in the same row rather than dropping to the top of the page.
  panel.addEventListener("click", (ev) => {
    const d = (ev.target as HTMLElement).dataset;
    if (d.undo) {
      setLever(d.undo, undefined);
      refocus(`[data-range="${d.undo}"], [data-flag="${d.undo}"]`);
    }
    if (d.remove) {
      setRemoval(d.remove, true);
      refocus(`[data-restore="${d.remove}"]`);
    }
    if (d.restore) {
      setRemoval(d.restore, false);
      refocus(`[data-remove="${d.restore}"]`);
    }
  });
  for (const end of ["pointerup", "change", "blur"]) panel.addEventListener(end, hideBubble, true);
  $("lever-search").addEventListener("input", () => (filterLevers(), filterPolicies()));
  $("changed-only").addEventListener("change", () => (filterLevers(), filterPolicies()));
  $("policies").addEventListener("click", (ev) => {
    const d = (ev.target as HTMLElement).dataset;
    const id = d.addPolicy ?? d.dropPolicy;
    if (d.addPolicy) addPolicy(d.addPolicy);
    if (d.dropPolicy) dropPolicy(d.dropPolicy);
    if (id) refocus(`[data-policy="${id}"] .policy-actions button`);
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
  $("picture").addEventListener("click", savePicture);
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
// Wide screens: a column of its own. Otherwise inside the results, after the scorecard and before the household
// calculator, so what the budget does to the public finances and to households comes first.
const phone = window.matchMedia("(max-width: 900px)");
const wide = window.matchMedia("(min-width: 1600px)");
function placeTaxChart() {
  const panel = $("tax-panel");
  if (wide.matches) $("results").before(panel);
  else $("household").before(panel);
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
let lastLevers: Extract<Reply, { type: "levers" }> | undefined;
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
    lastLevers = undefined;
    $("results").classList.remove("pending");
    renderHeadline(m, undefined);
    renderFiscal(m, undefined);
    renderBreakdown(m, undefined);
    renderWinners(m.distribution.deciles, m.distribution.familyTypes, m.distribution.regions, m.distribution.all);
  } else if (m.type === "levers" && lastStatic) {
    lastLevers = m;
    renderBreakdown(lastStatic, m);
  } else if (m.type === "progress") {
    const el = document.getElementById("behaviour-progress");
    if (el) el.textContent = `${Math.round(m.done * 100)}% done`;
  } else if (m.type === "behaviour" && lastStatic) {
    lastBehaviour = m.behaviour;
    renderHeadline(lastStatic, m.behaviour);
    renderFiscal(lastStatic, m.behaviour);
    renderBreakdown(lastStatic, lastLevers);
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

const EMPTY_TEXT = "This is the budget as it stands for 2026-27. Change a lever to see what it raises or costs, and who gains and loses.";

/** A fiscal rule on the scoreboard: the margin, and a bar of the room left against the OBR's forecast (the tick). */
function ruleCell(label: string, about: string, ours: number, obr: number, changed: boolean) {
  const i = info(label, about);
  const scale = Math.max(2 * obr, ours, 1);
  const width = Math.max(0, Math.min(1, ours / scale)) * 100;
  return `<div class="cell"><div class="label">${esc(label)}${i.button}</div>${i.panel}
    <div class="value ${ours < 0 ? "neg" : "pos"}">${ours < 0 ? "missed by " : "met by "}${bnFixed(Math.abs(ours))}</div>
    <div class="room${ours < 0 ? " missed" : ""}" aria-hidden="true"><span style="width:${width.toFixed(1)}%"></span><i style="left:${((obr / scale) * 100).toFixed(1)}%"></i></div>
    <div class="sub">${changed ? `${assume.economy ? "with the effect on the economy; " : ""}OBR forecast: met by ${bnFixed(obr)}` : "OBR forecast, today's policies"}</div></div>`;
}

const RULE_ABOUT = {
  stability: "The main fiscal rule: in 2029-30, taxes must cover day-to-day spending, so the current budget is in surplus. The margin is how far it's met or missed; the bar shows the room left, with a tick at the OBR's forecast. Standard costing: the economy as the OBR forecasts it.",
  debt: "The second rule: debt (public sector net financial liabilities) falling as a share of GDP between 2028-29 and 2029-30. The bar shows the room left, with a tick at the OBR's forecast. Standard costing: the economy as the OBR forecasts it.",
};

function renderHeadline(s: Static | undefined, b: BehaviourFigures | undefined) {
  const changes = currentPolicy();
  const fr = FORECAST.fiscal_rules;
  if (!changes.length || !s) {
    $("headline").innerHTML = `<div class="cell wide"><div class="label">Your budget</div><div class="value small">No changes yet</div><div class="sub">${EMPTY_TEXT}</div></div>
      ${ruleCell("Main fiscal rule, 2029-30", RULE_ABOUT.stability, fr.stability.margin, fr.stability.margin, false)}
      ${ruleCell("Debt rule, 2029-30", RULE_ABOUT.debt, fr.debt.margin, fr.debt.margin, false)}`;
    return;
  }
  const fits = fitsOf(s);
  const household = changes.some((c) => inHouseholdModel(c.lever) || sharedOut(c.lever)); // anything that reaches households
  const modelled = changes.some((c) => inHouseholdModel(c.lever)); // anything the household model works out
  const check = policyCheck(changes, fits);
  const g = costingGrade(changes, fits);
  const scale = `The scale: A ${GRADE_MEANING.A} B ${GRADE_MEANING.B} C ${GRADE_MEANING.C} D ${GRADE_MEANING.D}`;
  const grade = info(`grade ${g ?? "for spending"}`, g ? `Grade ${g}: ${GRADE_MEANING[g]} ${scale}` : `Spending changes cost what you set, so there's no estimate to grade. ${scale}`);
  const raisedAbout = info(
    "what it raises",
    "Positive raises money, negative costs it, in the budget's first year. Static: nobody changes what they earn or claim. Allowing for responses: people work, earn and report income differently, using the Scottish Fiscal Commission's elasticities, with a low and high figure." +
      (s.reckoner.length ? " Other taxes are HMRC's costings, which already allow for responses, so they count the same in both." : "") +
      (s.spending.length ? " Spending changes are for 2027-28 and cost what you set." : ""),
  );
  const raised = (x: number) => `<span class="${x < 0 ? "neg" : "pos"}">${bn(x)}</span>`;
  // The headline is the figure the assumptions pick; the static figure is always shown under it, never blended.
  const responds = b && assume.respond !== "none" && (b.low !== 0 || b.high !== 0);
  const headline = responds ? s.netRevenue + chosen(b) : s.netRevenue;
  const unit = responds ? RESPOND_LABEL[assume.respond] : "static";
  const underneath = responds
    ? `static (nobody responding): <strong>${raised(s.netRevenue)}</strong>${
        assume.respond === "central" ? `; range ${bn(s.netRevenue + Math.min(b.low, b.high), false)} to ${bn(s.netRevenue + Math.max(b.low, b.high), false)}` : ""
      }`
    : assume.respond === "none"
      ? "assumed: nobody responds (Assumptions)"
      : !b
        ? `${RESPOND_LABEL[assume.respond]}: working it out… <span id="behaviour-progress"></span>`
        : !modelled
          ? s.reckoner.length
            ? "responses are already in HMRC's costings"
            : "spending changes cost what's set"
          : changes.some((c) => inHouseholdModel(c.lever) && !/^(uc|cb)_/.test(REMOVAL[c.lever]?.lever ?? c.lever)) // a household tax change
            ? "responses make no difference to what's raised here"
            : "no household tax changes; benefits are costed static";
  const path = fiscalPath(s.change, chosen(b), { economy: assume.economy, reckoner: s.reckoner, spending: s.spending });
  const all = s.distribution.all;
  $("headline").innerHTML = `
    <div class="cell wide"><div class="label">Raised (+) or cost (−) a year${raisedAbout.button}</div>${raisedAbout.panel}
      <div class="value">${raised(headline)} <span class="unit">${unit}</span></div><div class="sub">${underneath}</div></div>
    ${ruleCell("Main fiscal rule, 2029-30", RULE_ABOUT.stability, path.stabilityMargin, fr.stability.margin, true)}
    ${ruleCell("Debt rule, 2029-30", RULE_ABOUT.debt, path.debtMargin, fr.debt.margin, true)}
    <div class="cell"><div class="label">Households losing / gaining</div>${
      household
        ? `<div class="value">${share(all.lose)} / ${share(all.gain)}</div><div class="sub">by more than £1 a week${
            s.reckoner.some((c) => !sharedOut(c.lever)) || s.spending.length ? "; leaves out changes not shared out" : ""
          }</div>`
        : `<div class="value small">not worked out</div><div class="sub">${s.spending.length && !s.reckoner.length ? "spending isn't shared out to households" : "these changes aren't shared out yet"}</div>`
    }</div>
    <div class="cell"><div class="label">How far to trust it</div><div class="value small">${g ? `<span class="grade">${g}</span>` : "spending as set"}${grade.button} ${checkBadge(check)}</div>${grade.panel}<div class="sub">${
      g ? (g === "A" ? "HMRC's own costing" : "our model, or HMRC's scaled") : "no estimate to grade"
    }</div></div>`;
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
    lines.push(`Changes: ${changes.map(changeLine).join("; ")}`);
    const s = lastStatic.netRevenue;
    const responds = lastBehaviour && assume.respond !== "none";
    const total = s + chosen(lastBehaviour);
    lines.push(`${total < 0 ? "Costs" : "Raises"} ${bn(Math.abs(total), false)} a year${responds ? `, ${RESPOND_LABEL[assume.respond]} (${bn(Math.abs(s), false)} before that)` : " before allowing for how people respond"}`);
    const path = fiscalPath(lastStatic.change, chosen(lastBehaviour), { economy: assume.economy, reckoner: lastStatic.reckoner, spending: lastStatic.spending });
    const m = path.stabilityMargin;
    lines.push(`Main fiscal rule (current budget in surplus in 2029-30): ${m < 0 ? "missed" : "met"} by £${Math.abs(m).toFixed(1)}bn${assume.economy ? ", including the effect on the economy" : ""} (OBR forecast: met by £${FORECAST.fiscal_rules.stability.margin.toFixed(1)}bn)`);
    const all = lastStatic.distribution.all;
    lines.push(`Households: ${share(all.lose)} lose and ${share(all.gain)} gain more than £1 a week`);
  }
  lines.push(location.href);
  return lines.join("\n");
}

/** A picture of the budget: shared from a phone, saved as a file elsewhere. */
async function savePicture() {
  const button = $("picture") as HTMLButtonElement;
  const changes = currentPolicy();
  const s = lastStatic;
  const fr = FORECAST.fiscal_rules;
  const ruleText = (x: number) => `${x < 0 ? "missed by" : "met by"} ${bnFixed(Math.abs(x))}`;
  let picture: Picture;
  if (!changes.length || !s) {
    const p = fiscalPath(noChange, 0);
    picture = {
      changes: [changes.length ? "Still working out the figures" : "No changes: today's budget"],
      headline: "£0", headlineNote: "nothing changed", households: "no change", path: p,
      rules: [
        { label: "Main fiscal rule, 2029-30", text: ruleText(fr.stability.margin), met: true },
        { label: "Debt rule, 2029-30", text: ruleText(fr.debt.margin), met: true },
      ],
      footer: "",
    };
  } else {
    const b = lastBehaviour;
    const total = s.netRevenue + chosen(b);
    const path = fiscalPath(s.change, chosen(b), { economy: assume.economy, reckoner: s.reckoner, spending: s.spending });
    const responds = b && assume.respond !== "none" && (b.low !== 0 || b.high !== 0);
    picture = {
      changes: changes.map(changeLine),
      headline: `${total < 0 ? "Costs" : "Raises"} ${bn(Math.abs(total), false)} a year`,
      headlineNote: responds ? `${RESPOND_LABEL[assume.respond]} (${bn(s.netRevenue)} static)` : "static: nobody changes what they earn or claim",
      rules: [
        { label: `Main fiscal rule, 2029-30${assume.economy ? ", with the economy" : ""}`, text: ruleText(path.stabilityMargin), met: path.stabilityMargin >= 0 },
        { label: `Debt rule, 2029-30${assume.economy ? ", with the economy" : ""}`, text: ruleText(path.debtMargin), met: path.debtMargin >= 0 },
      ],
      households: changes.some((c) => inHouseholdModel(c.lever) || sharedOut(c.lever))
        ? `${share(s.distribution.all.lose)} lose, ${share(s.distribution.all.gain)} gain more than £1 a week`
        : "not worked out for these changes",
      path,
      footer: "",
    };
  }
  picture.footer = `UK budget simulator. Estimates from made-up households weighted to published UK totals, with HMRC and OBR figures. ${location.host}`;
  try {
    const blob = await drawPicture(picture);
    const file = new File([blob], "my-uk-budget.png", { type: "image/png" });
    if (phone.matches && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "My UK budget", url: location.href });
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      button.textContent = "Picture saved";
    }
  } catch (e) {
    if ((e as Error).name !== "AbortError") button.textContent = "Couldn't make the picture";
  }
  setTimeout(() => (button.textContent = "Save a picture"), 2000);
}

const todaySummary = () => `Today's budget<br>Main fiscal rule: met by £${FORECAST.fiscal_rules.stability.margin.toFixed(1)}bn`;

/** Phones: one line on the bar at the bottom. */
function showSummary(text: string) {
  $("summary-text").innerHTML = text;
}

// ---- borrowing and debt ------------------------------------------------------------------------
const bnFixed = (x: number, dp = 1) => `${x < 0 ? "−" : ""}£${Math.abs(x).toFixed(dp)}bn`;
const signedBn = (x: number) => (Math.abs(x) < 0.05 ? "£0.0bn" : `${x > 0 ? "+" : "−"}£${Math.abs(x).toFixed(1)}bn`);

function renderFiscal(s: Static, b: BehaviourFigures | undefined) {
  const changed = currentPolicy().length > 0;
  const behaviour = chosen(b);
  const path = fiscalPath(s.change, behaviour, { reckoner: s.reckoner, spending: s.spending });
  const econ = fiscalPath(s.change, behaviour, { economy: true, reckoner: s.reckoner, spending: s.spending });
  const lowHigh = [FORECAST.multipliers.range_low, FORECAST.multipliers.range_high].map((k) => fiscalPath(s.change, behaviour, { economy: true, multiplierScale: k, reckoner: s.reckoner, spending: s.spending }));
  const shown = assume.economy ? econ : path; // what the assumptions pick, for the bar on phones
  updateImpact(path, econ, changed, assume.economy);
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
      ? `${raised < 0 ? "Costs" : "Raises"} <strong>${bn(Math.abs(raised), false)}</strong> a year${b && assume.respond !== "none" ? "" : " (static)"}<br>Main fiscal rule: <span class="${shown.stabilityMargin < 0 ? "neg" : "pos"}">${marginText(shown.stabilityMargin)}</span>`
      : todaySummary(),
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
  if (changed && !b && assume.respond !== "none") html += `<p class="small">Allowing for how people respond: working it out. Until then these use the static costing.</p>`;
  if (changed && assume.respond !== "central") html += `<p class="small">Using ${RESPOND_LABEL[assume.respond]} (set in Assumptions).</p>`;

  const row = (label: string, xs: (string | number)[], cls = "") => `<tr class="${cls}"><td>${label}</td>${xs.map((x) => `<td class="num">${x}</td>`).join("")}</tr>`;
  const debtPct = (y: string, extra: number) => `${(((psnfl[y]! + extra) / centred[y]!) * 100).toFixed(1)}%`;
  let table = `<div class="scroll-x"><table class="fiscal"><tr><th>£ billion a year</th>${years.map((y) => `<th class="num">${y}</th>`).join("")}</tr>`;
  if (changed) {
    table += row("Your budget raises (+) or costs (−)", path.years.map((y) => signedBn(y.taxRaised + y.benefitsCut + y.behaviour - y.spending - y.investment)));
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
    <p>Extra borrowing adds to the debt, and that adds to interest costs, at the rates implied by the OBR's debt interest ready reckoner. Taxes, benefits and day-to-day spending change the current budget, which the main rule is about; investment spending adds to borrowing and debt but not to the current budget. Spending changes are set for 2027-28 and grow with each department's plans (after the years the plans cover, with the OBR's total), or with the OBR's forecast for each benefit. England-only budgets carry their Barnett share for Scotland, Wales and Northern Ireland. Debt here is public sector net financial liabilities, the measure the rule uses.</p>
    <p>Grade ${COSTING_GRADE} for the standard figures, which leave the economy as the OBR forecasts it, as official costings do. The lines "with the effect on the economy" use the OBR's published fiscal multipliers (a tax change worth 1% of GDP moves GDP by 0.33% in its first year, fading to nothing by the fifth; benefits 0.60%, departments' day-to-day spending 0.45% and their investment 1.00%), and the OBR's rule that borrowing rises by 0.5% of GDP for each 1% the economy is below its potential, plus 0.2% the year after. The OBR calls its multipliers a highly uncertain starting point, so this part is grade C, with a range from half to one and a half times them (our judgement; the OBR doesn't publish a range). These effects are temporary: by 2031-32 they have all but gone.</p>
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

/** One change in a line of plain text: from today's value to yours, or the change itself for a change-from-today slider. */
function changeLine(c: { lever: string; value: LeverValue }): string {
  if (REMOVAL[c.lever]) return changeLabel(c.lever);
  const l = LEVER[c.lever]!;
  return isChange(l) ? `${l.label} (${l.group.toLowerCase()}): ${showValue(l, c.value)}` : `${l.label}: ${showValue(l, l.get(rules))} → ${showValue(l, c.value)}`;
}

/** A change's name with what it does underneath. */
function changeText(id: string): string {
  const x = REMOVAL[id];
  if (x) return `${esc(changeLabel(id))}<div class="working">${esc(x.means)}</div>`;
  const l = LEVER[id]!;
  return `${esc(l.label)}<div class="working">${esc(l.group)}: ${esc(showValue(l, l.get(rules)))} → ${esc(showValue(l, policy.get(id)!))}</div>`;
}

/**
 * The scorecard: each measure on its own, year by year, then what joins them up (their overlap, people's responses, the
 * economy if the assumptions include it, and interest on the debt), adding up to the change in borrowing.
 */
function scorecard(s: Static, levers: Levers | undefined): string {
  const changes = currentPolicy();
  const b = lastBehaviour;
  const shown = fiscalPath(s.change, chosen(b), { economy: assume.economy, reckoner: s.reckoner, spending: s.spending });
  const years = shown.years.filter((y) => y.year >= START_YEAR);
  const raisedBy = (y: Path["years"][number]) => y.taxRaised + y.benefitsCut - y.spending - y.investment;
  const cell = (x: number) => `<td class="num ${x < -0.05 ? "neg" : x > 0.05 ? "pos" : ""}">${signedBn(x)}</td>`;
  const working = `<td class="num small" colspan="${years.length}">working…</td>`;
  const row = (label: string, xs: number[] | undefined, check = "", cls = "") =>
    `<tr class="${cls}"><td>${label}</td>${xs ? xs.map(cell).join("") : working}<td>${check}</td></tr>`;
  const fits = fitsOf(s);
  const sum = years.map(() => 0);
  let html = `<div class="scroll-x"><table class="fiscal scorecard"><tr><th>£ billion a year: + raises money, − costs it</th>${years.map((y) => `<th class="num">${y.year}</th>`).join("")}<th>Checks</th></tr>`;
  for (const ch of changes) {
    const own = levers?.perLever.find((p) => p.lever === ch.lever);
    const xs = own && fiscalPath(own.change, 0, { reckoner: own.reckoner, spending: own.spending }).years.filter((y) => y.year >= START_YEAR).map(raisedBy);
    xs?.forEach((x, i) => (sum[i]! += x));
    const g = leverCheck(ch.lever, fits[ch.lever]);
    html += row(changeText(ch.lever), xs, checkBadge(g.check, g.why));
  }
  if (changes.length > 1) {
    html += row(`Overlap between the changes<div class="working">e.g. a tax rise reduces Universal Credit; a rate rise on a bigger allowance raises less</div>`, levers && years.map((y, i) => raisedBy(y) - sum[i]!));
  }
  if (changes.some((c) => inHouseholdModel(c.lever)) && assume.respond !== "none") {
    html += row(`People's responses<div class="working">${RESPOND_LABEL[assume.respond]}, to income tax and National Insurance changes</div>`, b && years.map((y) => y.behaviour));
  }
  if (assume.economy) html += row(`Effect on the economy<div class="working">the OBR's multipliers (grade C)</div>`, years.map((y) => -y.cyclical));
  html += row(`Interest on the debt<div class="working">at the rates in the OBR's ready reckoner</div>`, years.map((y) => -y.debtInterest));
  html += row("Less borrowing (+) or more (−)", years.map((y) => -y.borrowing), "", "total");
  return html + `</table></div>`;
}

function renderBreakdown(s: Static, levers: Levers | undefined) {
  const changes = currentPolicy();
  if (!changes.length) {
    $("breakdown").innerHTML = `<p class="small">Nothing changed yet. Each measure you add gets a row here, costed year by year.</p>`;
    return;
  }
  const signed = (x: number) => `<td class="num ${x < -5e5 ? "neg" : x > 5e5 ? "pos" : ""}">${bn(x)}</td>`;
  let html = scorecard(s, levers);
  html += `<h3>The first year, by tax and benefit</h3><table class="first-year"><tr><th>Effect on the public finances</th><th class="num">£ a year</th></tr>`;
  for (const [k, label, sign] of EFFECTS) {
    if (Math.abs(s.change[k]) < 5e5) continue;
    html += `<tr><td>${label}</td>${signed(sign * s.change[k])}</tr>`;
  }
  for (const c of s.reckoner) {
    html += `<tr><td>${esc(LEVER[c.lever]!.label)}<div class="working">HMRC's costing, allowing for responses</div></td>${signed(c.raises[0]!)}</tr>`;
  }
  for (const c of s.spending) {
    const l = LEVER[c.lever]!;
    html += `<tr><td>${esc(l.label)}<div class="working">${esc(l.group)}, 2027-28</div></td>${signed(-c.first)}</tr>`;
  }
  const barnett = s.spending.reduce((sum, c) => sum + c.barnett, 0);
  if (Math.abs(barnett) >= 5e5) {
    html += `<tr><td>Scotland, Wales and Northern Ireland<div class="working">Their Barnett share of England-only spending changes (HM Treasury's formula)</div></td>${signed(-barnett)}</tr>`;
  }
  html += `<tr class="total"><td>Total${s.reckoner.length ? "" : " (static)"}</td>${signed(s.netRevenue)}</tr></table>`;
  const fits = fitsOf(s);
  html += `<details class="show-working"><summary>Show working</summary>
    <p>Every made-up household is run through the 2026-27 rules twice, as they are and with your changes, and the differences are added up, weighted to stand for the whole UK. "Static" means nobody changes what they earn or claim. The figure allowing for responses uses ${SOURCES.sfc}, rising with income, with a low and high figure at half and one and a half times them. Benefits and employer National Insurance stay static.</p>
    <p>In the scorecard each measure is costed on its own, static, and carried forward the same way as the borrowing figures. Measures overlap, so on their own they don't quite add up to the whole package: the difference is the overlap row. People's responses, the economy (if included in Assumptions) and interest on the extra debt are worked out for the package as a whole. The bottom line is the change in borrowing, the same as in the borrowing section.</p>
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
    ${(() => {
      const out = lastStatic?.reckoner.filter((c) => !sharedOut(c.lever)) ?? [];
      const shared = lastStatic?.reckoner.filter((c) => sharedOut(c.lever)) ?? [];
      return (
        (out.length ? `<p class="empty">Not included: ${esc(out.map((c) => LEVER[c.lever]!.label).join("; "))}. These fall on companies, estates and property buyers, and there's no published breakdown by household income to share them out with.</p>` : "") +
        (shared.length ? `<p class="small">VAT and duties are shared out by income tenth in proportion to what each tenth pays now (ONS, 2023-24), the same for every household in a tenth: approximate.</p>` : "") +
        (lastStatic?.spending.length ? `<p class="empty">Not included: spending changes. Public services and the benefits outside the household model aren't shared out to households yet.</p>` : "")
      );
    })()}
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
const updateImpact = initImpact($("impact"));
renderForm(form);
form.addEventListener("input", updateHousehold);
renderLevers();
filterLevers();
renderPolicies();
wireLevers();
wireTabs();
wireGuide();
redrawTaxChart = initTaxChart($("tax-chart"), rules, () => applyPolicy(rules, currentPolicy()));
// The impact chart shows the OBR's forecast until a costing arrives.
const noChange = { incomeTax: 0, employeeNI: 0, employerNI: 0, selfEmployedNI: 0, childBenefitCharge: 0, childBenefit: 0, universalCredit: 0 };
updateImpact(fiscalPath(noChange, 0), fiscalPath(noChange, 0, { economy: true }), false, assume.economy);
placeTaxChart();
updateHousehold();
if (currentPolicy().length) $("headline").innerHTML = `<div class="empty">Loading 39,000 made-up households to cost your budget…</div>`;
else renderHeadline(undefined, undefined);
showSummary(currentPolicy().length ? "Working out your budget…" : todaySummary());
