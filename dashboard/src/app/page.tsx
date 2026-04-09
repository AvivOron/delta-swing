import { supabase, type StockRow } from "@/lib/supabase";
import StocksTable from "@/components/StocksTable";

// Revalidate every 60 seconds on Vercel so the page auto-refreshes data
export const revalidate = 60;

async function getStocks(): Promise<StockRow[]> {
  const { data, error } = await supabase
    .from("stocks")
    .select("ticker, price, swings_count, is_buy_zone, last_updated")
    .order("swings_count", { ascending: false });

  if (error) {
    console.error("Supabase fetch error:", error.message);
    return [];
  }
  return (data as StockRow[]) ?? [];
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
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">
            Delta Swing
            <span className="ml-2 text-indigo-400">Pattern Finder</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            NYSE stocks with ≥3 ZigZag swings ±10% in the last 30 days
          </p>
        </div>

        {/* Last scanned pill */}
        <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/60 px-4 py-2 text-sm">
          <span className="h-2 w-2 rounded-full bg-indigo-400" />
          <span className="text-slate-400">Last scanned:</span>
          <span className="font-medium text-slate-200">
            {lastScanned
              ? new Date(lastScanned).toLocaleString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "No data yet"}
          </span>
        </div>
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
        Data fetched by Raspberry Pi worker · Stored in Supabase · Refreshes
        every 60 s on Vercel
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
