'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface LeadRow {
  city: string | null;
  state: string | null;
  trade_category: string | null;
  qualification_score: number | null;
  outreach_status: string | null;
  status: string | null;
  email: string | null;
  phone: string | null;
}

interface CityStateStats {
  city: string;
  state: string;
  count: number;
  avgScore: number;
  withEmail: number;
  withPhone: number;
  outreachSent: number;
}

interface TradeStats {
  trade: string;
  count: number;
  avgScore: number;
  withEmail: number;
  withPhone: number;
}

interface OutreachSummary {
  pending: number;
  contacted: number;
  responded: number;
  converted: number;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1);
}

export default function ReportsPanel() {
  const [loading, setLoading] = useState(true);
  const [cityStats, setCityStats] = useState<CityStateStats[]>([]);
  const [tradeStats, setTradeStats] = useState<TradeStats[]>([]);
  const [outreach, setOutreach] = useState<OutreachSummary>({
    pending: 0,
    contacted: 0,
    responded: 0,
    converted: 0,
  });

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const { data, error } = await supabase
        .from('leads')
        .select('city, state, trade_category, qualification_score, outreach_status, status, email, phone');

      if (error || !data) {
        console.error('Failed to fetch leads:', error);
        setLoading(false);
        return;
      }

      const leads = data as LeadRow[];

      // --- By City/State ---
      const cityMap = new Map<string, LeadRow[]>();
      for (const lead of leads) {
        const key = `${lead.city ?? 'Unknown'}||${lead.state ?? 'Unknown'}`;
        if (!cityMap.has(key)) cityMap.set(key, []);
        cityMap.get(key)!.push(lead);
      }

      const cityRows: CityStateStats[] = Array.from(cityMap.entries())
        .map(([key, rows]) => {
          const [city, state] = key.split('||');
          const scores = rows
            .map((r) => r.qualification_score)
            .filter((s): s is number => s != null);
          return {
            city,
            state,
            count: rows.length,
            avgScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
            withEmail: rows.filter((r) => r.email).length,
            withPhone: rows.filter((r) => r.phone).length,
            outreachSent: rows.filter((r) => r.outreach_status && r.outreach_status !== 'pending').length,
          };
        })
        .sort((a, b) => b.count - a.count);

      setCityStats(cityRows);

      // --- By Trade ---
      const tradeMap = new Map<string, LeadRow[]>();
      for (const lead of leads) {
        const trade = lead.trade_category ?? 'Unknown';
        if (!tradeMap.has(trade)) tradeMap.set(trade, []);
        tradeMap.get(trade)!.push(lead);
      }

      const tradeRows: TradeStats[] = Array.from(tradeMap.entries())
        .map(([trade, rows]) => {
          const scores = rows
            .map((r) => r.qualification_score)
            .filter((s): s is number => s != null);
          return {
            trade,
            count: rows.length,
            avgScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
            withEmail: rows.filter((r) => r.email).length,
            withPhone: rows.filter((r) => r.phone).length,
          };
        })
        .sort((a, b) => b.count - a.count);

      setTradeStats(tradeRows);

      // --- Outreach Summary ---
      const summary: OutreachSummary = { pending: 0, contacted: 0, responded: 0, converted: 0 };
      for (const lead of leads) {
        const s = (lead.outreach_status ?? 'pending').toLowerCase();
        if (s === 'contacted') summary.contacted++;
        else if (s === 'responded') summary.responded++;
        else if (s === 'converted') summary.converted++;
        else summary.pending++;
      }
      setOutreach(summary);

      setLoading(false);
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-gray-400">
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Loading reports...
        </div>
      </div>
    );
  }

  const tableWrapper = 'overflow-x-auto rounded-lg border border-gray-800 bg-gray-900';
  const th = 'px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400';
  const td = 'px-4 py-3 text-sm text-gray-300 whitespace-nowrap';

  return (
    <div className="space-y-8">
      {/* By City/State */}
      <section>
        <h3 className="mb-3 text-lg font-semibold text-white">Leads by City / State</h3>
        <div className={tableWrapper}>
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800 bg-gray-900/80">
              <tr>
                <th className={th}>City</th>
                <th className={th}>State</th>
                <th className={th}>Lead Count</th>
                <th className={th}>Avg Score</th>
                <th className={th}>With Email</th>
                <th className={th}>With Phone</th>
                <th className={th}>Outreach Sent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {cityStats.map((row) => (
                <tr key={`${row.city}-${row.state}`} className="hover:bg-gray-800/50">
                  <td className={td}>{row.city}</td>
                  <td className={td}>{row.state}</td>
                  <td className={td}>{fmt(row.count)}</td>
                  <td className={td}>{fmt(row.avgScore)}</td>
                  <td className={td}>{fmt(row.withEmail)}</td>
                  <td className={td}>{fmt(row.withPhone)}</td>
                  <td className={td}>{fmt(row.outreachSent)}</td>
                </tr>
              ))}
              {cityStats.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                    No lead data available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* By Trade */}
      <section>
        <h3 className="mb-3 text-lg font-semibold text-white">Leads by Trade</h3>
        <div className={tableWrapper}>
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800 bg-gray-900/80">
              <tr>
                <th className={th}>Trade</th>
                <th className={th}>Lead Count</th>
                <th className={th}>Avg Score</th>
                <th className={th}>With Email</th>
                <th className={th}>With Phone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {tradeStats.map((row) => (
                <tr key={row.trade} className="hover:bg-gray-800/50">
                  <td className={`${td} capitalize`}>{row.trade}</td>
                  <td className={td}>{fmt(row.count)}</td>
                  <td className={td}>{fmt(row.avgScore)}</td>
                  <td className={td}>{fmt(row.withEmail)}</td>
                  <td className={td}>{fmt(row.withPhone)}</td>
                </tr>
              ))}
              {tradeStats.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                    No lead data available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Outreach Summary */}
      <section>
        <h3 className="mb-3 text-lg font-semibold text-white">Outreach Summary</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {([
            { label: 'Pending', value: outreach.pending, color: 'text-gray-300' },
            { label: 'Contacted', value: outreach.contacted, color: 'text-blue-400' },
            { label: 'Responded', value: outreach.responded, color: 'text-green-400' },
            { label: 'Converted', value: outreach.converted, color: 'text-emerald-400' },
          ] as const).map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-gray-800 bg-gray-900 px-5 py-4 text-center"
            >
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                {item.label}
              </p>
              <p className={`mt-1 text-2xl font-bold ${item.color}`}>{fmt(item.value)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
