# Delta Swing — Setup Guide

> **Scanner config:** 180-day lookback · 10% ZigZag threshold · min 3 swings · NYSE + NASDAQ


## Part C: Infrastructure Setup

---

### 1. Supabase SQL Schema

Run this in the **Supabase SQL Editor** (`Database → SQL Editor → New query`):

```sql
-- Create the stocks table
create table if not exists public.stocks (
  ticker       text        primary key,
  price        numeric     not null,
  swings_count integer     not null default 0,
  is_buy_zone  boolean     not null default false,
  last_updated timestamptz not null default now()
);

-- Enable Row Level Security (RLS)
alter table public.stocks enable row level security;

-- Allow anonymous reads (for the Next.js dashboard using the anon key)
create policy "Allow public read"
  on public.stocks
  for select
  using (true);

-- Allow the service role to upsert (used by the Pi worker)
create policy "Allow service upsert"
  on public.stocks
  for all
  using (auth.role() = 'service_role');

-- Index for fast buy-zone queries
create index if not exists idx_stocks_buy_zone on public.stocks (is_buy_zone)
  where is_buy_zone = true;
```

---

### 2. Raspberry Pi — Worker Setup

```bash
# 1. Clone / copy the worker directory onto the Pi
cd ~/delta-swing/worker

# 2. Create a virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Set environment variables (add to ~/.bashrc or a .env file)
export SUPABASE_URL="https://xxxxxxxxxxxx.supabase.co"
export SUPABASE_KEY="your-service-role-key"   # use the service_role key, NOT the anon key

# 5. Test run
python scanner.py
```

#### Crontab — daily at 9:00 AM Israel time

```bash
# Open crontab editor
crontab -e
```

Add these lines (adjust the path as needed):

```
TZ=Asia/Jerusalem
0 9 * * * /home/pi/delta-swing/worker/.venv/bin/python /home/pi/delta-swing/worker/scanner.py >> /home/pi/delta-swing/worker/scanner.log 2>&1
```

The `TZ=Asia/Jerusalem` line sets the timezone for all jobs in the crontab, so the scanner runs at **09:00 Israel time** regardless of DST (Israel switches between UTC+2 and UTC+3).

---

### 3. Vercel — Dashboard Deployment

#### Environment Variables

In Vercel → Project → Settings → Environment Variables, add:

| Variable                    | Value                                     | Notes                          |
|-----------------------------|-------------------------------------------|--------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`  | `https://xxxxxxxxxxxx.supabase.co`        | Found in Supabase Project Settings |
| `NEXT_PUBLIC_SUPABASE_KEY`  | `your-anon-public-key`                    | Use the **anon** key here (public-safe) |

> **Security note:** The dashboard uses the `anon` key with RLS enforcing read-only access.  
> The Pi worker uses the `service_role` key set in its environment — never expose this in the frontend.

#### Deploy

```bash
cd dashboard
npm install
# push to GitHub, then import the repo in Vercel — it auto-detects Next.js
```

Or deploy directly with the Vercel CLI:

```bash
npx vercel --prod
```

---

### 4. Ticker Sources

The scanner automatically fetches both NYSE and NASDAQ tickers on startup from:

- `https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nyse/nyse_tickers.json`
- `https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nasdaq/nasdaq_tickers.json`

This pulls ~5,000+ symbols dynamically (duplicates are deduplicated). If either fetch fails, the scanner falls back to a hardcoded 50-ticker starter list.

The `ThreadPoolExecutor` with `MAX_WORKERS = 16` is tuned for the Pi 4/5's IO-bound workload. You may tune this value up or down depending on your Pi model.

---

### 5. Architecture Overview

```
Raspberry Pi (cron @ 9AM Israel time)
  └─ scanner.py
       ├─ yfinance → OHLC data (parallel, ThreadPoolExecutor)
       ├─ ZigZag algorithm → pivot detection
       └─ supabase-py → upsert to `stocks` table
                             │
                    Supabase PostgreSQL
                             │
                    Next.js on Vercel
                       └─ page.tsx (ISR, revalidate=60s)
                            └─ StocksTable → sortable, filterable, virtualized UI
```
