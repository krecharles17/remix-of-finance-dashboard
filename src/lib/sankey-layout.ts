import { sankey } from "d3-sankey";
import type { SankeyGraph, SankeyNode, SankeyLink } from "d3-sankey";
import type { Aggregate } from "@/data/finance-data";

export type Tone = "revenue" | "gross" | "cost" | "profit" | "loss";

export interface NDef {
  id: string;
  label: string;
  tone: Tone;
  order: number;
  /** Financially correct figure to print, independent of layout geometry. */
  display: number;
}

export interface LDef {
  source: string;
  target: string;
  value: number;
  tone: Tone;
  order: number;
}

export type LayoutNode = SankeyNode<NDef, LDef>;
export type LayoutLink = SankeyLink<NDef, LDef>;

/** Money-flow graph: revenue merges into one trunk, then splits into costs and profit. */
export function buildFlowGraph(a: Aggregate): { nodes: NDef[]; links: LDef[] } {
  const profitPositive = a.operatingIncome >= 0;

  const nodes: NDef[] = [
    {
      id: "platform",
      label: "Platform Subscriptions",
      tone: "revenue",
      order: 0,
      display: a.revenueByLine.platform,
    },
    {
      id: "usage",
      label: "Usage & Overages",
      tone: "revenue",
      order: 1,
      display: a.revenueByLine.usage,
    },
    {
      id: "services",
      label: "Professional Services",
      tone: "revenue",
      order: 2,
      display: a.revenueByLine.services,
    },
    {
      id: "marketplace",
      label: "Marketplace Rev-Share",
      tone: "revenue",
      order: 3,
      display: a.revenueByLine.marketplace,
    },

    { id: "revenue", label: "Total Revenue", tone: "gross", order: 5, display: a.totalRevenue },

    { id: "cogs", label: "Cost of Revenue", tone: "cost", order: 6, display: a.totalCogs },
    { id: "gross", label: "Gross Profit", tone: "gross", order: 7, display: a.grossProfit },

    { id: "hosting", label: "Cloud & Hosting", tone: "cost", order: 8, display: a.cogs.hosting },
    { id: "support", label: "Customer Support", tone: "cost", order: 9, display: a.cogs.support },
    {
      id: "delivery",
      label: "Service Delivery",
      tone: "cost",
      order: 10,
      display: a.cogs.delivery,
    },
    { id: "rd", label: "R&D", tone: "cost", order: 11, display: a.opex.rd },
    { id: "sm", label: "Sales & Marketing", tone: "cost", order: 12, display: a.opex.sm },
    { id: "ga", label: "General & Admin", tone: "cost", order: 13, display: a.opex.ga },
  ];

  if (profitPositive) {
    // Surplus leaves the system as operating income.
    nodes.push({
      id: "income",
      label: "Operating Income",
      tone: "profit",
      order: 14,
      display: a.operatingIncome,
    });
  } else {
    // A loss has to be funded from somewhere — show it entering from reserves,
    // which is also what keeps the diagram in balance.
    nodes.push({
      id: "drawdown",
      label: "Funded from Cash Reserves",
      tone: "loss",
      order: 4,
      display: Math.abs(a.operatingIncome),
    });
  }

  const min = 1; // keep every ribbon renderable
  const links: LDef[] = [
    {
      source: "platform",
      target: "revenue",
      value: Math.max(min, a.revenueByLine.platform),
      tone: "revenue",
      order: 0,
    },
    {
      source: "usage",
      target: "revenue",
      value: Math.max(min, a.revenueByLine.usage),
      tone: "revenue",
      order: 1,
    },
    {
      source: "services",
      target: "revenue",
      value: Math.max(min, a.revenueByLine.services),
      tone: "revenue",
      order: 2,
    },
    {
      source: "marketplace",
      target: "revenue",
      value: Math.max(min, a.revenueByLine.marketplace),
      tone: "revenue",
      order: 3,
    },

    {
      source: "revenue",
      target: "cogs",
      value: Math.max(min, a.totalCogs),
      tone: "cost",
      order: 4,
    },
    {
      source: "revenue",
      target: "gross",
      value: Math.max(min, a.grossProfit),
      tone: "gross",
      order: 5,
    },

    {
      source: "cogs",
      target: "hosting",
      value: Math.max(min, a.cogs.hosting),
      tone: "cost",
      order: 6,
    },
    {
      source: "cogs",
      target: "support",
      value: Math.max(min, a.cogs.support),
      tone: "cost",
      order: 7,
    },
    {
      source: "cogs",
      target: "delivery",
      value: Math.max(min, a.cogs.delivery),
      tone: "cost",
      order: 8,
    },

    { source: "gross", target: "rd", value: Math.max(min, a.opex.rd), tone: "cost", order: 9 },
    { source: "gross", target: "sm", value: Math.max(min, a.opex.sm), tone: "cost", order: 10 },
    { source: "gross", target: "ga", value: Math.max(min, a.opex.ga), tone: "cost", order: 11 },
  ];

  if (profitPositive) {
    links.push({
      source: "gross",
      target: "income",
      value: Math.max(min, a.operatingIncome),
      tone: "profit",
      order: 13,
    });
  } else {
    links.push({
      source: "drawdown",
      target: "gross",
      value: Math.max(min, Math.abs(a.operatingIncome)),
      tone: "loss",
      order: 3.5,
    });
  }

  return { nodes, links };
}

