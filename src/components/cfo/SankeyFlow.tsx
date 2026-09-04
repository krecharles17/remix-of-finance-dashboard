import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildFlowGraph,
  centrePath,
  collapse,
  computeLayout,
  interpolate,
  nodesOnPath,
  ribbonPath,
  tracePath,
  type LinkSnap,
  type Snapshot,
  type Tone,
} from "@/lib/sankey-layout";
import {
  fmtPctOr,
  formatCurrency,
  safeDiv,
  type Aggregate,
} from "@/data/finance-data";
import { useMeasure } from "@/lib/motion";

const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const TONE_FILL: Record<Tone, string> = {
  revenue: "url(#g-revenue)",
  gross: "url(#g-gross)",
  cost: "url(#g-cost)",
  profit: "url(#g-profit)",
  loss: "url(#g-loss)",
};

const TONE_STROKE: Record<Tone, string> = {
  revenue: "var(--signal)",
  gross: "var(--signal)",
  cost: "var(--ember)",
  profit: "var(--mint)",
  loss: "var(--destructive)",
};

interface Props {
  agg: Aggregate;
  /** Changing this key re-runs the ribbon resize animation. */
  stateKey: string;
  /** Gate the first reveal on the page-load sequence. */
  active: boolean;
  height?: number;
}

