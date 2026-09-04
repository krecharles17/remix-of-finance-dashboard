import { describe, expect, it } from "vitest";

import {
  AGING_NOTES,
  MONTHS,
  MONTH_FIELD_RULES,
  NOT_AVAILABLE,
  SCENARIOS,
  aggregate,
  aggregatePeriod,
  annualisedRunRate,
  budgetForPeriod,
  buildVariance,
  fmtPct,
  fmtPctOr,
  foldValues,
  formatCurrency,
  incompleteNote,
  makeInvoices,
  periodsFor,
  priorPeriodOf,
  riskFor,
  runwayMonths,
  safeDiv,
  segmentFor,
  validateDataset,
  varianceImpact,
  variancePctOfBudget,
  type MonthRecord,
  type Scenario,
} from "./finance-data";

const base: Scenario = SCENARIOS[0];

describe("safeDiv", () => {
  it("returns null instead of Infinity or NaN", () => {
    expect(safeDiv(1, 0)).toBeNull();
    expect(safeDiv(0, 0)).toBeNull();
    expect(safeDiv(Number.NaN, 2)).toBeNull();
    expect(safeDiv(1, 4)).toBe(0.25);
  });
});

describe("flow versus stock aggregation", () => {
  it("declares every month field as sum or last", () => {
    for (const rule of Object.values(MONTH_FIELD_RULES)) {
      expect(["sum", "last"]).toContain(rule);
    }
    expect(MONTH_FIELD_RULES.cashBalance).toBe("last");
    expect(MONTH_FIELD_RULES.headcount).toBe("last");
    expect(MONTH_FIELD_RULES["revenue.platform"]).toBe("sum");
  });

  it("folds values under the given rule and ignores non-numbers", () => {
    expect(foldValues([1, 2, 3], "sum")).toBe(6);
    expect(foldValues([1, undefined, 3], "last")).toBe(3);
    expect(foldValues([], "sum")).toBe(0);
    expect(foldValues([], "last")).toBe(0);
  });

  it("sums revenue across a quarter but carries cash and headcount forward", () => {
    const q = MONTHS.slice(0, 3);
    const agg = aggregatePeriod(q, base);
    const monthly = q.map((m) => aggregate(m, base));

    expect(agg.revenueByLine.platform).toBe(
      monthly.reduce((s, a) => s + a.revenueByLine.platform, 0),
    );
    expect(agg.cashBalance).toBe(monthly[2].cashBalance);
    expect(agg.headcount).toBe(monthly[2].headcount);
  });

  it("computes gross margin from period totals, not an average of months", () => {
    const q = MONTHS.slice(0, 3);
    const agg = aggregatePeriod(q, base);
    expect(agg.grossMargin).toBeCloseTo(agg.grossProfit / agg.totalRevenue, 12);
    expect(agg.operatingIncome).toBe(agg.grossProfit - agg.totalOpex);
  });

  it("returns zeroed totals and a null margin for an empty period", () => {
    const agg = aggregatePeriod([], base);
    expect(agg.totalRevenue).toBe(0);
    expect(agg.cashBalance).toBe(0);
    expect(agg.grossMargin).toBeNull();
  });

  it("applies scenario multipliers per month before aggregating", () => {
    const scenario: Scenario = {
      ...base,
      key: "test-double",
      revenueMult: { platform: 2, usage: 2, services: 2, marketplace: 2 },
    };
    const q = MONTHS.slice(0, 3);
    expect(aggregatePeriod(q, scenario).totalRevenue).toBeCloseTo(
      aggregatePeriod(q, base).totalRevenue * 2,
      6,
    );
  });

  it("annualises the run rate from the final month only", () => {
    const q = MONTHS.slice(0, 3);
    const last = aggregate(q[2], base);
    expect(annualisedRunRate(q, base)).toBeCloseTo(
      (last.revenueByLine.platform +
        last.revenueByLine.usage +
        last.revenueByLine.marketplace) *
        12,
      6,
    );
    expect(annualisedRunRate([], base)).toBe(0);
  });
});

describe("periods", () => {
  it("builds one period per month", () => {
    const months = periodsFor("month");
    expect(months).toHaveLength(MONTHS.length);
    expect(months.every((p) => p.months.length === 1 && p.complete)).toBe(true);
  });

  it("groups quarters of three and flags short ones as incomplete", () => {
    const quarters = periodsFor("quarter", MONTHS.slice(0, 4));
    expect(quarters).toHaveLength(2);
    expect(quarters[0].complete).toBe(true);
    expect(quarters[1].complete).toBe(false);
    expect(incompleteNote(quarters[1])).toMatch(/1 of 3 months/);
    expect(incompleteNote(quarters[0])).toBeNull();
  });

  it("sorts unsorted input before grouping", () => {
    const shuffled = [...MONTHS].reverse();
    expect(periodsFor("month", shuffled).map((p) => p.id)).toEqual(
      MONTHS.map((m) => m.id),
    );
  });

  it("makes year to date cumulative from the fiscal year start", () => {
    const ytd = periodsFor("ytd");
    expect(ytd[0].months).toHaveLength(1);
    expect(ytd[3].months).toHaveLength(4);
  });

  it("returns no prior period for the first one", () => {
    const months = periodsFor("month");
    expect(priorPeriodOf(months[0], months)).toBeNull();
    expect(priorPeriodOf(months[3], months)?.id).toBe(months[2].id);
  });

  it("refuses a prior period of a different length", () => {
    const quarters = periodsFor("quarter", MONTHS.slice(0, 4));
    expect(priorPeriodOf(quarters[1], quarters)).toBeNull();
  });
});

