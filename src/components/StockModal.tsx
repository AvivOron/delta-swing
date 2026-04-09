"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
} from "recharts";
import StatusBadge from "./StatusBadge";
import type { StockRow } from "@/lib/supabase";

interface ChartPoint {
  date: string;
  price: number;
  timestamp: number;
  pivotHigh?: number;
  pivotLow?: number;
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
        pivots.push({ date: point.date, price: point.price, direction: "high" });
        lastDir = "high";
        lastPrice = point.price;
      } else if (point.price > lastPrice) {
        pivots[pivots.length - 1] = { date: point.date, price: point.price, direction: "high" };
        lastPrice = point.price;
      }
    } else if (change <= -delta) {
      if (lastDir !== "low") {
        pivots.push({ date: point.date, price: point.price, direction: "low" });
        lastDir = "low";
        lastPrice = point.price;
      } else if (point.price < lastPrice) {
        pivots[pivots.length - 1] = { date: point.date, price: point.price, direction: "low" };
        lastPrice = point.price;
      }
    }
  }
  return pivots;
}

async function fetchHistory(ticker: string): Promise<ChartPoint[]> {
  const res = await fetch(`/delta-swing/api/chart?ticker=${encodeURIComponent(ticker)}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return [];
  const timestamps: number[] = result.timestamp;
  const closes: number[] = result.indicators.quote[0].close;
  const cutoffTimestamp = Math.floor(Date.now() / 1000) - MAX_HISTORY_SECONDS;
  return timestamps
    .map((ts, i) => ({
      timestamp: ts,
      date: new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      price: closes[i] ?? null,
    }))
    .filter((p) => p.price !== null && p.timestamp >= cutoffTimestamp) as ChartPoint[];
}

const DELTA = 0.05;
const BUY_TOLERANCE = 0.02;
const MAX_HISTORY_DAYS = 180;
const MAX_HISTORY_SECONDS = MAX_HISTORY_DAYS * 24 * 60 * 60;
const TIMEFRAME_OPTIONS = [
  { key: "1M", label: "1M", points: 21 },
  { key: "3M", label: "3M", points: 63 },
  { key: "6M", label: "6M", points: 126 },
] as const;

type TimeframeKey = (typeof TIMEFRAME_OPTIONS)[number]["key"];

const PivotDot = (props: any) => {
  const { cx, cy, payload } = props;
  if (payload.pivotHigh !== undefined) {
    return <circle cx={cx} cy={cy} r={4} fill="#f59e0b" stroke="#1e293b" strokeWidth={1.5} />;
  }
  if (payload.pivotLow !== undefined) {
    return <circle cx={cx} cy={cy} r={4} fill="#10b981" stroke="#1e293b" strokeWidth={1.5} />;
  }
  return null;
};

interface Props {
  stock: StockRow;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
}

export default function StockModal({ stock, onClose, onPrevious, onNext }: Props) {
  const [history, setHistory] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiText, setGeminiText] = useState<string | null>(null);
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<TimeframeKey>("6M");

  useEffect(() => {
    setLoading(true);
    fetchHistory(stock.ticker).then((data) => {
      setHistory(data);
      setLoading(false);
    });
  }, [stock.ticker]);

  useEffect(() => {
    setTimeframe("6M");
    setGeminiText(null);
    setGeminiError(null);
  }, [stock.ticker]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        !!target?.isContentEditable;

      if (isTypingTarget) return;

      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft" && onPrevious) {
        e.preventDefault();
        onPrevious();
      } else if (e.key === "ArrowRight" && onNext) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, onPrevious, onNext]);

  const pivots = calculateZigzag(history, DELTA);
  const timeframePoints = TIMEFRAME_OPTIONS.find((option) => option.key === timeframe)?.points ?? null;
  const visibleHistory = timeframePoints ? history.slice(-timeframePoints) : history;
  const visiblePivots = calculateZigzag(visibleHistory, DELTA);

  // Merge pivot markers into chart data, and add zigzag line values
  const pivotDates = new Set(visiblePivots.map((p) => p.date));
  const chartData: ChartPoint[] = visibleHistory.map((p) => {
    const pivot = visiblePivots.find((pv) => pv.date === p.date);
    return {
      ...p,
      zigzag: pivotDates.has(p.date) ? p.price : undefined,
      ...(pivot?.direction === "high" ? { pivotHigh: p.price } : {}),
      ...(pivot?.direction === "low" ? { pivotLow: p.price } : {}),
    };
  });

  const lastLow = [...pivots].reverse().find((p) => p.direction === "low");
  const lastHigh = [...pivots].reverse().find((p) => p.direction === "high");
  const currentPrice = stock.price;

  const distanceFromLow = lastLow
    ? ((currentPrice - lastLow.price) / lastLow.price) * 100
    : null;

  const priceMin = visibleHistory.length ? Math.min(...visibleHistory.map((p) => p.price)) * 0.96 : 0;
  const priceMax = visibleHistory.length ? Math.max(...visibleHistory.map((p) => p.price)) * 1.04 : 0;

  async function askGemini() {
    setGeminiLoading(true);
    setGeminiText(null);
    setGeminiError(null);
    try {
      const res = await fetch("/delta-swing/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: stock.ticker,
          price: currentPrice,
          isBuyZone: stock.is_buy_zone,
          pivots,
          swingsCount: stock.swings_count,
          distanceFromLow,
        }),
      });
      const data = await res.json();
      if (data.error) setGeminiError(data.error);
      else setGeminiText(data.analysis);
    } catch {
      setGeminiError("Failed to reach Gemini.");
    } finally {
      setGeminiLoading(false);
    }
  }

  const bullets: string[] = [];
  if (pivots.length >= 2) {
    bullets.push(`${pivots.length} swing pivot${pivots.length !== 1 ? "s" : ""} detected over the last 180 days using a 5% threshold.`);
  }
  if (lastHigh) bullets.push(`Most recent peak: $${lastHigh.price.toFixed(2)} on ${lastHigh.date}.`);
  if (lastLow) bullets.push(`Most recent trough: $${lastLow.price.toFixed(2)} on ${lastLow.date}.`);
  if (stock.is_buy_zone && distanceFromLow !== null) {
    bullets.push(`Current price $${currentPrice.toFixed(2)} is ${distanceFromLow.toFixed(1)}% above the last trough — within the 2% buy zone.`);
    bullets.push("This suggests the stock has bounced from a recent support level established by the ZigZag pattern.");
  } else if (distanceFromLow !== null) {
    bullets.push(`Current price is ${distanceFromLow.toFixed(1)}% above the last trough — outside the 2% buy zone.`);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div className="relative z-10 w-full sm:max-w-[calc(42rem+7rem)] sm:px-14">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPrevious?.();
          }}
          disabled={!onPrevious}
          aria-label="Previous stock"
          className="absolute left-0 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-slate-700/60 bg-slate-900/90 text-xl text-slate-300 shadow-lg backdrop-blur transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-35 sm:flex"
        >
          ←
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onNext?.();
          }}
          disabled={!onNext}
          aria-label="Next stock"
          className="absolute right-0 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-slate-700/60 bg-slate-900/90 text-xl text-slate-300 shadow-lg backdrop-blur transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-35 sm:flex"
        >
          →
        </button>

        <div
          className="w-full overflow-y-auto rounded-t-2xl border border-slate-700 bg-slate-900 shadow-2xl sm:mx-auto sm:max-w-2xl sm:rounded-2xl"
          style={{ maxHeight: "92dvh" }}
          onClick={(e) => e.stopPropagation()}
        >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <a
              href={`https://finance.yahoo.com/quote/${stock.ticker}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-2xl font-bold text-slate-100 hover:text-indigo-400 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {stock.ticker} ↗
            </a>
            <span className="font-mono text-lg text-slate-400">${currentPrice.toFixed(2)}</span>
            <StatusBadge isBuyZone={stock.is_buy_zone} />
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Chart */}
        <div className="px-2 pt-4 sm:px-6">
          {loading ? (
            <div className="flex h-48 items-center justify-center text-slate-500 text-sm">
              Loading chart…
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-3 px-2">
                <div className="text-xs uppercase tracking-wider text-slate-500">
                  Chart Range
                </div>
                <div className="flex items-center gap-1 rounded-full border border-slate-700/60 bg-slate-800/60 p-1">
                  {TIMEFRAME_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setTimeframe(option.key)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        timeframe === option.key
                          ? "bg-indigo-600 text-white"
                          : "text-slate-400 hover:bg-slate-700/70 hover:text-slate-200"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Legend */}
              <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 px-2 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-4 rounded bg-indigo-400 opacity-60" /> Price
                </span>
<span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-400" /> Peak
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" /> Trough
                </span>
              </div>

              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
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
                    formatter={(v: number, name: string) => {
                      if (name === "price") return [`$${v.toFixed(2)}`, "Price"];
                      return [null, null];
                    }}
                    itemSorter={() => -1}
                  />

                  {/* Support line */}
                  {lastLow && (
                    <ReferenceLine
                      y={lastLow.price}
                      stroke="#10b981"
                      strokeDasharray="4 3"
                      strokeOpacity={0.7}
                    />
                  )}
                  {/* Buy zone upper band */}
                  {lastLow && (
                    <ReferenceLine
                      y={lastLow.price * (1 + BUY_TOLERANCE)}
                      stroke="#10b981"
                      strokeDasharray="2 5"
                      strokeOpacity={0.35}
                    />
                  )}

                  {/* Price area */}
                  <Area
                    type="monotone"
                    dataKey="price"
                    stroke="#6366f1"
                    strokeWidth={1.5}
                    fill="url(#priceGrad)"
                    dot={false}
                    activeDot={{ r: 4, fill: "#6366f1" }}
                  />

                  {/* Pivot dots — peaks (amber) and troughs (green) */}
                  <Line
                    type="linear"
                    dataKey="zigzag"
                    stroke="none"
                    dot={<PivotDot />}
                    activeDot={false}
                    legendType="none"
                    isAnimationActive={false}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </>
          )}
        </div>

        {/* Signal Analysis */}
        <div className="px-6 py-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Signal Analysis
            </h3>
            <button
              onClick={askGemini}
              disabled={geminiLoading || loading}
              className="flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-600/10 px-3 py-1 text-xs font-medium text-indigo-300 hover:bg-indigo-600/20 hover:text-indigo-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {geminiLoading ? (
                <>
                  <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Asking…
                </>
              ) : (
                <>✦ Ask Gemini</>
              )}
            </button>
          </div>
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

          {geminiError && (
            <p className="mt-3 text-sm text-red-400">{geminiError}</p>
          )}

          {geminiText && (
            <div className="mt-3 rounded-xl border border-indigo-500/20 bg-indigo-950/30 px-4 py-3 text-sm text-slate-300 leading-relaxed prose prose-invert prose-sm max-w-none">
              <ReactMarkdown>{geminiText}</ReactMarkdown>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-700/60 px-6 py-3 text-xs text-slate-600">
          Last scanned {new Date(stock.last_updated).toLocaleString()} · ZigZag δ=5% · Buy zone ±2% of last trough
        </div>
      </div>
      </div>
    </div>
  );
}