export function SankeyFlow({ agg, stateKey, active, height = 540 }: Props) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [frame, setFrame] = useState<Snapshot | null>(null);
  const frameRef = useRef<Snapshot | null>(null);
  const rafRef = useRef(0);

  /**
   * The travelling dash is a reveal cue, not a live-feed cue: it runs while a
   * morph settles, then parks. Only the hovered/traced path keeps moving.
   */
  const [restingDash, setRestingDash] = useState(true);
  const [hoverLink, setHoverLink] = useState<string | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  /** Keyboard equivalent of hover — drives the same trace and tooltip. */
  const [focusKind, setFocusKind] = useState<"link" | "node" | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  /**
   * Below MIN_DIAGRAM_W the diagram is drawn at its minimum width inside a
   * horizontal scroller rather than being squeezed. Left-to-right motion is
   * the whole point of a Sankey, so panning it preserves the read where
   * stacking labels above nodes would break the flow into a list.
   */
  const MIN_DIAGRAM_W = 700;
  const scrollable = width > 0 && width < MIN_DIAGRAM_W;
  const svgW = width > 0 ? Math.max(width, MIN_DIAGRAM_W) : 0;

  const compact = svgW > 0 && svgW < 860;
  const padL = compact ? 118 : 196;
  const padR = compact ? 116 : 188;
  const innerW = Math.max(220, svgW - padL - padR);
  const innerH = height - 24;

  const graph = useMemo(() => buildFlowGraph(agg), [agg]);

  useEffect(() => {
    if (!active || svgW <= 0) return;
    const target = computeLayout(graph, innerW, innerH, compact ? 9 : 12, compact ? 12 : 18);
    const first = !frameRef.current;
    const from = frameRef.current ?? collapse(target);
    const duration = first ? 1150 : 760;
    let start = 0;

    const tick = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / duration);
      const f = interpolate(from, target, easeInOut(t));
      frameRef.current = f;
      setFrame(f);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else {
        frameRef.current = target;
        setFrame(target);
      }
    };

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    // Dash runs through the morph, then parks ~6s after it settles.
    setRestingDash(true);
    const park = setTimeout(() => setRestingDash(false), duration + 6000);
    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(park);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateKey, innerW, innerH, active, compact]);

  // ---- highlight sets ----
  const activeLink = hoverLink ?? (focusKind === "link" ? focusKey : null);
  const activeNode = hoverNode ?? (focusKind === "node" ? focusKey : null);

  const { litLinks, litNodes, focusLink } = useMemo(() => {
    if (!frame) return { litLinks: null as Set<string> | null, litNodes: null as Set<string> | null, focusLink: null as LinkSnap | null };
    const tracedLink = activeLink;
    const tracedNode = activeNode;
    if (tracedLink && frame.links[tracedLink]) {
      const l = tracePath(frame, tracedLink);
      return { litLinks: l, litNodes: nodesOnPath(frame, l), focusLink: frame.links[tracedLink] };
    }
    if (tracedNode && frame.nodes[tracedNode]) {
      const keys = new Set<string>();
      for (const k of frame.order) {
        const link = frame.links[k];
        if (link.source === tracedNode || link.target === tracedNode) {
          for (const t of tracePath(frame, k)) keys.add(t);
        }
      }
      return { litLinks: keys, litNodes: nodesOnPath(frame, keys), focusLink: null };
    }
    return { litLinks: null, litNodes: null, focusLink: null };
  }, [frame, activeLink, activeNode]);

  const dimmed = litLinks !== null;

  const ariaSummary = useMemo(() => {
    const income = agg.operatingIncome;
    return [
      `Money flow for the period.`,
      `Total revenue in ${formatCurrency(agg.totalRevenue)}.`,
      `Cost of revenue out ${formatCurrency(agg.totalCogs)}, leaving gross profit ${formatCurrency(agg.grossProfit)}.`,
      `Operating expense out ${formatCurrency(agg.totalOpex)}.`,
      income >= 0
        ? `Operating income ${formatCurrency(income)}.`
        : `Operating loss ${formatCurrency(Math.abs(income))}, funded from cash reserves.`,
    ].join(" ");
  }, [agg]);

  const clearFocus = () => {
    setFocusKind(null);
    setFocusKey(null);
  };

  /**
   * KEYBOARD MODEL — the diagram is a single tab stop with a roving cursor.
   *
   * The cursor sits on either a node or a ribbon, and the arrow keys follow
   * the flow rather than DOM order:
   *   ← / →  step upstream / downstream — node to the ribbon leaving or
   *          entering it, ribbon to the node at its other end.
   *   ↑ / ↓  move between siblings at the same position in the flow — nodes
   *          at the same depth, or ribbons sharing the same source node.
   *   Esc    releases the cursor and returns to normal page tab order.
   * The trace highlight and tooltip follow the cursor exactly as they follow
   * the pointer on hover.
   */
  const byY = (a: number, b: number) => a - b;

  const moveCursor = (key: string) => {
    if (!frame) return false;
    const cur =
      focusKind && focusKey ? { kind: focusKind, key: focusKey } : null;

    const nodesAtDepth = (depth: number) =>
      frame.nodeOrder
        .filter((id) => frame.nodes[id].depth === depth)
        .sort((a, b) => byY(frame.nodes[a].y0, frame.nodes[b].y0));
    const linksFrom = (id: string) =>
      frame.order
        .filter((k) => frame.links[k].source === id)
        .sort((a, b) => byY(frame.links[a].sy, frame.links[b].sy));
    const linksInto = (id: string) =>
      frame.order
        .filter((k) => frame.links[k].target === id)
        .sort((a, b) => byY(frame.links[a].ty, frame.links[b].ty));

    const set = (kind: "link" | "node", k: string) => {
      setFocusKind(kind);
      setFocusKey(k);
      const x =
        kind === "link"
          ? padL + (frame.links[k].sx + frame.links[k].tx) / 2
          : padL + frame.nodes[k].x0;
      if (kind === "link") {
        const l = frame.links[k];
        setPointer({ x, y: 12 + (l.sy + l.ty) / 2 });
      }
      // Keep the cursor in view when the diagram is a horizontal scroller.
      const el = ref.current;
      if (el && el.scrollWidth > el.clientWidth) {
        el.scrollTo({ left: Math.max(0, x - el.clientWidth / 2), behavior: "smooth" });
      }
      return true;
    };

    // No cursor yet: start at the first source node.
    if (!cur) {
      const first = nodesAtDepth(0)[0] ?? frame.nodeOrder[0];
      return first ? set("node", first) : false;
    }

    const step = (list: string[], current: string, delta: number) => {
      const i = list.indexOf(current);
      if (i < 0 || list.length === 0) return list[0];
      return list[(i + delta + list.length) % list.length];
    };

    if (cur.kind === "node") {
      const n = frame.nodes[cur.key];
      if (!n) return false;
      if (key === "ArrowRight") {
        const out = linksFrom(cur.key)[0];
        return out ? set("link", out) : false;
      }
      if (key === "ArrowLeft") {
        const into = linksInto(cur.key)[0];
        return into ? set("link", into) : false;
      }
      const peers = nodesAtDepth(n.depth);
      return set("node", step(peers, cur.key, key === "ArrowDown" ? 1 : -1));
    }

    const l = frame.links[cur.key];
    if (!l) return false;
    if (key === "ArrowRight") return set("node", l.target);
    if (key === "ArrowLeft") return set("node", l.source);
    // Sibling ribbons: those leaving the same source, else entering the same target.
    let peers = linksFrom(l.source);
    if (peers.length < 2) peers = linksInto(l.target);
    return set("link", step(peers, cur.key, key === "ArrowDown" ? 1 : -1));
  };

  const activeDescId =
    focusKind && focusKey
      ? focusKind === "link"
        ? `sk-link-${focusKey}`
        : `sk-node-${focusKey}`
      : undefined;

  return (
    <div
      ref={ref}
      className={`relative select-none rounded-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] ${scrollable ? "overflow-x-auto overflow-y-hidden" : ""}`}
      style={{ height }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setPointer({ x: e.clientX - r.left + e.currentTarget.scrollLeft, y: e.clientY - r.top });
      }}
      onPointerLeave={() => {
        setHoverLink(null);
        setHoverNode(null);
      }}
      tabIndex={0}
      role="application"
      aria-roledescription="Money flow diagram"
      aria-label={`${ariaSummary} Arrow left and right step upstream and downstream along the flow; arrow up and down move between items at the same point in the flow; Escape leaves the diagram.`}
      aria-activedescendant={activeDescId}
      onFocus={(e) => {
        if (e.target === e.currentTarget && !focusKey) moveCursor("init");
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) clearFocus();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          clearFocus();
          setHoverLink(null);
          setHoverNode(null);
          (e.currentTarget as HTMLElement).blur();
          return;
        }
        if (
          e.key === "ArrowLeft" ||
          e.key === "ArrowRight" ||
          e.key === "ArrowUp" ||
          e.key === "ArrowDown"
        ) {
          e.preventDefault();
          moveCursor(e.key);
        }
      }}
    >
      <p className="sr-only">
        Interactive money flow diagram. Use the left and right arrow keys to step
        upstream and downstream along the flow, the up and down arrow keys to move
        between items at the same point in the flow, and Escape to leave the diagram.
      </p>
      {svgW > 0 && frame && (
        <svg
          width={svgW}
          height={height}
          /* overflow-visible keeps focus rings and end labels from clipping
             at the extreme left and right of the diagram. */
          className="block overflow-visible"
          focusable="false"
        >

          <defs>
            <linearGradient id="g-revenue" x1="0" x2="1">
              <stop offset="0%" stopColor="var(--signal-deep)" />
              <stop offset="100%" stopColor="var(--signal)" />
            </linearGradient>
            <linearGradient id="g-gross" x1="0" x2="1">
              <stop offset="0%" stopColor="var(--signal)" />
              <stop offset="100%" stopColor="var(--signal-soft)" />
            </linearGradient>
            <linearGradient id="g-cost" x1="0" x2="1">
              <stop offset="0%" stopColor="var(--cost-origin)" />
              <stop offset="100%" stopColor="var(--ember-soft)" />
            </linearGradient>
            <linearGradient id="g-profit" x1="0" x2="1">
              <stop offset="0%" stopColor="var(--signal)" />
              <stop offset="100%" stopColor="var(--mint)" />
            </linearGradient>
            <linearGradient id="g-loss" x1="0" x2="1">
              <stop offset="0%" stopColor="var(--ember)" />
              <stop offset="100%" stopColor="var(--destructive)" />
            </linearGradient>
          </defs>

          <g transform={`translate(${padL},12)`}>
            {/* ---- ribbons ---- */}
            <g>
              {frame.order.map((key) => {
                const l = frame.links[key];
                const lit = litLinks?.has(key) ?? false;
                const opacity = !dimmed
                  ? "var(--ribbon-rest)"
                  : lit
                    ? "var(--ribbon-lit)"
                    : "var(--ribbon-dim)";
                return (
                  <g key={key}>
                    <path
                      d={ribbonPath(l)}
                      fill={TONE_FILL[l.tone]}
                      style={{
                        opacity,
                        transition: "opacity 220ms ease-out",
                      }}
                    />
                    {/* travelling flow line — reads as money in motion */}
                    <path
                      d={centrePath(l)}
                      fill="none"
                      stroke={TONE_STROKE[l.tone]}
                      strokeWidth={lit ? 1.6 : 1}
                      strokeLinecap="round"
                      strokeDasharray="3 26"
                      className="pointer-events-none"
                      style={{
                        opacity: !dimmed ? (restingDash ? 0.28 : 0) : lit ? 0.95 : 0,
                        animation: `flow ${lit ? 1.6 : 4.2}s linear infinite`,
                        animationPlayState: lit || restingDash ? "running" : "paused",
                        transition: "opacity 420ms ease-out",
                      }}
                    />
                    {/* generous invisible hit area, also the keyboard stop */}
                    <path
                      d={ribbonPath({ ...l, width: Math.max(l.width, 9) })}
                      fill="transparent"
                      className="cursor-crosshair focus:outline-none"
                      id={`sk-link-${key}`}
                      role="img"
                      aria-label={`${frame.nodes[l.source]?.label} to ${
                        frame.nodes[l.target]?.label
                      }: ${formatCurrency(Math.round(l.value))}, ${fmtPctOr(
                        safeDiv(l.value, agg.totalRevenue),
                        1,
                      )} of total revenue`}
                      style={{
                        outline: "none",
                        stroke:
                          focusKind === "link" && focusKey === key
                            ? "var(--ring)"
                            : "transparent",
                        strokeWidth: 2,
                      }}
                      onPointerEnter={() => {
                        setHoverLink(key);
                        setHoverNode(null);
                      }}
                    />
                  </g>
                );
              })}
            </g>

            {/* ---- nodes ---- */}
            <g>
              {frame.nodeOrder.map((id) => {
                const n = frame.nodes[id];
                const lit = litNodes?.has(id) ?? false;
                const isFirst = n.depth === 0;
                const h = Math.max(1, n.y1 - n.y0);
                const share = safeDiv(n.display, agg.totalRevenue);
                return (
                  <g
                    key={id}
                    id={`sk-node-${id}`}
                    role="img"
                    aria-label={`${n.label}: ${formatCurrency(n.display)}${
                      n.depth > 0 ? `, ${fmtPctOr(share, 0)} of total revenue` : ""
                    }`}
                    onPointerEnter={() => {
                      setHoverNode(id);
                      setHoverLink(null);
                    }}
                    className="cursor-crosshair focus:outline-none"
                  >
                    {focusKind === "node" && focusKey === id && (
                      <rect
                        x={n.x0 - 4}
                        y={n.y0 - 4}
                        width={n.x1 - n.x0 + 8}
                        height={h + 8}
                        rx={4}
                        fill="none"
                        stroke="var(--ring)"
                        strokeWidth={2}
                      />
                    )}
                    <rect
                      x={n.x0}
                      y={n.y0}
                      width={Math.max(1, n.x1 - n.x0)}
                      height={h}
                      rx={2}
                      fill={TONE_STROKE[n.tone]}
                      style={{
                        opacity: !dimmed ? 0.85 : lit ? 1 : 0.18,
                        transition: "opacity 220ms ease-out",
                      }}
                    />
                    <rect
                      x={n.x0 - 6}
                      y={n.y0 - 4}
                      width={n.x1 - n.x0 + 12}
                      height={h + 8}
                      fill="transparent"
                    />
                    <g
                      transform={`translate(${isFirst ? n.x0 - 12 : n.x1 + 12},${(n.y0 + n.y1) / 2})`}
                      textAnchor={isFirst ? "end" : "start"}
                      style={{
                        opacity: !dimmed ? 1 : lit ? 1 : 0.3,
                        transition: "opacity 220ms ease-out",
                      }}
                    >
                      <text
                        y={-3}
                        fill="var(--foreground)"
                        fontSize={compact ? 10 : 11.5}
                        fontWeight={500}
                        letterSpacing="-0.01em"
                        /* halo keeps the label legible over any ribbon fill,
                           at rest, lit, or dimmed, in both themes */
                        stroke="var(--surface)"
                        strokeWidth={3}
                        strokeLinejoin="round"
                        paintOrder="stroke"
                      >
                        {compact ? shortLabel(n.label) : n.label}
                      </text>
                      <text
                        y={11}
                        className="num"
                        fill={lit || !dimmed ? "var(--ink-dim)" : "var(--ink-faint)"}
                        fontSize={compact ? 9.5 : 10.5}
                        stroke="var(--surface)"
                        strokeWidth={2.6}
                        strokeLinejoin="round"
                        paintOrder="stroke"
                      >
                        {formatCurrency(n.display, { compact: true })}
                        {n.depth > 0 && (
                          <tspan fill="var(--ink-faint)"> · {fmtPctOr(share, 0)}</tspan>
                        )}
                      </text>
                    </g>
                  </g>
                );
              })}
            </g>
          </g>
        </svg>
      )}

      {/* ---- flow tooltip ---- */}
      {focusLink && frame && (
        <div
          className="pointer-events-none absolute z-20 w-60 rounded-md border border-hairline bg-popover/95 p-3 shadow-2xl backdrop-blur-sm"
          style={{
            left: Math.min(Math.max(pointer.x + 16, 8), Math.max(8, svgW - 256)),
            top: Math.min(Math.max(pointer.y - 20, 8), height - 130),
          }}
        >
          <div className="eyebrow">Flow</div>
          <div className="mt-1 text-[13px] leading-snug text-foreground">
            {frame.nodes[focusLink.source]?.label}
            <span className="mx-1.5 text-ink-faint">→</span>
            {frame.nodes[focusLink.target]?.label}
          </div>
          <div className="num mt-2 text-xl font-medium text-foreground">
            {formatCurrency(Math.round(focusLink.value))}
          </div>
          <div className="num mt-1 text-[10px] text-ink-faint">
            {fmtPctOr(safeDiv(focusLink.value, agg.totalRevenue), 1)} of total revenue
          </div>
        </div>
      )}
    </div>
  );
}

function shortLabel(label: string): string {
  return (
    {
      "Platform Subscriptions": "Platform",
      "Usage & Overages": "Usage",
      "Professional Services": "Services",
      "Marketplace Rev-Share": "Marketplace",
      "Total Revenue": "Revenue",
      "Cost of Revenue": "COGS",
      "Gross Profit": "Gross",
      "Cloud & Hosting": "Hosting",
      "Customer Support": "Support",
      "Service Delivery": "Delivery",
      "Sales & Marketing": "S&M",
      "General & Admin": "G&A",
      "Operating Income": "Op. income",
      "Funded from Cash Reserves": "From reserves",
    } as Record<string, string>
  )[label] ?? label;
}
