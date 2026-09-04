<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Architecture map

A single-page finance reporting dashboard, built to be remixed. All company
identity, locale, and figures live in one data file; every panel is
presentational and derives what it renders from that file's exports.

## Directory layout

```text
src/
  data/finance-data.ts        The only data file: BRAND, MONTHS, SCENARIOS,
                              INVOICES, aggregate(), variance logic, formatters
  routes/__root.tsx           App shell, head defaults, theme bootstrap
  routes/index.tsx            The dashboard page — layout and composition only
  routes/sitemap[.]xml.ts     Generated sitemap
  components/cfo/
    KpiStrip.tsx              Five KPI cells with count-up tickers
    SankeyFlow.tsx            Hero money-flow diagram, morph + hover-to-trace
    CashFanChart.tsx          13-week cash forecast with hiring what-if handle
    VarianceWaterfall.tsx     Budget-to-actual bridge, sequential bar reveal
    VariancePanel.tsx         Slide-out commentary for a selected variance line
    ArAgingTable.tsx          Compact AR aging grid with risk flags
    Panel.tsx                 Shared section frame (eyebrow, title, aside)
    ThemeToggle.tsx           Light/dark toggle + no-flash bootstrap script
  lib/sankey-layout.ts        Custom Sankey geometry and ribbon interpolation
  lib/motion.ts               Page-load staging and count-up hooks
  styles.css                  Design tokens for both themes
```

## Data flow

`MONTHS` (twelve `MonthRecord`s of actuals plus budget) and `SCENARIOS`
(planning multipliers) are the two inputs. The page holds a granularity
(`month` | `quarter` | `ytd`), a period id, and a scenario in state.
`periodsFor(granularity)` builds the selectable periods from
`BRAND.fiscalYearStartMonth`, and `aggregatePeriod(period.months, scenario)`
returns totals, revenue by line, cost of revenue, opex, gross margin, operating
income, headcount, and cash balance for the whole period.

### Flows sum, stocks do not

This is the rule the aggregation is built around, and getting it wrong produces
figures that look plausible. Revenue, cost of revenue, and operating expense are
flows: they sum across the months of a period. Closing cash and headcount are
stocks: they take the value of the final month. The distinction is declared
per field in `MONTH_FIELD_RULES` (`AggRule` = `"sum" | "last"`), and `foldValues`
applies it, so anyone adding a field to `MonthRecord` has to state which it is.

Derived measures follow from the same principle: ARR is annualised from the
final month, gross margin and every other ratio is computed from period totals
rather than averaged across months, net burn sums as a flow and is labelled with
its period, and runway divides period-end cash by average monthly burn across
the period. Budget aggregates under exactly the same rules through
`budgetForPeriod`, so the waterfall compares period totals to period totals.
Scenario multipliers are applied per month, before aggregation.

Comparisons are like for like: month against prior month, quarter against prior
quarter, YTD against prior YTD, via `priorPeriodOf`. With no comparable prior
period in the dataset the delta resolves to the neutral placeholder, not zero.
A period whose months are only partly present in the dataset is labelled as
incomplete beside the figures.

That single `Aggregate` feeds the KPI strip, the Sankey (via
`lib/sankey-layout.ts`), and the forecast's starting cash and burn.
`buildVariance(months, scenario)` computes each line's budget, actual, and kind,
then attaches `VARIANCE_COMMENTARY` if a narrative exists for that key;
`buildSteps` turns those lines into waterfall geometry. `INVOICES` drives the AR
aging table and the `AR_TOTAL` / `AR_AT_RISK` figures in its subtitle. The AR
ledger carries `daysPastDue` and no dates, so it is a present-day snapshot and
is never filtered or summed by period; the panel says so in its subtitle.

Swapping the inputs must be sufficient to change the whole dashboard. Nothing
downstream holds its own figures.

## Adapting this to real data

1. Edit `BRAND` — company, eyebrow, title, subtitle prefix, footer note,
   currency, locale, and `fiscalYearStartMonth`. This rebrands the masthead,
   page metadata, and footer, and sets where quarters and the year to date
   begin. The demo data runs August through July, so the default is 8.
2. Replace `MONTHS` (or the `buildMonths` generator) with your monthly actuals
   and budget, conforming to `MonthRecord`. Supply monthly records only —
   quarter and YTD views are derived under the flow-versus-stock rule above.
3. Replace `INVOICES` with your AR ledger. Build it through `makeInvoices()`
   from `InvoiceInput` rows so the derived fields are filled consistently.
