/**
 * TEMPLATE DATA LAYER. To use real data: replace MONTHS (or buildMonths) with
 * your monthly actuals and budget conforming to MonthRecord, replace INVOICES
 * with your AR ledger, and adjust SCENARIOS to your planning cases. All KPIs,
 * the Sankey, the cash forecast, the waterfall, and AR aging derive
 * automatically.
 *
 * The bundled dataset is a fictional $14M ARR B2B SaaS company.
 * Deterministic seeded demo data for the trailing 12 months.
 */

/**
 * BRAND — every piece of company identity and locale in one place.
 * Editing this object rebrands the whole app: masthead, page metadata,
 * footer, and all currency and percentage formatting.
 */
export const BRAND = {
  company: "Northwind Cloud",
  eyebrow: "Financial Reporting",
  title: "CFO Command Center",
  subtitlePrefix: "Close of",
  footerNote: "demo dataset · figures are fictional",
  currency: "USD",
  locale: "en-US",
  /**
   * First calendar month of the fiscal year, 1–12. Quarters and year to date
   * are derived from it, so a company on a calendar year sets 1 and a company
   * on an August–July year sets 8. The bundled demo data runs August to July.
   */
  fiscalYearStartMonth: 8,
} as const;

/**
 * ASSUMPTIONS — every value the dashboard derives rather than reads from your
 * data. None of these are booked figures. Each one is a modelling assumption
 * carried over from the demo company, and each should be reviewed and replaced
 * when you connect real data. Nothing outside this object may hard-code these
 * numbers; helpers read them from here.
 */
export const ASSUMPTIONS = {
  /** Calendar weeks in a month, used to convert monthly figures to weekly. */
  WEEKS_PER_MONTH: 4.33,

  /** Horizon of the cash forecast, in weeks. */
  FORECAST_WEEKS: 13,

  /**
   * How many trailing months of actuals the forecast averages to derive its
   * weekly run rate. Shorten it if your business changed shape recently.
   */
  FORECAST_TRAILING_MONTHS: 3,

  /**
   * Share of each open receivable expected to be collected inside the forecast
   * horizon, by risk flag. Replace with your own historical recovery rates.
   */
  AR_RECOVERY_BY_RISK: { low: 0.95, watch: 0.75, high: 0.4, critical: 0.1 } as Record<
    RiskFlag,
    number
  >,

  /**
   * Payroll is paid in lumps rather than smoothly. This is the share of the
   * month's payroll that lands in the payroll-heavy week rather than being
   * spread evenly, and the week interval on which that falls.
   */
  PAYROLL_LUMP_SHARE: 0.15,
  PAYROLL_WEEK_INTERVAL: 4,

  /**
   * Customer AP runs cluster. This is the share of a month's collections that
   * arrives in the collection-heavy week, and the week it repeats on.
   */
  COLLECTIONS_LUMP_SHARE: 0.18,
  COLLECTIONS_WEEK_INTERVAL: 4,
  COLLECTIONS_WEEK_OFFSET: 2,

  /**
   * Forecast uncertainty. The band widens with the square of time; these
   * govern how fast, and how much week-to-week noise the base line carries.
   * They are presentational, not predictive.
   */
  FORECAST_SPREAD_BASE: 0.006,
  FORECAST_SPREAD_EXPONENT: 1.42,
  FORECAST_NOISE: 0.004,

  /**
   * Share of each opex category that is payroll. Used only when a month does
   * not supply `headcountCost` — the CSV import template does not carry it.
   * Replace with your own payroll split if you report it.
   */
  PAYROLL_SHARE_BY_OPEX: { rd: 0.78, sm: 0.55, ga: 0.62 } as Record<OpexKey, number>,

  /**
   * Invoice size bands used to derive `segment` when the import does not
   * supply one. These are revenue-scale specific — set them to your own
   * enterprise and mid-market thresholds.
   */
  SEGMENT_BAND_ENTERPRISE: 250_000,
  SEGMENT_BAND_MID_MARKET: 60_000,

  /**
   * Canonical mapping from the vocabulary used in the CSV import template to
   * the four `RiskFlag` values the app renders. The CSV ships the four app
   * values; "medium" is accepted as an alias for "watch" for spreadsheets
   * exported from systems that only carry three levels.
   */
  RISK_IMPORT_MAP: {
    low: "low",
    watch: "watch",
    medium: "watch",
    high: "high",
    critical: "critical",
  } as Record<string, RiskFlag>,
} as const;

// ---------- safe arithmetic ----------
/**
 * Divide without ever producing NaN or Infinity. Returns null when the figure
 * is genuinely not computable, so the display layer can render a neutral
 * placeholder instead of substituting zero — an unknown margin and a zero
 * margin mean different things to a finance reader.
 */
export function safeDiv(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator === 0) return null;
  const r = numerator / denominator;
  return Number.isFinite(r) ? r : null;
}

/** Neutral placeholder for a figure that is not computable. */
export const NOT_AVAILABLE = "—";

/** True when a value is a real, printable number. */
export function isNum(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// ---------- deterministic PRNG ----------
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260723);
const jitter = (amp: number) => 1 + (rand() - 0.5) * 2 * amp;

// ---------- shape ----------
export const PRODUCT_LINES = [
  { key: "platform", label: "Platform Subscriptions" },
  { key: "usage", label: "Usage & Overages" },
  { key: "services", label: "Professional Services" },
  { key: "marketplace", label: "Marketplace Rev-Share" },
] as const;

export type ProductKey = (typeof PRODUCT_LINES)[number]["key"];

export const OPEX_CATEGORIES = [
  { key: "rd", label: "R&D" },
  { key: "sm", label: "S&M" },
  { key: "ga", label: "G&A" },
] as const;

export type OpexKey = (typeof OPEX_CATEGORIES)[number]["key"];

export interface MonthRecord {
  /** ISO month, e.g. "2025-08" */
  id: string;
  label: string;
  shortLabel: string;
  revenue: Record<ProductKey, number>;
  cogs: { hosting: number; support: number; delivery: number };
  opex: Record<OpexKey, number>;
  /**
   * Optional. Payroll portion of each opex category. The CSV import template
   * does not carry it; when absent it is derived from
   * `ASSUMPTIONS.PAYROLL_SHARE_BY_OPEX` via `headcountCostOf`.
   */
  headcountCost?: Record<OpexKey, number>;
  headcount: number;
  cashBalance: number;
  budget: {
    revenue: Record<ProductKey, number>;
    cogs: number;
    opex: Record<OpexKey, number>;
  };
}

