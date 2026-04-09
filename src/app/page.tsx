import { supabase, type StockRow } from "@/lib/supabase";
import StocksTable from "@/components/StocksTable";

// Revalidate every 60 seconds on Vercel so the page auto-refreshes data
export const revalidate = 60;

async function getStocks(): Promise<StockRow[]> {
  const PAGE = 1000;
  const all: StockRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("stocks")
      .select("ticker, price, swings_count, is_buy_zone, last_updated")
      .order("swings_count", { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) {
      console.error("Supabase fetch error:", error.message);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...(data as StockRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return all;
}

export default async function HomePage() {
  const stocks = await getStocks();

  // Derive the most recent scan timestamp across all rows
  const lastScanned =
    stocks.length > 0
      ? stocks.reduce((latest, s) =>
          s.last_updated > latest.last_updated ? s : latest
        ).last_updated
      : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      {/* ── Header ── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">
          Delta Swing
          <span className="ml-2 text-indigo-400">Pattern Finder</span>
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-sm text-slate-400">
            NYSE ZigZag swing scanner
          </p>
          <span className="text-slate-600">·</span>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
            <span className="text-slate-500">
              {lastScanned
                ? new Date(lastScanned).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "No data yet"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Logic explanation ── */}
      <div className="mb-6 rounded-xl border border-slate-700/50 bg-slate-800/30 px-4 py-3 text-sm text-slate-400 leading-relaxed">
        Scans every NYSE stock for a <span className="text-slate-200">ZigZag swing pattern</span> — a series of price moves of{" "}
        <span className="text-slate-200">±5% or more</span> in alternating directions over the last{" "}
        <span className="text-slate-200">90 days</span>. A stock appears here if it has at least{" "}
        <span className="text-slate-200">2 such swings</span>. A{" "}
        <span className="text-emerald-400 font-medium">Buy Signal</span> is raised when the current price is within{" "}
        <span className="text-slate-200">2%</span> above the most recent trough — suggesting a potential bounce from support.
      </div>

      {/* ── Stats strip ── */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard
          label="Stocks scanned"
          value={stocks.length.toString()}
          accent="indigo"
        />
        <StatCard
          label="Buy signals"
          value={stocks.filter((s) => s.is_buy_zone).length.toString()}
          accent="emerald"
        />
        <StatCard
          label="Avg. swings"
          value={
            stocks.length
              ? (
                  stocks.reduce((s, r) => s + r.swings_count, 0) / stocks.length
                ).toFixed(1)
              : "—"
          }
          accent="violet"
        />
      </div>

      {/* ── Table ── */}
      <StocksTable stocks={stocks} />

      {/* ── Footer ── */}
      <p className="mt-8 text-center text-xs text-slate-600">
        Updated daily by Raspberry Pi
      </p>
    </main>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "indigo" | "emerald" | "violet";
}) {
  const colors = {
    indigo: "text-indigo-400 bg-indigo-600/10 ring-indigo-500/20",
    emerald: "text-emerald-400 bg-emerald-600/10 ring-emerald-500/20",
    violet: "text-violet-400 bg-violet-600/10 ring-violet-500/20",
  };
  return (
    <div
      className={`rounded-xl p-4 ring-1 ${colors[accent]} flex flex-col gap-1`}
    >
      <span className="text-xs font-medium uppercase tracking-wider opacity-70">
        {label}
      </span>
      <span className="text-3xl font-bold">{value}</span>
    </div>
  );
}
