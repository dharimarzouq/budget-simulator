import type { Parameter, RulesFile, Source, Unit } from "./schema";
import sourcesData from "../../rules/sources.yaml";

const files = import.meta.glob<RulesFile>("../../rules/*/*.yaml", { eager: true, import: "default" });

export const sources = sourcesData as Record<string, Source>;

/** All rules files, keyed by "<year>/<area>", e.g. "2026-27/income_tax". */
export const rules: Record<string, RulesFile> = {};
for (const [path, file] of Object.entries(files)) {
  const [, year, name] = path.match(/rules\/([^/]+)\/([^/]+)\.yaml$/) ?? [];
  rules[`${year}/${name}`] = file;
}

const UNITS: Unit[] = ["gbp", "gbp_per_year", "gbp_per_month", "gbp_per_week", "years", "rate", "flag"];

/** Every problem found in the rules files; empty when all is well. */
export function checkRules(all = rules, known = sources): string[] {
  const problems: string[] = [];
  for (const [key, file] of Object.entries(all)) {
    const [year, area] = key.split("/");
    if (file.year !== year) problems.push(`${key}: year says ${file.year}, folder says ${year}`);
    if (file.area !== area) problems.push(`${key}: area says ${file.area}, file name says ${area}`);
    for (const [name, p] of Object.entries(file.parameters ?? {})) {
      problems.push(...checkParameter(p, known).map((msg) => `${key}.${name}: ${msg}`));
    }
  }
  return problems;
}

function checkParameter(p: Parameter, known: Record<string, Source>): string[] {
  const problems: string[] = [];
  if (!p.label) problems.push("missing label");
  if (!UNITS.includes(p.unit)) problems.push(`unknown unit ${p.unit}`);
  if (!p.source) problems.push("missing source");
  else if (!known[p.source]) problems.push(`source ${p.source} is not in sources.yaml`);
  if ((p.value === undefined) === (p.bands === undefined)) problems.push("needs exactly one of value or bands");

  if (p.unit === "flag" && p.value !== undefined && typeof p.value !== "boolean") problems.push("a flag must be true or false");
  if (p.unit !== "flag" && p.value !== undefined && (typeof p.value !== "number" || !Number.isFinite(p.value))) {
    problems.push("value must be a number");
  }
  if (p.unit === "rate" && typeof p.value === "number" && (p.value < 0 || p.value > 1)) problems.push("a rate must be between 0 and 1");
  if (p.unit !== "rate" && p.unit !== "flag" && typeof p.value === "number" && p.value < 0) problems.push("amount can't be negative");

  if (p.bands) {
    if (p.bands.length === 0) problems.push("bands are empty");
    if (p.bands[0]?.threshold !== 0) problems.push("the first band must start at 0");
    p.bands.forEach((b, i) => {
      if (b.rate < 0 || b.rate > 1) problems.push(`band ${i + 1}: rate must be between 0 and 1`);
      const prev = p.bands![i - 1];
      if (prev && b.threshold <= prev.threshold) problems.push(`band ${i + 1}: thresholds must increase`);
    });
  }
  return problems;
}

/** Look up one parameter; throws if it doesn't exist, so a typo never silently becomes zero. */
export function param(year: string, area: string, name: string): Parameter {
  const p = rules[`${year}/${area}`]?.parameters[name];
  if (!p) throw new Error(`No parameter ${year}/${area}.${name}`);
  return p;
}
