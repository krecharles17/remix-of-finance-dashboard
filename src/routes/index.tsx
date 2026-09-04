import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { RemixGuide } from "@/components/cfo/RemixGuide";

import {
  BRAND,
  MONTHS,
  SCENARIOS,
  aggregatePeriod,
  annualisedRunRate,
  budgetedOperatingIncome,
  buildVariance,
  derivedMonthlyBurn,
  granularityNoun,
  incompleteNote,
  periodsFor,
  priorPeriodCaption,
  priorPeriodOf,
  AR_AT_RISK,
  AR_TOTAL,
  INVOICES,
  NOT_AVAILABLE,
  fmtPctOr,
  formatCurrency,
  isNum,
  periodRange,
  runwayMonths,
  safeDiv,
  type Granularity,
  type Scenario,
} from "@/data/finance-data";
import { type GeneratedScenario } from "@/lib/scenario-from-prose";
import { ControlBar } from "@/components/cfo/ControlBar";
import { KpiStrip, type Kpi } from "@/components/cfo/KpiStrip";
import { SankeyFlow } from "@/components/cfo/SankeyFlow";
import { CashFanChart } from "@/components/cfo/CashFanChart";
import { VarianceWaterfall, buildSteps } from "@/components/cfo/VarianceWaterfall";
import { VariancePanel } from "@/components/cfo/VariancePanel";
import { ArAgingTable } from "@/components/cfo/ArAgingTable";
import { Panel } from "@/components/cfo/Panel";
import { useStage } from "@/lib/motion";
import { useGeneratedCommentary } from "@/lib/use-generated-commentary";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${BRAND.title} — ${BRAND.company} Finance Ops` },
      {
        name: "description",
        content: `Finance ops room for ${BRAND.company}: animated money-flow Sankey, 13-week cash fan forecast, budget variance waterfall and AR collection risk.`,
      },
      { property: "og:title", content: `${BRAND.title} — ${BRAND.company}` },
      {
        property: "og:description",
        content: `An operator's finance dashboard for ${BRAND.company}: money-flow Sankey, 13-week cash forecast with what-if hiring, variance waterfall and AR risk.`,
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  // No periods at all is a setup state, not an error state.
  component: MONTHS.length === 0 ? NoPeriods : CommandCenter,
});

function NoPeriods() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <div className="eyebrow">{BRAND.company}</div>
        <h1 className="mt-2 text-[1.4rem] font-semibold leading-tight text-foreground">
          No financial periods found
        </h1>
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-faint">
          This dashboard renders from the monthly records in{" "}
          <span className="num">src/data/finance-data.ts</span>. Add at least one period to{" "}
          <span className="num">MONTHS</span>, conforming to{" "}
          <span className="num">MonthRecord</span>, and every panel will populate from it.
        </p>
      </div>
    </div>
  );
}

