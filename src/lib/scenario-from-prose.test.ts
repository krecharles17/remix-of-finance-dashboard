import { describe, expect, it } from "vitest";

import {
  MULT_MAX,
  MULT_MIN,
  ScenarioRejected,
  inBounds,
  isGeneratedScenario,
  parseScenario,
} from "./scenario-from-prose";

const good = {
  label: "S&M pullback",
  blurb: "Sales and marketing spend is reduced while everything else holds.",
  revenueMult: { platform: 1, usage: 1, services: 1, marketplace: 1 },
  cogsMult: 1,
  opexMult: { rd: 1, sm: 0.7, ga: 1 },
};

const parse = (raw: unknown, keys: string[] = []) => parseScenario(raw, "a described case", keys);

describe("parseScenario", () => {
  it("accepts a well-formed payload and marks it generated", () => {
    const s = parse(good);
    expect(s.opexMult.sm).toBe(0.7);
    expect(s.source).toBe("a described case");
    expect(isGeneratedScenario(s)).toBe(true);
    expect(s.key).toBe("gen-s-m-pullback");
  });

  it("rounds multipliers to two decimals", () => {
    expect(parse({ ...good, cogsMult: 1.23456 }).cogsMult).toBe(1.23);
  });

  it("de-duplicates the key against existing scenarios", () => {
    expect(parse(good, ["gen-s-m-pullback"]).key).toBe("gen-s-m-pullback-2");
  });

  it("rejects a non-object payload", () => {
    expect(() => parse(null)).toThrow(ScenarioRejected);
    expect(() => parse([])).toThrow(ScenarioRejected);
  });

  it("rejects a missing multiplier rather than defaulting it", () => {
    const { sm: _sm, ...rest } = good.opexMult;
    expect(() => parse({ ...good, opexMult: rest })).toThrow(/left out/);
  });

  it("rejects invented lines the dataset does not have", () => {
    expect(() => parse({ ...good, revenueMult: { ...good.revenueMult, hardware: 1.1 } })).toThrow(
      /invented lines/,
    );
  });

  it("rejects non-numeric and non-finite multipliers", () => {
    expect(() => parse({ ...good, cogsMult: "0.8" })).toThrow(/not a number/);
    expect(() => parse({ ...good, cogsMult: Number.NaN })).toThrow(/not a number/);
  });

  it("rejects out-of-range multipliers instead of clamping them", () => {
    expect(() => parse({ ...good, cogsMult: MULT_MAX + 1 })).toThrow(/plausible planning range/);
    expect(() => parse({ ...good, cogsMult: MULT_MIN - 0.01 })).toThrow(/plausible planning range/);
  });

  it("requires a label and a blurb", () => {
    expect(() => parse({ ...good, label: "  " })).toThrow(/no label/);
    expect(() => parse({ ...good, blurb: 5 })).toThrow(/no blurb/);
  });

  it("requires the multiplier blocks", () => {
    expect(() => parse({ ...good, opexMult: null })).toThrow(/no opexMult block/);
  });
});

describe("inBounds", () => {
  it("matches the parser's accepted range", () => {
    expect(inBounds(MULT_MIN)).toBe(true);
    expect(inBounds(MULT_MAX)).toBe(true);
    expect(inBounds(MULT_MAX + 0.01)).toBe(false);
    expect(inBounds(Number.NaN)).toBe(false);
  });
});
