import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface StockRow {
  ticker: string;
  price: number;
  swings_count: number;
  is_buy_zone: boolean;
  gabo_signal: boolean;
  last_updated: string; // ISO 8601
}
