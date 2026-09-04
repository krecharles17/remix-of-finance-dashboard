import { useEffect, useRef } from "react";
import {
  fmtPctOr,
  formatCurrency,
  varianceImpact,
  variancePctOfBudget,
  type VarianceLine,
} from "@/data/finance-data";


import type { GeneratedCommentary } from "@/lib/ai-commentary";

interface Props {
  line: VarianceLine | null;
  /** The period these figures cover, named plainly beside them. */
  periodLabel?: string;
  /** Set when the period is partial, so nobody reads it as a whole one. */
  incompleteNote?: string | null;
  onClose: () => void;
  /** Layer two: session-only, machine-written commentary for this line. */
  generated?: GeneratedCommentary;
  /** Prose currently streaming in for this line, before validation. */
  streaming?: string;
  generateError?: string;
  onGenerate?: () => void;
}

export function VariancePanel({
  line,
  periodLabel,
  incompleteNote,
  onClose,
  generated,
  streaming,
  generateError,
  onGenerate,
}: Props) {
  const open = line !== null;
  const impact = line ? varianceImpact(line) : 0;
  const favourable = impact >= 0;

  const panelRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const returnRef = useRef<HTMLElement | null>(null);

  /**
   * onClose arrives as an inline arrow from the route, so it changes identity
   * on every parent render. Keep it in a ref so the focus effect below depends
   * only on `open` and runs exactly once per open/close transition.
   */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Move focus in on open, trap it while open, restore it on close.
  useEffect(() => {
    if (!open) return;
    // Captured only on the transition into open, so it is the element that
    // opened the panel — never the close button we are about to focus.
    returnRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const root = panelRef.current;
      if (!root) return;
      const items = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      returnRef.current?.focus?.();
    };
  }, [open]);


  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-background/60 backdrop-blur-[2px] transition-opacity duration-300"
        style={{
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
        }}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal={open}
        aria-label={line ? `Variance detail for ${line.label}` : undefined}
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[440px] flex-col border-l border-hairline bg-surface shadow-2xl transition-transform duration-[420ms]"
        style={{
          transform: open ? "translateX(0)" : "translateX(100%)",
          transitionTimingFunction: "cubic-bezier(0.22,1,0.36,1)",
        }}
        aria-hidden={!open}
        {...(open ? {} : { inert: true })}
      >
        {line && (
          <>

            <header className="flex items-start justify-between gap-4 border-b border-border/70 p-6">
              <div>
                <div className="eyebrow">
                  Variance explained{periodLabel ? ` · ${periodLabel}` : ""}
                </div>
                <h3 className="mt-1.5 text-xl font-semibold leading-tight text-foreground">
                  {line.label}
                </h3>
                <div className="num mt-2 text-[11px] text-ink-faint">
                  {line.commentary?.owner ??
                    (generated ? "AI-generated · no owner" : "Owner not assigned")}
                </div>
              </div>
              <button
                ref={closeRef}
                onClick={onClose}
                aria-label="Close variance detail"
                className="-mr-1 -mt-1 rounded p-1.5 text-ink-faint transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
              >

                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <path
                    d="M3 3l9 9M12 3l-9 9"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { l: "Budget", v: formatCurrency(line.budget, { compact: true }), c: "var(--ink-dim)" },
                  { l: "Actual", v: formatCurrency(line.actual, { compact: true }), c: "var(--foreground)" },
                  {
                    l: favourable ? "Favourable" : "Unfavourable",
                    v: `${impact >= 0 ? "+" : "−"}${formatCurrency(Math.abs(impact), { compact: true })}`,
                    c: favourable ? "var(--mint)" : "var(--ember)",
                  },
                ].map((s) => (
                  <div
                    key={s.l}
                    className="rounded-md border border-border/70 bg-surface-raised/60 p-3"
                  >
                    <div className="eyebrow">{s.l}</div>
                    <div className="num mt-1.5 text-sm font-medium" style={{ color: s.c }}>
                      {s.v}
                    </div>
                  </div>
                ))}
              </div>

              <div className="num mt-3 text-[10.5px] text-ink-faint">
                {fmtPctOr(variancePctOfBudget(line), 1)} off budget on this line
                {periodLabel ? ` · ${periodLabel} totals` : ""}
              </div>

              {incompleteNote && (
                <p
                  className="mt-2 text-[11px] leading-relaxed"
                  style={{ color: "var(--ember)" }}
                >
                  {incompleteNote}
                </p>
              )}


              <div className="mt-6">
                <div className="eyebrow">Plain-English read</div>
                {line.commentary ? (
                  <p className="mt-2.5 text-[13.5px] leading-relaxed text-foreground/85">
                    {line.commentary.narrative}
                  </p>
                ) : (
                  <>
                    <p className="mt-2.5 text-[13.5px] leading-relaxed text-foreground/85">
                      {formatCurrency(Math.abs(impact), { compact: true })}{" "}
                      {favourable ? "favourable" : "unfavourable"} to budget (
                      {impact >= 0 ? "+" : "−"}
                      {fmtPctOr(variancePctOfBudget(line), 1)}) on{" "}
                      {line.label}.
                    </p>

                    {/* Layer two: generated prose, always visibly marked. */}
                    {generated || streaming !== undefined ? (
                      <div className="mt-4 rounded-md border border-hairline bg-surface-raised/60 p-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="eyebrow" style={{ color: "var(--signal)" }}>
                            AI-generated read
                          </span>
                          {streaming !== undefined && (
                            <span className="num text-[10px] text-ink-faint">writing…</span>
                          )}
                        </div>
                        {/*
                          Announce once, on completion. While the stream runs
                          the region is busy, so a screen reader hears that
                          commentary is being written rather than the first
                          half of a sentence re-read on every chunk.
                        */}
                        <p
                          aria-live="polite"
                          aria-busy={streaming !== undefined}
                          className="mt-2 text-[13px] leading-relaxed text-foreground/85"
                        >
                          {generated?.narrative ?? streaming}
                          {streaming !== undefined && (
                            <span
                              aria-hidden="true"
                              className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.15em]"
                              style={{ background: "var(--signal)", opacity: 0.8 }}
                            />
                          )}
                        </p>
                        {generated && (
                          <div className="mt-3 divide-y divide-border/60 border-t border-border/60">
                            {generated.drivers.map((d) => (
                              <div
                                key={d.label}
                                className="flex items-baseline justify-between gap-4 py-2"
                              >
                                <span className="text-[12px] text-ink-dim">{d.label}</span>
                                <span className="num text-[11.5px] text-foreground">
                                  {d.value}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="mt-2.5 text-[10.5px] leading-relaxed text-ink-faint">
                          Written by a model from the budget and actual above. Figures in
                          the table are computed from the dataset, not by the model.
                        </p>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-md border border-dashed border-hairline p-3.5">
                        {onGenerate && (
                          <button
                            onClick={onGenerate}
                            className="rounded border border-border bg-surface px-2.5 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
                          >
                            Expand this read with AI
                          </button>
                        )}
                        <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-faint">
                          No commentary authored for this line. Add your own in{" "}
                          <span className="num">VARIANCE_COMMENTARY</span>, or generate a
                          plain-English read from the figures above.
                        </p>
                        {generateError && (
                          <p
                            role="status"
                            className="mt-2 text-[11.5px] leading-relaxed"
                            style={{ color: "var(--ember)" }}
                          >
                            {generateError} The computed read above still stands.
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {line.commentary && (
                <>
                  <div className="mt-7">
                    <div className="eyebrow">Drivers</div>
                    <div className="mt-2.5 divide-y divide-border/60">
                      {line.commentary.drivers.map((d) => (
                        <div
                          key={d.label}
                          className="flex items-baseline justify-between gap-4 py-2.5"
                        >
                          <span className="text-[12.5px] text-ink-dim">{d.label}</span>
                          <span className="num text-[12px] text-foreground">{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-7 rounded-md border border-dashed border-hairline p-3.5">
                    <div className="eyebrow">Note</div>
                    <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-faint">
                      Commentary is editorial and hand-written for this demo dataset.
                      Variance math above derives from the data.
                    </p>
                  </div>
                </>
              )}

            </div>
          </>
        )}
      </aside>
    </>
  );
}
