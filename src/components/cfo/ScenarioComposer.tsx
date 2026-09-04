import { useEffect, useId, useRef, useState } from "react";

import {
  MULT_MAX,
  MULT_MIN,
  OPEX_KEYS,
  OPEX_LABELS,
  REVENUE_KEYS,
  REVENUE_LABELS,
  ScenarioRejected,
  inBounds,
  requestScenario,
  type GeneratedScenario,
} from "@/lib/scenario-from-prose";

const HINTS = [
  "S&M pullback of thirty percent, hosting renegotiation lands next quarter, services flat",
  "Usage expansion accelerates fifteen percent, R&D hiring freeze",
  "Marketplace revenue halves, G&A up ten percent",
];

const HINT_CHIPS: readonly { label: string; text: string }[] = [
  { label: "S&M pullback", text: HINTS[0] },
  { label: "Usage expansion", text: HINTS[1] },
  { label: "Marketplace halves", text: HINTS[2] },
];

/**
 * The collapsed affordance in the instrument bar. Open state is owned by the
 * bar so the expanded composer can take a full-width line of its own rather
 * than squeezing itself between the scenario presets and the period row.
 */
export function ScenarioComposerTrigger({
  open,
  onOpen,
  triggerRef,
}: {
  open: boolean;
  onOpen: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={triggerRef}
      type="button"
      aria-expanded={open}
      onClick={onOpen}
      className="flex min-h-11 shrink-0 items-center gap-2 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] sm:min-h-0"
      style={{
        borderColor: "var(--signal)",
        background: open
          ? "color-mix(in oklab, var(--signal) 18%, var(--surface))"
          : "color-mix(in oklab, var(--signal) 9%, var(--surface))",
        color: "var(--foreground)",
      }}
    >
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: "var(--signal)" }}
      />
      Model a scenario
    </button>
  );
}

/**
 * Prose → scenario, on its own line: a single wide field that reads as a
 * composer rather than a control, with example cases as one-tap chips beneath
 * it. The multiplier grid is deliberately not here — it lives in a popover so
 * it overlays the page instead of displacing the dashboard below it.
 */
export function ScenarioComposerRow({
  existingKeys,
  onApply,
  onClose,
}: {
  existingKeys: readonly string[];
  onApply: (s: GeneratedScenario) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const uid = useId();
  const hintId = `${uid}-hint`;

  // Opening moves focus into the field: the control is the affordance, the
  // field is where the work happens.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function generate() {
    const description = text.trim();
    if (description.length < 3 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const scenario = await requestScenario(description, existingKeys);
      onApply(scenario);
      setText("");
      onClose();
    } catch (err) {
      setError(err instanceof ScenarioRejected ? err.message : "Could not model that description.");
    } finally {
      setBusy(false);
    }
  }

  const canSend = !busy && text.trim().length >= 3;

  return (
    <div
      className="pb-3"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div
        className="rounded-xl border p-2 transition-colors focus-within:border-[var(--signal)]"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <label htmlFor={`${uid}-prose`} className="sr-only">
          Describe a planning case
        </label>
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            id={`${uid}-prose`}
            rows={1}
            value={text}
            placeholder="Describe a planning case in plain English…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void generate();
              }
            }}
            aria-describedby={hintId}
            className="max-h-32 min-h-[40px] w-full flex-1 resize-none bg-transparent px-2 py-2 text-[13px] leading-relaxed text-foreground outline-none placeholder:text-ink-faint"
          />
          <button
            type="button"
            onClick={() => void generate()}
            disabled={!canSend}
            className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-[12px] font-medium transition-opacity disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
            style={{ background: "var(--signal)", color: "var(--control-on-fg)" }}
          >
            {busy ? "Modelling…" : "Model it"}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scenario modelling"
            className="flex min-h-10 shrink-0 items-center rounded-lg border border-border px-2.5 text-[13px] leading-none text-ink-faint transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <p id={hintId} className="mr-1 text-[11px] leading-snug text-ink-faint">
          Becomes a selectable scenario. Try
        </p>
        {HINT_CHIPS.map((h) => (
          <button
            key={h.label}
            type="button"
            title={h.text}
            onClick={() => {
              setText(h.text);
              inputRef.current?.focus();
            }}
            className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] text-ink-dim transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            {h.label}
          </button>
        ))}
      </div>

      {error && (
        <p role="status" className="mt-2 text-[11px] leading-snug text-[var(--destructive)]">
          {error} The preset scenarios are unaffected.
        </p>
      )}
    </div>
  );
}

/**
 * The derived assumptions for the selected generated scenario, as a popover
 * over the layout. It is driven by the selection, never by a local copy, so
 * what is displayed is always what is applied.
 */
