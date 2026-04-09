import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 });
  }

  const body = await req.json();
  const { ticker, price, isBuyZone, pivots, swingsCount, distanceFromLow } = body;

  const pivotsText = pivots
    .map((p: { direction: string; price: number; date: string }) =>
      `  - ${p.direction === "high" ? "Peak" : "Trough"}: $${p.price.toFixed(2)} on ${p.date}`
    )
    .join("\n");

  const prompt = `You are a financial analyst assistant. A user does NOT currently hold ${ticker} and is deciding whether to buy it now as a new position. This is a NYSE/NASDAQ-listed US stock.

Here is the ZigZag technical analysis data from the last 90 days:
- Current price: $${price.toFixed(2)}
- ZigZag swings detected (5% threshold): ${swingsCount}
- Buy zone signal (within 2% above last trough): ${isBuyZone ? "YES" : "NO"}
${distanceFromLow !== null ? `- Distance from last trough: ${distanceFromLow.toFixed(1)}%` : ""}
- Swing pivots (last 90 days):
${pivotsText || "  No pivots detected"}

Based on this technical pattern AND your existing knowledge about ${ticker} (business model, sector, historical performance, known risks, any events up to your knowledge cutoff), give a direct recommendation on whether to BUY or WAIT.

Format your response as:
1. **Verdict**: Buy Now / Wait for Better Entry / Avoid (with one-line reason)
2. **Technical**: 2-3 sentences on what the ZigZag pattern suggests for a new entry
3. **About ${ticker}**: 2-3 sentences on what this company does, its sector, and any relevant context from your training data
4. **Risk**: One key risk to watch for a new buyer

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
  console.log("Gemini finishReason:", candidate?.finishReason, "| usageMetadata:", JSON.stringify(data?.usageMetadata));
  const text = candidate?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") || null;
  if (!text) {
    console.error("Gemini error response:", JSON.stringify(data));
    const reason = data?.error?.message ?? data?.candidates?.[0]?.finishReason ?? "unknown";
    return NextResponse.json({ error: `Gemini: ${reason}` }, { status: 502 });
  }

  return NextResponse.json({ analysis: text });
}
