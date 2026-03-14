'use client';

import { useEffect, useState } from 'react';
import type { StoredLead } from '@podium/shared';

interface LeadStats {
  total: number;
  byTrade: Array<{
    trade: string;
    count: number;
    avg_score: number;
    with_email: number;
    with_phone: number;
  }>;
  byStatus: Array<{ status: string; count: number }>;
}

export default function Dashboard() {
  const [leads, setLeads] = useState<StoredLead[]>([]);
  const [stats, setStats] = useState<LeadStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    Promise.all([
      fetch('/api/leads').then(r => r.json()),
      fetch('/api/leads/stats').then(r => r.json()),
    ])
      .then(([leadsData, statsData]) => {
        setLeads(leadsData.leads || []);
        setStats(statsData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filteredLeads = filter === 'all'
    ? leads
    : leads.filter(l => l.trade_category === filter);

  const trades = [...new Set(leads.map(l => l.trade_category))].sort();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-400">Loading leads...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 max-w-7xl mx-auto">
      <header className="mb-10">
        <h1 className="text-3xl font-bold text-white mb-2">Podium Lead Hunter</h1>
        <p className="text-gray-400">
          {stats?.total || 0} leads across {stats?.byTrade.length || 0} trades
        </p>
      </header>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <StatCard label="Total Leads" value={stats.total} />
          <StatCard label="Trades" value={stats.byTrade.length} />
          <StatCard
            label="With Phone"
            value={stats.byTrade.reduce((s, t) => s + t.with_phone, 0)}
          />
          <StatCard
            label="With Email"
            value={stats.byTrade.reduce((s, t) => s + t.with_email, 0)}
          />
        </div>
      )}

      {/* Trade breakdown */}
      {stats && (
        <div className="mb-10">
          <h2 className="text-xl font-semibold text-white mb-4">By Trade</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {stats.byTrade.map(t => (
              <button
                key={t.trade}
                onClick={() => setFilter(filter === t.trade ? 'all' : t.trade)}
                className={`rounded-lg p-3 text-left transition-colors ${
                  filter === t.trade
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                <div className="text-xs uppercase tracking-wide opacity-70">
                  {t.trade}
                </div>
                <div className="text-2xl font-bold">{t.count}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Leads table */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">
            {filter === 'all' ? 'All Leads' : filter}
            <span className="text-gray-500 font-normal ml-2">
              ({filteredLeads.length})
            </span>
          </h2>
          {filter !== 'all' && (
            <button
              onClick={() => setFilter('all')}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              Show all
            </button>
          )}
        </div>
        <div className="bg-gray-900 rounded-lg overflow-hidden border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-left">
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Trade</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead, i) => (
                <tr
                  key={lead.id}
                  className="border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">
                      {lead.company_name}
                    </div>
                    {lead.email && (
                      <div className="text-xs text-gray-500">{lead.email}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-block px-2 py-0.5 rounded text-xs bg-gray-800 text-gray-300">
                      {lead.trade_category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {lead.metadata?.location || '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {lead.phone || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <ScoreBadge score={lead.qualification_score} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={lead.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredLeads.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              No leads found. Run the pipeline first.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
      <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">{label}</div>
      <div className="text-3xl font-bold text-white">{value}</div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-gray-400';
  return <span className={`font-mono font-bold ${color}`}>{score}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    new: 'bg-blue-900/50 text-blue-300',
    contacted: 'bg-yellow-900/50 text-yellow-300',
    replied: 'bg-green-900/50 text-green-300',
    qualified: 'bg-purple-900/50 text-purple-300',
    lost: 'bg-red-900/50 text-red-300',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs ${colors[status] || 'bg-gray-800 text-gray-400'}`}>
      {status}
    </span>
  );
}