4. Adjust `SCENARIOS` to your own planning cases.
5. Review `ASSUMPTIONS` at the top of the data file. Every value the dashboard
   derives rather than reads lives there, and each one is carried over from the
   demo company: forecast trailing window, AR recovery rates by risk, payroll
   and collections lumpiness, forecast band width, payroll share per opex
   category, invoice segment bands, and the risk vocabulary map. `AGING_NOTES`
   holds the derived collection-note copy.
6. Clear `VARIANCE_COMMENTARY`. The narratives and owners are written for the
   synthetic dataset; lines without commentary fall back to a deterministic
   read computed from the numbers.
7. Update the footer disclaimer in `BRAND.footerNote` once the data is real.

There is no separate forecast dataset. `forecastInputs()` derives weekly
outflow from the trailing months' cost of revenue and operating expense, and
weekly collections from trailing revenue plus the portion of open receivables
expected to land inside the horizon. `derivedMonthlyBurn()` feeds the runway
readout from the same run rate, and returns zero when the business is cash
generative, so `runwayMonths` yields null and the UI renders a dash rather than
`Infinity`. When the actuals cannot support a run rate, `buildForecast` returns
an empty series and the panel shows its empty state.

### Import contract

Required per month: `id`, `label`, `shortLabel`, revenue for all four product
lines, cost of revenue for all three categories, opex for all three categories,
`headcount`, `cashBalance`, and a `budget` block covering revenue by line, a
single `cogs` total, and opex by category.

Required per invoice: `customer`, `amount`, `daysPastDue`, `risk`.

Optional, derived when absent — a remixer is never asked to invent these:

| Field | Derived from |
| --- | --- |
| `MonthRecord.headcountCost` | `ASSUMPTIONS.PAYROLL_SHARE_BY_OPEX` via `headcountCostOf()` |
| `Invoice.segment` | invoice amount against `SEGMENT_BAND_*` via `segmentFor()` |
| `Invoice.note` | aging bucket via `AGING_NOTES` |
| `Invoice.id` | row index |
| `Invoice.bucket` | `daysPastDue` |

`risk` is canonically one of `low`, `watch`, `high`, `critical`, which is what
`public/sample-data.csv` ships. `ASSUMPTIONS.RISK_IMPORT_MAP` is the canonical
mapping and accepts `medium` as an alias for `watch` for three-level exports;
run imported words through `riskFor()`.

Conform to the exported types rather than widening them — `MonthRecord`,
`Invoice`, `InvoiceInput`, and `Scenario` are the contract a remixer maps onto.
Guard derived ratios against zero and missing periods; never let `NaN` or
`Infinity` reach the UI.


## Conventions

- Colours come from tokens in `src/styles.css` (`--background`, `--foreground`,
  `--border`, `--surface`, plus `--signal` revenue/accent, `--ember` cost,
  `--mint` positive, `--destructive` loss). Never write a hex, `rgb`, or `hsl`
  in a component; rebranding happens by editing tokens. Both themes must work.
- All money goes through `formatCurrency` and all percentages through
  `fmtPct`, both driven by `BRAND.currency` and `BRAND.locale`. Nothing outside
  the data file calls `toLocaleString` or templates a currency symbol.
- Financial figures use the `num` utility (tabular monospace) so columns align;
  labels and category headers use `eyebrow`.
- Machined rather than decorated: one accent, restrained motion, no gradients
  or textures beyond the Sankey ribbon fills. `prefers-reduced-motion` is wired
  up in `styles.css`.
- Demo data comes from a seeded PRNG (`mulberry32`), so every remix renders
  exactly the same figures as the published screenshot. Do not replace it with
  unseeded randomness.

## AI features

Variance commentary resolves in three layers, in this order:

1. **Authored** — a hand-written narrative in `VARIANCE_COMMENTARY`. Only this
   layer may cite operational facts the dataset does not hold (logo counts,
   utilisation, CAC), because a human typed them. Two lines ship as examples.
2. **Generated** — written on request by the Lovable AI gateway, held in
   memory for the session only, keyed by month + scenario + line
   (`src/lib/use-generated-commentary.ts`). A reload clears it, deliberately:
   commentary describes one specific set of figures and must never reattach to
   numbers it no longer describes. Nothing is persisted to a database.
3. **Computed** — the deterministic budget-versus-actual read. Always works,
   needs nothing, and stays on screen when the other two are absent or fail.