export interface NodeSnap {
  id: string;
  label: string;
  tone: Tone;
  depth: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  value: number;
  display: number;
}

export interface LinkSnap {
  key: string;
  source: string;
  target: string;
  tone: Tone;
  /** ribbon endpoints */
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  width: number;
  value: number;
}

export interface Snapshot {
  nodes: Record<string, NodeSnap>;
  links: Record<string, LinkSnap>;
  order: string[];
  nodeOrder: string[];
  maxDepth: number;
}

export function computeLayout(
  graph: { nodes: NDef[]; links: LDef[] },
  width: number,
  height: number,
  nodeWidth = 12,
  nodePadding = 16,
): Snapshot {
  const gen = sankey<NDef, LDef>()
    .nodeId((d) => d.id)
    .nodeWidth(nodeWidth)
    .nodePadding(nodePadding)
    .nodeSort((a, b) => (a as NDef).order - (b as NDef).order)
    .linkSort((a, b) => (a as LDef).order - (b as LDef).order)
    .extent([
      [0, 6],
      [width, height - 6],
    ]);

  const g: SankeyGraph<NDef, LDef> = gen({
    nodes: graph.nodes.map((n) => ({ ...n })),
    links: graph.links.map((l) => ({ ...l })),
  });

  const nodes: Record<string, NodeSnap> = {};
  const nodeOrder: string[] = [];
  let maxDepth = 0;
  for (const n of g.nodes as LayoutNode[]) {
    maxDepth = Math.max(maxDepth, n.depth ?? 0);
    nodes[n.id] = {
      id: n.id,
      label: n.label,
      tone: n.tone,
      depth: n.depth ?? 0,
      x0: n.x0 ?? 0,
      x1: n.x1 ?? 0,
      y0: n.y0 ?? 0,
      y1: n.y1 ?? 0,
      value: n.value ?? 0,
      display: n.display,
    };
    nodeOrder.push(n.id);
  }

  const links: Record<string, LinkSnap> = {};
  const order: string[] = [];
  for (const l of g.links as LayoutLink[]) {
    const s = l.source as LayoutNode;
    const t = l.target as LayoutNode;
    const key = `${s.id}->${t.id}`;
    links[key] = {
      key,
      source: s.id,
      target: t.id,
      tone: l.tone,
      sx: s.x1 ?? 0,
      sy: l.y0 ?? 0,
      tx: t.x0 ?? 0,
      ty: l.y1 ?? 0,
      width: l.width ?? 0,
      value: l.value as number,
    };
    order.push(key);
  }

  return { nodes, links, order, nodeOrder, maxDepth };
}