const MONTH_LABELS = [
  ["2025-08", "August 2025", "Aug"],
  ["2025-09", "September 2025", "Sep"],
  ["2025-10", "October 2025", "Oct"],
  ["2025-11", "November 2025", "Nov"],
  ["2025-12", "December 2025", "Dec"],
  ["2026-01", "January 2026", "Jan"],
  ["2026-02", "February 2026", "Feb"],
  ["2026-03", "March 2026", "Mar"],
  ["2026-04", "April 2026", "Apr"],
  ["2026-05", "May 2026", "May"],
  ["2026-06", "June 2026", "Jun"],
  ["2026-07", "July 2026", "Jul"],
] as const;

function buildMonths(): MonthRecord[] {
  const out: MonthRecord[] = [];
  // start ARR ~ $11.4M growing to ~$14M
  let cash = 15_400_000;

  MONTH_LABELS.forEach(([id, label, shortLabel], i) => {
    const growth = Math.pow(1.019, i);
    const seasonal = 1 + Math.sin((i / 12) * Math.PI * 2) * 0.03;

    const platform = 780_000 * growth * seasonal * jitter(0.018);
    const usage = 186_000 * Math.pow(1.028, i) * jitter(0.06);
    const services = 118_000 * jitter(0.16) * (i === 4 || i === 9 ? 1.35 : 1);
    const marketplace = 44_000 * Math.pow(1.035, i) * jitter(0.09);

    const revenue = {
      platform: Math.round(platform),
      usage: Math.round(usage),
      services: Math.round(services),
      marketplace: Math.round(marketplace),
    };
    const totalRev = platform + usage + services + marketplace;

    const cogs = {
      hosting: Math.round(totalRev * 0.115 * jitter(0.05)),
      support: Math.round(totalRev * 0.055 * jitter(0.06)),
      delivery: Math.round(services * 0.62 * jitter(0.08)),
    };

    // opex: non-payroll portion
    const rdNonPay = Math.round(totalRev * 0.07 * jitter(0.09));
    const smNonPay = Math.round(totalRev * 0.19 * jitter(0.11));
    const gaNonPay = Math.round(totalRev * 0.085 * jitter(0.08));

    const headcount = Math.round(118 + i * 2.4 + rand() * 2);
    const headcountCost = {
      rd: Math.round(totalRev * 0.35 * jitter(0.03)),
      sm: Math.round(totalRev * 0.27 * jitter(0.04)),
      ga: Math.round(totalRev * 0.15 * jitter(0.04)),
    };

    const opex = {
      rd: rdNonPay + headcountCost.rd,
      sm: smNonPay + headcountCost.sm,
      ga: gaNonPay + headcountCost.ga,
    };

    const totalCogs = cogs.hosting + cogs.support + cogs.delivery;
    const netIncome = totalRev - totalCogs - opex.rd - opex.sm - opex.ga;
    cash += netIncome - 40_000 * jitter(0.4); // working capital drag
    if (i === 6) cash -= 620_000; // annual insurance + tax true-up

    out.push({
      id,
      label,
      shortLabel,
      revenue,
      cogs,
      opex,
      headcountCost,
      headcount,
      cashBalance: Math.round(cash),
      // Budget is deterministic per line so the sign of every variance always
      // agrees with the narrative written for that line.
      budget: {
        revenue: {
          platform: Math.round(platform * (1.022 + rand() * 0.01)),
          usage: Math.round(usage * (0.79 + rand() * 0.03)),
          services: Math.round(services * (1.46 + rand() * 0.06)),
          marketplace: Math.round(marketplace * (0.99 + rand() * 0.02)),
        },
        cogs: Math.round(totalCogs * (0.79 + rand() * 0.02)),
        opex: {
          rd: Math.round(opex.rd * (1.075 + rand() * 0.015)),
          sm: Math.round(opex.sm * (0.865 + rand() * 0.015)),
          ga: Math.round(opex.ga * (1.015 + rand() * 0.012)),
        },
      },
    });
  });

  return out;
}

export const MONTHS: MonthRecord[] = buildMonths();
export const LATEST = MONTHS[MONTHS.length - 1];

/**
 * Payroll cost per opex category for a month. Supplied when the record carries
 * `headcountCost`, otherwise derived from ASSUMPTIONS.PAYROLL_SHARE_BY_OPEX.
 */
export function headcountCostOf(month: MonthRecord): Record<OpexKey, number> {
  const share = ASSUMPTIONS.PAYROLL_SHARE_BY_OPEX;
  const opex = month?.opex ?? ({} as MonthRecord["opex"]);
  const fin = (v: number | undefined) => (Number.isFinite(v as number) ? (v as number) : 0);
  const supplied = month?.headcountCost;
  return {
    rd: supplied ? fin(supplied.rd) : Math.round(fin(opex.rd) * share.rd),
    sm: supplied ? fin(supplied.sm) : Math.round(fin(opex.sm) * share.sm),
    ga: supplied ? fin(supplied.ga) : Math.round(fin(opex.ga) * share.ga),
  };
}

/**
 * Human range covering the dataset, derived from the ISO `id` of the first and
 * last period ("2025-08") rather than any hardcoded year. Years are rendered
 * through the configured locale.
 */
export function periodRange(months: MonthRecord[] = MONTHS): string | null {
  if (!Array.isArray(months) || months.length === 0) return null;
  const year = (m: MonthRecord | undefined) => {
    const y = Number.parseInt(String(m?.id ?? "").slice(0, 4), 10);
    return Number.isFinite(y)
      ? new Intl.NumberFormat(BRAND.locale, { useGrouping: false }).format(y)
      : null;
  };
  const label = (m: MonthRecord | undefined) => {
    const y = year(m);
    return [m?.shortLabel, y].filter(Boolean).join(" ") || NOT_AVAILABLE;
  };
  const from = label(months[0]);
  const to = label(months[months.length - 1]);
  return from === to ? from : `${from} — ${to}`;
}

// ---------- scenarios ----------
export interface Scenario {
  key: string;
  label: string;
  blurb: string;
  revenueMult: Record<ProductKey, number>;
  cogsMult: number;
  opexMult: Record<OpexKey, number>;
}

export const SCENARIOS: Scenario[] = [
  {
    key: "actual",
    label: "Actuals",
    blurb: "Booked results as closed by accounting.",
    revenueMult: { platform: 1, usage: 1, services: 1, marketplace: 1 },
    cogsMult: 1,
    opexMult: { rd: 1, sm: 1, ga: 1 },
  },
  {
    key: "plan",
    label: "Board plan",
    blurb: "The plan we committed to in the last board deck.",
    revenueMult: { platform: 1.04, usage: 1.11, services: 0.94, marketplace: 1.08 },
    cogsMult: 0.96,
    opexMult: { rd: 1.06, sm: 1.09, ga: 1.02 },
  },
  {
    key: "efficiency",
    label: "Efficiency case",
    blurb: "S&M pullback and hosting renegotiation; slower top-line.",
    revenueMult: { platform: 0.985, usage: 0.97, services: 0.88, marketplace: 1.0 },
    cogsMult: 0.84,
    opexMult: { rd: 0.97, sm: 0.72, ga: 0.9 },
  },
  {
    key: "upside",
    label: "Upside case",
    blurb: "Enterprise pipeline converts; usage expansion accelerates.",
    revenueMult: { platform: 1.09, usage: 1.26, services: 1.15, marketplace: 1.18 },
    cogsMult: 1.06,
    opexMult: { rd: 1.04, sm: 1.14, ga: 1.03 },
  },
];

