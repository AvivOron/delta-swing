"use client";

import { useState } from "react";
import StatusBadge from "./StatusBadge";
import StockModal from "./StockModal";
import type { StockRow } from "@/lib/supabase";

type SortKey = keyof Pick<StockRow, "ticker" | "price" | "swings_count">;
type SortDir = "asc" | "desc";

interface StocksTableProps {
  stocks: StockRow[];
}

export default function StocksTable({ stocks }: StocksTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("swings_count");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filter, setFilter] = useState<"all" | "buy">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<StockRow | null>(null);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const visible = stocks
    .filter((s) => filter === "all" || s.is_buy_zone)
    .filter((s) => !search || s.ticker.toUpperCase().includes(search.toUpperCase()))
    .sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });

  const SortIcon = ({ col }: { col: SortKey }) => (
    <span className="ml-1 text-slate-500">
      {sortKey === col ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
    </span>
  );

  const thClass =
    "cursor-pointer select-none px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-colors";

  return (
    <div className="space-y-4">
      {selected && (
        <StockModal stock={selected} onClose={() => setSelected(null)} />
      )}
      {/* Filter + Search */}
      <div className="flex flex-wrap items-center gap-2">
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
        <input
          type="text"
          placeholder="Search ticker…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto rounded-full border border-slate-700 bg-slate-800 px-4 py-1.5 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors w-40"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-700/60 bg-slate-900/60 backdrop-blur-sm">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-slate-700/60 bg-slate-800/40">
            <tr>
              <th className={thClass} onClick={() => handleSort("ticker")}>
                Ticker <SortIcon col="ticker" />
              </th>
              <th className={thClass} onClick={() => handleSort("price")}>
                Price <SortIcon col="price" />
              </th>
              <th className={thClass} onClick={() => handleSort("swings_count")}>
                Swings Found <SortIcon col="swings_count" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                Last Updated
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                  No stocks match the current filter.
                </td>
              </tr>
            ) : (
              visible.map((stock) => (
                <tr
                  key={stock.ticker}
                  onClick={() => setSelected(stock)}
                  className={`cursor-pointer transition-colors hover:bg-slate-800/40 ${
                    stock.is_buy_zone ? "bg-emerald-950/10" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-mono font-bold text-slate-100">
                    {stock.ticker}
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
    </div>
  );
}
