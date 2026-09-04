import { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { scaleLinear } from "d3-scale";
import {
  formatCurrency,
  varianceImpact,
  type VarianceLine,
} from "@/data/finance-data";
import { useMeasure, useStage } from "@/lib/motion";

export interface WaterfallStep {
  key: string;
  label: string;
  /** signed impact on operating income */
  impact: number;
  start: number;
  end: number;
  kind: "anchor" | "delta";
  line?: VarianceLine;
}

export function buildSteps(
  lines: VarianceLine[],
  budgetOI: number,
  actualOI: number,
): WaterfallStep[] {
  const steps: WaterfallStep[] = [
    { key: "budget", label: "Budgeted op. income", impact: budgetOI, start: 0, end: budgetOI, kind: "anchor" },
  ];
  let cursor = budgetOI;
  for (const l of lines) {
    const impact = varianceImpact(l);
    steps.push({
      key: l.key,
      label: l.label,
      impact,
      start: cursor,
      end: cursor + impact,
      kind: "delta",
      line: l,
    });
    cursor += impact;
  }
  steps.push({
    key: "actual",
    label: "Actual op. income",
    impact: actualOI,
    start: 0,
    end: actualOI,
    kind: "anchor",
  });
  return steps;
}

interface Props {
  steps: WaterfallStep[];
  active: boolean;
  selected: string | null;
  onSelect: (key: string | null) => void;
  /** Which lines carry commentary, and from which layer. */
  marks?: Record<string, "authored" | "generated">;
}

export function VarianceWaterfall({ steps, active, selected, onSelect, marks = {} }: Props) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const height = 236;
  const m = { top: 22, right: 56, bottom: 38, left: 8 };
  const innerW = Math.max(120, width - m.left - m.right);
  const innerH = height - m.top - m.bottom;

  const y = useMemo(() => {
    const vals = steps.flatMap((s) => [s.start, s.end, 0]);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    // One common scale for every bar; only the headroom around it is trimmed.
    const pad = (hi - lo) * 0.05 || 1;
    return scaleLinear().domain([lo - pad, hi + pad]).range([innerH, 0]);
  }, [steps, innerH]);


  const bandW = innerW / steps.length;
  const barW = Math.min(46, bandW * 0.56);
  const started = useStage(active ? 60 : 100000);
  /** Focus ring is drawn from state, like the Sankey node ring, so it does not
   *  depend on the order of <rect> children inside a bar group. */
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  return (
    <div ref={ref} className="relative" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} className="block">
          <g transform={`translate(${m.left},${m.top})`}>
            {y.ticks(4).map((t) => (
              <g key={t} transform={`translate(0,${y(t)})`}>
                <line
                  x2={innerW}
                  stroke={t === 0 ? "var(--axis-line)" : "var(--grid-line)"}
                  strokeOpacity={t === 0 ? 1 : 0.85}
                  strokeDasharray={t === 0 ? undefined : "2 4"}
                />
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

            {steps.map((s, i) => {
              const cx = i * bandW + bandW / 2;
              const top = y(Math.max(s.start, s.end));
              const bottom = y(Math.min(s.start, s.end));
              const h = Math.max(2, bottom - top);
              const isAnchor = s.kind === "anchor";
              const favourable = s.impact >= 0;
              const fill = isAnchor
                ? "var(--signal-soft)"
                : favourable
                  ? "var(--mint)"
                  : "var(--ember)";
              const isSel = selected === s.key;
              const dim = selected !== null && !isSel;
              const grows = s.end >= s.start;

              return (
                <g key={s.key}>
                  {/* connector */}
                  {i > 0 && !isAnchor && (
                    <line
                      x1={(i - 1) * bandW + bandW / 2 + barW / 2}
                      x2={cx - barW / 2}
                      y1={y(s.start)}
                      y2={y(s.start)}
                      stroke="var(--connector)"
                      strokeWidth={1}
                      strokeDasharray="3 2"
                      style={{
                        opacity: started ? 0.8 : 0,
                        transition: `opacity 300ms ease-out ${140 + i * 130}ms`,
                      }}
                    />
                  )}

                  <g
                    className={s.line ? "cursor-pointer focus:outline-none" : ""}
                    onClick={() => s.line && onSelect(isSel ? null : s.key)}
                    {...(s.line
                      ? {
                          role: "button",
                          tabIndex: 0,
                          "aria-pressed": isSel,
                          "aria-label": `${s.label}: ${
                            favourable ? "favourable" : "unfavourable"
                          } variance of ${formatCurrency(Math.abs(s.impact), {
                            compact: true,
                          })} to operating income. ${
                            marks[s.key] === "authored"
                              ? "Authored commentary available."
                              : marks[s.key] === "generated"
                                ? "AI-generated commentary available."
                                : "No commentary yet."
                          } Open commentary.`,
                          onFocus: () => setFocusedKey(s.key),
                          onBlur: () => setFocusedKey((k) => (k === s.key ? null : k)),
                          onKeyDown: (e: ReactKeyboardEvent) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onSelect(isSel ? null : s.key);
                            }
                          },
                        }
                      : { "aria-hidden": true })}
                  >
                    <rect
                      x={cx - bandW / 2}
                      y={0}
                      width={bandW}
                      height={innerH}
                      fill="transparent"
                    />
                    <rect
                      x={cx - barW / 2}
                      y={top}
                      width={barW}
                      height={h}
                      rx={2}
                      fill={fill}
                      style={{
                        transformBox: "fill-box",
                        transformOrigin: grows ? "center bottom" : "center top",
                        transform: started ? "scaleY(1)" : "scaleY(0)",
                        opacity: started ? (dim ? 0.28 : 1) : 0,
                        transition: `transform 520ms cubic-bezier(0.22,1,0.36,1) ${i * 130}ms, opacity 300ms ease-out ${i * 130}ms`,
                      }}
                    />
                    {focusedKey === s.key && (
                      <rect
                        x={cx - barW / 2 - 2}
                        y={top - 2}
                        width={barW + 4}
                        height={h + 4}
                        rx={3}
                        fill="none"
                        stroke="var(--ring)"
                        strokeWidth={2}
                      />
                    )}
                    {isSel && (
                      <rect
                        x={cx - barW / 2 - 3}
                        y={top - 3}
                        width={barW + 6}
                        height={h + 6}
                        rx={4}
                        fill="none"
                        stroke="var(--signal)"
                        strokeWidth={1.25}
                      />
                    )}

                    <text
                      x={cx}
                      y={grows ? top - 7 : bottom + 13}
                      textAnchor="middle"
                      className="num"
                      fontSize={9.5}
                      fill={isAnchor ? "var(--foreground)" : fill}
                      style={{
                        opacity: started ? (dim ? 0.4 : 1) : 0,
                        transition: `opacity 340ms ease-out ${240 + i * 130}ms`,
                      }}
                    >
                      {isAnchor
                        ? formatCurrency(s.end, { compact: true })
                        : `${s.impact >= 0 ? "+" : "−"}${formatCurrency(Math.abs(s.impact), { compact: true }).replace("$", "$")}`}
                    </text>
                  </g>

                  {marks[s.key] && (
                    <circle
                      cx={cx}
                      cy={innerH + 27}
                      r={3.4}
                      fill={
                        marks[s.key] === "generated" ? "var(--signal)" : "var(--surface)"
                      }
                      stroke={
                        marks[s.key] === "generated" ? "var(--signal)" : "var(--ink-dim)"
                      }
                      strokeWidth={1.4}
                      style={{
                        opacity: started ? (dim ? 0.4 : 1) : 0,
                        transition: `opacity 340ms ease-out ${200 + i * 130}ms`,
                      }}
                    />
                  )}


                  <text
                    x={cx}
                    y={innerH + 18}
                    textAnchor="middle"
                    fontSize={9}
                    fill={isSel ? "var(--foreground)" : "var(--ink-faint)"}
                    style={{
                      opacity: started ? 1 : 0,
                      transition: `opacity 340ms ease-out ${200 + i * 130}ms`,
                    }}
                  >
                    {abbrev(s.label)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      )}
    </div>
  );
}

function abbrev(label: string): string {
  return (
    {
      "Budgeted op. income": "Budget",
      "Actual op. income": "Actual",
      "Platform Subscriptions": "Platform",
      "Usage & Overages": "Usage",
      "Professional Services": "Services",
      "Marketplace Rev-Share": "Mktplace",
      "Cost of Revenue": "COGS",
      "R&D Operating Expense": "R&D",
      "S&M Operating Expense": "S&M",
      "G&A Operating Expense": "G&A",
    } as Record<string, string>
  )[label] ?? label;
}
