import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const COPY_PROMPT = `Replace the demo dataset in \`src/data/finance-data.ts\` with my real numbers, pasted below. Keep the existing types. Map my accounts onto the four revenue lines, three cost-of-revenue categories, and three operating expense categories rather than changing the shape of \`MonthRecord\`. Clear \`VARIANCE_COMMENTARY\`, since those narratives describe the demo company. Update \`BRAND\` with my company name, currency and locale. If anything in my data does not map cleanly, tell me rather than guessing. My data:`;

/**
 * Reading panel for someone who has decided to remix the template. Same
 * slide-out mechanics as the variance detail: focus moves in on open, is
 * trapped while open, Escape closes, focus returns to the trigger.
 */
export function RemixGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const returnRef = useRef<HTMLElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
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

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2200);
    return () => clearTimeout(t);
  }, [copied]);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(COPY_PROMPT);
      setCopied(true);
    } catch {
      // Clipboard access can be refused; the prompt stays selectable on screen.
      setCopied(false);
    }
  }

  /**
   * The control bar is a backdrop-blurred sticky element, which becomes the
   * containing block for `position: fixed` descendants. Portal to the body so
   * the slide-out covers the viewport the way the variance panel does.
   */
  if (!mounted) return null;

  return createPortal(
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-background/60 backdrop-blur-[2px] transition-opacity duration-300"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal={open}
        aria-label="Template instructions"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[520px] flex-col border-l border-hairline bg-surface shadow-2xl transition-transform duration-[420ms]"
        style={{
          transform: open ? "translateX(0)" : "translateX(100%)",
          transitionTimingFunction: "cubic-bezier(0.22,1,0.36,1)",
        }}
        aria-hidden={!open}
        {...(open ? {} : { inert: true })}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border/70 p-6">
          <div>
            <div className="eyebrow">Remixing this template</div>
            <h3 className="mt-1.5 text-xl font-semibold leading-tight text-foreground">
              Template instructions
            </h3>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close the data guide"
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

        <div className="flex-1 overflow-y-auto p-6 text-[13.5px] leading-relaxed text-foreground/85">
          <p>
            To see this dashboard with your own numbers, copy the text below, paste it into the
            Lovable chat, and add your spreadsheet.
          </p>

          <section className="mt-7">
            <h4 className="text-[15px] font-semibold text-foreground">
              The fastest path: hand your numbers to the agent
            </h4>
            <p className="mt-2">
              Paste your figures into Lovable chat and ask the agent to rewrite the data file. This
              works better than editing by hand because the fiddly part is mapping your chart of
              accounts onto this model — four revenue lines, three cost-of-revenue categories,
              three operating expense categories — and the agent does that mapping for you, keeping
              the existing types intact.
            </p>

            <div className="mt-4 rounded-md border border-hairline bg-surface-raised/60 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <span className="eyebrow">Prompt to copy</span>
                <button
                  type="button"
                  onClick={copyPrompt}
                  className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] font-medium text-ink-dim transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
                >
                  {copied ? "Copied" : "Copy prompt"}
                </button>
              </div>
              <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-dim">{COPY_PROMPT}</p>
              <p aria-live="polite" className="sr-only">
                {copied ? "Prompt copied to clipboard" : ""}
              </p>
            </div>
          </section>

          <section className="mt-7">
            <h4 className="text-[15px] font-semibold text-foreground">What the model needs</h4>
            <p className="mt-2">
              Around twelve monthly records. Each one carries revenue split four ways, cost of
              revenue split three ways, operating expense split three ways, headcount, closing cash,
              and a budget block for the same lines. Alongside that, a ledger of open receivables:
              customer, amount, days past due, and a risk flag.
            </p>
            <p className="mt-2">
              Supply everything monthly. Quarter and year-to-date views are derived, and they
              follow one rule: flows sum, stocks do not. Revenue, cost and operating expense add up
              across the months of a period, while closing cash and headcount take the value of the
              final month, because they are positions rather than flows. Ratios such as gross
              margin are computed from period totals rather than averaged. Set{" "}
              <span className="num">fiscalYearStartMonth</span> in <span className="num">BRAND</span>{" "}
              so quarters and the year to date line up with your fiscal calendar. Receivables have
              no date column, so the AR panel always shows the present-day position whatever period
              is selected.
            </p>
          </section>


          <section className="mt-7 pb-2">
            <h4 className="text-[15px] font-semibold text-foreground">A sample file</h4>
            <p className="mt-2">
              <a
                href="/sample-data.csv"
                download
                className="underline underline-offset-2 transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
                style={{ color: "var(--signal)" }}
              >
                sample-data.csv
              </a>{" "}
              shows what your spreadsheet should look like, with a few example rows. You can hand it
              to the chat alongside your own numbers.
            </p>
          </section>
        </div>
      </aside>
    </>,
    document.body,
  );
}
