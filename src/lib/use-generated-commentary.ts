import { useCallback, useRef, useState } from "react";

import { BRAND, varianceImpact, type VarianceLine } from "@/data/finance-data";
import {
  commentaryKey,
  computedDrivers,
  isGeneratedCommentary,
  streamCommentary,
  type GeneratedCommentary,
} from "@/lib/ai-commentary";

export interface CommentaryStore {
  /** Validated, finished commentary for the current session only. */
  get: (lineKey: string) => GeneratedCommentary | undefined;
  /** Prose arriving right now, before validation. */
  streaming: (lineKey: string) => string | undefined;
  error: (lineKey: string) => string | undefined;
  isBusy: boolean;
  generate: (line: VarianceLine) => Promise<void>;
  generateAll: (lines: VarianceLine[]) => Promise<void>;
  /** Progress of a whole-month run, null when none is in flight. */
  progress: { done: number; total: number } | null;
  /**
   * "generated" per line key, scoped to the current month and scenario.
   * Authored marks come from the dataset and are merged by the caller.
   */
  marks: Record<string, "generated">;
}

interface Context {
  monthId: string;
  monthLabel: string;
  scenarioKey: string;
  scenarioLabel: string;
  totalRevenue: number;
  operatingIncome: number;
}

/**
 * In-memory only, keyed by month + scenario + line. A reload clears it, which
 * is the honest signal: commentary describes one specific set of figures and
 * must never reattach to numbers it no longer describes.
 */
export function useGeneratedCommentary(ctx: Context): CommentaryStore {
  const [store, setStore] = useState<Record<string, GeneratedCommentary>>({});
  const [partial, setPartial] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const inFlight = useRef<Set<string>>(new Set());
  // Backed by state so `isBusy` is never stale when read during render.
  const [busyCount, setBusyCount] = useState(0);

  const k = useCallback(
    (lineKey: string) => commentaryKey(ctx.monthId, ctx.scenarioKey, lineKey),
    [ctx.monthId, ctx.scenarioKey],
  );

  const generate = useCallback(
    async (line: VarianceLine) => {
      const id = k(line.key);
      if (inFlight.current.has(id) || store[id]) return;
      inFlight.current.add(id);
      setBusyCount((n) => n + 1);
      setErrors((e) => ({ ...e, [id]: "" }));
      setPartial((p) => ({ ...p, [id]: "" }));
      try {
        const narrative = await streamCommentary(
          {
            lineLabel: line.label,
            kind: line.kind,
            monthLabel: ctx.monthLabel,
            scenarioLabel: ctx.scenarioLabel,
            budget: line.budget,
            actual: line.actual,
            impact: varianceImpact(line),
            totalRevenue: ctx.totalRevenue,
            operatingIncome: ctx.operatingIncome,
            currency: BRAND.currency,
            locale: BRAND.locale,
          },
          (chunk) => setPartial((p) => ({ ...p, [id]: (p[id] ?? "") + chunk })),
        );
        const record: GeneratedCommentary = {
          narrative,
          drivers: computedDrivers(line),
          generated: true,
        };
        if (!isGeneratedCommentary(record)) {
          throw new Error("Generated commentary failed validation.");
        }
        setStore((s) => ({ ...s, [id]: record }));
        setPartial((p) => {
          const next = { ...p };
          delete next[id];
          return next;
        });
      } catch (err) {
        setErrors((e) => ({
          ...e,
          [id]: err instanceof Error ? err.message : "Commentary unavailable.",
        }));
      } finally {
        // Partial prose is left in place on failure: the stream aborts at the
        // first offending character, so what the user watched appear is real
        // and is not deleted out from under them.
        inFlight.current.delete(id);
        setBusyCount((n) => Math.max(0, n - 1));
      }
    },
    [ctx, k, store],
  );

  const generateAll = useCallback(
    async (lines: VarianceLine[]) => {
      const targets = lines.filter((l) => !l.commentary && !store[k(l.key)]);
      if (targets.length === 0) return;
      setProgress({ done: 0, total: targets.length });
      for (let i = 0; i < targets.length; i++) {
        await generate(targets[i]);
        setProgress({ done: i + 1, total: targets.length });
      }
      setProgress(null);
    },
    [generate, k, store],
  );

  // Scoped to the current month and scenario: a line generated in July must
  // never show as generated in June.
  const marks: Record<string, "generated"> = {};
  const prefix = `${ctx.monthId}|${ctx.scenarioKey}|`;
  for (const key of Object.keys(store)) {
    if (key.startsWith(prefix)) marks[key.slice(prefix.length)] = "generated";
  }

  return {
    get: (lineKey) => store[k(lineKey)],
    streaming: (lineKey) => partial[k(lineKey)],
    error: (lineKey) => errors[k(lineKey)] || undefined,
    isBusy: progress !== null || busyCount > 0,
    generate,
    generateAll,
    progress,
    marks,
  };
}
