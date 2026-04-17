"""
Delta Swing Scanner — Raspberry Pi Worker
Scans NYSE and NASDAQ tickers for ZigZag swing patterns and upserts results to Supabase.
"""

import os
import logging
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
import pandas as pd
from supabase import create_client

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
}
SESSION = requests.Session()
SESSION.headers.update(HEADERS)
# Keep pool size in sync with MAX_WORKERS to avoid "pool is full" warnings
_adapter = requests.adapters.HTTPAdapter(pool_connections=20, pool_maxsize=20)
SESSION.mount("https://", _adapter)


def fetch_closes(ticker: str, days: int) -> pd.Series:
    """Fetch daily closes from Yahoo Finance v8 chart API."""
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
        f"?interval=1d&range={days}d"
    )
    r = SESSION.get(url, timeout=15)
    r.raise_for_status()
    data = r.json()
    result = data["chart"]["result"][0]
    timestamps = result["timestamp"]
    closes = result["indicators"]["quote"][0]["close"]
    series = pd.Series(closes, index=pd.to_datetime(timestamps, unit="s"))
    return series.dropna()

# ── Configuration ────────────────────────────────────────────────────────────
SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_KEY: str = os.environ["SUPABASE_KEY"]

DELTA: float = 0.05          # 5% swing threshold
MIN_OCCURRENCES: int = 3     # minimum qualifying swings
LOOKBACK_DAYS: int = 180     # calendar days of history to fetch
BUY_ZONE_TOLERANCE: float = 0.02  # within 2% of last pivot low
MAX_WORKERS: int = 16        # tune for Pi 4/5 — IO-bound so can exceed core count
GABO_FLOOR_VARIANCE: float = 0.03  # ±3% max spread between the 3 floor prices
GABO_MIN_BOUNCE: float = 0.08      # each floor must bounce ≥8% to next peak
MIN_MARKET_CAP: int = 1_000_000_000  # $1B minimum market cap

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ── Full NYSE + NASDAQ ticker list ───────────────────────────────────────────
def _fetch_tickers(url: str) -> list:
    r = SESSION.get(url, timeout=15)
    r.raise_for_status()
    return [
        t.strip() for t in r.json()
        if isinstance(t, str) and t.strip() and "^" not in t and "/" not in t
    ]

try:
    nyse = _fetch_tickers(
        "https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nyse/nyse_tickers.json"
    )
    nasdaq = _fetch_tickers(
        "https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nasdaq/nasdaq_tickers.json"
    )
    TICKERS = list(dict.fromkeys(nyse + nasdaq))  # dedupe, preserve order
    log.info("Loaded %d tickers (NYSE + NASDAQ) from remote.", len(TICKERS))
except Exception as _e:
    log.warning("Could not fetch tickers (%s), falling back to starter list.", _e)
    TICKERS = [
        "AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "NVDA", "JPM", "BAC",
        "WFC", "GS", "MS", "C", "USB", "PNC", "TFC", "COF", "AXP", "V", "MA",
        "UNH", "JNJ", "PFE", "MRK", "ABBV", "LLY", "BMY", "AMGN", "GILD", "CVS",
        "XOM", "CVX", "COP", "SLB", "HAL", "BKR", "MPC", "VLO", "PSX", "OXY",
        "WMT", "HD", "TGT", "COST", "LOW", "NKE", "SBUX", "MCD", "YUM", "DRI",
    ]


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
                pivots[-1] = {"index": i, "price": p, "direction": "high"}
                last_pivot_price = p

        elif change <= -delta:
            if last_direction != "low":
                pivots.append({"index": i, "price": p, "direction": "low"})
                last_direction = "low"
                last_pivot_price = p
            elif p < last_pivot_price:
                pivots[-1] = {"index": i, "price": p, "direction": "low"}
                last_pivot_price = p

        elif last_direction == "low" and p < last_pivot_price:
            # dipped lower within current low swing without crossing -delta from last_pivot_price
            pivots[-1] = {"index": i, "price": p, "direction": "low"}
            last_pivot_price = p

        elif last_direction == "high" and p > last_pivot_price:
            # pushed higher within current high swing without crossing +delta from last_pivot_price
            pivots[-1] = {"index": i, "price": p, "direction": "high"}
            last_pivot_price = p

    return pivots


# ── Gabo Formula ─────────────────────────────────────────────────────────────
def check_gabo_formula(pivots: list) -> bool:
    """
    Triple Floor Volatility Algorithm:
    - Take the 3 most recent pivot lows.
    - Their prices must be within ±2% of each other (variance ≤ 2%).
    - Each low must be followed immediately by a pivot high that is ≥10% above it.
    Returns True if all conditions pass.
    """
    lows = [p for p in pivots if p["direction"] == "low"]
    if len(lows) < 3:
        return False

    recent_lows = lows[-3:]

    floors = []
    for low in recent_lows:
        low_idx = next(i for i, p in enumerate(pivots) if p["index"] == low["index"])
        next_high = next(
            (p for p in pivots[low_idx + 1:] if p["direction"] == "high"), None
        )
        if next_high is None:
            return False
        bounce = (next_high["price"] - low["price"]) / low["price"]
        if bounce < GABO_MIN_BOUNCE:
            return False
        floors.append(low["price"])

    avg_floor = sum(floors) / len(floors)
    variance = (max(floors) - min(floors)) / avg_floor
    return variance <= GABO_FLOOR_VARIANCE


# ── Per-ticker analysis ───────────────────────────────────────────────────────
def analyze_ticker(ticker: str):
    """
    Fetch data, compute ZigZag, and return a result dict or None.
    """
    try:
        info_res = SESSION.get(
            f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{ticker}?modules=summaryDetail",
            timeout=15,
        )
        if info_res.status_code == 200:
            market_cap = (
                info_res.json()
                .get("quoteSummary", {})
                .get("result", [{}])[0]
                .get("summaryDetail", {})
                .get("marketCap", {})
                .get("raw", 0)
            )
            if market_cap and market_cap < MIN_MARKET_CAP:
                return None

        closes = fetch_closes(ticker, LOOKBACK_DAYS)
        if len(closes) < 5:
            return None

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
            is_buy_zone = bool(0 <= distance <= BUY_ZONE_TOLERANCE)

        gabo_signal = check_gabo_formula(pivots)

        return {
            "ticker": ticker,
            "price": round(float(current_price), 4),
            "swings_count": int(len(pivots)),
            "is_buy_zone": bool(is_buy_zone),
            "gabo_signal": bool(gabo_signal),
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
        .upsert(rows)
        .execute()
    )
    log.info("Upserted %d row(s) → Supabase.", len(rows))
    if hasattr(response, "error") and response.error:
        log.error("Supabase error: %s", response.error)


# ── Main ──────────────────────────────────────────────────────────────────────
def clear_table(client) -> None:
    """Delete all rows before each run so stale tickers don't persist."""
    client.table("stocks").delete().neq("ticker", "").execute()
    log.info("Cleared stocks table.")


def main() -> None:
    log.info("Delta Swing Scanner starting — %d tickers", len(TICKERS))
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    clear_table(supabase)
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
                        "%-6s  $%-8.2f  swings=%d  buy_zone=%s  gabo=%s",
                        result["ticker"],
                        result["price"],
                        result["swings_count"],
                        result["is_buy_zone"],
                        result["gabo_signal"],
                    )
            except Exception as exc:
                log.warning("%-6s  unhandled error: %s", ticker, exc)

    upsert_results(supabase, results)
    log.info("Scan complete. %d/%d matched.", len(results), len(TICKERS))


if __name__ == "__main__":
    main()
