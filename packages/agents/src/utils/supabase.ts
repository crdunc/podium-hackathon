// ============================================================
// Supabase Client
// Primary storage backend for leads. Supabase is required.
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { StoredLead } from '@podium/shared';
import { log } from './logger';

const AGENT_NAME = 'Supabase';

let client: SupabaseClient | null = null;

export function getClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  // Prefer service role key (bypasses RLS) for backend agents
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env. ' +
      'Get them from your Supabase project settings.'
    );
  }

  client = createClient(url, key);
  return client;
}

/** Upsert leads to Supabase. Returns count of rows upserted. */
export async function upsertLeads(leads: StoredLead[], city: string): Promise<number> {
  const supabase = getClient();

  // Split "Detroit, MI" → city="Detroit", state="MI"
  function splitCityState(raw: string): { city: string; state: string | null } {
    if (raw.includes(',')) {
      const parts = raw.split(',').map(s => s.trim());
      return { city: parts[0], state: parts[1] || null };
    }
    return { city: raw, state: null };
  }

  const rows = leads.map(lead => {
    const location = splitCityState(city);
    return {
      source_id: lead.id,  // google_places_ChIJ... or claude_search_...
      company_name: lead.company_name,
      trade_category: lead.trade_category,
      description: lead.description,
      address: lead.address,
      phone: lead.phone,
      email: lead.email,
      website: lead.website,
      has_website: lead.has_website,
      contacts: lead.contacts,
      google_place_id: lead.google_place_id,
      business_status: lead.business_status,
      collected_at: lead.collected_at,
      metadata: lead.metadata,
      qualification_score: lead.qualification_score,
      qualification_reasons: lead.qualification_reasons,
      enriched_at: lead.enriched_at,
      owner_name: lead.owner_name || null,
      social_profiles: lead.social_profiles || null,
      services: lead.services || null,
      years_in_business: lead.years_in_business || null,
      status: lead.status,
      created_at: lead.created_at,
      updated_at: lead.updated_at,
      city: location.city,
      state: location.state,
    };
  });

  if (rows.length === 0) return 0;

  const { error } = await supabase
    .from('leads')
    .upsert(rows, { onConflict: 'source_id' });

  if (error) {
    log('error', AGENT_NAME, `Upsert failed: ${error.message}`);
    throw error;
  }

  log('success', AGENT_NAME, `Stored ${rows.length} leads for ${city}`);
  return rows.length;
}

/** Fetch all leads from Supabase */
export async function getAllLeads(): Promise<StoredLead[]> {
  const supabase = getClient();

  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('qualification_score', { ascending: false });

  if (error) {
    log('error', AGENT_NAME, `Fetch failed: ${error.message}`);
    throw error;
  }

  return (data || []) as StoredLead[];
}

/** Fetch leads for a specific city */
export async function getLeadsByCity(city: string): Promise<StoredLead[]> {
  const supabase = getClient();

  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('city', city);

  if (error) {
    log('error', AGENT_NAME, `Fetch failed: ${error.message}`);
    throw error;
  }

  return (data || []) as StoredLead[];
}

/** Get lead stats from Supabase */
export async function getLeadStats(): Promise<{
  total: number;
  byTrade: Array<{ trade: string; count: number; avg_score: number; with_email: number; with_phone: number }>;
  byCity: Array<{ city: string; count: number }>;
  byStatus: Array<{ status: string; count: number }>;
}> {
  const leads = await getAllLeads();

  const tradeMap = new Map<string, { count: number; totalScore: number; withEmail: number; withPhone: number }>();
  const statusMap = new Map<string, number>();
  const cityMap = new Map<string, number>();

  for (const lead of leads) {
    // By trade
    const t = tradeMap.get(lead.trade_category) || { count: 0, totalScore: 0, withEmail: 0, withPhone: 0 };
    t.count++;
    t.totalScore += lead.qualification_score || 0;
    if (lead.email) t.withEmail++;
    if (lead.phone) t.withPhone++;
    tradeMap.set(lead.trade_category, t);

    // By status
    statusMap.set(lead.status, (statusMap.get(lead.status) || 0) + 1);

    // By city
    const city = (lead as any).city || lead.metadata?.location || 'Unknown';
    cityMap.set(city, (cityMap.get(city) || 0) + 1);
  }

  return {
    total: leads.length,
    byTrade: [...tradeMap.entries()].map(([trade, d]) => ({
      trade,
      count: d.count,
      avg_score: d.count > 0 ? d.totalScore / d.count : 0,
      with_email: d.withEmail,
      with_phone: d.withPhone,
    })),
    byCity: [...cityMap.entries()].map(([city, count]) => ({ city, count })),
    byStatus: [...statusMap.entries()].map(([status, count]) => ({ status, count })),
  };
}
