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
  timestamp: number;
  price: number;
  direction: "high" | "low";
}

function calculateZigzag(data: ChartPoint[], delta: number): Pivot[] {
  if (data.length < 2) return [];
  const pivots: Pivot[] = [];
  let lastPrice = data[0].price;
  let lastDir: "high" | "low" | null = null;

  for (let i = 1; i < data.length; i++) {
    const change = (data[i].price - lastPrice) / lastPrice;
    if (change >= delta) {
      if (lastDir !== "high") {
        pivots.push({ date: data[i].date, timestamp: data[i].timestamp, price: data[i].price, direction: "high" });
        lastDir = "high";
        lastPrice = data[i].price;
      } else if (data[i].price > lastPrice) {
        pivots[pivots.length - 1] = { date: data[i].date, timestamp: data[i].timestamp, price: data[i].price, direction: "high" };
        lastPrice = data[i].price;
      }
    } else if (change <= -delta) {
      if (lastDir !== "low") {
        pivots.push({ date: data[i].date, timestamp: data[i].timestamp, price: data[i].price, direction: "low" });
        lastDir = "low";
        lastPrice = data[i].price;
      } else if (data[i].price < lastPrice) {
        // Extend the low to the new minimum regardless of delta magnitude
        pivots[pivots.length - 1] = { date: data[i].date, timestamp: data[i].timestamp, price: data[i].price, direction: "low" };
        lastPrice = data[i].price;
      }
    } else if (lastDir === "low" && data[i].price < lastPrice) {
      // Price dipped lower within the current low swing but didn't cross -delta from lastPrice
      pivots[pivots.length - 1] = { date: data[i].date, timestamp: data[i].timestamp, price: data[i].price, direction: "low" };
      lastPrice = data[i].price;
    } else if (lastDir === "high" && data[i].price > lastPrice) {
      // Price pushed higher within the current high swing but didn't cross +delta from lastPrice
      pivots[pivots.length - 1] = { date: data[i].date, timestamp: data[i].timestamp, price: data[i].price, direction: "high" };
      lastPrice = data[i].price;
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
const FLOOR_VARIANCE_LIMIT = 0.02; // ±2%
const MIN_BOUNCE_PCT = 0.10; // ≥10%
const TIMEFRAME_OPTIONS = [
  { key: "1M", label: "1M", points: 21 },
  { key: "3M", label: "3M", points: 63 },
  { key: "6M", label: "6M", points: 126 },
] as const;

type TimeframeKey = (typeof TIMEFRAME_OPTIONS)[number]["key"];
type ModalTab = "analysis" | "gabo";

interface GaboFloor {
  price: number;
  date: string;
  bounce: number; // % gain to next peak
}

interface GaboResult {
  passed: boolean;
  floors: GaboFloor[];
  variance: number; // % range between min and max floor price
  avgFloor: number;
  avgBounce: number;
  failReason: string | null;
}

function runGaboFormula(pivots: Pivot[]): GaboResult | null {
  // Need at least 3 lows each followed by a high
  const lows = pivots.filter((p) => p.direction === "low");
  if (lows.length < 3) return null;

  // Take the 3 most recent lows
  const recentLows = lows.slice(-3);

  // For each low, find the immediately subsequent high in the full pivots array
  const floors: GaboFloor[] = [];
  for (const low of recentLows) {
    const lowIdx = pivots.findIndex((p) => p.timestamp === low.timestamp);
    const nextHigh = pivots.slice(lowIdx + 1).find((p) => p.direction === "high");
    if (!nextHigh) return null; // no subsequent high — can't measure bounce
    const bounce = (nextHigh.price - low.price) / low.price;
    floors.push({ price: low.price, date: low.date, bounce });
  }

  const prices = floors.map((f) => f.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const avgFloor = prices.reduce((a, b) => a + b, 0) / prices.length;
  // Variance = (max - min) / avg expressed as %
  const variance = (maxPrice - minPrice) / avgFloor;

  const avgBounce = floors.reduce((a, f) => a + f.bounce, 0) / floors.length;

  const variancePassed = variance <= FLOOR_VARIANCE_LIMIT;
  const bouncePassed = floors.every((f) => f.bounce >= MIN_BOUNCE_PCT);

  let failReason: string | null = null;
  if (!variancePassed && !bouncePassed) {
    failReason = `Floor variance ${(variance * 100).toFixed(1)}% exceeds ±2% limit and bounces below 10% requirement.`;
  } else if (!variancePassed) {
    failReason = `Floor variance ${(variance * 100).toFixed(1)}% exceeds the ±2% limit.`;
  } else if (!bouncePassed) {
    failReason = `Average bounce ${(avgBounce * 100).toFixed(1)}% is below the 10% requirement.`;
  }

  return {
    passed: variancePassed && bouncePassed,
    floors,
    variance,
    avgFloor,
    avgBounce,
    failReason,
  };
}

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
  isFollowed: boolean;
  onToggleFollow: () => void;
}

export default function StockModal({ stock, onClose, onPrevious, onNext, isFollowed, onToggleFollow }: Props) {
  const [history, setHistory] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiText, setGeminiText] = useState<string | null>(null);
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<TimeframeKey>("6M");
  const [activeTab, setActiveTab] = useState<ModalTab>("analysis");
  const [buyPrice, setBuyPrice] = useState("");
  const [sellLoading, setSellLoading] = useState(false);
  const [sellText, setSellText] = useState<string | null>(null);
  const [sellError, setSellError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchHistory(stock.ticker).then((data) => {
      setHistory(data);
      setLoading(false);
    });
  }, [stock.ticker]);

  useEffect(() => {
    setTimeframe("6M");
    setActiveTab("analysis");
    setGeminiText(null);
    setGeminiError(null);
    setSellText(null);
    setSellError(null);
    setBuyPrice("");
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
  const visibleTimestamps = new Set(visibleHistory.map((p) => p.timestamp));
  const visiblePivots = pivots.filter((p) => visibleTimestamps.has(p.timestamp));

  // Merge pivot markers into chart data, and add zigzag line values
  const pivotTimestamps = new Set(visiblePivots.map((p) => p.timestamp));
  const chartData: ChartPoint[] = visibleHistory.map((p) => {
    const pivot = visiblePivots.find((pv) => pv.timestamp === p.timestamp);
    return {
      ...p,
      zigzag: pivotTimestamps.has(p.timestamp) ? p.price : undefined,
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

  async function askSell() {
    const parsed = parseFloat(buyPrice);
    if (!buyPrice || isNaN(parsed) || parsed <= 0) return;
    setSellLoading(true);
    setSellText(null);
    setSellError(null);
    try {
      // Fetch live price before calling Gemini
      const quoteRes = await fetch(`/delta-swing/api/chart?ticker=${encodeURIComponent(stock.ticker)}`);
      const quoteJson = await quoteRes.json();
      const result = quoteJson?.chart?.result?.[0];
      const closes: number[] = result?.indicators?.quote?.[0]?.close ?? [];
      const livePrice = closes.filter(Boolean).at(-1) ?? currentPrice;

      const liveDistanceFromLow = lastLow
        ? ((livePrice - lastLow.price) / lastLow.price) * 100
        : distanceFromLow;

      const res = await fetch("/delta-swing/api/gemini-sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: stock.ticker,
          buyPrice: parsed,
          currentPrice: livePrice,
          pivots,
          distanceFromLow: liveDistanceFromLow,
          lastHigh,
          lastLow,
        }),
      });
      const data = await res.json();
      if (data.error) setSellError(data.error);
      else setSellText(data.analysis);
    } catch {
      setSellError("Failed to reach Gemini.");
    } finally {
      setSellLoading(false);
    }
  }

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

  const gaboResult = loading ? null : runGaboFormula(pivots);

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
              className="group inline-flex items-center gap-1 font-mono text-2xl font-bold text-slate-100 hover:text-indigo-400 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <span>{stock.ticker}</span>
              <span className="text-base leading-none text-slate-400 transition-colors group-hover:text-indigo-400">
                ↗
              </span>
            </a>
            <span className="font-mono text-lg text-slate-400">${currentPrice.toFixed(2)}</span>
            <StatusBadge isBuyZone={stock.is_buy_zone} />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleFollow}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                isFollowed
                  ? "border-amber-400/50 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
                  : "border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-600 hover:bg-slate-800"
              }`}
            >
              {isFollowed ? "Following" : "Follow"}
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
              aria-label="Close modal"
            >
              ✕
            </button>
          </div>
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

        {/* Tab bar */}
        <div className="flex border-b border-slate-700/60">
          <button
            type="button"
            onClick={() => setActiveTab("analysis")}
            className={`px-6 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${
              activeTab === "analysis"
                ? "border-b-2 border-indigo-500 text-indigo-400"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Signal Analysis
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("gabo")}
            className={`px-6 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${
              activeTab === "gabo"
                ? "border-b-2 border-indigo-500 text-indigo-400"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            The Gabo Formula
          </button>
        </div>

        {/* Signal Analysis Tab */}
        {activeTab === "analysis" && (
          <>
            <div className="px-6 py-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Should I Buy?
                </h3>
                <button
                  onClick={askGemini}
                  disabled={geminiLoading || loading}
                  className="flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-600/10 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-600/20 hover:text-indigo-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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

            <div className="border-t border-slate-700/60 px-6 py-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Should I Sell?
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-300">I bought at</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="$0.00"
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                  className="w-28 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                />
                <button
                  onClick={askSell}
                  disabled={sellLoading || loading || !buyPrice || isNaN(parseFloat(buyPrice)) || parseFloat(buyPrice) <= 0}
                  className="flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-600/10 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-600/20 hover:text-indigo-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {sellLoading ? (
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
              {sellError && <p className="mt-3 text-sm text-red-400">{sellError}</p>}
              {sellText && (
                <div className="mt-3 rounded-xl border border-indigo-500/20 bg-indigo-950/30 px-4 py-3 text-sm text-slate-300 leading-relaxed prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{sellText}</ReactMarkdown>
                </div>
              )}
            </div>
          </>
        )}

        {/* Gabo Formula Tab */}
        {activeTab === "gabo" && (
          <div className="px-6 py-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Triple Floor Volatility Algorithm
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  3 most recent troughs within ±2% of each other, each followed by a ≥10% bounce.
                </p>
              </div>
              {gaboResult && (
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                    gaboResult.passed
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      : "bg-red-500/15 text-red-400 border border-red-500/30"
                  }`}
                >
                  {gaboResult.passed ? "✓ Matched" : "✕ Rejected"}
                </span>
              )}
            </div>

            {loading && (
              <p className="text-sm text-slate-500">Loading chart data…</p>
            )}

            {!loading && !gaboResult && (
              <p className="text-sm text-slate-500">
                Not enough swing data — fewer than 3 troughs detected in the last 6 months.
              </p>
            )}

            {!loading && gaboResult && (
              <>
                {/* Floor table */}
                <div className="mb-4 overflow-hidden rounded-xl border border-slate-700/60">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/60 bg-slate-800/60">
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Floor</th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Date</th>
                        <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Price</th>
                        <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Bounce</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gaboResult.floors.map((f, i) => (
                        <tr key={i} className="border-b border-slate-700/40 last:border-0">
                          <td className="px-4 py-2.5 text-slate-400">#{i + 1}</td>
                          <td className="px-4 py-2.5 text-slate-300">{f.date}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-slate-300">${f.price.toFixed(2)}</td>
                          <td className={`px-4 py-2.5 text-right font-mono font-medium ${f.bounce >= MIN_BOUNCE_PCT ? "text-emerald-400" : "text-red-400"}`}>
                            +{(f.bounce * 100).toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Algorithm check */}
                <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 px-4 py-3 space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Algorithm Check</h4>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Avg Floor Price</span>
                    <span className="font-mono text-slate-200">${gaboResult.avgFloor.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Floor Variance</span>
                    <span className={`font-mono font-medium ${gaboResult.variance <= FLOOR_VARIANCE_LIMIT ? "text-emerald-400" : "text-red-400"}`}>
                      {(gaboResult.variance * 100).toFixed(2)}%
                      <span className="ml-1.5 text-xs text-slate-500">
                        ({gaboResult.variance <= FLOOR_VARIANCE_LIMIT ? "PASSED" : "FAILED"} ±2%)
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Avg Bounce</span>
                    <span className={`font-mono font-medium ${gaboResult.avgBounce >= MIN_BOUNCE_PCT ? "text-emerald-400" : "text-red-400"}`}>
                      {(gaboResult.avgBounce * 100).toFixed(1)}%
                      <span className="ml-1.5 text-xs text-slate-500">
                        ({gaboResult.avgBounce >= MIN_BOUNCE_PCT ? "PASSED" : "FAILED"} &gt;10%)
                      </span>
                    </span>
                  </div>
                </div>

                {gaboResult.failReason && (
                  <p className="mt-3 text-sm text-red-400">{gaboResult.failReason}</p>
                )}
              </>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-slate-700/60 px-6 py-3 text-xs text-slate-600">
          Last scanned {new Date(stock.last_updated).toLocaleString()} · ZigZag δ=5% · Buy zone ±2% of last trough
        </div>
      </div>
      </div>
    </div>
  );
}