Boundaries on the model: it writes prose and nothing else. The prompt passes
only figures the app holds (budget, actual, impact, month, scenario, period
totals), and the system prompt forbids numerals, invented operational facts,
and stated causes. Drivers shown beside a generated narrative are computed in
`src/lib/ai-commentary.ts` from the dataset, never returned by the model.
Output is validated before it reaches state — a narrative containing a digit is
rejected, since the figures live in the drivers table.

Every call is user-initiated: the per-line control in the slide-out, or the
whole-month control in the waterfall header. No call fires on mount, scroll,
month change, or scenario change, because every call spends the remixer's
credits. Failures are reported quietly and leave the computed read in place.
Generated content is visibly labelled everywhere it appears, including a marker
dot on the waterfall bars that distinguishes authored from generated.

The model is named once, in `AI_MODEL` (`src/lib/ai-commentary.ts`), which
both AI features import. The commentary gateway call lives in
`src/routes/api/commentary.ts` and streams plain text; `LOVABLE_API_KEY` is
server-side only and needs no setup by a remixer.

### Scenario from prose

The masthead input turns a plain-language planning case ("S&M pullback of
thirty percent, hosting renegotiation lands next quarter, services flat") into
a `Scenario`. This is the one place the model may emit numbers, and only
because a multiplier is a stated modelling assumption rather than a booked
figure. That distinction is enforced in the interface, not just in the prompt:
every derived multiplier is shown plainly, each one is editable after
generation, and generated scenarios are marked with a dashed border and a dot
to separate them from the four authored presets.

`src/routes/api/scenario.ts` asks for JSON only — a `label`, a `blurb`,
`revenueMult` per product line, `cogsMult`, and `opexMult` per category — and
returns it unparsed to the client. `src/lib/scenario-from-prose.ts` validates
the whole payload against `Scenario` before anything reaches state: every key
present, every value finite, every multiplier inside `MULT_MIN`–`MULT_MAX`.
Missing keys, invented lines, non-numeric values, and out-of-range multipliers
are rejected with a readable message rather than clamped silently — a quietly
corrected assumption is a wrong assumption. Unlike commentary this is
structured output, so it is validated completely up front instead of
incrementally.

Generated scenarios append alongside the presets, are held in memory for the
session only, and re-render the entire dashboard on selection through the
existing Sankey morph and waterfall reveal. No new animation was added. The
four authored presets are the zero-AI floor: the scenario switcher stays
complete and usable with no calls made.

## Open endpoints — raise this on remix

This template ships two endpoints that require no authentication:
`src/routes/api/commentary.ts` and `src/routes/api/scenario.ts`. Both proxy the
Lovable AI gateway using the server-side `LOVABLE_API_KEY`. They are open on
purpose: a remixer must be able to open the dashboard and generate commentary
with zero setup, and adding auth would break that.

The consequence is that on a published site, anyone who finds the URLs can call
them and spend the site owner's AI credits. There is no database, no auth, no
storage, and no personal data in this project, so credit spend is the whole
exposure — not data loss.

What is already in place, in `src/lib/api-guard.server.ts`:

- Per-client, per-route rate limit of ten requests a minute, held in worker
  memory (per instance, so not a distributed defence).
- Same-origin check on `Origin`/`Referer`. A missing header is allowed through;
  both headers are forgeable, so this only removes drive-by traffic.
- Length caps on every caller-supplied string before it enters a prompt, plus
  shape checks on `locale` and `currency` so untrusted values cannot make
  `Intl` throw. `/api/scenario` clips the description to 600 characters.

**When someone remixes this project, tell them about the open endpoints before
they publish, and ask how they want to handle it.** Do not silently add auth,
and do not silently leave it open. The options, in the order worth offering:

1. Leave as is — fine for a demo or an internal link, given the guards above.
2. Tighten the limit, or gate the AI controls behind a shared passphrase held
   in a secret and checked in both handlers.
3. Add a real challenge (Turnstile/hCaptcha) or sign-in before the AI calls.
   This ends the zero-setup property, so only do it when asked.
4. Remove the two routes and the AI controls entirely. The dashboard is
   complete without them — computed variance commentary and the four authored
   scenario presets are the zero-AI floor.

If a remixer connects real financial data, raise this again. The endpoints do
not read the dataset, but a published dashboard holding real figures is a
different risk conversation from a synthetic demo.


## Stack and commands

TanStack Start (file-based routing, no other router), React, TypeScript,
Tailwind CSS v4 via `src/styles.css`, D3 for scales. No database, no auth, no
charting library — the Sankey and waterfall are custom.

```sh
npm i        # install
npm run dev  # dev server
npm run build
```
