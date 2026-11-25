import { describe, expect, it } from "vitest";
import { calcBalkon, retainedAt } from "./balkon";
import { clipCurveFromHourly, CLIP_RATIOS } from "./pvgis.server";

const clip = { ratios: [0.4, 0.5, 0.8, 1], retained: [0.9, 0.96, 1, 1] };

describe("retainedAt", () => {
  it("interpolates between grid points", () => {
    expect(retainedAt(clip, 0.45)).toBeCloseTo(0.93, 5);
    expect(retainedAt(clip, 0.4)).toBeCloseTo(0.9, 5);
  });
  it("keeps everything when the inverter is at least as large as the panels", () => {
    expect(retainedAt(clip, 1)).toBe(1);
    expect(retainedAt(clip, 1.5)).toBe(1);
  });
});

describe("clipCurveFromHourly", () => {
  it("measures energy lost above the cap", () => {
    // two hours: 1000 W and 200 W per kWp -> total 1.2 kWh; at ratio 0.5 keep 0.5 + 0.2 = 0.7
    const hours = [1000, 200, ...Array(8000).fill(0)];
    const c = clipCurveFromHourly(hours);
    expect(c.ratios).toEqual(CLIP_RATIOS);
    expect(c.retained[CLIP_RATIOS.indexOf(0.5)]).toBeCloseTo(0.7 / 1.2, 3);
    expect(c.retained[CLIP_RATIOS.length - 1]).toBe(1);
  });
});

describe("calcBalkon", () => {
  const base = { kwhPerKwp: 700, moduleWp: 800, inverterW: 800, clip, selfUsePct: 50, priceCt: 35, cost: 500 };
  it("computes yield, savings and payback", () => {
    const r = calcBalkon(base);
    expect(r.annualKwh).toBeCloseTo(560, 5);
    expect(r.usedKwh).toBeCloseTo(280, 5);
    expect(r.savingsEur).toBeCloseTo(98, 5);
    expect(r.paybackYears).toBeCloseTo(500 / 98, 5);
    expect(r.clipLossPct).toBe(0);
  });
  it("applies the 800 W cap to oversized panels", () => {
    const r = calcBalkon({ ...base, moduleWp: 2000 });
    expect(r.rawKwh).toBeCloseTo(1400, 5);
    expect(r.annualKwh).toBeCloseTo(1260, 5);
    expect(r.clipLossPct).toBeCloseTo(10, 5);
  });
  it("returns no payback when nothing is saved", () => {
    expect(calcBalkon({ ...base, selfUsePct: 0 }).paybackYears).toBeNull();
  });
  it("reports the cap as not modelled without a clip curve", () => {
    expect(calcBalkon({ ...base, clip: null, moduleWp: 2000 }).clipLossPct).toBeNull();
  });
});