describe("variance", () => {
  const lines = buildVariance(MONTHS.slice(0, 3), base);

  it("compares period totals with period budget totals", () => {
    const agg = aggregatePeriod(MONTHS.slice(0, 3), base);
    const budget = budgetForPeriod(MONTHS.slice(0, 3));
    const platform = lines.find((l) => l.key === "platform")!;
    expect(platform.actual).toBe(agg.revenueByLine.platform);
    expect(platform.budget).toBe(budget.revenue.platform);
  });

  it("signs impact by line kind", () => {
    expect(varianceImpact({ key: "a", label: "a", kind: "revenue", budget: 100, actual: 130 })).toBe(30);
    expect(varianceImpact({ key: "b", label: "b", kind: "cost", budget: 100, actual: 130 })).toBe(-30);
  });

  it("returns null share when the budget line is zero", () => {
    expect(
      variancePctOfBudget({ key: "c", label: "c", kind: "cost", budget: 0, actual: 50 }),
    ).toBeNull();
  });
});

describe("invoices", () => {
  it("derives segment, bucket, note and id when absent", () => {
    const [big, small] = makeInvoices([
      { customer: "Big Co", amount: 400_000, daysPastDue: 95, risk: "critical" },
      { customer: "Small Co", amount: 9_000, daysPastDue: 0, risk: "low" },
    ]);
    expect(big.segment).toBe("Enterprise");
    expect(big.bucket).toBe("90+");
    expect(big.note).toBe(AGING_NOTES["90+"]);
    expect(small.segment).toBe("SMB");
    expect(small.bucket).toBe("Current");
    expect(small.id).not.toBe(big.id);
  });

  it("coerces non-numeric amounts rather than propagating NaN", () => {
    const [inv] = makeInvoices([
      { customer: "Odd Co", amount: Number.NaN, daysPastDue: Number.NaN, risk: "low" },
    ]);
    expect(inv.amount).toBe(0);
    expect(inv.daysPastDue).toBe(0);
    expect(inv.bucket).toBe("Current");
  });

  it("maps imported risk words, treating medium as watch", () => {
    expect(riskFor("Medium")).toBe("watch");
    expect(riskFor("critical")).toBe("critical");
    expect(riskFor("nonsense")).toBe("watch");
  });

  it("bands segments by amount", () => {
    expect(segmentFor(Number.NaN)).toBe("SMB");
    expect(segmentFor(1_000_000)).toBe("Enterprise");
  });
});

describe("runway", () => {
  it("is null when the business is not burning", () => {
    expect(runwayMonths(1_000_000, 0)).toBeNull();
    expect(runwayMonths(1_000_000, -5)).toBeNull();
    expect(runwayMonths(1_000_000, 250_000)).toBe(4);
  });
});

describe("formatting", () => {
  it("never shows NaN or Infinity", () => {
    expect(formatCurrency(Number.NaN)).toBe(NOT_AVAILABLE);
    expect(formatCurrency(Number.POSITIVE_INFINITY)).toBe(NOT_AVAILABLE);
    expect(fmtPctOr(null)).toBe(NOT_AVAILABLE);
    expect(fmtPctOr(undefined)).toBe(NOT_AVAILABLE);
  });

  it("compacts millions and thousands and marks negatives", () => {
    expect(formatCurrency(2_500_000, { compact: true })).toContain("2.50M");
    expect(formatCurrency(12_400, { compact: true })).toContain("12K");
    expect(formatCurrency(-2_500_000, { compact: true }).startsWith("−")).toBe(true);
  });

  it("formats percentages to the requested precision", () => {
    expect(fmtPct(0.1234, 1)).toBe("12.3%");
    expect(fmtPct(0.1234, 0)).toBe("12%");
  });
});

describe("validateDataset", () => {
  it("passes the shipped demo dataset", () => {
    expect(validateDataset()).toEqual([]);
  });

  it("names duplicate ids and broken figures instead of throwing", () => {
    const broken = [
      { ...MONTHS[0] },
      { ...MONTHS[0], cashBalance: Number.NaN },
    ] as MonthRecord[];
    const problems = validateDataset(broken, []);
    expect(problems.some((p) => /duplicates an earlier month id/.test(p))).toBe(true);
    expect(problems.some((p) => /cashBalance is not a number/.test(p))).toBe(true);
  });

  it("reports an empty month list", () => {
    expect(validateDataset([], []).some((p) => /MONTHS is empty/.test(p))).toBe(true);
  });
});
