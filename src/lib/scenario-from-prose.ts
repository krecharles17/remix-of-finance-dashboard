/**
 * Scenario from prose — the one place in this project where the model is
 * allowed to emit numbers.
 *
 * The exception is defensible only because a multiplier is a stated modelling
 * assumption, not a booked figure: it never claims what happened, only what a
 * described planning case would do to the actuals. To keep that distinction
 * honest the UI must show every derived multiplier, let the user edit it, and
 * mark the scenario as modelled from a description.
 *
 * Everything the model returns is validated against `Scenario` before it
 * reaches state. Missing keys, extra keys, non-finite values, or values
 * outside plausible planning bounds are rejected outright — never clamped
 * silently, and never applied partially.
 */
import type { Scenario } from "@/data/finance-data";

export const REVENUE_KEYS = ["platform", "usage", "services", "marketplace"] as const;
export const OPEX_KEYS = ["rd", "sm", "ga"] as const;

/** Plausible planning bounds. Outside these a chart stops being readable. */
export const MULT_MIN = 0.2;
export const MULT_MAX = 3;

export const REVENUE_LABELS: Record<(typeof REVENUE_KEYS)[number], string> = {
  platform: "Platform subscriptions",
  usage: "Usage & overages",
  services: "Professional services",
  marketplace: "Marketplace rev share",
};

export const OPEX_LABELS: Record<(typeof OPEX_KEYS)[number], string> = {
  rd: "R&D",
  sm: "S&M",
  ga: "G&A",
};

/** Marks a scenario as modelled from a description rather than authored. */
export interface GeneratedScenario extends Scenario {
  generated: true;
  /** The prose the user typed, kept so the assumption stays auditable. */
  source: string;
}

export function isGeneratedScenario(s: Scenario): s is GeneratedScenario {
  return (s as GeneratedScenario).generated === true;
}

export class ScenarioRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScenarioRejected";
  }
}

function readMult(bag: Record<string, unknown>, key: string, where: string): number {
  if (!(key in bag)) {
    throw new ScenarioRejected(`The model left out the ${where} multiplier.`);
  }
  const v = bag[key];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new ScenarioRejected(`The ${where} multiplier was not a number.`);
  }
  if (v < MULT_MIN || v > MULT_MAX) {
    throw new ScenarioRejected(
      `The ${where} multiplier came back at ${v}, outside the plausible planning range of ${MULT_MIN}–${MULT_MAX}. Rejected rather than clamped, because a silently corrected assumption is a wrong assumption.`,
    );
  }
  // Multipliers are assumptions, not measurements: two decimals is the honest
  // precision, and it keeps the editable inputs readable.
  return Math.round(v * 100) / 100;
}

function readBag(raw: Record<string, unknown>, field: string): Record<string, unknown> {
  const bag = raw[field];
  if (typeof bag !== "object" || bag === null || Array.isArray(bag)) {
    throw new ScenarioRejected(`The model returned no ${field} block.`);
  }
  return bag as Record<string, unknown>;
}

function readText(raw: Record<string, unknown>, field: string, max: number): string {
  const v = raw[field];
  if (typeof v !== "string" || v.trim().length === 0) {
    throw new ScenarioRejected(`The model returned no ${field}.`);
  }
  return v.trim().slice(0, max);
}

/**
 * Validate the whole payload before anything is shown. Unlike commentary,
 * this is structured output, so it can be checked completely up front — and
 * therefore should be.
 */
export function parseScenario(
  raw: unknown,
  source: string,
  existingKeys: readonly string[],
): GeneratedScenario {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ScenarioRejected("The model did not return a scenario object.");
  }
  const obj = raw as Record<string, unknown>;

  const revBag = readBag(obj, "revenueMult");
  const opexBag = readBag(obj, "opexMult");

  const extraRev = Object.keys(revBag).filter(
    (k) => !(REVENUE_KEYS as readonly string[]).includes(k),
  );
  const extraOpex = Object.keys(opexBag).filter(
    (k) => !(OPEX_KEYS as readonly string[]).includes(k),
  );
  if (extraRev.length || extraOpex.length) {
    throw new ScenarioRejected(
      `The model invented lines this dataset does not have: ${[...extraRev, ...extraOpex].join(", ")}.`,
    );
  }

  const revenueMult = {} as GeneratedScenario["revenueMult"];
  for (const k of REVENUE_KEYS) revenueMult[k] = readMult(revBag, k, REVENUE_LABELS[k]);

  const opexMult = {} as GeneratedScenario["opexMult"];
  for (const k of OPEX_KEYS) opexMult[k] = readMult(opexBag, k, OPEX_LABELS[k]);

  const cogsMult = readMult(obj, "cogsMult", "cost of revenue");

  const label = readText(obj, "label", 40);
  const blurb = readText(obj, "blurb", 160);

  let key = `gen-${
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "scenario"
  }`;
  let n = 2;
  const taken = new Set(existingKeys);
  const base = key;
  while (taken.has(key)) key = `${base}-${n++}`;

  return { key, label, blurb, revenueMult, cogsMult, opexMult, generated: true, source };
}

/** Bounds check for a user edit of an already-generated multiplier. */
export function inBounds(v: number) {
  return Number.isFinite(v) && v >= MULT_MIN && v <= MULT_MAX;
}

/** Ask the app's own endpoint for a scenario. User-initiated only. */
export async function requestScenario(
  description: string,
  existingKeys: readonly string[],
): Promise<GeneratedScenario> {
  let res: Response;
  try {
    res = await fetch("/api/scenario", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });
  } catch {
    throw new ScenarioRejected("Scenario service unreachable.");
  }
  if (!res.ok) {
    throw new ScenarioRejected(
      res.status === 429
        ? "Rate limited — try again in a moment."
        : res.status === 402
          ? "AI credits exhausted for this workspace."
          : "Scenario service unavailable.",
    );
  }
  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new ScenarioRejected("The model returned something we could not read.");
  }
  return parseScenario(payload, description, existingKeys);
}