// ---------- derived aggregates ----------
export interface Aggregate {
  revenueByLine: Record<ProductKey, number>;
  totalRevenue: number;
  cogs: { hosting: number; support: number; delivery: number };
  totalCogs: number;
  grossProfit: number;
  /** null when there is no revenue to divide by. */
  grossMargin: number | null;

  opex: Record<OpexKey, number>;
  totalOpex: number;
  operatingIncome: number;
  headcount: number;
  cashBalance: number;
}

export function aggregate(month: MonthRecord, scenario: Scenario): Aggregate {
  // Remixed data is routinely incomplete: coerce every input to a finite
  // number so sums stay printable, and let ratios below resolve to null.
  const n = (v: number | undefined, mult: number | undefined) =>
    Math.round(
      (Number.isFinite(v as number) ? (v as number) : 0) *
        (Number.isFinite(mult as number) ? (mult as number) : 1),
    );

  const rev = month.revenue ?? ({} as MonthRecord["revenue"]);
  const rm = scenario.revenueMult ?? ({} as Scenario["revenueMult"]);
  const revenueByLine = {
    platform: n(rev.platform, rm.platform),
    usage: n(rev.usage, rm.usage),
    services: n(rev.services, rm.services),
    marketplace: n(rev.marketplace, rm.marketplace),
  };
  const totalRevenue =
    revenueByLine.platform +
    revenueByLine.usage +
    revenueByLine.services +
    revenueByLine.marketplace;

  const c = month.cogs ?? ({} as MonthRecord["cogs"]);
  const cogs = {
    hosting: n(c.hosting, scenario.cogsMult),
    support: n(c.support, scenario.cogsMult),
    delivery: n(c.delivery, scenario.cogsMult),
  };
  const totalCogs = cogs.hosting + cogs.support + cogs.delivery;

  const o = month.opex ?? ({} as MonthRecord["opex"]);
  const om = scenario.opexMult ?? ({} as Scenario["opexMult"]);
  const opex = {
    rd: n(o.rd, om.rd),
    sm: n(o.sm, om.sm),
    ga: n(o.ga, om.ga),
  };
  const totalOpex = opex.rd + opex.sm + opex.ga;
  const grossProfit = totalRevenue - totalCogs;

  return {
    revenueByLine,
    totalRevenue,
    cogs,
    totalCogs,
    grossProfit,
    grossMargin: safeDiv(grossProfit, totalRevenue),
    opex,
    totalOpex,
    operatingIncome: grossProfit - totalOpex,
    headcount: Number.isFinite(month.headcount) ? month.headcount : 0,
    cashBalance: Number.isFinite(month.cashBalance) ? month.cashBalance : 0,
  };
}

// ---------- flow vs stock ----------
/**
 * FLOWS SUM, STOCKS DO NOT.
 *
 * Revenue, cost of revenue and operating expense are flows: they sum across
 * the months of a period. Closing cash and headcount are stocks: point-in-time
 * positions that take the value of the FINAL month of the period. Summing
 * three months of closing cash would turn a $27M balance into $81M and take
 * the runway calculation with it.
 *
 * Every numeric field on MonthRecord is declared below. The Record type is
 * exhaustive, so adding a field to `MonthNumericField` forces whoever adds it
 * to decide whether it is a flow or a stock rather than silently defaulting.
 */
export type AggRule = "sum" | "last";

export type CogsKey = "hosting" | "support" | "delivery";
export const COGS_KEYS = ["hosting", "support", "delivery"] as const;

export type MonthNumericField =
  | `revenue.${ProductKey}`
  | `cogs.${CogsKey}`
  | `opex.${OpexKey}`
  | `budget.revenue.${ProductKey}`
  | "budget.cogs"
  | `budget.opex.${OpexKey}`
  | "headcount"
  | "cashBalance";

export const MONTH_FIELD_RULES: Record<MonthNumericField, AggRule> = {
  "revenue.platform": "sum",
  "revenue.usage": "sum",
  "revenue.services": "sum",
  "revenue.marketplace": "sum",
  "cogs.hosting": "sum",
  "cogs.support": "sum",
  "cogs.delivery": "sum",
  "opex.rd": "sum",
  "opex.sm": "sum",
  "opex.ga": "sum",
  "budget.revenue.platform": "sum",
  "budget.revenue.usage": "sum",
  "budget.revenue.services": "sum",
  "budget.revenue.marketplace": "sum",
  "budget.cogs": "sum",
  "budget.opex.rd": "sum",
  "budget.opex.sm": "sum",
  "budget.opex.ga": "sum",
  // Stocks. Never sum these.
  headcount: "last",
  cashBalance: "last",
};

/** Combine a field's monthly values under its declared rule. */
export function foldValues(values: Array<number | undefined>, rule: AggRule): number {
  const nums = values.filter((v): v is number => Number.isFinite(v as number));
  if (nums.length === 0) return 0;
  return rule === "last" ? nums[nums.length - 1] : nums.reduce((s, v) => s + v, 0);
}

/**
 * Period aggregate. Scenario multipliers are applied per month, before
 * aggregation, then each field is folded under its declared rule. Every ratio
 * is computed from period totals — never averaged from monthly ratios, which
 * is a different and wrong number.
 */
export function aggregatePeriod(months: MonthRecord[], scenario: Scenario): Aggregate {
  const per = months.map((m) => aggregate(m, scenario));
  const fold = (field: MonthNumericField, pick: (a: Aggregate) => number) =>
    foldValues(per.map(pick), MONTH_FIELD_RULES[field]);

  const revenueByLine = {
    platform: fold("revenue.platform", (a) => a.revenueByLine.platform),
    usage: fold("revenue.usage", (a) => a.revenueByLine.usage),
    services: fold("revenue.services", (a) => a.revenueByLine.services),
    marketplace: fold("revenue.marketplace", (a) => a.revenueByLine.marketplace),
  };
  const totalRevenue =
    revenueByLine.platform +
    revenueByLine.usage +
    revenueByLine.services +
    revenueByLine.marketplace;

  const cogs = {
    hosting: fold("cogs.hosting", (a) => a.cogs.hosting),
    support: fold("cogs.support", (a) => a.cogs.support),
    delivery: fold("cogs.delivery", (a) => a.cogs.delivery),
  };
  const totalCogs = cogs.hosting + cogs.support + cogs.delivery;

  const opex = {
    rd: fold("opex.rd", (a) => a.opex.rd),
    sm: fold("opex.sm", (a) => a.opex.sm),
    ga: fold("opex.ga", (a) => a.opex.ga),
  };
  const totalOpex = opex.rd + opex.sm + opex.ga;
  const grossProfit = totalRevenue - totalCogs;

  return {
    revenueByLine,
    totalRevenue,
    cogs,
    totalCogs,
    grossProfit,
    // From period totals, not an average of monthly margins.
    grossMargin: safeDiv(grossProfit, totalRevenue),
    opex,
    totalOpex,
    operatingIncome: grossProfit - totalOpex,
    headcount: fold("headcount", (a) => a.headcount),
    cashBalance: fold("cashBalance", (a) => a.cashBalance),
  };
}

