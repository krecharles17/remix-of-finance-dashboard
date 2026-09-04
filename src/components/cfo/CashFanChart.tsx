import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { area, curveMonotoneX, line } from "d3-shape";
import { scaleLinear } from "d3-scale";
import {
  BRAND,
  LATEST,
  NOT_AVAILABLE,
  buildForecast,
  formatCurrency,
  runwayMonths,
  type ForecastWeek,
} from "@/data/finance-data";

import { useMeasure } from "@/lib/motion";

interface Props {
  startCash: number;
  baseMonthlyBurn: number;
  active: boolean;
  hiringSpend: number;
  onHiringSpend: (v: number) => void;
}

const MIN_HIRE = 0;
const MAX_HIRE = 900_000;

export function CashFanChart({
  startCash,
  baseMonthlyBurn,
  active,
  hiringSpend,
  onHiringSpend,
}: Props) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const height = 260;
  const m = { top: 16, right: 52, bottom: 26, left: 8 };

  const data: ForecastWeek[] = useMemo(
    () => buildForecast(hiringSpend, startCash),
    [hiringSpend, startCash],
  );

  const innerW = Math.max(80, width - m.left - m.right);
  const innerH = height - m.top - m.bottom;

  const x = useMemo(() => scaleLinear().domain([1, 13]).range([0, innerW]), [innerW]);
  const y = useMemo(() => {
    if (data.length === 0) return scaleLinear().domain([0, 1]).range([innerH, 0]);
    const lo = Math.min(...data.map((d) => d.p10));
    const hi = Math.max(...data.map((d) => d.p90));
    const pad = Math.max(1, (hi - lo) * 0.12);
    return scaleLinear()
      .domain([lo - pad, hi + pad])
      .range([innerH, 0]);
  }, [data, innerH]);

  const outer = useMemo(
    () =>
      area<ForecastWeek>()
        .x((d) => x(d.week))
        .y0((d) => y(d.p10))
        .y1((d) => y(d.p90))
        .curve(curveMonotoneX)(data) ?? "",
    [data, x, y],
  );
  const inner = useMemo(
    () =>
      area<ForecastWeek>()
        .x((d) => x(d.week))
        .y0((d) => y(d.p25))
        .y1((d) => y(d.p75))
        .curve(curveMonotoneX)(data) ?? "",
    [data, x, y],
  );
  const mid = useMemo(
    () =>
      line<ForecastWeek>()
        .x((d) => x(d.week))
        .y((d) => y(d.base))
        .curve(curveMonotoneX)(data) ?? "",
    [data, x, y],
  );

  const [hover, setHover] = useState<number | null>(null);
  const hovered = hover !== null ? data[hover] : null;

  return (
    <div className="flex flex-col gap-4">
      <div ref={ref} className="relative" style={{ height }}>
        {data.length === 0 && (
          <div className="flex h-full items-center justify-center rounded-md border border-dashed border-border/70 px-6 text-center text-[12.5px] text-ink-faint">
            Not enough cash activity in the actuals to project a forecast.
          </div>
        )}
        {width > 0 && data.length > 0 && (
          <svg
            width={width}
            height={height}
            className="block"
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const px = e.clientX - r.left - m.left;
              const w = Math.round(x.invert(px));
              setHover(Math.min(12, Math.max(0, w - 1)));
            }}
            onPointerLeave={() => setHover(null)}
          >
            <g transform={`translate(${m.left},${m.top})`}>
              {y.ticks(4).map((t) => (
                <g key={t} transform={`translate(0,${y(t)})`}>
                  <line x2={innerW} stroke="var(--grid-line)" strokeDasharray="2 4" />
                  <text
                    x={innerW + 8}
                    dy="0.32em"
                    className="num"
                    fontSize={9.5}
                    fill="var(--ink-faint)"
                  >
                    {formatCurrency(t, { compact: true })}
                  </text>
                </g>
              ))}

              <g
                style={{
                  clipPath: active ? "inset(0 0 0 0)" : "inset(0 100% 0 0)",
                  transition: "clip-path 1.5s cubic-bezier(0.22,1,0.36,1) 0.15s",
                }}
              >
                <path
                  d={outer}
                  fill="var(--band-outer)"
                  stroke="var(--band-stroke)"
                  strokeWidth={0.75}
                />
                <path
                  d={inner}
                  fill="var(--band-inner)"
                  stroke="var(--band-stroke)"
                  strokeWidth={0.75}
                />
                <path
                  d={mid}
                  fill="none"
                  stroke="var(--signal)"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                />
              </g>

              {data.map((d) => (
                <text
                  key={d.week}
                  x={x(d.week)}
                  y={innerH + 16}
                  textAnchor="middle"
                  className="num"
                  fontSize={9}
                  fill={hover === d.week - 1 ? "var(--foreground)" : "var(--ink-faint)"}
                >
                  {d.week}
                </text>
              ))}

              {hovered && (
                <g>
                  <line
                    x1={x(hovered.week)}
                    x2={x(hovered.week)}
                    y1={0}
                    y2={innerH}
                    stroke="var(--signal)"
                    strokeOpacity={0.5}
                    strokeDasharray="3 3"
                  />
                  <circle
                    cx={x(hovered.week)}
                    cy={y(hovered.base)}
                    r={3.5}
                    fill="var(--surface)"
                    stroke="var(--signal)"
                    strokeWidth={1.75}
                  />
                </g>
              )}
            </g>
          </svg>
        )}

        {hovered && (
          <div
            className="pointer-events-none absolute top-2 rounded-md border border-hairline bg-popover/95 px-3 py-2 shadow-xl"
            style={{
              left: Math.min(Math.max(x(hovered.week) + m.left - 70, 0), Math.max(0, width - 152)),
            }}
          >
            <div className="eyebrow">Week {hovered.week}</div>
            <div className="num mt-0.5 text-sm text-foreground">
              {formatCurrency(hovered.base, { compact: true })}
            </div>
            <div className="num mt-0.5 text-[10px] text-ink-faint">
              P10–P90 {formatCurrency(hovered.p10, { compact: true })} –{" "}
              {formatCurrency(hovered.p90, { compact: true })}
            </div>
          </div>
        )}
      </div>

      <HiringDrag
        value={hiringSpend}
        onChange={onHiringSpend}
        baseMonthlyBurn={baseMonthlyBurn}
        startCash={startCash}
      />
    </div>
  );
}

