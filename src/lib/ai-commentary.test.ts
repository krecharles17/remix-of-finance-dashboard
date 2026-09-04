import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AI_MODEL,
  COMMENTARY_MODEL,
  NarrativeRejected,
  commentaryKey,
  computedDrivers,
  isGeneratedCommentary,
  streamCommentary,
  validateNarrative,
  type CommentaryRequest,
} from "./ai-commentary";

const prose =
  "Platform subscriptions landed ahead of plan, and the gap is wide enough to change the read on the quarter.";

describe("validateNarrative", () => {
  it("accepts prose with no numerals", () => {
    expect(validateNarrative(prose)).toBe(prose);
  });

  it("collapses whitespace", () => {
    expect(validateNarrative(`  ${prose.replace(" ", "\n\n")} `)).toBe(prose);
  });

  it("rejects any digit, because figures belong in the drivers table", () => {
    expect(validateNarrative(`${prose} Up 12 percent.`)).toBeNull();
  });

  it("rejects output that is too short, too long, or not a string", () => {
    expect(validateNarrative("Too short.")).toBeNull();
    expect(validateNarrative("word ".repeat(400))).toBeNull();
    expect(validateNarrative(42)).toBeNull();
  });
});

describe("computedDrivers", () => {
  it("derives every driver from the dataset line", () => {
    const drivers = computedDrivers({
      key: "platform",
      label: "Platform",
      kind: "revenue",
      budget: 1_000_000,
      actual: 1_250_000,
    });
    expect(drivers.map((d) => d.label)).toEqual([
      "Budget",
      "Actual",
      "Impact on op. income",
      "Share of budgeted line",
    ]);
    expect(drivers[2].value.startsWith("+")).toBe(true);
    expect(drivers[3].value).toBe("25.0%");
  });

  it("marks an adverse impact as negative", () => {
    const drivers = computedDrivers({
      key: "sm",
      label: "S&M",
      kind: "cost",
      budget: 1_000_000,
      actual: 1_200_000,
    });
    expect(drivers[2].value.startsWith("−")).toBe(true);
  });
});

describe("keys, guards and model choice", () => {
  it("scopes commentary to month, scenario and line", () => {
    expect(commentaryKey("2026-01", "base", "platform")).toBe("2026-01|base|platform");
  });

  it("recognises a generated record and rejects malformed ones", () => {
    expect(
      isGeneratedCommentary({ generated: true, narrative: prose, drivers: [] }),
    ).toBe(true);
    expect(isGeneratedCommentary({ narrative: prose, drivers: [] })).toBe(false);
    expect(isGeneratedCommentary(null)).toBe(false);
    expect(
      isGeneratedCommentary({ generated: true, narrative: prose, drivers: [{ label: 1 }] }),
    ).toBe(false);
  });

  it("names the model in exactly one place", () => {
    expect(COMMENTARY_MODEL).toBe(AI_MODEL);
  });
});

const body: CommentaryRequest = {
  lineLabel: "Platform subscriptions",
  kind: "revenue",
  monthLabel: "January 2026",
  scenarioLabel: "Base case",
  budget: 1_000_000,
  actual: 1_250_000,
  impact: 250_000,
  totalRevenue: 4_000_000,
  operatingIncome: 500_000,
  currency: "USD",
  locale: "en-US",
};

function streamOf(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(encoder.encode(c));
        controller.close();
      },
    }),
  );
}

describe("streamCommentary", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("streams deltas and returns the validated narrative", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => streamOf([prose.slice(0, 20), prose.slice(20)])));
    const seen: string[] = [];
    const text = await streamCommentary(body, (c) => seen.push(c));
    expect(seen).toHaveLength(2);
    expect(text).toBe(prose);
  });

  it("aborts the moment a digit arrives mid-stream", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => streamOf([prose, " Up 12 percent."])));
    const seen: string[] = [];
    await expect(streamCommentary(body, (c) => seen.push(c))).rejects.toBeInstanceOf(
      NarrativeRejected,
    );
    expect(seen).toEqual([prose]);
  });

  it("reports rate limiting and exhausted credits in plain language", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429 })));
    await expect(streamCommentary(body, () => {})).rejects.toThrow(/Rate limited/);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 402 })));
    await expect(streamCommentary(body, () => {})).rejects.toThrow(/credits/);
  });
});
