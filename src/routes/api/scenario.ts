import { createFileRoute } from "@tanstack/react-router";

import { AI_MODEL } from "@/lib/ai-commentary";
import { guardPublicAi } from "@/lib/api-guard.server";
import {
  MULT_MAX,
  MULT_MIN,
  OPEX_LABELS,
  REVENUE_LABELS,
} from "@/lib/scenario-from-prose";

/**
 * Turns a plain-language planning case into the multipliers that make up a
 * `Scenario`. The model emits assumptions, never figures: the dashboard still
 * computes every dollar itself from the actuals times these multipliers.
 *
 * Non-streaming on purpose — the payload is small structured output and is
 * validated in full on the client before it reaches state.
 *
 * Unauthenticated by design (zero-setup template), so it is rate limited and
 * same-origin checked. See `src/lib/api-guard.server.ts`.
 */
export const Route = createFileRoute("/api/scenario")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const blocked = guardPublicAi(request, "scenario");
        if (blocked) return blocked;

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("AI is not configured.", { status: 500 });

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return new Response("Invalid request.", { status: 400 });
        }
        const description =
          typeof body.description === "string" ? body.description.trim().slice(0, 600) : "";
        if (description.length < 3) {
          return new Response("Describe the planning case first.", { status: 400 });
        }


        const revenueLines = Object.entries(REVENUE_LABELS)
          .map(([k, v]) => `  "${k}": ${v}`)
          .join("\n");
        const opexLines = Object.entries(OPEX_LABELS)
          .map(([k, v]) => `  "${k}": ${v}`)
          .join("\n");

        const system = [
          "You translate a plain-language financial planning case into multipliers over a company's booked monthly actuals.",
          "Return JSON only, with exactly this shape and no other keys:",
          '{ "label": string, "blurb": string, "revenueMult": { "platform": number, "usage": number, "services": number, "marketplace": number }, "cogsMult": number, "opexMult": { "rd": number, "sm": number, "ga": number } }',
          "",
          "Revenue lines:",
          revenueLines,
          "Operating expense categories:",
          opexLines,
          '"cogsMult" scales cost of revenue (hosting, support, delivery).',
          "",
          "Rules:",
          `- Every multiplier is a number between ${MULT_MIN} and ${MULT_MAX}. 1 means unchanged, 0.7 means a thirty percent reduction, 1.2 means a twenty percent increase.`,
          "- A line the description does not mention stays at 1. Do not improvise movements nobody asked for.",
          "- \"flat\" means exactly 1.",
          "- label: at most four words naming the case, sentence case.",
          "- blurb: one short sentence describing the assumptions, no numerals.",
          "- Output raw JSON. No markdown, no code fences, no commentary.",
        ].join("\n");

        let upstream: Response;
        try {
          upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Lovable-API-Key": key,
              "X-Lovable-AIG-SDK": "fetch",
            },
            body: JSON.stringify({
              model: AI_MODEL,
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: system },
                { role: "user", content: description },
              ],
            }),
          });
        } catch {
          return new Response("Scenario service unreachable.", { status: 502 });
        }

        if (!upstream.ok) {
          const detail = await upstream.text().catch(() => "");
          console.error(`Scenario gateway failed [${upstream.status}]: ${detail}`);
          const status =
            upstream.status === 429 || upstream.status === 402 ? upstream.status : 502;
          return new Response("Scenario service error.", { status });
        }

        const json = (await upstream.json().catch(() => null)) as
          | { choices?: Array<{ message?: { content?: string } }> }
          | null;
        const text = json?.choices?.[0]?.message?.content ?? "";
        // Some models still wrap JSON in a fence despite being told not to.
        const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

        let parsed: unknown;
        try {
          parsed = JSON.parse(cleaned);
        } catch {
          return new Response("The model did not return usable JSON.", { status: 502 });
        }

        return Response.json(parsed, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
