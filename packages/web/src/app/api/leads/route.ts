import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_KEY');
  return createClient(url, key);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const supabase = getSupabase();

  let query = supabase.from('leads').select('*', { count: 'exact' });

  // Apply filters from query params
  const city = searchParams.get('city');
  const state = searchParams.get('state');
  const trade = searchParams.get('trade');
  const status = searchParams.get('status');
  const outreachStatus = searchParams.get('outreach_status');
  const minScore = searchParams.get('min_score');
  const limit = parseInt(searchParams.get('limit') || '200');
  const offset = parseInt(searchParams.get('offset') || '0');

  if (city) query = query.eq('city', city);
  if (state) query = query.eq('state', state);
  if (trade) query = query.eq('trade_category', trade);
  if (status) query = query.eq('status', status);
  if (outreachStatus) query = query.eq('outreach_status', outreachStatus);
  if (minScore) query = query.gte('qualification_score', parseInt(minScore));

  query = query
    .order('qualification_score', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ leads: data || [], total: count || 0 });
}
