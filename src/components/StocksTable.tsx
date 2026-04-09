"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import StatusBadge from "./StatusBadge";
import StockModal from "./StockModal";
import type { StockRow } from "@/lib/supabase";

type SortKey = keyof Pick<StockRow, "ticker" | "price" | "swings_count">;
type SortDir = "asc" | "desc";

interface StocksTableProps {
  stocks: StockRow[];
}

const PAGE_SIZE = 50;
const FOLLOWED_STORAGE_KEY = "delta-swing-followed";

export default function StocksTable({ stocks }: StocksTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("swings_count");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filter, setFilter] = useState<"all" | "buy" | "followed">("all");
  const [minPrice, setMinPrice] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<StockRow | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [followedTickers, setFollowedTickers] = useState<Set<string>>(new Set());
  const sentinelRef = useRef<HTMLDivElement>(null);
  const minPriceValue = Number(minPrice);
  const hasMinPriceFilter = minPrice.trim() !== "" && Number.isFinite(minPriceValue) && minPriceValue > 0;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(FOLLOWED_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setFollowedTickers(new Set(parsed.filter((value): value is string => typeof value === "string")));
      }
    } catch {
      window.localStorage.removeItem(FOLLOWED_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      FOLLOWED_STORAGE_KEY,
      JSON.stringify(Array.from(followedTickers).sort())
    );
  }, [followedTickers]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const visible = stocks
    .filter((s) => {
      if (filter === "buy") return s.is_buy_zone;
      if (filter === "followed") return followedTickers.has(s.ticker);
      return true;
    })
    .filter((s) => !hasMinPriceFilter || s.price >= minPriceValue)
    .filter((s) => !search || s.ticker.toUpperCase() === search.toUpperCase() || s.ticker.toUpperCase().startsWith(search.toUpperCase()))
    .sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
  const buySignalsTotal = stocks.filter((s) => s.is_buy_zone).length;
  const baseCount = filter === "buy" ? buySignalsTotal : stocks.length;
  const countLabel = filter === "buy" ? "Buy Signal stocks" : "stocks";

  const page = visible.slice(0, limit);
  const hasMore = limit < visible.length;
  const selectedIndex = selected
    ? visible.findIndex((stock) => stock.ticker === selected.ticker)
    : -1;
  const canSelectPrevious = selectedIndex > 0;
  const canSelectNext = selectedIndex >= 0 && selectedIndex < visible.length - 1;

  // Reset limit when filters/sort change
  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [filter, hasMinPriceFilter, minPriceValue, search, sortKey, sortDir]);

  useEffect(() => {
    if (!selected) return;

    const nextSelected = visible.find((stock) => stock.ticker === selected.ticker);
    if (!nextSelected) {
      setSelected(null);
      return;
    }

    if (nextSelected !== selected) {
      setSelected(nextSelected);
    }
  }, [selected, visible]);

  const loadMore = useCallback(() => {
    setLimit((l) => l + PAGE_SIZE);
  }, []);

  const toggleFollow = useCallback((ticker: string) => {
    setFollowedTickers((current) => {
      const next = new Set(current);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  }, []);

  const selectStockAtIndex = useCallback((index: number) => {
    const nextStock = visible[index];
    if (!nextStock) return;

    setSelected(nextStock);
    setLimit((currentLimit) => Math.max(currentLimit, index + 1));
  }, [visible]);

  const handleSelectPrevious = useCallback(() => {
    if (selectedIndex <= 0) return;
    selectStockAtIndex(selectedIndex - 1);
  }, [selectStockAtIndex, selectedIndex]);

  const handleSelectNext = useCallback(() => {
    if (selectedIndex < 0 || selectedIndex >= visible.length - 1) return;
    selectStockAtIndex(selectedIndex + 1);
  }, [selectStockAtIndex, selectedIndex, visible.length]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, hasMore]);

  const SortIcon = ({ col }: { col: SortKey }) => (
    <span className="ml-1 text-slate-500">
      {sortKey === col ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
    </span>
  );

  const thClass =
    "cursor-pointer select-none px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-colors";

  return (
    <div className="space-y-3">
      {selected && (
        <StockModal
          stock={selected}
          onClose={() => setSelected(null)}
          onPrevious={canSelectPrevious ? handleSelectPrevious : undefined}
          onNext={canSelectNext ? handleSelectNext : undefined}
          isFollowed={followedTickers.has(selected.ticker)}
          onToggleFollow={() => toggleFollow(selected.ticker)}
        />
      )}

      {/* Controls */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === "all"
                ? "bg-indigo-600 text-white"
                : "bg-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            All ({stocks.length})
          </button>
          <button
            onClick={() => setFilter("buy")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === "buy"
                ? "bg-emerald-600 text-white"
                : "bg-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            Buy Signals ({stocks.filter((s) => s.is_buy_zone).length})
          </button>
          <button
            onClick={() => setFilter("followed")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === "followed"
                ? "bg-amber-500 text-slate-950"
                : "bg-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            Following ({followedTickers.size})
          </button>
        </div>
        <div className="flex gap-2 sm:ml-auto">
          <label className="flex w-28 shrink-0 items-center gap-2 rounded-full border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-400 transition-colors focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 sm:w-auto sm:px-4">
            <span>Min $</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-right text-slate-200 outline-none placeholder-slate-500 sm:w-20 sm:flex-none"
            />
          </label>
          <input
            type="text"
            placeholder="Search ticker…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 flex-1 rounded-full border border-slate-700 bg-slate-800 px-4 py-1.5 text-sm text-slate-200 placeholder-slate-500 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:w-44 sm:flex-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-1 text-sm text-slate-500">
        <span>
          Showing <span className="text-slate-300">{visible.length}</span> of{" "}
          <span className="text-slate-300">{baseCount}</span> {countLabel}
        </span>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-xl border border-slate-700/60 bg-slate-900/60 backdrop-blur-sm md:block">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="border-b border-slate-700/60 bg-slate-800/40">
            <tr>
              <th className={`${thClass} w-[13rem]`} onClick={() => handleSort("ticker")}>
                <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-3">
                  <span aria-hidden="true" />
                  <span>
                    Ticker <SortIcon col="ticker" />
                  </span>
                </div>
              </th>
              <th className={thClass} onClick={() => handleSort("price")}>
                Price <SortIcon col="price" />
              </th>
              <th className={thClass} onClick={() => handleSort("swings_count")}>
                Swings <SortIcon col="swings_count" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                Updated
              </th>
            </tr>
          </thead>
          <tbody className="[&>tr+tr>td]:border-t [&>tr+tr>td]:border-slate-800/60">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                  No stocks match the current filter.
                </td>
              </tr>
            ) : (
              page.map((stock) => (
                <tr
                  key={stock.ticker}
                  onClick={() => setSelected(stock)}
                  className={`cursor-pointer transition-colors hover:bg-slate-800/40 ${
                    stock.is_buy_zone ? "bg-emerald-950/10" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFollow(stock.ticker);
                        }}
                        aria-label={followedTickers.has(stock.ticker) ? `Unfollow ${stock.ticker}` : `Follow ${stock.ticker}`}
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-sm transition-colors ${
                          followedTickers.has(stock.ticker)
                            ? "border-amber-400/50 bg-amber-500/15 text-amber-300"
                            : "border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300"
                        }`}
                      >
                        ★
                      </button>
                      <span className="font-mono font-bold text-slate-100">
                        {stock.ticker}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-300">
                    ${stock.price.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600/20 text-xs font-bold text-indigo-300">
                      {stock.swings_count}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge isBuyZone={stock.is_buy_zone} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(stock.last_updated).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="space-y-2 md:hidden">
        {visible.length === 0 ? (
          <p className="py-12 text-center text-slate-500">No stocks match the current filter.</p>
        ) : (
          page.map((stock) => (
            <button
              key={stock.ticker}
              onClick={() => setSelected(stock)}
              className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                stock.is_buy_zone
                  ? "border-emerald-700/40 bg-emerald-950/20 hover:bg-emerald-950/30"
                  : "border-slate-700/60 bg-slate-900/60 hover:bg-slate-800/60"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFollow(stock.ticker);
                    }}
                    aria-label={followedTickers.has(stock.ticker) ? `Unfollow ${stock.ticker}` : `Follow ${stock.ticker}`}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm transition-colors ${
                      followedTickers.has(stock.ticker)
                        ? "border-amber-400/50 bg-amber-500/15 text-amber-300"
                        : "border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300"
                    }`}
                  >
                    ★
                  </button>
                  <span className="font-mono text-base font-bold text-slate-100">
                    {stock.ticker}
                  </span>
                </div>
                <StatusBadge isBuyZone={stock.is_buy_zone} />
              </div>
              <div className="mt-1.5 flex items-center gap-4 text-sm text-slate-400">
                <span className="font-mono text-slate-300">${stock.price.toFixed(2)}</span>
                <span>
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600/20 text-xs font-bold text-indigo-300">
                    {stock.swings_count}
                  </span>
                  <span className="ml-1">swings</span>
                </span>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Scroll sentinel */}
      {hasMore && <div ref={sentinelRef} className="h-1" />}
    </div>
  );
}
