import { createFileRoute } from "@tanstack/react-router";

import { COMMENTARY_MODEL } from "@/lib/ai-commentary";
import { clampText, guardPublicAi } from "@/lib/api-guard.server";

/**
 * Streams a plain-prose variance narrative from the Lovable AI gateway.
 * The response body is raw text, so the client can render it as it arrives.
 * No figures are requested from the model — the dashboard computes those.
 *
 * Unauthenticated by design (zero-setup template), so it is rate limited and
 * same-origin checked, and every caller-supplied string is length capped
 * before it reaches the prompt.
 */
export const Route = createFileRoute("/api/commentary")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const blocked = guardPublicAi(request, "commentary");
        if (blocked) return blocked;

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("AI is not configured.", { status: 500 });

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return new Response("Invalid request.", { status: 400 });
        }

        // Caps keep a single request from being made arbitrarily expensive.
        const s = (k: string, max = 80) => clampText(body[k], max);
        const n = (k: string) =>
          typeof body[k] === "number" && Number.isFinite(body[k] as number)
            ? (body[k] as number)
            : 0;
        if (!s("lineLabel") || !s("monthLabel")) {
          return new Response("Invalid request.", { status: 400 });
        }

        // Untrusted locale/currency would make Intl throw, so fall back to
        // defaults unless they match the expected shape.
        const locale = /^[a-zA-Z-]{2,12}$/.test(s("locale", 12)) ? s("locale", 12) : "en-US";
        const currency = /^[a-zA-Z]{3}$/.test(s("currency", 3)) ? s("currency", 3) : "USD";
        const money = (v: number) =>
          new Intl.NumberFormat(locale, {
            style: "currency",
            currency,
            maximumFractionDigits: 0,
          }).format(v);



        const favourable = n("impact") >= 0;
        const prompt = [
          `Line: ${s("lineLabel")} (${s("kind")} line)`,
          `Period: ${s("monthLabel")} · scenario: ${s("scenarioLabel")}`,
          `Budget: ${money(n("budget"))}`,
          `Actual: ${money(n("actual"))}`,
          `Impact on operating income: ${favourable ? "favourable" : "unfavourable"} ${money(Math.abs(n("impact")))}`,
          `Total revenue this period: ${money(n("totalRevenue"))}`,
          `Operating income this period: ${money(n("operatingIncome"))}`,
        ].join("\n");

        const system = [
          "You are a finance controller writing one short variance note for a monthly close review.",
          "Write two to four sentences of plain prose describing what a variance of this direction and relative size means for the business, and what a reader should watch next.",
          "Absolute rules:",
          "- Never write any numeral or figure. The dashboard shows the numbers beside your text; describe magnitude only in words such as modest, sizeable, or material.",
          "- Never invent operational facts: no customer names, headcounts, logo counts, utilisation, CAC, deal counts, dates, or owners. You only know the figures given.",
          "- Never state a cause as fact. Frame possible drivers as questions or as things to confirm.",
          "- No headings, no bullet points, no markdown. Prose only.",
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
              model: COMMENTARY_MODEL,
              stream: true,
              messages: [
                { role: "system", content: system },
                { role: "user", content: prompt },
              ],
            }),
          });
        } catch {
          return new Response("Commentary service unreachable.", { status: 502 });
        }

        if (!upstream.ok || !upstream.body) {
          const status = upstream.status === 429 || upstream.status === 402 ? upstream.status : 502;
          return new Response("Commentary service error.", { status });
        }

        // Unwrap the SSE envelope into plain text deltas, and end the
        // response ourselves on the terminal frame — the upstream socket can
        // stay open past the final chunk.
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        const reader = upstream.body.getReader();

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            let buffer = "";
            try {
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                let ended = false;
                for (const raw of lines) {
                  const line = raw.trim();
                  if (!line.startsWith("data:")) continue;
                  const data = line.slice(5).trim();
                  if (!data) continue;
                  if (data === "[DONE]") {
                    ended = true;
                    break;
                  }
                  try {
                    const json = JSON.parse(data);
                    const delta = json?.choices?.[0]?.delta?.content;
                    if (typeof delta === "string" && delta.length > 0) {
                      controller.enqueue(encoder.encode(delta));
                    }
                    if (json?.choices?.[0]?.finish_reason) ended = true;
                  } catch {
                    // partial frame; ignore
                  }
                }
                if (ended) break;
              }
            } catch {
              // fall through and close with whatever prose arrived
            } finally {
              try {
                await reader.cancel();
              } catch {
                // already closed
              }
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
