"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import StatusBadge from "./StatusBadge";
import type { StockRow } from "@/lib/supabase";

interface ChartPoint {
  date: string;
  price: number;
}

interface Pivot {
  date: string;
  price: number;
  direction: "high" | "low";
}

function calculateZigzag(data: ChartPoint[], delta: number): Pivot[] {
  if (data.length < 2) return [];
  const pivots: Pivot[] = [];
  let lastPrice = data[0].price;
  let lastDir: "high" | "low" | null = null;

  for (const point of data.slice(1)) {
    const change = (point.price - lastPrice) / lastPrice;
    if (change >= delta) {
      if (lastDir !== "high") {
        pivots.push({ ...point, direction: "high" });
        lastDir = "high";
        lastPrice = point.price;
      } else if (point.price > lastPrice) {
        pivots[pivots.length - 1] = { ...point, direction: "high" };
        lastPrice = point.price;
      }
    } else if (change <= -delta) {
      if (lastDir !== "low") {
        pivots.push({ ...point, direction: "low" });
        lastDir = "low";
        lastPrice = point.price;
      } else if (point.price < lastPrice) {
        pivots[pivots.length - 1] = { ...point, direction: "low" };
        lastPrice = point.price;
      }
    }
  }
  return pivots;
}

async function fetchHistory(ticker: string): Promise<ChartPoint[]> {
  const res = await fetch(`/api/chart?ticker=${encodeURIComponent(ticker)}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return [];
  const timestamps: number[] = result.timestamp;
  const closes: number[] = result.indicators.quote[0].close;
  return timestamps.map((ts, i) => ({
    date: new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    price: closes[i] ?? null,
  })).filter((p) => p.price !== null) as ChartPoint[];
}

const DELTA = 0.05;
const BUY_TOLERANCE = 0.02;

interface Props {
  stock: StockRow;
  onClose: () => void;
}

export default function StockModal({ stock, onClose }: Props) {
  const [history, setHistory] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory(stock.ticker).then((data) => {
      setHistory(data);
      setLoading(false);
    });
    // Close on Escape
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [stock.ticker, onClose]);

  const pivots = calculateZigzag(history, DELTA);
  const lastLow = [...pivots].reverse().find((p) => p.direction === "low");
  const lastHigh = [...pivots].reverse().find((p) => p.direction === "high");
  const currentPrice = stock.price;

  const distanceFromLow = lastLow
    ? ((currentPrice - lastLow.price) / lastLow.price) * 100
    : null;

  const priceMin = history.length
    ? Math.min(...history.map((p) => p.price)) * 0.98
    : 0;
  const priceMax = history.length
    ? Math.max(...history.map((p) => p.price)) * 1.02
    : 0;

  // Explanation bullets
  const bullets: string[] = [];
  if (pivots.length >= 2) {
    bullets.push(
      `${pivots.length} swing pivot${pivots.length !== 1 ? "s" : ""} detected over the last 90 days using a 5% threshold.`
    );
  }
  if (lastHigh) {
    bullets.push(`Most recent peak: $${lastHigh.price.toFixed(2)} on ${lastHigh.date}.`);
  }
  if (lastLow) {
    bullets.push(`Most recent trough: $${lastLow.price.toFixed(2)} on ${lastLow.date}.`);
  }
  if (stock.is_buy_zone && distanceFromLow !== null) {
    bullets.push(
      `Current price $${currentPrice.toFixed(2)} is ${distanceFromLow.toFixed(1)}% above the last trough — within the 2% buy zone.`
    );
    bullets.push(
      "This suggests the stock has bounced from a recent support level established by the ZigZag pattern."
    );
  } else if (distanceFromLow !== null) {
    bullets.push(
      `Current price is ${distanceFromLow.toFixed(1)}% above the last trough — outside the 2% buy zone.`
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Panel — full-width sheet on mobile, centered card on desktop */}
      <div
        className="relative z-10 w-full overflow-y-auto rounded-t-2xl border border-slate-700 bg-slate-900 shadow-2xl sm:max-w-2xl sm:rounded-2xl"
        style={{ maxHeight: "92dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-2xl font-bold text-slate-100">
              {stock.ticker}
            </span>
            <span className="font-mono text-lg text-slate-400">
              ${currentPrice.toFixed(2)}
            </span>
            <StatusBadge isBuyZone={stock.is_buy_zone} />
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Chart */}
        <div className="px-6 pt-4">
          {loading ? (
            <div className="flex h-48 items-center justify-center text-slate-500 text-sm">
              Loading chart…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={history} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[priceMin, priceMax]}
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${v.toFixed(0)}`}
                  width={52}
                />
                <Tooltip
                  contentStyle={{
                    background: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [`$${v.toFixed(2)}`, "Price"]}
                />
                {/* Buy zone band */}
                {lastLow && (
                  <ReferenceLine
                    y={lastLow.price}
                    stroke="#10b981"
                    strokeDasharray="4 3"
                    label={{ value: "support", fill: "#10b981", fontSize: 10, position: "insideTopRight" }}
                  />
                )}
                {lastLow && (
                  <ReferenceLine
                    y={lastLow.price * (1 + BUY_TOLERANCE)}
                    stroke="#10b981"
                    strokeDasharray="2 4"
                    strokeOpacity={0.5}
                    label={{ value: "+2%", fill: "#10b981", fontSize: 10, position: "insideTopRight" }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#priceGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#6366f1" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Explanation */}
        <div className="px-6 py-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Signal Analysis
          </h3>
          <ul className="space-y-1.5">
            {bullets.map((b, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-300">
                <span className={stock.is_buy_zone && i === bullets.length - 1 ? "text-emerald-400" : "text-indigo-400"}>
                  •
                </span>
                {b}
              </li>
            ))}
            {bullets.length === 0 && !loading && (
              <li className="text-sm text-slate-500">Not enough pivot data to explain signal.</li>
            )}
          </ul>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-700/60 px-6 py-3 text-xs text-slate-600">
          Last scanned {new Date(stock.last_updated).toLocaleString()} · ZigZag δ=5% · Buy zone ±2% of last trough
        </div>
      </div>
    </div>
  );
}