function CommandCenter() {
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [periodId, setPeriodId] = useState(MONTHS[MONTHS.length - 1].id);
  const [scenarioKey, setScenarioKey] = useState(SCENARIOS[0].key);
  const [hiringSpend, setHiringSpend] = useState(180_000);
  const [selectedVariance, setSelectedVariance] = useState<string | null>(null);
  // Session-only, like generated commentary: a scenario describes a specific
  // set of assumptions and should not outlive the session silently.
  const [generated, setGenerated] = useState<GeneratedScenario[]>([]);

  const allScenarios = useMemo<Scenario[]>(() => [...SCENARIOS, ...generated], [generated]);

  const periods = useMemo(() => periodsFor(granularity), [granularity]);
  const period = periods.find((p) => p.id === periodId) ?? periods[periods.length - 1];
  const scenario = allScenarios.find((s) => s.key === scenarioKey) ?? SCENARIOS[0];

  /** Switching granularity lands on the most recent period of the new kind. */
  const changeGranularity = (g: Granularity) => {
    const next = periodsFor(g);
    setGranularity(g);
    setPeriodId(next[next.length - 1]?.id ?? "");
  };

  // Flows sum across the period, stocks take the final month. See
  // MONTH_FIELD_RULES in the data file.
  const agg = useMemo(() => aggregatePeriod(period.months, scenario), [period, scenario]);

  // Like compared with like: quarter against prior quarter, YTD against prior
  // YTD, month against prior month. Genuinely null when the dataset holds no
  // comparable prior period, which is different from a zero change.
  const prior = useMemo(() => priorPeriodOf(period, periods), [period, periods]);
  const prevAgg = useMemo(
    () => (prior ? aggregatePeriod(prior.months, scenario) : null),
    [prior, scenario],
  );
  const deltaCaption = priorPeriodCaption(granularity);
  const partialNote = incompleteNote(period);

  const heroOn = useStage(320);
  const forecastOn = useStage(900);
  const waterfallOn = useStage(1150);

  // ---- KPIs ----
  // A run rate, not a flow: taken from the final month of the period.
  const arr = annualisedRunRate(period.months, scenario);
  const prevArr = prior ? annualisedRunRate(prior.months, scenario) : null;
  const netBurn = Math.max(0, -agg.operatingIncome);
  const prevBurn = prevAgg ? Math.max(0, -prevAgg.operatingIncome) : null;
  // Runway needs a monthly rate: average monthly cash burn across the selected
  // period, against period-end cash. The month view keeps the trailing window,
  // but ends it at the selected month rather than at the dataset's last month.
  const cashBurn = useMemo(() => {
    if (granularity !== "month") {
      return derivedMonthlyBurn(period.months, INVOICES, period.months.length);
    }
    const i = MONTHS.findIndex((m) => m.id === period.id);
    const upTo = i >= 0 ? MONTHS.slice(0, i + 1) : MONTHS;
    return derivedMonthlyBurn(upTo);
  }, [granularity, period]);

  const totalBurn = cashBurn + hiringSpend;
  const runway = runwayMonths(agg.cashBalance, totalBurn);

  // From period totals, never an average of monthly ratios.
  const opMargin = safeDiv(agg.operatingIncome, agg.totalRevenue);

  /** Percent change, or null when there is no comparable prior figure. */
  const pctDelta = (a: number | null, b: number | null) => {
    if (!isNum(a) || !isNum(b)) return null;
    const r = safeDiv(a - b, Math.abs(b));
    return r === null ? null : r * 100;
  };
  const negate = (v: number | null) => (v === null ? null : -v);

  const periodSuffix =
    granularity === "month" ? "" : granularity === "quarter" ? " · quarter" : " · YTD";

  const kpis: Kpi[] = [
    {
      label: "ARR",
      value: arr,
      fmt: "usdCompact",
      delta: pctDelta(arr, prevArr),
      deltaLabel: deltaCaption,
      hint: "Recurring lines only — services excluded. Run rate from the final month of the period.",
    },
    {
      label: "Gross margin",
      value: agg.grossMargin,
      fmt: "pct",
      delta:
        prevAgg && isNum(agg.grossMargin) && isNum(prevAgg.grossMargin)
          ? (agg.grossMargin - prevAgg.grossMargin) * 100
          : null,
      deltaLabel: `pts ${deltaCaption.replace("vs ", "")}`,
      hint: "Gross profit over revenue for the whole period, not an average of monthly margins.",
    },
    {
      label: `Net burn${periodSuffix}`,
      value: netBurn,
      fmt: "usdCompact",
      delta: negate(pctDelta(netBurn, prevBurn)),
      deltaLabel: deltaCaption,
      tone: "ember",
      hint: `Operating loss summed across the ${granularityNoun(granularity)}, before the what-if hiring overlay.`,
    },
    {
      label: "Runway",
      value: runway,
      fmt: "months",
      delta: negate(pctDelta(totalBurn, isNum(prevBurn) ? prevBurn + hiringSpend : null)),
      deltaLabel: "at current burn",
      tone: isNum(runway) && runway < 18 ? "ember" : "mint",
      hint: "Average monthly burn across the period against period-end cash. Includes the hiring what-if.",
    },
    {
      label: "Cash balance",
      value: agg.cashBalance,
      fmt: "usdCompact",
      delta: pctDelta(agg.cashBalance, prevAgg?.cashBalance ?? null),
      deltaLabel: deltaCaption,
      hint: "Operating and reserve accounts. A position, not a flow — the balance at period end.",
    },
  ];

  // ---- variance ----
  const varianceLines = useMemo(() => buildVariance(period.months, scenario), [period, scenario]);
  const budgetOI = useMemo(() => budgetedOperatingIncome(period.months), [period]);
  const steps = useMemo(
    () => buildSteps(varianceLines, budgetOI, agg.operatingIncome),
    [varianceLines, budgetOI, agg.operatingIncome],
  );
  const selectedLine = varianceLines.find((l) => l.key === selectedVariance) ?? null;

  // Layer two: session-only generated commentary. Nothing here runs on mount,
  // on period change, or on scenario change — every call is user-initiated.
  const commentary = useGeneratedCommentary({
    monthId: period.id,
    monthLabel: period.label,
    scenarioKey: scenario.key,
    scenarioLabel: scenario.label,
    totalRevenue: agg.totalRevenue,
    operatingIncome: agg.operatingIncome,
  });
  // Authored marks come from the dataset; generated marks come from the hook,
  // already scoped to the selected period and scenario.
  const marks: Record<string, "authored" | "generated"> = { ...commentary.marks };
  for (const l of varianceLines) {
    if (l.commentary) marks[l.key] = "authored";
  }

  const [guideOpen, setGuideOpen] = useState(false);

  const pendingCount = varianceLines.filter((l) => !l.commentary && !commentary.get(l.key)).length;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-[1560px] px-4 pb-20 sm:px-6 lg:px-8">
        {/* ================= masthead: identity only ================= */}
        <header className="stage flex flex-wrap items-start justify-between gap-3 py-4 sm:py-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--mint)" }}
              />
              <span className="eyebrow">
                {BRAND.company} · {BRAND.eyebrow}
              </span>
            </div>
            <h1 className="mt-1.5 text-[clamp(1.65rem,3vw,2.35rem)] font-bold leading-[1.02] text-foreground">
              {BRAND.title}
            </h1>
            <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-ink-faint">
              {scenario.blurb} {BRAND.subtitlePrefix} {period.label} · {agg.headcount} employees at
              period end · books locked by the controller.
            </p>
          </div>

          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={guideOpen}
            onClick={() => setGuideOpen(true)}
            className="min-h-11 shrink-0 self-start whitespace-nowrap rounded-md px-3.5 py-2 text-[12.5px] font-semibold transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
            style={{
              background: "var(--signal)",
              color: "var(--control-on-fg)",
            }}
          >
            Template instructions
          </button>
        </header>

        <RemixGuide open={guideOpen} onClose={() => setGuideOpen(false)} />

        {/* ================= instrument bar ================= */}
        <ControlBar
          scenarios={allScenarios}
          scenarioKey={scenarioKey}
          onScenario={setScenarioKey}
          onDeleteScenario={(key) => {
            setGenerated((prev) => prev.filter((p) => p.key !== key));
            if (scenarioKey === key) setScenarioKey(SCENARIOS[0].key);
          }}
          onApplyScenario={(s) => {
            setGenerated((prev) => [...prev.filter((p) => p.key !== s.key), s]);
            setScenarioKey(s.key);
          }}
          onEditScenario={(s) => {
            setGenerated((prev) => prev.map((p) => (p.key === s.key ? s : p)));
          }}
          granularity={granularity}
          onGranularity={changeGranularity}
          periods={periods}
          periodId={period.id}
          onPeriod={setPeriodId}
        />

        {/* A partial period is never presented as a whole one. */}
        {partialNote && (
          <p
            role="status"
            className="mt-3 rounded-md border border-dashed border-hairline px-3 py-2 text-[12px] leading-relaxed"
            style={{ color: "var(--ember)" }}
          >
            {partialNote} Figures below cover only the months present.
          </p>
        )}

        {/* ================= KPI strip ================= */}
        <div className="mt-4">
          <KpiStrip kpis={kpis} />
        </div>

        {/* ================= HERO: money flow ================= */}
        <div className="mt-4">
          <Panel
            eyebrow="Hero · money flow"
            title="Where every dollar went"
            subtitle={`${period.label} · hover any ribbon to trace it end to end.`}
            subtitleHint="Revenue streams merge into one trunk, then split through cost of revenue and operating expense into what is left over. Hover any ribbon to trace it end to end."
            headerClassName="px-5 pb-3 pt-4 sm:px-6 sm:pb-3 sm:pt-5"
            delay={260}
            aside={
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Legend swatch="var(--signal)" glyph="in" label="Revenue" />
                <Legend swatch="var(--ember)" glyph="out" label="Cost" />
                <Legend
                  swatch={agg.operatingIncome >= 0 ? "var(--mint)" : "var(--destructive)"}
                  glyph={agg.operatingIncome >= 0 ? "+" : "−"}
                  label={agg.operatingIncome >= 0 ? "Income" : "Loss"}
                />
                <div className="border-l border-border/70 pl-4">
                  <div className="eyebrow">Op. margin</div>
                  <div
                    className="num text-sm font-medium"
                    style={{
                      color: agg.operatingIncome >= 0 ? "var(--mint)" : "var(--ember)",
                    }}
                  >
                    {fmtPctOr(opMargin, 1)}
                  </div>
                </div>
              </div>
            }
            bodyClassName="px-2 pb-4 sm:px-4 sm:pb-6"
            empty={
              agg.totalRevenue <= 0 ? (
                <>
                  No revenue recorded for {period.label}, so there is nothing to trace through the
                  flow. Add revenue figures for this period in{" "}
                  <span className="num">src/data/finance-data.ts</span>.
                </>
              ) : undefined
            }
          >
            <SankeyFlow
              agg={agg}
              stateKey={`${period.id}|${scenarioKey}`}
              active={heroOn}
              height={470}
            />

            <div className="mt-1 flex flex-wrap gap-x-8 gap-y-2 px-3">
              <Readout label="Total revenue" value={formatCurrency(agg.totalRevenue)} />
              <Readout label="Cost of revenue" value={formatCurrency(agg.totalCogs)} />
              <Readout label="Gross profit" value={formatCurrency(agg.grossProfit)} />
              <Readout label="Operating expense" value={formatCurrency(agg.totalOpex)} />
              <Readout
                label={agg.operatingIncome >= 0 ? "Operating income" : "Operating loss"}
                value={formatCurrency(Math.abs(agg.operatingIncome))}
                tone={agg.operatingIncome >= 0 ? "var(--mint)" : "var(--ember)"}
              />
            </div>
          </Panel>
        </div>

        {/* ================= forecast + AR ================= */}
        <div className="mt-5 grid gap-5 xl:grid-cols-5">
          <Panel
            eyebrow="Liquidity"
            title="13-week cash forecast"
            subtitle={`Anchored on cash at the end of ${period.label}. Base case with P25–P75 and P10–P90 uncertainty bands. Drag the handle to reprice the hiring plan.`}
            delay={620}
            className="xl:col-span-3"
            empty={
              !isNum(agg.cashBalance) || agg.cashBalance <= 0 ? (
                <>
                  The forecast starts from the closing cash balance for {period.label}, which is
                  missing or not positive. Set <span className="num">cashBalance</span> on this
                  period in <span className="num">src/data/finance-data.ts</span> to project the
                  next 13 weeks.
                </>
              ) : undefined
            }
          >
            <CashFanChart
              startCash={agg.cashBalance}
              baseMonthlyBurn={cashBurn}
              active={forecastOn}
              hiringSpend={hiringSpend}
              onHiringSpend={setHiringSpend}
            />
          </Panel>

          <Panel
            eyebrow="Receivables"
            title="AR aging & collection risk"
            subtitle={
              INVOICES.length === 0
                ? undefined
                : `${formatCurrency(AR_TOTAL, { compact: true })} outstanding · ${formatCurrency(
                    AR_AT_RISK,
                    { compact: true },
                  )} flagged at risk · present-day snapshot, not ${period.label} period-end receivables`
            }
            delay={720}
            className="xl:col-span-2"
            empty={
              INVOICES.length === 0 ? (
                <>
                  No outstanding receivables. Add your AR ledger to{" "}
                  <span className="num">INVOICES</span> in{" "}
                  <span className="num">src/data/finance-data.ts</span> to see aging buckets and
                  collection risk.
                </>
              ) : undefined
            }
          >
            <ArAgingTable />
          </Panel>
        </div>

        {/* ================= waterfall ================= */}
        <div className="mt-5">
          <Panel
            eyebrow="Budget vs actual"
            title="Operating income variance"
            subtitle={`${period.label} totals against ${period.label} budget. Click any variance bar for the plain-English read.`}
            delay={820}
            aside={
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-start gap-1.5">
                  <button
                    onClick={() => commentary.generateAll(varianceLines)}
                    disabled={commentary.progress !== null || pendingCount === 0}
                    className="rounded border border-border bg-surface px-2.5 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
                  >
                    {commentary.progress
                      ? `Generating ${Math.min(commentary.progress.done + 1, commentary.progress.total)} of ${commentary.progress.total}…`
                      : pendingCount === 0
                        ? "All lines have commentary"
                        : `Generate commentary (${pendingCount})`}
                  </button>
                  <div className="flex items-center gap-3">
                    <Legend swatch="var(--ink-dim)" label="Authored" glyph="•" />
                    <Legend swatch="var(--signal)" label="AI-generated" glyph="•" />
                  </div>
                </div>
                <div className="text-right">
                  <div className="eyebrow">Net variance</div>
                  <div
                    className="num text-sm font-medium"
                    style={{
                      color: agg.operatingIncome - budgetOI >= 0 ? "var(--mint)" : "var(--ember)",
                    }}
                  >
                    {agg.operatingIncome - budgetOI >= 0 ? "+" : "−"}
                    {formatCurrency(Math.abs(agg.operatingIncome - budgetOI), {
                      compact: true,
                    })}
                  </div>
                </div>
              </div>
            }
          >
            <VarianceWaterfall
              steps={steps}
              active={waterfallOn}
              selected={selectedVariance}
              onSelect={setSelectedVariance}
              marks={marks}
            />
          </Panel>
        </div>

        <footer className="stage mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-5">
          <p className="num text-[10.5px] tracking-[0.04em] text-ink-faint">
            {BRAND.company} · {BRAND.footerNote}
          </p>
          <p className="num text-[10.5px] tracking-[0.04em] text-ink-faint">
            Showing {period.label}
            {partialNote ? " (incomplete)" : ""} · dataset {periodRange() ?? NOT_AVAILABLE} ·{" "}
            {MONTHS.length} months
          </p>
        </footer>
      </div>

      <VariancePanel
        line={selectedLine}
        periodLabel={period.label}
        incompleteNote={partialNote}
        onClose={() => setSelectedVariance(null)}
        generated={selectedLine ? commentary.get(selectedLine.key) : undefined}
        streaming={selectedLine ? commentary.streaming(selectedLine.key) : undefined}
        generateError={selectedLine ? commentary.error(selectedLine.key) : undefined}
        onGenerate={selectedLine ? () => commentary.generate(selectedLine) : undefined}
      />
    </div>
  );
}

function Legend({
  swatch,
  label,
  glyph,
}: {
  swatch: string;
  label: string;
  /** Text carrier so the legend does not rely on colour alone. */
  glyph: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-block h-2 w-2 rounded-sm"
        style={{ background: swatch, opacity: 0.85 }}
      />
      <span className="text-[11px] font-medium text-ink-dim">
        {label}
        <span className="num ml-1 text-[10px] text-ink-faint">({glyph})</span>
      </span>
    </div>
  );
}

function Readout({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div
        className="num mt-0.5 text-[13px] font-medium"
        style={{ color: tone ?? "var(--foreground)" }}
      >
        {value}
      </div>
    </div>
  );
}