/** A layout with every ribbon collapsed to zero width — the reveal's start frame. */
export function collapse(snap: Snapshot): Snapshot {
  const links: Record<string, LinkSnap> = {};
  for (const k of snap.order) {
    links[k] = { ...snap.links[k], width: 0, value: 0 };
  }
  const nodes: Record<string, NodeSnap> = {};
  for (const k of snap.nodeOrder) {
    const n = snap.nodes[k];
    const mid = (n.y0 + n.y1) / 2;
    nodes[k] = { ...n, y0: mid, y1: mid, value: 0, display: 0 };
  }
  return { ...snap, nodes, links };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function interpolate(from: Snapshot, to: Snapshot, t: number): Snapshot {
  const nodes: Record<string, NodeSnap> = {};
  for (const id of to.nodeOrder) {
    const b = to.nodes[id];
    const a = from.nodes[id] ?? b;
    nodes[id] = {
      ...b,
      x0: lerp(a.x0, b.x0, t),
      x1: lerp(a.x1, b.x1, t),
      y0: lerp(a.y0, b.y0, t),
      y1: lerp(a.y1, b.y1, t),
      value: lerp(a.value, b.value, t),
      display: lerp(a.display, b.display, t),
    };
  }

  const links: Record<string, LinkSnap> = {};
  for (const k of to.order) {
    const b = to.links[k];
    const a = from.links[k] ?? b;
    links[k] = {
      ...b,
      sx: lerp(a.sx, b.sx, t),
      sy: lerp(a.sy, b.sy, t),
      tx: lerp(a.tx, b.tx, t),
      ty: lerp(a.ty, b.ty, t),
      width: lerp(a.width, b.width, t),
      value: lerp(a.value, b.value, t),
    };
  }

  return { ...to, nodes, links };
}

/** Variable-width horizontal ribbon between two node faces. */
export function ribbonPath(l: LinkSnap): string {
  const w = Math.max(0.4, l.width) / 2;
  const cx = (l.sx + l.tx) / 2;
  const t0 = l.sy - w;
  const t1 = l.ty - w;
  const b0 = l.sy + w;
  const b1 = l.ty + w;
  return [
    `M${l.sx},${t0}`,
    `C${cx},${t0} ${cx},${t1} ${l.tx},${t1}`,
    `L${l.tx},${b1}`,
    `C${cx},${b1} ${cx},${b0} ${l.sx},${b0}`,
    "Z",
  ].join(" ");
}

/** Centreline of a ribbon — used for the travelling highlight dash. */
export function centrePath(l: LinkSnap): string {
  const cx = (l.sx + l.tx) / 2;
  return `M${l.sx},${l.sy} C${cx},${l.sy} ${cx},${l.ty} ${l.tx},${l.ty}`;
}

/**
 * Every link on the end-to-end path through a given link: walk all the way
 * upstream from its source and all the way downstream from its target.
 */
export function tracePath(snap: Snapshot, linkKey: string): Set<string> {
  const out = new Set<string>([linkKey]);
  const inbound = new Map<string, string[]>();
  const outbound = new Map<string, string[]>();
  for (const k of snap.order) {
    const l = snap.links[k];
    if (!outbound.has(l.source)) outbound.set(l.source, []);
    outbound.get(l.source)!.push(k);
    if (!inbound.has(l.target)) inbound.set(l.target, []);
    inbound.get(l.target)!.push(k);
  }

  const up = (nodeId: string) => {
    for (const k of inbound.get(nodeId) ?? []) {
      if (out.has(k)) continue;
      out.add(k);
      up(snap.links[k].source);
    }
  };
  const down = (nodeId: string) => {
    for (const k of outbound.get(nodeId) ?? []) {
      if (out.has(k)) continue;
      out.add(k);
      down(snap.links[k].target);
    }
  };

  up(snap.links[linkKey].source);
  down(snap.links[linkKey].target);
  return out;
}

export function nodesOnPath(snap: Snapshot, keys: Set<string>): Set<string> {
  const s = new Set<string>();
  for (const k of keys) {
    s.add(snap.links[k].source);
    s.add(snap.links[k].target);
  }
  return s;
}
