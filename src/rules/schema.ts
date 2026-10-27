// The shape of a rules file. Every number the engine uses lives in rules/<year>/*.yaml
// and must name a source from rules/sources.yaml.

export type Unit =
  | "gbp" // an amount held, such as savings, not a flow
  | "gbp_per_year"
  | "gbp_per_month"
  | "gbp_per_week"
  | "years"
  | "rate" // a fraction, 0.2 means 20%
  | "flag"; // true or false

export interface Band {
  /** Start of the band, in the parameter's unit (e.g. taxable income per year). */
  threshold: number;
  rate: number;
}

export interface Parameter {
  label: string;
  unit: Unit;
  /** A single value, or a schedule of bands; exactly one of the two. */
  value?: number | boolean;
  bands?: Band[];
  /** Key into rules/sources.yaml. */
  source: string;
  /** Legislation or official guidance the value comes from. */
  legal?: string;
  note?: string;
}

export interface RulesFile {
  year: string; // e.g. "2026-27"
  area: string; // e.g. "income_tax"
  label: string;
  /** Simplifications this file makes, stated plainly. */
  limits?: string[];
  parameters: Record<string, Parameter>;
}

export interface Source {
  title: string;
  publisher: string;
  url: string;
  licence: string;
  published?: string;
  updated?: string;
  accessed: string;
}
