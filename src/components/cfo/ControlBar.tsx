import { useEffect, useRef, useState } from "react";

import type { Granularity, Period, Scenario } from "@/data/finance-data";
import { isGeneratedScenario, type GeneratedScenario } from "@/lib/scenario-from-prose";
import {
  MultiplierPopover,
  ScenarioComposerRow,
  ScenarioComposerTrigger,
} from "@/components/cfo/ScenarioComposer";
import { ThemeToggle } from "@/components/cfo/ThemeToggle";

const GRANULARITIES: Array<{ key: Granularity; label: string; full: string }> = [
  { key: "month", label: "M", full: "Month" },
  { key: "quarter", label: "Q", full: "Quarter" },
  { key: "ytd", label: "YTD", full: "Year to date" },
];

/**
 * One instrument band directly under the masthead: scenario, period, theme.
 * It pins to the top of the viewport as part of the page — a hairline and the
 * surface token, no floating chrome — so a scenario or period can be changed
 * while looking at the waterfall.
 *
 * Below ~640px the scenario row wraps and the period row becomes a horizontal
 * scroller rather than eating half the viewport height.
 */
export function ControlBar({
  scenarios,
  scenarioKey,
  onScenario,
  onDeleteScenario,
  onApplyScenario,
  onEditScenario,
  granularity,
  onGranularity,
  periods,
  periodId,
  onPeriod,
}: {
  scenarios: readonly Scenario[];
  scenarioKey: string;
  onScenario: (key: string) => void;
  onDeleteScenario: (key: string) => void;
  onApplyScenario: (s: GeneratedScenario) => void;
  onEditScenario: (s: GeneratedScenario) => void;
  granularity: Granularity;
  onGranularity: (g: Granularity) => void;
  periods: readonly Period[];
  periodId: string;
  onPeriod: (id: string) => void;
}) {
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const assumptionsRef = useRef<HTMLButtonElement>(null);
  const composerTriggerRef = useRef<HTMLButtonElement>(null);

  function closeComposer() {
    setComposerOpen(false);
    composerTriggerRef.current?.focus();
  }

  const selected = scenarios.find((s) => s.key === scenarioKey) ?? null;
  const generatedSelected = selected && isGeneratedScenario(selected) ? selected : null;

  // The popover exists only while a generated scenario is selected.
  useEffect(() => {
    if (!generatedSelected) setAssumptionsOpen(false);
  }, [generatedSelected]);

  function closeAssumptions() {
    setAssumptionsOpen(false);
    assumptionsRef.current?.focus();
  }

  return (
    <div className="sticky top-0 z-40 -mx-4 border-b border-hairline bg-background/95 px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="grid grid-cols-1 items-center gap-2 py-2.5 lg:grid-cols-[minmax(0,1fr)_auto]">
        {/* ---- scenario ---- */}
        <div className="relative flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="eyebrow hidden shrink-0 text-ink-faint sm:inline">Scenario</span>
          <div
            role="group"
            aria-label="Planning scenario"
            className="flex min-w-0 flex-initial gap-1 overflow-x-auto py-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {scenarios.map((s) => {
              const on = s.key === scenarioKey;
              const gen = isGeneratedScenario(s);
              return (
                <span
                  key={s.key}
                  className={
                    gen
                      ? "flex min-w-0 max-w-[min(260px,58vw)] shrink-0 items-center"
                      : "flex shrink-0 items-center"
                  }
                >
                  <button
                    type="button"
                    aria-pressed={on}
                    title={gen ? `Modelled from: ${s.source}` : s.blurb}
                    onClick={() => onScenario(s.key)}
                    className={
                      gen
                        ? "flex min-h-11 min-w-0 flex-1 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] sm:min-h-0"
                        : "flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] sm:min-h-0"
                    }
                    style={{
                      borderColor: on || gen ? "var(--signal)" : "var(--border)",
                      borderStyle: gen && !on ? "dashed" : "solid",
                      color: on ? "var(--control-on-fg)" : "var(--ink-dim)",
                      background: on ? "var(--signal)" : "var(--surface)",
                      borderTopRightRadius: gen ? 0 : undefined,
                      borderBottomRightRadius: gen ? 0 : undefined,
                      borderRightWidth: gen ? 0 : undefined,
                    }}
                  >
                    {gen && (
                      <span
                        aria-hidden="true"
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{ background: on ? "var(--control-on-fg)" : "var(--signal)" }}
                      />
                    )}
                    <span className="min-w-0 truncate">{s.label}</span>

                    {gen && <span className="sr-only"> (modelled from a description)</span>}
                  </button>
                  {gen && (
                    <button
                      type="button"
                      aria-label={`Remove scenario ${s.label}`}
                      title="Remove this modelled scenario"
                      onClick={() => onDeleteScenario(s.key)}
                      className="flex min-h-11 items-center rounded-r-md border px-1.5 py-1.5 text-[12px] leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] sm:min-h-0"
                      style={{
                        borderColor: "var(--signal)",
                        borderStyle: on ? "solid" : "dashed",
                        color: on ? "var(--control-on-fg)" : "var(--ink-faint)",
                        background: on ? "var(--signal)" : "var(--surface)",
                      }}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  )}
                </span>
              );
            })}
          </div>

          <div className="flex min-w-0 shrink-0 items-center gap-1.5">
            <ScenarioComposerTrigger
              open={composerOpen}
              onOpen={() => setComposerOpen(true)}
              triggerRef={composerTriggerRef}
            />

            {generatedSelected && (
              <button
                ref={assumptionsRef}
                type="button"
                aria-expanded={assumptionsOpen}
                aria-haspopup="dialog"
                onClick={() => setAssumptionsOpen((v) => !v)}
                className="min-h-11 shrink-0 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] font-medium text-ink-dim transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] sm:min-h-0"
              >
                Assumptions
              </button>
            )}
          </div>

          {generatedSelected && assumptionsOpen && (
            <MultiplierPopover
              scenario={generatedSelected}
              onEdit={onEditScenario}
              onClose={closeAssumptions}
            />
          )}
        </div>

        {/* ---- granularity + period + theme ---- */}
        <div className="flex min-w-0 items-center justify-end gap-2 lg:justify-self-end">
          <span className="eyebrow hidden shrink-0 text-ink-faint sm:inline">Period</span>

          <div
            role="group"
            aria-label="Reporting granularity"
            className="flex shrink-0 gap-px overflow-hidden rounded-md border border-border"
          >
            {GRANULARITIES.map((g) => {
              const on = g.key === granularity;
              return (
                <button
                  key={g.key}
                  type="button"
                  aria-pressed={on}
                  aria-label={g.full}
                  title={g.full}
                  onClick={() => onGranularity(g.key)}
                  className="num min-h-11 shrink-0 px-2 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ring)] sm:min-h-0"
                  style={{
                    color: on ? "var(--control-on-fg)" : "var(--ink-dim)",
                    background: on ? "var(--signal)" : "var(--surface)",
                  }}
                >
                  {g.label}
                </button>
              );
            })}
          </div>

          <div
            role="group"
            aria-label="Reporting period"
            className="flex min-w-0 gap-px overflow-x-auto rounded-md border border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {periods.map((p) => {
              const on = p.id === periodId;
              const partial = !p.complete && p.granularity !== "month";
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  aria-label={partial ? `${p.label} (incomplete)` : p.label}
                  onClick={() => onPeriod(p.id)}
                  title={partial ? `${p.label} — incomplete` : p.label}
                  className="num relative min-h-11 shrink-0 px-2 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ring)] sm:min-h-0"
                  style={{
                    minWidth: granularity === "month" ? 40 : undefined,
                    color: on ? "var(--control-on-fg)" : "var(--ink-dim)",
                    background: on ? "var(--signal)" : "var(--surface)",
                  }}
                >
                  {p.shortLabel}
                  {partial && (
                    <span aria-hidden="true" className="ml-0.5 align-super text-[9px]">
                      *
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <ThemeToggle />
        </div>
      </div>

      {/* ---- composer: its own full-width line ---- */}
      {composerOpen && (
        <ScenarioComposerRow
          existingKeys={scenarios.map((s) => s.key)}
          onApply={(s) => {
            onApplyScenario(s);
            setAssumptionsOpen(true);
          }}
          onClose={closeComposer}
        />
      )}
    </div>
  );
}
