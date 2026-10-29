// A picture of a budget to share: its changes, what it raises or costs, the fiscal rules, households, and borrowing
// with the budget against the OBR's forecast. Drawn on a canvas in the page's own colours and fonts.
import { baselineSeries, yoursSeries } from "./economy/history";
import type { Path } from "./economy/fiscal";

export type Picture = {
  changes: string[];
  /** The headline figure and what it is, e.g. "Raises £8.8bn a year" and "allowing for responses (£8.9bn static)". */
  headline: string;
  headlineNote: string;
  rules: { label: string; text: string; met: boolean }[];
  households: string;
  path: Path;
  footer: string;
};

const W = 1200, H = 630;

export async function drawPicture(p: Picture): Promise<Blob> {
  const css = getComputedStyle(document.documentElement);
  const c = (name: string) => css.getPropertyValue(name).trim();
  const serif = c("--serif"), mono = c("--mono"), sans = "system-ui, sans-serif";
  await document.fonts.load(`700 40px ${serif}`);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d")!;
  g.fillStyle = c("--surface");
  g.fillRect(0, 0, W, H);
  g.fillStyle = c("--red");
  g.fillRect(0, 0, W, 10);

  // Title and the changes, on the left.
  g.textBaseline = "alphabetic";
  g.fillStyle = c("--red");
  g.font = `700 44px ${serif}`;
  g.fillText("My UK budget", 48, 78);
  g.fillStyle = c("--ink-2");
  g.font = `600 15px ${sans}`;
  g.fillText("THE CHANGES", 48, 122);
  g.fillStyle = c("--ink");
  g.font = `19px ${sans}`;
  const shown = p.changes.slice(0, p.changes.length > 6 ? 5 : 6); // room below for the chart
  shown.forEach((t, i) => g.fillText(clip(g, `• ${t}`, 520), 48, 154 + i * 30));
  if (p.changes.length > shown.length) {
    g.fillStyle = c("--ink-2");
    g.fillText(`and ${p.changes.length - shown.length} more`, 48, 154 + shown.length * 30);
  }

  // The headline figure and the rules, on the right.
  const x = 640;
  g.fillStyle = c("--ink");
  g.font = `700 40px ${mono}`;
  g.fillText(clip(g, p.headline, 520), x, 82);
  g.fillStyle = c("--ink-2");
  g.font = `17px ${sans}`;
  g.fillText(clip(g, p.headlineNote, 520), x, 110);
  p.rules.forEach((r, i) => {
    const y = 172 + i * 76;
    g.fillStyle = c("--ink-2");
    g.font = `600 14px ${sans}`;
    g.fillText(r.label.toUpperCase(), x, y);
    g.fillStyle = c(r.met ? "--gain" : "--loss");
    g.font = `700 24px ${mono}`;
    g.fillText(r.text, x, y + 28);
  });
  g.fillStyle = c("--ink-2");
  g.font = `600 14px ${sans}`;
  g.fillText("HOUSEHOLDS", x, 324);
  g.fillStyle = c("--ink");
  g.font = `20px ${sans}`;
  g.fillText(clip(g, p.households, 520), x, 352);

  // Borrowing as a share of GDP since 2007-08: outturn, the OBR's forecast, your budget.
  const box = { x: 90, y: 380, w: 1060, h: 150 };
  const base = baselineSeries("borrowing").filter((d) => d.year >= "2007-08" && d.value !== null) as { year: string; value: number; forecast: boolean }[];
  const yours = yoursSeries("borrowing", p.path);
  const values = [...base.map((d) => d.value), ...yours.values()];
  const hi = Math.ceil(Math.max(...values) / 5) * 5, lo = Math.min(0, Math.floor(Math.min(...values) / 5) * 5);
  const px = (i: number) => box.x + (i / (base.length - 1)) * box.w;
  const py = (v: number) => box.y + ((hi - v) / (hi - lo)) * box.h;
  g.fillStyle = c("--ink-2");
  g.font = `600 14px ${sans}`;
  g.fillText("BORROWING, % OF GDP", box.x, box.y - 12);
  g.strokeStyle = c("--grid");
  g.lineWidth = 1;
  g.font = `13px ${sans}`;
  for (let v = lo; v <= hi; v += 5) {
    g.beginPath();
    g.moveTo(box.x, py(v));
    g.lineTo(box.x + box.w, py(v));
    g.stroke();
    g.fillText(`${v}%`, box.x - 34, py(v) + 4);
  }
  const line = (pts: [number, number][], colour: string, width: number, dash: number[] = []) => {
    g.strokeStyle = colour;
    g.lineWidth = width;
    g.setLineDash(dash);
    g.beginPath();
    pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b)));
    g.stroke();
    g.setLineDash([]);
  };
  const at = (pred: (d: (typeof base)[number]) => boolean) => base.map((d, i) => [d, i] as const).filter(([d]) => pred(d));
  const lastOutturn = at((d) => !d.forecast).at(-1)![1];
  line(at((d) => !d.forecast).map(([d, i]) => [px(i), py(d.value)] as [number, number]), c("--ink"), 2);
  const joined: [number, number] = [px(lastOutturn), py(base[lastOutturn]!.value)];
  line([joined, ...at((d) => d.forecast).map(([d, i]) => [px(i), py(d.value)] as [number, number])], c("--ink-2"), 2, [6, 5]);
  const yourPts = base.map((d, i) => [i, yours.get(d.year)] as const).filter(([, v]) => v !== undefined) as [number, number][];
  if (yourPts.length) line([joined, ...yourPts.map(([i, v]) => [px(i), py(v)] as [number, number])], c("--series"), 3.5);
  g.fillStyle = c("--ink-2");
  g.fillText(base[0]!.year.slice(0, 4), box.x, box.y + box.h + 20);
  g.textAlign = "right";
  g.fillText(base.at(-1)!.year.slice(0, 4), box.x + box.w, box.y + box.h + 20);
  g.fillStyle = c("--series");
  g.font = `600 14px ${sans}`;
  g.fillText("Your budget", box.x + box.w, box.y - 12);
  g.textAlign = "left";

  // What it is, at the bottom.
  g.fillStyle = c("--rule");
  g.fillRect(48, H - 52, W - 96, 1);
  g.fillStyle = c("--ink-2");
  g.font = `15px ${sans}`;
  g.fillText(clip(g, p.footer, W - 96), 48, H - 24);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't draw the picture"))), "image/png"));
}

/** Shorten text to fit a width, with an ellipsis. */
function clip(g: CanvasRenderingContext2D, text: string, width: number): string {
  if (g.measureText(text).width <= width) return text;
  let t = text;
  while (t.length > 1 && g.measureText(`${t}…`).width > width) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}
