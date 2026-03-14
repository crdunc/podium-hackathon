'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface LeadFilters {
  city?: string;
  state?: string;
  trade?: string;
  status?: string;
  outreach_status?: string;
  minScore?: number;
}

export interface Lead {
  id: string;
  source_id: string;
  company_name: string;
  trade_category: string;
  city: string;
  state: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  has_website: boolean;
  qualification_score: number;
  status: string;
  outreach_status: string;
  sequence_step: number | null;
  site_url: string | null;
  owner_name: string | null;
  services: string[] | null;
  social_profiles: Record<string, string> | null;
  address: string | null;
  business_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface TradeStat {
  trade: string;
  count: number;
  avg_score: number;
  with_email: number;
  with_phone: number;
}

export interface CityStat {
  city: string;
  state: string;
  count: number;
}

export interface LeadStats {
  total: number;
  byTrade: TradeStat[];
  byCity: CityStat[];
}

function computeStats(leads: Lead[], total: number): LeadStats {
  const tradeMap = new Map<
    string,
    { count: number; totalScore: number; with_email: number; with_phone: number }
  >();
  const cityMap = new Map<string, { state: string; count: number }>();

  for (const lead of leads) {
    const trade = lead.trade_category || 'Unknown';
    const existing = tradeMap.get(trade) || {
      count: 0,
      totalScore: 0,
      with_email: 0,
      with_phone: 0,
    };
    existing.count++;
    existing.totalScore += lead.qualification_score ?? 0;
    if (lead.email) existing.with_email++;
    if (lead.phone) existing.with_phone++;
    tradeMap.set(trade, existing);

    const cityKey = `${lead.city}|${lead.state}`;
    const cityEntry = cityMap.get(cityKey) || { state: lead.state, count: 0 };
    cityEntry.count++;
    cityMap.set(cityKey, cityEntry);
  }

  const byTrade: TradeStat[] = Array.from(tradeMap.entries())
    .map(([trade, data]) => ({
      trade,
      count: data.count,
      avg_score: data.count > 0 ? Math.round(data.totalScore / data.count) : 0,
      with_email: data.with_email,
      with_phone: data.with_phone,
    }))
    .sort((a, b) => b.count - a.count);

  const byCity: CityStat[] = Array.from(cityMap.entries())
    .map(([key, data]) => {
      const [city] = key.split('|');
      return { city, state: data.state, count: data.count };
    })
    .sort((a, b) => b.count - a.count);

  return { total, byTrade, byCity };
}

export function useLeads(filters: LeadFilters) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<LeadStats>({ total: 0, byTrade: [], byCity: [] });

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase.from('leads').select('*', { count: 'exact' });

      if (filters.city) {
        query = query.eq('city', filters.city);
      }
      if (filters.state) {
        query = query.eq('state', filters.state);
      }
      if (filters.trade) {
        query = query.eq('trade_category', filters.trade);
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.outreach_status) {
        query = query.eq('outreach_status', filters.outreach_status);
      }
      if (filters.minScore !== undefined && filters.minScore > 0) {
        query = query.gte('qualification_score', filters.minScore);
      }

      query = query.order('qualification_score', { ascending: false });

      const { data, count, error: queryError } = await query;

      if (queryError) {
        setError(queryError.message);
        setLeads([]);
        setTotal(0);
        setStats({ total: 0, byTrade: [], byCity: [] });
        return;
      }

      const fetchedLeads = (data as Lead[]) || [];
      const fetchedTotal = count ?? fetchedLeads.length;

      setLeads(fetchedLeads);
      setTotal(fetchedTotal);
      setStats(computeStats(fetchedLeads, fetchedTotal));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(message);
      setLeads([]);
      setTotal(0);
      setStats({ total: 0, byTrade: [], byCity: [] });
    } finally {
      setLoading(false);
    }
  }, [filters.city, filters.state, filters.trade, filters.status, filters.outreach_status, filters.minScore]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  return { leads, total, loading, error, stats, refetch: fetchLeads };
}

export interface LeadFilterOptions {
  cities: string[];
  states: string[];
  trades: string[];
}

export function useLeadFilterOptions() {
  const [options, setOptions] = useState<LeadFilterOptions>({
    cities: [],
    states: [],
    trades: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOptions() {
      setLoading(true);

      try {
        const [citiesRes, statesRes, tradesRes] = await Promise.all([
          supabase.from('leads').select('city'),
          supabase.from('leads').select('state'),
          supabase.from('leads').select('trade_category'),
        ]);

        const cities = Array.from(
          new Set(
            (citiesRes.data || [])
              .map((r: { city: string }) => r.city)
              .filter(Boolean)
          )
        ).sort() as string[];

        const states = Array.from(
          new Set(
            (statesRes.data || [])
              .map((r: { state: string }) => r.state)
              .filter(Boolean)
          )
        ).sort() as string[];

        const trades = Array.from(
          new Set(
            (tradesRes.data || [])
              .map((r: { trade_category: string }) => r.trade_category)
              .filter(Boolean)
          )
        ).sort() as string[];

        setOptions({ cities, states, trades });
      } catch {
        // Silently fail — dropdowns will just be empty
      } finally {
        setLoading(false);
      }
    }

    fetchOptions();
  }, []);

  return { options, loading };
}
