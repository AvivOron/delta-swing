"""
Delta Swing Scanner — Raspberry Pi Worker
Scans NYSE tickers for ZigZag swing patterns and upserts results to Supabase.
"""

import os
import logging
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

import pandas as pd
import yfinance as yf
from supabase import create_client

# ── Configuration ────────────────────────────────────────────────────────────
SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_KEY: str = os.environ["SUPABASE_KEY"]

DELTA: float = 0.10          # 10% swing threshold
MIN_OCCURRENCES: int = 3     # minimum qualifying swings
LOOKBACK_DAYS: int = 30      # calendar days of history to fetch
BUY_ZONE_TOLERANCE: float = 0.02  # within 2% of last pivot low
MAX_WORKERS: int = 8         # tune for Pi 4/5 core count

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ── Starter ticker list (replace with full NYSE fetch — see bottom) ───────────
TICKERS: list[str] = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "NVDA", "JPM", "BAC",
    "WFC", "GS", "MS", "C", "USB", "PNC", "TFC", "COF", "AXP", "V", "MA",
    "UNH", "JNJ", "PFE", "MRK", "ABBV", "LLY", "BMY", "AMGN", "GILD", "CVS",
    "XOM", "CVX", "COP", "SLB", "HAL", "BKR", "MPC", "VLO", "PSX", "OXY",
    "WMT", "HD", "TGT", "COST", "LOW", "NKE", "SBUX", "MCD", "YUM", "DRI",
]

# ── To scan the full NYSE, uncomment the two lines below and comment out
# the TICKERS list above:
#
# _df = pd.read_csv("https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nyse/nyse_full_tickers.csv")
# TICKERS = _df["Symbol"].dropna().str.strip().tolist()


# ── ZigZag calculation ────────────────────────────────────────────────────────
def calculate_zigzag(closes: pd.Series, delta: float) -> list:
    """
    Return a list of pivot dicts: {"index": int, "price": float, "direction": str}
    direction is "high" (peak) or "low" (trough).
    """
    if len(closes) < 2:
        return []

    prices = closes.values
    pivots = []
    last_pivot_price = prices[0]
    last_direction = None  # "high" or "low"

    for i in range(1, len(prices)):
        p = prices[i]
        change = (p - last_pivot_price) / last_pivot_price

        if change >= delta:
            if last_direction != "high":
                pivots.append({"index": i, "price": p, "direction": "high"})
                last_direction = "high"
                last_pivot_price = p
            elif p > last_pivot_price:
                # extend the existing peak
                pivots[-1] = {"index": i, "price": p, "direction": "high"}
                last_pivot_price = p

        elif change <= -delta:
            if last_direction != "low":
                pivots.append({"index": i, "price": p, "direction": "low"})
                last_direction = "low"
                last_pivot_price = p
            elif p < last_pivot_price:
                # extend the existing trough
                pivots[-1] = {"index": i, "price": p, "direction": "low"}
                last_pivot_price = p

    return pivots


# ── Per-ticker analysis ───────────────────────────────────────────────────────
def analyze_ticker(ticker: str):
    """
    Fetch data, compute ZigZag, and return a result dict or None.
    """
    try:
        df = yf.download(
            ticker,
            period=f"{LOOKBACK_DAYS}d",
            interval="1d",
            progress=False,
            auto_adjust=True,
        )
        if df.empty or len(df) < 5:
            return None

        closes = df["Close"].dropna().squeeze()
        if isinstance(closes, pd.DataFrame):
            closes = closes.iloc[:, 0]

        pivots = calculate_zigzag(closes, DELTA)

        if len(pivots) < MIN_OCCURRENCES:
            return None

        current_price = float(closes.iloc[-1])

        # Identify the most recent pivot low
        last_low = next(
            (p for p in reversed(pivots) if p["direction"] == "low"), None
        )
        is_buy_zone = False
        if last_low:
            distance = (current_price - last_low["price"]) / last_low["price"]
            is_buy_zone = 0 <= distance <= BUY_ZONE_TOLERANCE

        return {
            "ticker": ticker,
            "price": round(current_price, 4),
            "swings_count": len(pivots),
            "is_buy_zone": is_buy_zone,
            "last_updated": datetime.now(timezone.utc).isoformat(),
        }

    except Exception as exc:
        log.warning("%-6s  error: %s", ticker, exc)
        return None


# ── Supabase upsert ───────────────────────────────────────────────────────────
def upsert_results(client, rows: list) -> None:
    if not rows:
        log.info("No matching stocks to upsert.")
        return

    response = (
        client.table("stocks")
        .upsert(rows, on_conflict="ticker")
        .execute()
    )
    log.info("Upserted %d row(s) → Supabase.", len(rows))
    if hasattr(response, "error") and response.error:
        log.error("Supabase error: %s", response.error)


# ── Main ──────────────────────────────────────────────────────────────────────
def main() -> None:
    log.info("Delta Swing Scanner starting — %d tickers", len(TICKERS))
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    results = []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(analyze_ticker, t): t for t in TICKERS}
        for future in as_completed(futures):
            ticker = futures[future]
            try:
                result = future.result()
                if result:
                    results.append(result)
                    log.info(
                        "%-6s  $%-8.2f  swings=%d  buy_zone=%s",
                        result["ticker"],
                        result["price"],
                        result["swings_count"],
                        result["is_buy_zone"],
                    )
            except Exception as exc:
                log.warning("%-6s  unhandled error: %s", ticker, exc)

    upsert_results(supabase, results)
    log.info("Scan complete. %d/%d matched.", len(results), len(TICKERS))


if __name__ == "__main__":
    main()