export function MultiplierPopover({
  scenario,
  onEdit,
  onClose,
}: {
  scenario: GeneratedScenario;
  onEdit: (s: GeneratedScenario) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    node?.querySelector<HTMLInputElement>("input")?.focus();

    const onDown = (e: MouseEvent) => {
      if (node && !node.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function edit(path: "revenue" | "opex" | "cogs", key: string, v: number) {
    const next: GeneratedScenario =
      path === "cogs"
        ? { ...scenario, cogsMult: v }
        : path === "revenue"
          ? { ...scenario, revenueMult: { ...scenario.revenueMult, [key]: v } }
          : { ...scenario, opexMult: { ...scenario.opexMult, [key]: v } };
    onEdit(next);
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Modelled assumptions for ${scenario.label}`}
      data-testid="multiplier-panel"
      className="absolute left-0 top-full z-50 mt-2 w-[min(94vw,420px)] overflow-hidden rounded-xl border border-hairline bg-card"
      style={{ boxShadow: "0 24px 48px -32px rgb(0 0 0 / 0.55)" }}
    >
      <div className="flex items-start justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <span className="eyebrow" style={{ color: "var(--signal)" }}>
            Modelled assumptions
          </span>
          <p className="mt-1 truncate text-[12px] font-medium text-foreground">{scenario.label}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close assumptions"
          className="-mr-1 shrink-0 rounded px-1.5 py-0.5 text-[13px] leading-none text-ink-faint hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <p className="px-4 pt-3 text-[11px] leading-relaxed text-ink-faint">
        Stated assumptions, not booked figures. Adjust any of them and the dashboard recomputes from
        your actuals.
      </p>

      <div className="max-h-[52vh] overflow-y-auto px-4 pb-4 pt-3">
        <MultGroup title="Revenue">
          {REVENUE_KEYS.map((k) => (
            <MultInput
              key={`${scenario.key}-rev-${k}`}
              label={REVENUE_LABELS[k]}
              value={scenario.revenueMult[k]}
              onCommit={(v) => edit("revenue", k, v)}
            />
          ))}
        </MultGroup>

        <MultGroup title="Cost of revenue">
          <MultInput
            key={`${scenario.key}-cogs`}
            label="Cost of revenue"
            value={scenario.cogsMult}
            onCommit={(v) => edit("cogs", "cogs", v)}
          />
        </MultGroup>

        <MultGroup title="Operating expense">
          {OPEX_KEYS.map((k) => (
            <MultInput
              key={`${scenario.key}-opex-${k}`}
              label={OPEX_LABELS[k]}
              value={scenario.opexMult[k]}
              onCommit={(v) => edit("opex", k, v)}
            />
          ))}
        </MultGroup>
      </div>
    </div>
  );
}

function MultGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-3 last:mb-0">
      <h3 className="eyebrow mb-1 text-ink-faint">{title}</h3>
      <div className="divide-y divide-hairline rounded-lg border border-hairline">{children}</div>
    </section>
  );
}

/** "1.15" reads as arithmetic; "+15%" reads as an assumption. */
function deltaLabel(v: number) {
  const pct = Math.round((v - 1) * 100);
  if (pct === 0) return "no change";
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`;
}

/**
 * Controlled, but committed on blur or Enter rather than on keystroke: a
 * half-typed "0.7" on the way to "0.75" is not an assumption anyone made, and
 * applying it would morph the whole dashboard mid-keystroke. Out-of-range
 * values are refused out loud, in the same terms we refuse the model's.
 */
function MultInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
}) {
  const id = `mult-${label.replace(/\W+/g, "-").toLowerCase()}`;
  const [text, setText] = useState(String(value));
  const [rejected, setRejected] = useState(false);

  // The applied value is the source of truth; if it changes elsewhere the
  // field follows it rather than keeping a stale local copy.
  useEffect(() => {
    setText(String(value));
    setRejected(false);
  }, [value]);

  function commit() {
    const v = Number(text);
    if (!inBounds(v)) {
      setRejected(true);
      return;
    }
    setRejected(false);
    const rounded = Math.round(v * 100) / 100;
    setText(String(rounded));
    if (rounded !== value) onCommit(rounded);
  }

  const changed = value !== 1;

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-3">
        <label htmlFor={id} className="min-w-0 flex-1 text-[12px] text-ink-dim">
          {label}
        </label>
        <span
          aria-hidden="true"
          className="num shrink-0 text-[11px]"
          style={{ color: changed ? "var(--signal)" : "var(--ink-faint)" }}
        >
          {deltaLabel(value)}
        </span>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={0.05}
          min={MULT_MIN}
          max={MULT_MAX}
          value={text}
          aria-invalid={rejected || undefined}
          aria-describedby={rejected ? `${id}-error` : undefined}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          className="num w-[64px] shrink-0 rounded-md border bg-surface px-2 py-1.5 text-right text-[12px] text-foreground [appearance:textfield] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          style={{ borderColor: rejected ? "var(--destructive)" : "var(--border)" }}
        />
      </div>
      {rejected && (
        <p
          id={`${id}-error`}
          role="status"
          className="mt-1 text-[10px] leading-snug text-[var(--destructive)]"
        >
          Outside the plausible planning range of {MULT_MIN}–{MULT_MAX}. Rejected rather than
          clamped — a silently corrected assumption is a wrong assumption.
        </p>
      )}
    </div>
  );
}