/** Draggable what-if handle for incremental monthly hiring spend. */
function HiringDrag({
  value,
  onChange,
  baseMonthlyBurn,
  startCash,
}: {
  value: number;
  onChange: (v: number) => void;
  baseMonthlyBurn: number;
  startCash: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const pct = (value - MIN_HIRE) / (MAX_HIRE - MIN_HIRE);

  const setFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      onChange(Math.round((MIN_HIRE + p * (MAX_HIRE - MIN_HIRE)) / 10_000) * 10_000);
    },
    [onChange],
  );

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => setFromClientX(e.clientX);
    const up = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, setFromClientX]);

  const burn = baseMonthlyBurn + value;
  const months = runwayMonths(startCash, burn);
  // Runway counts forward from the last closed period in the data, not a fixed
  // date, so it stays correct after the actuals are replaced.
  const [ly, lm] = String(LATEST?.id ?? "")
    .split("-")
    .map(Number);
  const runwayDate =
    Number.isFinite(ly) && Number.isFinite(lm) ? new Date(ly, lm - 1 + 1, 0) : new Date();
  if (months !== null) {
    runwayDate.setMonth(runwayDate.getMonth() + Math.floor(months));
    runwayDate.setDate(runwayDate.getDate() + Math.round((months % 1) * 30));
  }

  const tight = months !== null && months < 18;

  return (
    <div className="rounded-md border border-border/70 bg-surface-raised/50 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">What-if · incremental monthly hiring spend</div>
          <div className="num mt-1 text-lg font-medium text-foreground">
            +{formatCurrency(value, { compact: true })}
            <span className="ml-1.5 text-[11px] text-ink-faint">/mo</span>
          </div>
        </div>
        <div className="text-right">
          <div className="eyebrow">Runway exhausts</div>
          <div
            className="num mt-1 text-lg font-medium"
            style={{
              color: months === null ? "var(--ink-faint)" : tight ? "var(--ember)" : "var(--mint)",
            }}
          >
            {months === null
              ? NOT_AVAILABLE
              : runwayDate.toLocaleDateString(BRAND.locale, {
                  month: "short",
                  year: "numeric",
                })}
          </div>
          <div className="num text-[10px] text-ink-faint">
            {months === null ? NOT_AVAILABLE : months.toFixed(1)} months ·{" "}
            {formatCurrency(burn, { compact: true })}/mo burn
          </div>
        </div>
      </div>

      <div
        ref={trackRef}
        className="group relative mt-4 h-11 cursor-ew-resize touch-none rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] sm:h-9"
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture?.(e.pointerId);
          e.currentTarget.focus();
          setDragging(true);
          setFromClientX(e.clientX);
        }}
        role="slider"
        tabIndex={0}
        aria-label="Incremental monthly hiring spend"
        aria-valuemin={MIN_HIRE}
        aria-valuemax={MAX_HIRE}
        aria-valuenow={value}
        aria-valuetext={`${formatCurrency(value, { compact: true })} per month`}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") onChange(Math.min(MAX_HIRE, value + 20_000));
          if (e.key === "ArrowLeft") onChange(Math.max(MIN_HIRE, value - 20_000));
          if (e.key === "Home") onChange(MIN_HIRE);
          if (e.key === "End") onChange(MAX_HIRE);
        }}
      >
        <div className="absolute inset-x-0 top-4 h-[3px] rounded-full bg-border" />
        <div
          className="absolute top-4 h-[3px] rounded-full"
          style={{
            width: `${pct * 100}%`,
            background: "linear-gradient(90deg, var(--signal-deep), var(--signal))",
          }}
        />
        <div
          className="absolute top-4 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${pct * 100}%` }}
        >
          <div
            className="h-4 w-4 rounded-full border-2 bg-background transition-transform"
            style={{
              borderColor: "var(--signal)",
              boxShadow: dragging
                ? "0 0 0 7px color-mix(in oklab, var(--signal) 22%, transparent)"
                : "0 0 0 0 transparent",
              transform: dragging ? "scale(1.15)" : "scale(1)",
            }}
          />
        </div>
        <div className="num absolute inset-x-0 bottom-0 flex justify-between text-[9px] text-ink-faint">
          <span>$0</span>
          <span>+$900K/mo</span>
        </div>
      </div>
    </div>
  );
}