/**
 * Annualised run rate. A rate, not a flow: take it from the final month of the
 * period and never sum it across months.
 */
export function annualisedRunRate(months: MonthRecord[], scenario: Scenario): number {
  const last = months[months.length - 1];
  if (!last) return 0;
  const a = aggregate(last, scenario);
  return (a.revenueByLine.platform + a.revenueByLine.usage + a.revenueByLine.marketplace) * 12;
}

// ---------- periods: month, quarter, year to date ----------
export type Granularity = "month" | "quarter" | "ytd";

export interface Period {
  id: string;
  /** Full name, e.g. "Q2 FY2026" or "FY2026 to date". */
  label: string;
  /** Compact name for the control bar. */
  shortLabel: string;
  granularity: Granularity;
  /** The months present in the dataset for this period, in order. */
  months: MonthRecord[];
  /** How many months a complete period of this kind holds. */
  expectedMonths: number;
  /** False when the dataset does not carry every month of the period. */
  complete: boolean;
}

const yearFmt = new Intl.NumberFormat(BRAND.locale, { useGrouping: false });

function monthNumberOf(id: string): number {
  return Number.parseInt(String(id).slice(5, 7), 10);
}
function yearNumberOf(id: string): number {
  return Number.parseInt(String(id).slice(0, 4), 10);
}
function fiscalStartMonth(): number {
  const m = Number(BRAND.fiscalYearStartMonth);
  return Number.isFinite(m) && m >= 1 && m <= 12 ? Math.round(m) : 1;
}
/** 0 for the first month of the fiscal year, 11 for the last. */
function fiscalIndexOf(id: string): number {
  const m = monthNumberOf(id);
  if (!Number.isFinite(m)) return 0;
  return (m - fiscalStartMonth() + 12) % 12;
}
/** The year the fiscal year is named after: its ending calendar year. */
function fiscalYearOf(id: string): number {
  const y = yearNumberOf(id);
  const m = monthNumberOf(id);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return 0;
  const start = fiscalStartMonth();
  const startYear = m >= start ? y : y - 1;
  return start === 1 ? startYear : startYear + 1;
}
function fyLabel(id: string): string {
  return `FY${yearFmt.format(fiscalYearOf(id))}`;
}

/** Month name without its calendar year: "March 2026" -> "March". */
function monthNameOf(m: MonthRecord): string {
  return String(m.label ?? m.shortLabel ?? m.id).replace(/[\s,]+\d{4}$/, "");
}

