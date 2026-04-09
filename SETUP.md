# Delta Swing — Setup Guide

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

#### Crontab — daily at 9:00 AM

```bash
# Open crontab editor
crontab -e
```

Add this line (adjust the path as needed):

```
0 9 * * * /home/pi/delta-swing/worker/.venv/bin/python /home/pi/delta-swing/worker/scanner.py >> /home/pi/delta-swing/worker/scanner.log 2>&1
```

This runs the scanner every day at **09:00**, and appends all output to `scanner.log`.

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

### 4. Pro-Tip: Full NYSE Scan

Once you've confirmed your Supabase connection works with the 50-ticker starter list,
replace the `TICKERS` list at the top of `scanner.py` with:

```python
import pandas as pd
_df = pd.read_csv(
    "https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nyse/nyse_full_tickers.csv"
)
TICKERS = _df["Symbol"].dropna().str.strip().tolist()
```

This pulls ~3,000 NYSE symbols dynamically. The `ThreadPoolExecutor` with
`MAX_WORKERS = 8` is already tuned for the Pi 4/5's quad-core with hyperthreading.
You may bump it to 12–16 on a Pi 5 if you want faster throughput.

---

### 5. Architecture Overview

```
Raspberry Pi (cron @ 9AM)
  └─ scanner.py
       ├─ yfinance → OHLC data (parallel, ThreadPoolExecutor)
       ├─ ZigZag algorithm → pivot detection
       └─ supabase-py → upsert to `stocks` table
                             │
                    Supabase PostgreSQL
                             │
                    Next.js on Vercel
                       └─ page.tsx (ISR, revalidate=60s)
                            └─ StocksTable → sortable, filterable UI
```
