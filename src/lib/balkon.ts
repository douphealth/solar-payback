// Pure balcony-solar (Balkonkraftwerk) calculation. No network or side effects.
export type Clip = { ratios: number[]; retained: number[] };

export type BalkonInputs = {
  kwhPerKwp: number; // PVGIS long-term yearly yield per kWp for the chosen tilt and orientation
  moduleWp: number; // total panel power
  inverterW: number; // inverter output cap (800 W in Germany)
  clip: Clip | null; // hourly-derived share of energy kept under the cap; null = cap not modelled
  selfUsePct: number; // share of the output used in the home
  priceCt: number; // electricity price in cent per kWh
  cost: number; // purchase price in euro
};

export type BalkonResult = {
  rawKwh: number;
  annualKwh: number;
  clipLossPct: number | null;
  usedKwh: number;
  savingsEur: number;
  paybackYears: number | null;
  net20Eur: number;
};

/** Share of energy kept when the inverter cap equals `ratio` watts per panel watt. Linear between grid points. */
export function retainedAt(clip: Clip, ratio: number): number {
  const { ratios, retained } = clip;
  if (!ratios.length) return 1;
  if (ratio >= 1) return 1; // hourly output per panel watt never exceeds 1 after system losses
  if (ratio >= ratios[ratios.length - 1]!) return retained[retained.length - 1]!;
  if (ratio <= ratios[0]!) return retained[0]! * (ratio / ratios[0]!);
  for (let i = 1; i < ratios.length; i++) {
    if (ratio <= ratios[i]!) {
      const a = ratios[i - 1]!, b = ratios[i]!, t = (ratio - a) / (b - a);
      return retained[i - 1]! + t * (retained[i]! - retained[i - 1]!);
    }
  }
  return 1;
}

export function calcBalkon(i: BalkonInputs): BalkonResult {
  const rawKwh = Math.max(0, i.kwhPerKwp) * Math.max(0, i.moduleWp) / 1000;
  const keep = i.clip && i.moduleWp > 0 ? Math.min(1, retainedAt(i.clip, i.inverterW / i.moduleWp)) : 1;
  const annualKwh = rawKwh * keep;
  const usedKwh = annualKwh * Math.min(100, Math.max(0, i.selfUsePct)) / 100;
  const savingsEur = usedKwh * Math.max(0, i.priceCt) / 100;
  return {
    rawKwh,
    annualKwh,
    clipLossPct: i.clip ? (1 - keep) * 100 : null,
    usedKwh,
    savingsEur,
    paybackYears: savingsEur > 0 ? i.cost / savingsEur : null,
    net20Eur: savingsEur * 20 - i.cost,
  };
}

const de0 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const de1 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const fmt = (n: number, digits: 0 | 1 = 0) => (digits ? de1 : de0).format(n);
