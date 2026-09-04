/**
 * Generated variance commentary — the middle layer of the three-layer
 * commentary model (authored → generated → computed).
 *
 * The model writes prose and nothing else. Every figure shown alongside a
 * generated narrative is computed here, from the dataset, before or after the
 * call. The model never calculates, estimates, or recalls a number, and it is
 * never asked for operational facts the dataset does not hold (logo counts,
 * utilisation, CAC). Those belong to authored commentary only.
 */
import {
  formatCurrency,
  fmtPctOr,
  varianceImpact,
  variancePctOfBudget,
  type VarianceLine,
} from "@/data/finance-data";

/** Single place the model is chosen. Call sites never name a model. */
export const AI_MODEL = "google/gemini-3.6-flash";
/** Historical alias — commentary and scenario generation share one model. */
export const COMMENTARY_MODEL = AI_MODEL;

export interface GeneratedCommentary {
  narrative: string;
  drivers: Array<{ label: string; value: string }>;
  /** Marks the record as machine-written wherever it is rendered. */
  generated: true;
}

/** Key that scopes generated commentary to the exact figures it describes. */
export function commentaryKey(monthId: string, scenarioKey: string, lineKey: string) {
  return `${monthId}|${scenarioKey}|${lineKey}`;
}

/** Drivers are derived from the dataset — never from the model. */
export function computedDrivers(line: VarianceLine): GeneratedCommentary["drivers"] {
  const impact = varianceImpact(line);
  return [
    { label: "Budget", value: formatCurrency(line.budget, { compact: true }) },
    { label: "Actual", value: formatCurrency(line.actual, { compact: true }) },
    {
      label: "Impact on op. income",
      value: `${impact >= 0 ? "+" : "−"}${formatCurrency(Math.abs(impact), { compact: true })}`,
    },
    { label: "Share of budgeted line", value: fmtPctOr(variancePctOfBudget(line), 1) },
  ];
}

/**
 * Validate model output before it reaches state. A narrative containing
 * numerals is rejected outright: the model was told the figures live in the
 * drivers table, so digits in the prose mean it restated or invented one.
 *
 * NOTE: the rule is deliberately strict — any digit at all. If it turns out to
 * fire often in practice, the narrower fix is to match currency and percentage
 * patterns (e.g. /[$€£]?\d/ and /\d\s?%/) rather than any digit.
 */
export function validateNarrative(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim().replace(/\s+/g, " ");
  if (text.length < 40 || text.length > 900) return null;
  if (/\d/.test(text)) return null;
  return text;
}

/** Error thrown the moment a forbidden character appears mid-stream. */
export class NarrativeRejected extends Error {
  constructor(message = "The model returned commentary we could not verify.") {
    super(message);
    this.name = "NarrativeRejected";
  }
}

export function isGeneratedCommentary(v: unknown): v is GeneratedCommentary {
  if (typeof v !== "object" || v === null) return false;
  const c = v as GeneratedCommentary;
  return (
    c.generated === true &&
    typeof c.narrative === "string" &&
    c.narrative.length > 0 &&
    Array.isArray(c.drivers) &&
    c.drivers.every((d) => typeof d?.label === "string" && typeof d?.value === "string")
  );
}

export interface CommentaryRequest {
  lineLabel: string;
  kind: "revenue" | "cost";
  monthLabel: string;
  scenarioLabel: string;
  budget: number;
  actual: number;
  impact: number;
  totalRevenue: number;
  operatingIncome: number;
  currency: string;
  locale: string;
}

/**
 * Streams prose from the app's own endpoint. `onDelta` receives text as it
 * arrives. Each chunk is validated as it lands, so a forbidden character
 * aborts the request immediately rather than after a finished paragraph is
 * thrown away.
 */
export async function streamCommentary(
  body: CommentaryRequest,
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  // Internal controller so an incremental rejection genuinely cancels the
  // upstream call instead of leaving the gateway request running.
  const controller = new AbortController();
  const relay = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", relay, { once: true });
  }
  try {
    const res = await fetch("/api/commentary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      throw new Error(
        res.status === 429
          ? "Rate limited — try again in a moment."
          : res.status === 402
            ? "AI credits exhausted for this workspace."
            : "Commentary service unavailable.",
      );
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      // Validate incrementally: the moment a digit appears, abort the upstream
      // call and stop. Nothing the user watched appear is destroyed after the
      // fact, because the stream never runs to completion on a bad narrative.
      if (/\d/.test(chunk)) {
        controller.abort();
        throw new NarrativeRejected();
      }
      text += chunk;
      onDelta(chunk);
    }
    const valid = validateNarrative(text);
    if (!valid) throw new NarrativeRejected();
    return valid;
  } finally {
    if (signal) signal.removeEventListener("abort", relay);
  }
}