/** Every period of the given granularity that the dataset can support. */
export function periodsFor(granularity: Granularity, months: MonthRecord[] = MONTHS): Period[] {
  // Never trust input order: a remixer pasting an unsorted export would
  // otherwise get quarters and cumulative spans in the wrong sequence.
  const src = (Array.isArray(months) ? [...months] : []).sort((a, b) =>
    String(a.id).localeCompare(String(b.id)),
  );
  if (granularity === "month") {
    return src.map((m) => ({
      id: m.id,
      label: m.label,
      shortLabel: m.shortLabel,
      granularity,
      months: [m],
      expectedMonths: 1,
      complete: true,
    }));
  }

  if (granularity === "ytd") {
    // Year to date means cumulative from the fiscal year start through the
    // selected month, so there is one selectable period per month.
    return src.map((m) => {
      const fy = fiscalYearOf(m.id);
      const idx = fiscalIndexOf(m.id);
      const ms = src.filter((x) => fiscalYearOf(x.id) === fy && fiscalIndexOf(x.id) <= idx);
      const expected = idx + 1;
      return {
        id: `ytd-${m.id}`,
        label: `${fyLabel(m.id)} through ${monthNameOf(m)}`,
        shortLabel: m.shortLabel,
        granularity,
        months: ms,
        expectedMonths: expected,
        // Complete when no month between the fiscal year start and this one
        // is missing — not when the fiscal year is full.
        complete: ms.length >= expected,
      };
    });
  }

  const groups = new Map<string, MonthRecord[]>();
  const meta = new Map<string, { label: string; shortLabel: string }>();

  for (const m of src) {
    const q = Math.floor(fiscalIndexOf(m.id) / 3) + 1;
    const key = `${fiscalYearOf(m.id)}-Q${q}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      meta.set(key, { label: `Q${q} ${fyLabel(m.id)}`, shortLabel: `Q${q}` });
    }
    groups.get(key)!.push(m);
  }

  const expected = 3;
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, ms]) => {
      const base = meta.get(key)!;
      return {
        id: key,
        label: base.label,
        shortLabel: base.shortLabel,
        granularity,
        months: ms,
        expectedMonths: expected,
        complete: ms.length >= expected,
      };
    });
}

/**
 * The comparable prior period, or null when the dataset holds none. Like is
 * compared with like: quarter against prior quarter, YTD against the same
 * span of the prior fiscal year, month against prior month. A prior period of
 * a different length is not comparable and resolves to null, which the display
 * layer renders as the neutral placeholder.
 */
export function priorPeriodOf(period: Period, all: Period[]): Period | null {
  if (period.granularity === "ytd") {
    const last = period.months[period.months.length - 1];
    if (!last) return null;
    const fy = fiscalYearOf(last.id);
    const idx = fiscalIndexOf(last.id);
    const prior = all.find((p) => {
      const l = p.months[p.months.length - 1];
      return !!l && fiscalYearOf(l.id) === fy - 1 && fiscalIndexOf(l.id) === idx;
    });
    return prior ?? null;
  }
  const i = all.findIndex((p) => p.id === period.id);
  if (i <= 0) return null;
  const prev = all[i - 1];
  return prev.months.length === period.months.length ? prev : null;
}

/** "vs prior month" / "vs prior quarter" / "vs prior year to date". */
export function priorPeriodCaption(granularity: Granularity): string {
  return granularity === "month"
    ? "vs prior month"
    : granularity === "quarter"
      ? "vs prior quarter"
      : "vs prior year to date";
}

/** How the period is named in running copy: "quarter", "month", "year to date". */
export function granularityNoun(granularity: Granularity): string {
  return granularity === "month" ? "month" : granularity === "quarter" ? "quarter" : "year to date";
}

/** Plain sentence naming a partial period, or null when it is complete. */
export function incompleteNote(period: Period): string | null {
  if (period.complete || period.granularity === "month") return null;
  return `Incomplete ${granularityNoun(period.granularity)} — ${period.months.length} of ${period.expectedMonths} months present in the dataset.`;
}

// ---------- AR aging ----------
export type RiskFlag = "low" | "watch" | "high" | "critical";

export interface Invoice {
  id: string;
  customer: string;
  segment: "Enterprise" | "Mid-market" | "SMB";
  amount: number;
  daysPastDue: number;
  bucket: "Current" | "1–30" | "31–60" | "61–90" | "90+";
  risk: RiskFlag;
  note: string;
}

/**
 * What an import supplies. `segment` and `note` are optional because the CSV
 * import template does not carry them: they are derived below from the invoice
 * amount and its aging, using thresholds and copy declared in ASSUMPTIONS and
 * AGING_NOTES. Supply them if your ledger has them; they win over the
 * derivation.
 */
export interface InvoiceInput {
  id?: string;
  customer: string;
  amount: number;
  daysPastDue: number;
  risk: RiskFlag;
  segment?: Invoice["segment"];
  note?: string;
}

function bucketFor(d: number): Invoice["bucket"] {
  if (d <= 0) return "Current";
  if (d <= 30) return "1–30";
  if (d <= 60) return "31–60";
  if (d <= 90) return "61–90";
  return "90+";
}

/** Derived segment banding. Thresholds live in ASSUMPTIONS. */
export function segmentFor(amount: number): Invoice["segment"] {
  const a = Number.isFinite(amount) ? amount : 0;
  if (a >= ASSUMPTIONS.SEGMENT_BAND_ENTERPRISE) return "Enterprise";
  if (a >= ASSUMPTIONS.SEGMENT_BAND_MID_MARKET) return "Mid-market";
  return "SMB";
}

/**
 * AGING NOTE TEXT — assumption, not data. Shown when an invoice carries no
 * note of its own. Rewrite the wording to match how your collections team
 * talks; it is copy, not a booked fact.
 */
export const AGING_NOTES: Record<Invoice["bucket"], string> = {
  Current: "Current — within terms",
  "1–30": "Recently past due — first reminder stage",
  "31–60": "Past due — chase with the AP contact",
  "61–90": "Materially overdue — escalate to the account owner",
  "90+": "Severely overdue — collections review",
};

/** Normalise an imported risk word through the canonical map. */
export function riskFor(value: string): RiskFlag {
  return ASSUMPTIONS.RISK_IMPORT_MAP[String(value).trim().toLowerCase()] ?? "watch";
}

/** Fill the derived fields an import does not supply. */
export function makeInvoices(rows: InvoiceInput[]): Invoice[] {
  return rows.map((r, i) => {
    const amount = Number.isFinite(r.amount) ? r.amount : 0;
    const daysPastDue = Number.isFinite(r.daysPastDue) ? r.daysPastDue : 0;
    const bucket = bucketFor(daysPastDue);
    return {
      id: r.id ?? `INV-${4820 + i * 7}`,
      customer: r.customer,
      segment: r.segment ?? segmentFor(amount),
      amount,
      daysPastDue,
      bucket,
      risk: r.risk,
      note: r.note ?? AGING_NOTES[bucket],
    };
  });
}

const AR_SEED: InvoiceInput[] = [
  {
    customer: "Halcyon Logistics",
    segment: "Enterprise",
    amount: 412_500,
    daysPastDue: 97,
    risk: "critical",
    note: "Procurement re-org; PO reissue pending",
  },
  {
    customer: "Wrenfield Health",
    segment: "Enterprise",
    amount: 288_000,
    daysPastDue: 64,
    risk: "high",
    note: "Disputing overage line on Feb usage",
  },
  {
    customer: "Ardent Retail Group",
    segment: "Mid-market",
    amount: 96_400,
    daysPastDue: 71,
    risk: "high",
    note: "Two broken payment promises",
  },
  {
    customer: "Cobalt Manufacturing",
    segment: "Enterprise",
    amount: 351_000,
    daysPastDue: 22,
    risk: "watch",
    note: "AP batch runs monthly on the 28th",
  },
  {
    customer: "Northgate Financial",
    segment: "Enterprise",
    amount: 505_000,
    daysPastDue: 4,
    risk: "low",
    note: "Confirmed in this week's ACH run",
  },
  {
    customer: "Verity Analytics",
    segment: "Mid-market",
    amount: 74_800,
    daysPastDue: 45,
    risk: "watch",
    note: "New AP contact, invoice re-sent",
  },
  {
    customer: "Larkspur Media",
    segment: "SMB",
    amount: 18_200,
    daysPastDue: 118,
    risk: "critical",
    note: "No response in 6 weeks; collections queue",
  },
  {
    customer: "Pinnacle Legal",
    segment: "Mid-market",
    amount: 61_500,
    daysPastDue: 0,
    risk: "low",
    note: "Current — net 30, issued last week",
  },
  {
    customer: "Solstice Energy",
    segment: "Enterprise",
    amount: 264_300,
    daysPastDue: 33,
    risk: "watch",
    note: "Awaiting signed SOW amendment",
  },
  {
    customer: "Fernbrook Labs",
    segment: "SMB",
    amount: 27_900,
    daysPastDue: 88,
    risk: "high",
    note: "Card on file failed twice",
  },
  {
    customer: "Atlas Freight",
    segment: "Mid-market",
    amount: 112_000,
    daysPastDue: 12,
    risk: "low",
    note: "Scheduled wire, 15th",
  },
  {
    customer: "Kestrel Insurance",
    segment: "Enterprise",
    amount: 197_600,
    daysPastDue: 58,
    risk: "high",
    note: "Tax exemption cert holding release",
  },
  {
    customer: "Drayton Foods",
    segment: "SMB",
    amount: 22_450,
    daysPastDue: 0,
    risk: "low",
    note: "Current — auto-charge enabled",
  },
  {
    customer: "Orion Semiconductor",
    segment: "Enterprise",
    amount: 338_700,
    daysPastDue: 9,
    risk: "low",
    note: "Approved, in payment run",
  },
];

export const INVOICES: Invoice[] = makeInvoices(AR_SEED);

const amountOf = (i: Invoice) => (Number.isFinite(i.amount) ? i.amount : 0);

export const AR_BUCKETS = (["Current", "1–30", "31–60", "61–90", "90+"] as const).map((b) => ({
  bucket: b,
  amount: INVOICES.filter((i) => i.bucket === b).reduce((s, i) => s + amountOf(i), 0),
  count: INVOICES.filter((i) => i.bucket === b).length,
}));

export const AR_TOTAL = INVOICES.reduce((s, i) => s + amountOf(i), 0);
export const AR_AT_RISK = INVOICES.filter((i) => i.risk === "high" || i.risk === "critical").reduce(
  (s, i) => s + amountOf(i),
  0,
);

// ---------- 13-week cash forecast ----------
export interface ForecastWeek {
  week: number;
  label: string;
  base: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
}

/**
 * Weekly cash run rate derived from the actuals and the AR ledger. Nothing
 * here is hard-coded: outflow comes from the trailing months' cost of revenue
 * and operating expense, collections come from trailing revenue plus the
 * portion of open receivables expected to land inside the horizon. The shape
 * of the lumpiness is an assumption and lives in ASSUMPTIONS.
 */
export interface ForecastInputs {
  weeklyOutflow: number;
  weeklyCollections: number;
  weeklyPayroll: number;
  /** False when the actuals cannot support a forecast at all. */
  usable: boolean;
}

export function forecastInputs(
  months: MonthRecord[] = MONTHS,
  invoices: Invoice[] = INVOICES,
  /**
   * How many trailing months to average. Period views pass the length of the
   * selected period so the run rate is the average monthly rate across that
   * period rather than a fixed trailing window.
   */
  trailingMonths: number = ASSUMPTIONS.FORECAST_TRAILING_MONTHS,
): ForecastInputs {
  const empty: ForecastInputs = {
    weeklyOutflow: 0,
    weeklyCollections: 0,
    weeklyPayroll: 0,
    usable: false,
  };
  if (!Array.isArray(months) || months.length === 0) return empty;

  const window = Number.isFinite(trailingMonths)
    ? trailingMonths
    : ASSUMPTIONS.FORECAST_TRAILING_MONTHS;
  const trailing = months.slice(-Math.max(1, Math.round(window)));
  const fin = (v: number | undefined) => (Number.isFinite(v as number) ? (v as number) : 0);

  let cost = 0;
  let revenue = 0;
  let payroll = 0;
  for (const m of trailing) {
    const c = m?.cogs ?? ({} as MonthRecord["cogs"]);
    const o = m?.opex ?? ({} as MonthRecord["opex"]);
    cost += fin(c.hosting) + fin(c.support) + fin(c.delivery);
    cost += fin(o.rd) + fin(o.sm) + fin(o.ga);
    const rv = m?.revenue ?? ({} as MonthRecord["revenue"]);
    revenue += fin(rv.platform) + fin(rv.usage) + fin(rv.services) + fin(rv.marketplace);
    const hc = headcountCostOf(m);
    payroll += hc.rd + hc.sm + hc.ga;
  }

  const monthlyCost = safeDiv(cost, trailing.length) ?? 0;
  const monthlyRevenue = safeDiv(revenue, trailing.length) ?? 0;
  const monthlyPayroll = safeDiv(payroll, trailing.length) ?? 0;

  // Receivables expected to convert inside the horizon, spread across it.
  const horizonWeeks = Math.max(1, ASSUMPTIONS.FORECAST_WEEKS);
  const recoverable = (Array.isArray(invoices) ? invoices : []).reduce((s, inv) => {
    const rate = ASSUMPTIONS.AR_RECOVERY_BY_RISK[inv?.risk] ?? 0;
    return s + amountOf(inv) * rate;
  }, 0);

  const perWeek = (monthly: number) =>
    safeDiv(monthly, Math.max(0.1, ASSUMPTIONS.WEEKS_PER_MONTH)) ?? 0;

  const weeklyOutflow = perWeek(monthlyCost);
  const weeklyCollections = perWeek(monthlyRevenue) + (safeDiv(recoverable, horizonWeeks) ?? 0);

  return {
    weeklyOutflow,
    weeklyCollections,
    weeklyPayroll: perWeek(monthlyPayroll),
    usable: weeklyOutflow > 0 || weeklyCollections > 0,
  };
}

/**
 * hiringSpend = incremental monthly hiring spend.
 * Returns an empty series when there is no usable starting cash or the actuals
 * cannot support a run rate, so the caller renders an empty state rather than
 * a chart of NaN.
 */
export function buildForecast(
  hiringSpend: number,
  startCash: number,
  months: MonthRecord[] = MONTHS,
  invoices: Invoice[] = INVOICES,
): ForecastWeek[] {
  if (!Number.isFinite(startCash)) return [];
  const inputs = forecastInputs(months, invoices);
  if (!inputs.usable) return [];

  const hire = Number.isFinite(hiringSpend) ? hiringSpend : 0;
  const weeklyOutflow =
    inputs.weeklyOutflow + (safeDiv(hire, Math.max(0.1, ASSUMPTIONS.WEEKS_PER_MONTH)) ?? 0);
  const weeklyCollections = inputs.weeklyCollections;

  // Lumps are re-timed, not added: what lands in a heavy week is taken out of
  // the smooth run rate, so the 13-week total matches the run rate exactly.
  const payrollLump =
    inputs.weeklyPayroll * ASSUMPTIONS.WEEKS_PER_MONTH * ASSUMPTIONS.PAYROLL_LUMP_SHARE;
  const collectionsLump =
    weeklyCollections * ASSUMPTIONS.WEEKS_PER_MONTH * ASSUMPTIONS.COLLECTIONS_LUMP_SHARE;

  const weeks = ASSUMPTIONS.FORECAST_WEEKS;
  const countWeeks = (test: (w: number) => boolean) => {
    let n = 0;
    for (let w = 1; w <= weeks; w++) if (test(w)) n++;
    return n;
  };
  const isPayrollWeek = (w: number) => w % ASSUMPTIONS.PAYROLL_WEEK_INTERVAL === 0;
  const isCollectionWeek = (w: number) =>
    w % ASSUMPTIONS.COLLECTIONS_WEEK_INTERVAL === ASSUMPTIONS.COLLECTIONS_WEEK_OFFSET;

  // The lumps re-time cash rather than create it: everything added on a heavy
  // week is taken back out of the smooth run rate, so the 13-week total equals
  // the derived run rate exactly and the runway readout agrees with the chart.
  const payrollSmoothing = safeDiv(payrollLump * countWeeks(isPayrollWeek), weeks) ?? 0;
  const collectionsSmoothing = safeDiv(collectionsLump * countWeeks(isCollectionWeek), weeks) ?? 0;

  const scale = Math.max(weeklyOutflow, weeklyCollections, 1);
  const out: ForecastWeek[] = [];
  let base = startCash;
  const r = mulberry32(991);

  for (let w = 1; w <= weeks; w++) {
    const lumpy = (isPayrollWeek(w) ? -payrollLump : 0) + payrollSmoothing;
    const spike = (isCollectionWeek(w) ? collectionsLump : 0) - collectionsSmoothing;
    const noise = (r() - 0.5) * scale * ASSUMPTIONS.FORECAST_NOISE * 2;
    base += weeklyCollections - weeklyOutflow + lumpy + spike + noise;
    const spread =
      Math.pow(w, ASSUMPTIONS.FORECAST_SPREAD_EXPONENT) * scale * ASSUMPTIONS.FORECAST_SPREAD_BASE;
    out.push({
      week: w,
      label: `W${w}`,
      base: Math.round(base),
      p10: Math.round(base - spread * 1.5),
      p25: Math.round(base - spread * 0.72),
      p75: Math.round(base + spread * 0.72),
      p90: Math.round(base + spread * 1.42),
    });
  }
  return out;
}

/**
 * Net monthly burn implied by the forecast run rate, for the runway readout.
 * Zero or negative means the business is cash generative, and runway is not a
 * meaningful figure — `runwayMonths` returns null and the UI shows a dash.
 */
export function derivedMonthlyBurn(
  months: MonthRecord[] = MONTHS,
  invoices: Invoice[] = INVOICES,
  trailingMonths: number = ASSUMPTIONS.FORECAST_TRAILING_MONTHS,
): number {
  const i = forecastInputs(months, invoices, trailingMonths);
  if (!i.usable) return 0;
  return Math.max(0, (i.weeklyOutflow - i.weeklyCollections) * ASSUMPTIONS.WEEKS_PER_MONTH);
}

/** Months of runway, or null when burn is zero, negative, or unknown. */
export function runwayMonths(cash: number, monthlyBurn: number): number | null {
  if (!Number.isFinite(cash) || !Number.isFinite(monthlyBurn)) return null;
  if (monthlyBurn <= 0) return null;
  return safeDiv(cash, monthlyBurn);
}

// ---------- variance ----------
export interface VarianceCommentary {
  narrative: string;
  drivers: Array<{ label: string; value: string }>;
  owner: string;
}

export interface VarianceLine {
  key: string;
  label: string;
  budget: number;
  actual: number;
  kind: "revenue" | "cost";
  /** Editorial. Absent when no commentary is authored for this line. */
  commentary?: VarianceCommentary;
}

/**
 * DEMO COMMENTARY — layer one of three (authored → generated → computed).
 *
 * These narratives, drivers, and owners are written for the synthetic demo
 * dataset and are deliberately kept to two lines so a remixer can see all
 * three layers at once. Authored commentary is the only layer allowed to cite
 * operational facts the dataset does not hold (logo counts, utilisation, CAC),
 * because a human typed them. Delete or rewrite these when you connect real
 * data; the waterfall and variance math derive automatically.
 */
export const VARIANCE_COMMENTARY: Record<string, VarianceCommentary | undefined> = {
  usage: {
    narrative:
      "Usage and overage revenue outran the plan. Two high-volume data customers ran unplanned backfill jobs, which pushed metered consumption well past their committed tiers. This is real cash but it is not durable — treat roughly half of the beat as one-time.",
    drivers: [
      { label: "Metered volume", value: "+18% vs plan" },
      { label: "Customers over commit", value: "11 (plan: 6)" },
      { label: "Estimated one-time portion", value: "~52% of the beat" },
    ],
    owner: "Dana Okafor · VP Revenue",
  },
  sm: {
    narrative:
      "Sales and marketing overspent. A late decision to sponsor an additional industry conference pulled forward roughly a quarter of the events budget, and paid acquisition costs rose as we pushed harder on the enterprise segment. Pipeline created supports the spend, but CAC efficiency deteriorated this month.",
    drivers: [
      { label: "Events pull-forward", value: "$96K" },
      { label: "Blended CAC", value: "+14% MoM" },
      { label: "Pipeline created", value: "$4.1M (plan: $3.6M)" },
    ],
    owner: "Dana Okafor · VP Revenue",
  },
};

/**
 * Budget totals for a period. Aggregated under exactly the same flow/stock
 * rules as the actuals, so the waterfall compares period totals to period
 * totals rather than a period actual to a single month's budget.
 */
export function budgetForPeriod(months: MonthRecord[]): {
  revenue: Record<ProductKey, number>;
  cogs: number;
  opex: Record<OpexKey, number>;
} {
  const src = Array.isArray(months) ? months : [];
  const pick = (fn: (m: MonthRecord) => number | undefined) => src.map(fn);
  const b = (m: MonthRecord) => m?.budget ?? ({} as MonthRecord["budget"]);
  return {
    revenue: {
      platform: foldValues(
        pick((m) => b(m).revenue?.platform),
        MONTH_FIELD_RULES["budget.revenue.platform"],
      ),
      usage: foldValues(
        pick((m) => b(m).revenue?.usage),
        MONTH_FIELD_RULES["budget.revenue.usage"],
      ),
      services: foldValues(
        pick((m) => b(m).revenue?.services),
        MONTH_FIELD_RULES["budget.revenue.services"],
      ),
      marketplace: foldValues(
        pick((m) => b(m).revenue?.marketplace),
        MONTH_FIELD_RULES["budget.revenue.marketplace"],
      ),
    },
    cogs: foldValues(
      pick((m) => b(m).cogs),
      MONTH_FIELD_RULES["budget.cogs"],
    ),
    opex: {
      rd: foldValues(
        pick((m) => b(m).opex?.rd),
        MONTH_FIELD_RULES["budget.opex.rd"],
      ),
      sm: foldValues(
        pick((m) => b(m).opex?.sm),
        MONTH_FIELD_RULES["budget.opex.sm"],
      ),
      ga: foldValues(
        pick((m) => b(m).opex?.ga),
        MONTH_FIELD_RULES["budget.opex.ga"],
      ),
    },
  };
}

/** Variance lines for a period: period actuals against period budget. */
export function buildVariance(months: MonthRecord[], scenario: Scenario): VarianceLine[] {
  const a = aggregatePeriod(months, scenario);
  const b = budgetForPeriod(months);
  const bRev = b.revenue;
  const bOpex = b.opex;
  const fin = (v: number | undefined) => (Number.isFinite(v as number) ? (v as number) : 0);

  const lines: VarianceLine[] = [
    ...PRODUCT_LINES.map((p) => ({
      key: p.key,
      label: p.label,
      budget: fin(bRev[p.key]),
      actual: a.revenueByLine[p.key],
      kind: "revenue" as const,
      commentary: VARIANCE_COMMENTARY[p.key],
    })),
    {
      key: "cogs",
      label: "Cost of Revenue",
      budget: fin(b.cogs),
      actual: a.totalCogs,
      kind: "cost" as const,
      commentary: VARIANCE_COMMENTARY.cogs,
    },
    ...OPEX_CATEGORIES.map((o) => ({
      key: o.key,
      label: `${o.label} Operating Expense`,
      budget: fin(bOpex[o.key]),
      actual: a.opex[o.key],
      kind: "cost" as const,
      commentary: VARIANCE_COMMENTARY[o.key],
    })),
  ];

  return lines;
}

/** Signed impact of a variance line on operating income. */
export function varianceImpact(line: VarianceLine): number {
  const delta = line.actual - line.budget;
  return line.kind === "revenue" ? delta : -delta;
}

/** Impact as a share of budget — null when the budget line is zero. */
export function variancePctOfBudget(line: VarianceLine): number | null {
  return safeDiv(Math.abs(varianceImpact(line)), Math.abs(line.budget));
}

/** Budgeted operating income for a period, from the aggregated budget. */
export function budgetedOperatingIncome(months: MonthRecord[]): number {
  const b = budgetForPeriod(months);
  const rev = b.revenue.platform + b.revenue.usage + b.revenue.services + b.revenue.marketplace;
  return rev - b.cogs - b.opex.rd - b.opex.sm - b.opex.ga;
}

// ---------- formatting ----------
// All money and percentages are formatted here, driven by BRAND.currency and
// BRAND.locale. Nothing outside this file should call toLocaleString or
// hardcode a currency symbol.

const currencyFormatter = new Intl.NumberFormat(BRAND.locale, {
  style: "currency",
  currency: BRAND.currency,
});

/**
 * Symbol placement is read from the locale rather than assumed: en-US prints
 * "$1,234" while de-DE prints "1.234 €", including the non-breaking space.
 */
const SYMBOL_LAYOUT = (() => {
  const parts = currencyFormatter.formatToParts(1234.56);
  const ci = parts.findIndex((p) => p.type === "currency");
  const symbol = ci >= 0 ? parts[ci].value : "";
  if (ci < 0) return { symbol: "", prefix: true, gap: "" };
  const before = parts.slice(0, ci).every((p) => p.type === "literal");
  const gap = before
    ? parts[ci + 1]?.type === "literal"
      ? parts[ci + 1].value
      : ""
    : parts[ci - 1]?.type === "literal"
      ? parts[ci - 1].value
      : "";
  return { symbol, prefix: before, gap };
})();

function withSymbol(body: string): string {
  const { symbol, prefix, gap } = SYMBOL_LAYOUT;
  return prefix ? `${symbol}${gap}${body}` : `${body}${gap}${symbol}`;
}

const wholeFormatter = new Intl.NumberFormat(BRAND.locale, {
  maximumFractionDigits: 0,
});
const centsFormatter = new Intl.NumberFormat(BRAND.locale, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(
  n: number,
  opts: { compact?: boolean; cents?: boolean } = {},
): string {
  if (!Number.isFinite(n)) return NOT_AVAILABLE;
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (opts.compact) {
    // The compact suffixes below (M, K) are deliberately not localised: they
    // are recognised in financial reporting across locales, and Intl's own
    // compact notation produces inconsistent widths that break the tabular
    // number alignment this dashboard depends on. Separators and symbol
    // placement still follow the locale.
    if (abs >= 1_000_000)
      return `${sign}${withSymbol(`${centsFormatter.format(abs / 1_000_000)}M`)}`;
    if (abs >= 1_000) return `${sign}${withSymbol(`${wholeFormatter.format(abs / 1_000)}K`)}`;
    return `${sign}${withSymbol(wholeFormatter.format(abs))}`;
  }
  const body = opts.cents ? centsFormatter.format(abs) : wholeFormatter.format(abs);
  return `${sign}${withSymbol(body)}`;
}

/** Currency, or the neutral placeholder when the figure is not computable. */
export function formatCurrencyOr(
  n: number | null | undefined,
  opts: { compact?: boolean; cents?: boolean } = {},
): string {
  return isNum(n) ? formatCurrency(n, opts) : NOT_AVAILABLE;
}

export function fmtPct(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return NOT_AVAILABLE;
  return `${new Intl.NumberFormat(BRAND.locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n * 100)}%`;
}

/** Percentage, or the neutral placeholder when the ratio is not computable. */
export function fmtPctOr(n: number | null | undefined, digits = 1): string {
  return isNum(n) ? fmtPct(n, digits) : NOT_AVAILABLE;
}

// ---------- dataset sanity check ----------
/**
 * Warn-only shape check for remixed data. Never throws and never blocks
 * rendering; it just names the specific problem in the console so someone
 * mid-setup can see why a panel looks wrong.
 */
export function validateDataset(
  months: MonthRecord[] = MONTHS,
  invoices: Invoice[] = INVOICES,
): string[] {
  const problems: string[] = [];
  const fin = (v: unknown) => typeof v === "number" && Number.isFinite(v);

  if (!Array.isArray(months) || months.length === 0) {
    problems.push("MONTHS is empty — no financial periods to report on.");
  } else {
    const seen = new Set<string>();
    months.forEach((m, i) => {
      const where = `MONTHS[${i}]${m?.id ? ` (${m.id})` : ""}`;
      if (!m || typeof m !== "object") {
        problems.push(`${where} is not a month record.`);
        return;
      }
      if (!m.id) problems.push(`${where} is missing an id.`);
      else if (seen.has(m.id)) problems.push(`${where} duplicates an earlier month id.`);
      else seen.add(m.id);
      if (!m.label || !m.shortLabel) problems.push(`${where} is missing label or shortLabel.`);
      if (!m.revenue) problems.push(`${where} is missing its revenue block.`);
      else
        for (const p of PRODUCT_LINES)
          if (!fin(m.revenue[p.key])) problems.push(`${where} revenue.${p.key} is not a number.`);
      if (!m.cogs) problems.push(`${where} is missing its cogs block.`);
      if (!m.opex) problems.push(`${where} is missing its opex block.`);
      else
        for (const o of OPEX_CATEGORIES)
          if (!fin(m.opex[o.key])) problems.push(`${where} opex.${o.key} is not a number.`);
      if (!m.budget) problems.push(`${where} is missing its budget block.`);
      else {
        if (!m.budget.revenue) problems.push(`${where} budget.revenue is missing.`);
        if (!fin(m.budget.cogs)) problems.push(`${where} budget.cogs is not a number.`);
        if (!m.budget.opex) problems.push(`${where} budget.opex is missing.`);
      }
      if (!fin(m.cashBalance)) problems.push(`${where} cashBalance is not a number.`);
    });
  }

  if (Array.isArray(invoices)) {
    invoices.forEach((inv, i) => {
      const where = `INVOICES[${i}]${inv?.id ? ` (${inv.id})` : ""}`;
      if (!inv || typeof inv !== "object") {
        problems.push(`${where} is not an invoice record.`);
        return;
      }
      if (!inv.customer) problems.push(`${where} is missing a customer name.`);
      if (!fin(inv.amount)) problems.push(`${where} amount is not a number.`);
      else if (inv.amount < 0) problems.push(`${where} has a negative amount.`);
      if (!fin(inv.daysPastDue)) problems.push(`${where} daysPastDue is not a number.`);
    });
  } else {
    problems.push("INVOICES is not an array.");
  }

  return problems;
}

// Setup aid only: warn while developing, never in a production build.
if (import.meta.env?.DEV) {
  for (const problem of validateDataset()) {
    console.warn(`[finance-data] ${problem}`);
  }
}
