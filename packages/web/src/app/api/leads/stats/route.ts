import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_KEY');
  return createClient(url, key);
}

export async function GET() {
  const supabase = getSupabase();

  const { data: leads, error } = await supabase
    .from('leads')
    .select('trade_category, qualification_score, email, phone, status, outreach_status, city, state');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = leads || [];

  // By trade
  const tradeMap = new Map<string, { count: number; totalScore: number; withEmail: number; withPhone: number }>();
  const statusMap = new Map<string, number>();
  const cityMap = new Map<string, { count: number; state: string | null }>();

  for (const lead of rows) {
    // Trade stats
    const t = tradeMap.get(lead.trade_category) || { count: 0, totalScore: 0, withEmail: 0, withPhone: 0 };
    t.count++;
    t.totalScore += lead.qualification_score || 0;
    if (lead.email) t.withEmail++;
    if (lead.phone) t.withPhone++;
    tradeMap.set(lead.trade_category, t);

    // Status stats
    statusMap.set(lead.status || 'new', (statusMap.get(lead.status || 'new') || 0) + 1);

    // City stats
    const cityKey = lead.city || 'Unknown';
    const c = cityMap.get(cityKey) || { count: 0, state: lead.state };
    c.count++;
    cityMap.set(cityKey, c);
  }

  const byTrade = [...tradeMap.entries()].map(([trade, data]) => ({
    trade,
    count: data.count,
    avg_score: data.count > 0 ? Math.round(data.totalScore / data.count) : 0,
    with_email: data.withEmail,
    with_phone: data.withPhone,
  })).sort((a, b) => b.count - a.count);

  const byStatus = [...statusMap.entries()].map(([status, count]) => ({ status, count }));

  const byCity = [...cityMap.entries()].map(([city, data]) => ({
    city,
    state: data.state,
    count: data.count,
  })).sort((a, b) => b.count - a.count);

  return NextResponse.json({
    total: rows.length,
    byTrade,
    byStatus,
    byCity,
  });
}
