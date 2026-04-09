# Delta Swing

A free US stock scanner that detects ZigZag swing patterns across NYSE and NASDAQ. Surfaces potential buy signals when a stock bounces off recent support.

**Live at:** [avivo.dev/delta-swing](https://avivo.dev/delta-swing)

---

## What it does

- Scans 5,000+ NYSE & NASDAQ stocks daily
- Detects ZigZag patterns: alternating price moves of ±10% or more over the last 180 days
- A stock qualifies with at least 3 such swings
- A **Buy Signal** is raised when the current price is within 2% above the most recent trough
- AI analysis powered by Gemini

---

## Architecture

```
Raspberry Pi (cron @ 9AM Israel time)
  └─ worker/scanner.py
       ├─ Fetches NYSE + NASDAQ tickers dynamically
       ├─ Yahoo Finance → daily OHLC data (parallel, ThreadPoolExecutor)
       ├─ ZigZag algorithm → pivot detection
       └─ supabase-py → upsert to `stocks` table
                             │
                    Supabase PostgreSQL
                             │
                    Next.js on Vercel
                       └─ page.tsx (ISR, revalidate=60s)
                            └─ StocksTable → sortable, filterable, virtualized UI
```

---

## Scanner config

| Parameter | Value |
|---|---|
| Lookback window | 180 days |
| ZigZag threshold | 10% |
| Minimum swings | 3 |
| Buy zone tolerance | within 2% of last trough |
| Exchanges | NYSE + NASDAQ |
| Schedule | Daily at 09:00 Israel time |

---

## Tech stack

- **Frontend:** Next.js (App Router), Tailwind CSS, deployed on Vercel
- **Database:** Supabase (PostgreSQL)
- **Worker:** Python, runs on a Raspberry Pi via cron
- **Data source:** Yahoo Finance (via `requests`)
- **AI:** Google Gemini

---

## Setup

See [SETUP.md](SETUP.md) for full infrastructure setup instructions (Supabase schema, Pi worker, Vercel deployment).
