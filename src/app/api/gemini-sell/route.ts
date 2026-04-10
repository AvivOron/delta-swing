import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 });
  }

  const body = await req.json();
  const { ticker, buyPrice, currentPrice, pivots, distanceFromLow, lastHigh, lastLow } = body;

  const pnlPct = ((currentPrice - buyPrice) / buyPrice) * 100;
  const pnlSign = pnlPct >= 0 ? "+" : "";

  const pivotsText = (pivots ?? [])
    .map((p: { direction: string; price: number; date: string }) =>
      `  - ${p.direction === "high" ? "Peak" : "Trough"}: $${p.price.toFixed(2)} on ${p.date}`
    )
    .join("\n");

  const prompt = `You are a financial analyst assistant. A user already HOLDS ${ticker} and is deciding whether to sell now or hold longer.

Position details:
- Buy price: $${buyPrice.toFixed(2)}
- Current price: $${currentPrice.toFixed(2)}
- Unrealized P&L: ${pnlSign}${pnlPct.toFixed(1)}%
${lastHigh ? `- Most recent peak (resistance): $${lastHigh.price.toFixed(2)} on ${lastHigh.date}` : ""}
${lastLow ? `- Most recent trough (support): $${lastLow.price.toFixed(2)} on ${lastLow.date}` : ""}
${distanceFromLow !== null ? `- Current price is ${distanceFromLow.toFixed(1)}% above the last trough` : ""}
- Swing pivots (last 180 days, 5% ZigZag threshold):
${pivotsText || "  No pivots detected"}

Based on the ZigZag pattern (proximity to resistance peaks vs support troughs) AND your existing knowledge of ${ticker}, give a direct sell/hold recommendation.

Format your response as:
1. **Verdict**: Sell Now / Hold / Take Partial Profits (with one-line reason)
2. **Technical**: 2-3 sentences — is the price near a historical peak/resistance? Is there room left to run before the next likely reversal?
3. **Position Context**: 1-2 sentences on the P&L situation and whether the entry price was at a good level relative to the pattern
4. **Risk**: One key risk of holding vs. one key risk of selling now

End with a one-line disclaimer that this is not financial advice.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
      }),
    }
  );

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  console.log("Gemini-sell finishReason:", candidate?.finishReason, "| usageMetadata:", JSON.stringify(data?.usageMetadata));
  const text = candidate?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") || null;
  if (!text) {
    console.error("Gemini-sell error response:", JSON.stringify(data));
    const reason = data?.error?.message ?? data?.candidates?.[0]?.finishReason ?? "unknown";
    return NextResponse.json({ error: `Gemini: ${reason}` }, { status: 502 });
  }

  return NextResponse.json({ analysis: text });
}
