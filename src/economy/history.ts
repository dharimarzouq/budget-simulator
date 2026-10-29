// History, forecast and your choices for each headline measure, as a share of GDP (forecasts/history-2026-10.yaml,
// built by data/build_history.py from the OBR's public finances databank and ONS GDP).
import historyData from "../../forecasts/history-2026-10.yaml";
import { FORECAST, type Path } from "./fiscal";

export type Measure = "current_budget_deficit" | "borrowing" | "psnd" | "receipts" | "spending" | "investment" | "real_growth";

type Row = Record<Measure | "psnfl", number | null>;
const DATA = historyData as { sources: string[]; first_forecast: string; years: Record<string, Row> };
export const HISTORY_SOURCES = DATA.sources;
export const FIRST_FORECAST = DATA.first_forecast;
export const YEARS = Object.keys(DATA.years);

export const MEASURES: { id: Measure; tab: string; label: string; about: string }[] = [
  { id: "current_budget_deficit", tab: "Current budget", label: "Current budget deficit, % of GDP",
    about: "Day-to-day spending less receipts. Below zero is a surplus, which the main fiscal rule asks for in 2029-30." },
  { id: "borrowing", tab: "Borrowing", label: "Public sector net borrowing, % of GDP", about: "The current budget deficit plus net investment." },
  { id: "psnd", tab: "Debt", label: "Public sector net debt, % of GDP",
    about: "Net debt, the most familiar measure, published since 1974-75. The debt rule uses a wider one, net financial liabilities, published only since 2008-09." },
  { id: "receipts", tab: "Tax", label: "Public sector current receipts, % of GDP", about: "All taxes and other current receipts." },
  { id: "spending", tab: "Spending", label: "Total managed expenditure, % of GDP", about: "All public spending, day-to-day and investment, including debt interest." },
  { id: "investment", tab: "Investment", label: "Public sector net investment, % of GDP", about: "Investment spending less depreciation." },
  { id: "real_growth", tab: "Growth", label: "Real GDP growth, % a year",
    about: "The ONS's outturn, then the OBR's forecast. Your budget only changes it in the version that allows for the effect on the economy (grade C)." },
];

/** History (outturn) and the OBR's forecast for a measure, by financial year. */
export function baselineSeries(m: Measure): { year: string; value: number | null; forecast: boolean }[] {
  return YEARS.map((y) => ({ year: y, value: DATA.years[y]![m], forecast: y >= FIRST_FORECAST }));
}

const gdp = (y: string, centred = false) => {
  const i = FORECAST.years.indexOf(y);
  return (FORECAST.series[centred ? "gdp_centred" : "gdp"]!.values as number[])[i]!;
};

/**
 * Your choices: the OBR's forecast plus your budget's effect on the measure, in the forecast years (from `path`, the
 * borrowing and debt path the simulator works out, in £bn). Shares of GDP use the OBR's GDP; the effect on the
 * economy changes growth (and borrowing, through `path`), not the GDP the shares are of.
 */
export function yoursSeries(m: Measure, path: Path): Map<string, number> {
  const out = new Map<string, number>();
  for (const y of path.years) {
    const base = DATA.years[y.year]?.[m];
    if (base === null || base === undefined) continue;
    const share = (bn: number, centred = false) => (bn / gdp(y.year, centred)) * 100;
    const change: Record<Measure, number> = {
      borrowing: share(y.borrowing),
      current_budget_deficit: share(y.borrowing - y.investment),
      psnd: share(y.debt, true),
      receipts: share(y.taxRaised + y.behaviour),
      spending: share(y.spending + y.investment - y.benefitsCut + y.debtInterest),
      investment: share(y.investment),
      real_growth: 0,
    };
    out.set(y.year, base + change[m]);
  }
  if (m === "real_growth") {
    // A change in the level of GDP from one year to the next changes that year's growth by about the difference.
    let last = 0;
    for (const y of path.years) {
      const base = DATA.years[y.year]?.real_growth;
      if (base === null || base === undefined) continue;
      out.set(y.year, base + (y.gdp - last));
      last = y.gdp;
    }
  }
  return out;
}
