import { useMemo, useState } from "react";
import {
  AR_BUCKETS,
  AR_TOTAL,
  INVOICES,
  formatCurrency,
  type Invoice,
  type RiskFlag,
  safeDiv,
} from "@/data/finance-data";

const RISK_META: Record<RiskFlag, { label: string; color: string }> = {
  low: { label: "Low", color: "var(--mint)" },
  watch: { label: "Watch", color: "var(--signal)" },
  high: { label: "High", color: "var(--ember)" },
  critical: { label: "Critical", color: "var(--destructive)" },
};

type SortKey = "amount" | "daysPastDue" | "customer";

export function ArAgingTable() {
  const [sort, setSort] = useState<SortKey>("daysPastDue");
  const [onlyRisk, setOnlyRisk] = useState(false);

  const rows = useMemo(() => {
    let r: Invoice[] = [...INVOICES];
    if (onlyRisk) r = r.filter((i) => i.risk === "high" || i.risk === "critical");
    r.sort((a, b) => {
      if (sort === "customer") return a.customer.localeCompare(b.customer);
      return (b[sort] as number) - (a[sort] as number);
    });
    return r;
  }, [sort, onlyRisk]);

  return (
    <div>
      {/* aging distribution rail */}
      <div className="flex gap-px overflow-hidden rounded-sm">
        {AR_BUCKETS.map((b, i) => (
          <div
            key={b.bucket}
            className="group relative h-1.5"
            style={{
              width: `${(safeDiv(b.amount, AR_TOTAL) ?? 0) * 100}%`,
              background: `color-mix(in oklab, ${
                i <= 1 ? "var(--signal)" : i === 2 ? "var(--ember-soft)" : "var(--destructive)"
              } ${90 - i * 6}%, transparent)`,
            }}
            title={`${b.bucket}: ${formatCurrency(b.amount)}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
        {AR_BUCKETS.map((b) => (
          <div key={b.bucket} className="flex items-baseline gap-1.5">
            <span className="num text-[10px] text-ink-faint">{b.bucket}</span>
            <span className="num text-[10.5px] text-ink-dim">
              {formatCurrency(b.amount, { compact: true })}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          aria-pressed={onlyRisk}
          onClick={() => setOnlyRisk((v) => !v)}
          className="min-h-11 rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] sm:min-h-0"
          style={{
            borderColor: onlyRisk ? "var(--signal)" : "var(--border)",
            color: onlyRisk ? "var(--signal)" : "var(--ink-faint)",
            background: onlyRisk
              ? "color-mix(in oklab, var(--signal) 12%, transparent)"
              : "transparent",
          }}
        >
          At-risk only
        </button>
        <div role="group" aria-label="Sort receivables" className="flex items-center gap-1">
          <span className="eyebrow" aria-hidden>Sort</span>
          {(
            [
              ["daysPastDue", "Age"],
              ["amount", "Value"],
              ["customer", "A–Z"],
            ] as Array<[SortKey, string]>
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              aria-pressed={sort === k}
              onClick={() => setSort(k)}
              className="min-h-11 rounded px-1.5 py-0.5 text-[12px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] sm:min-h-0"
              style={{ color: sort === k ? "var(--signal)" : "var(--ink-faint)" }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 max-h-[430px] overflow-y-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-hairline">
              {["Customer", "Bucket", "Days", "Amount", "Risk"].map((h, i) => (
                <th
                  key={h}
                  scope="col"
                  className="eyebrow whitespace-nowrap pb-2 pl-3 pt-1 font-medium first:pl-0"
                  style={{ textAlign: i >= 2 && i <= 3 ? "right" : "left" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((inv) => {
              const meta = RISK_META[inv.risk];
              return (
                <tr
                  key={inv.id}
                  className="group border-b border-border/40 transition-colors last:border-0 hover:bg-secondary/40"
                >
                  <th scope="row" className="py-2 pr-3 text-left align-top font-normal">
                    <div className="text-[12.5px] leading-tight text-foreground">
                      {inv.customer}
                    </div>
                    <div className="num text-[9.5px] text-ink-faint">
                      {inv.id} · {inv.segment}
                    </div>
                    <div className="max-h-0 overflow-hidden text-[10.5px] leading-snug text-ink-faint transition-all duration-300 group-hover:max-h-8 group-hover:pt-1">
                      {inv.note}
                    </div>
                  </th>
                  <td className="num whitespace-nowrap py-2 pr-3 align-top text-[11px] text-ink-dim">
                    {inv.bucket}
                  </td>
                  <td className="num py-2 pr-3 text-right align-top text-[11px] text-ink-dim">
                    {inv.daysPastDue > 0 ? inv.daysPastDue : "—"}
                  </td>
                  <td className="num py-2 pr-3 text-right align-top text-[12px] text-foreground">
                    {formatCurrency(inv.amount, { compact: true })}
                  </td>
                  <td className="py-2 align-top">
                    <span
                      className="num inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider"
                      style={{
                        color: meta.color,
                        background: `color-mix(in oklab, ${meta.color} 12%, var(--surface))`,
                        border: `1px solid color-mix(in oklab, ${meta.color} 32%, transparent)`,
                      }}
                    >
                      <span
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: 999,
                          background: meta.color,
                          display: "inline-block",
                        }}
                      />
                      {meta.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
