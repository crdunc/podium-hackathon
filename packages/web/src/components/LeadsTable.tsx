'use client';

import type { Lead } from '../hooks/useLeads';

interface LeadsTableProps {
  leads: Lead[];
  loading: boolean;
  total: number;
}

function ScoreBadge({ score }: { score?: number }) {
  if (score == null) return <span className="text-gray-500">--</span>;

  let colorClasses: string;
  if (score >= 80) {
    colorClasses = 'bg-green-900/50 text-green-400 border-green-700';
  } else if (score >= 50) {
    colorClasses = 'bg-yellow-900/50 text-yellow-400 border-yellow-700';
  } else {
    colorClasses = 'bg-gray-800 text-gray-400 border-gray-600';
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colorClasses}`}>
      {score}
    </span>
  );
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <span className="text-gray-500">--</span>;

  const colors: Record<string, string> = {
    new: 'bg-blue-900/50 text-blue-400 border-blue-700',
    contacted: 'bg-yellow-900/50 text-yellow-400 border-yellow-700',
    replied: 'bg-green-900/50 text-green-400 border-green-700',
    qualified: 'bg-purple-900/50 text-purple-400 border-purple-700',
    lost: 'bg-red-900/50 text-red-400 border-red-700',
  };

  const colorClasses = colors[status] ?? 'bg-gray-800 text-gray-400 border-gray-600';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${colorClasses}`}>
      {status}
    </span>
  );
}

function OutreachBadge({ status }: { status?: string }) {
  if (!status) return <span className="text-gray-500">--</span>;

  const colors: Record<string, string> = {
    pending: 'bg-gray-800 text-gray-400 border-gray-600',
    contacted: 'bg-blue-900/50 text-blue-400 border-blue-700',
    responded: 'bg-green-900/50 text-green-400 border-green-700',
    converted: 'bg-emerald-900/50 text-emerald-400 border-emerald-700',
    unsubscribed: 'bg-red-900/50 text-red-400 border-red-700',
  };

  const colorClasses = colors[status] ?? 'bg-gray-800 text-gray-400 border-gray-600';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${colorClasses}`}>
      {status}
    </span>
  );
}

function TradeBadge({ trade }: { trade?: string }) {
  if (!trade) return <span className="text-gray-500">--</span>;

  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-gray-800 text-gray-300 border-gray-600 capitalize">
      {trade}
    </span>
  );
}

function ExternalLinkIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
    </svg>
  );
}

export default function LeadsTable({ leads, loading, total }: LeadsTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        Loading leads...
      </div>
    );
  }

  if (!leads || leads.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        No leads found. Run the pipeline to get started.
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-4 text-sm text-gray-400">
        Showing <span className="text-white font-medium">{leads.length}</span> of{' '}
        <span className="text-white font-medium">{total}</span> leads
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-900 text-gray-400 uppercase text-xs tracking-wider">
            <tr>
              <th className="px-4 py-3 border-b border-gray-800">Company</th>
              <th className="px-4 py-3 border-b border-gray-800">Trade</th>
              <th className="px-4 py-3 border-b border-gray-800">City</th>
              <th className="px-4 py-3 border-b border-gray-800">State</th>
              <th className="px-4 py-3 border-b border-gray-800">Phone</th>
              <th className="px-4 py-3 border-b border-gray-800">Score</th>
              <th className="px-4 py-3 border-b border-gray-800">Status</th>
              <th className="px-4 py-3 border-b border-gray-800">Outreach</th>
              <th className="px-4 py-3 border-b border-gray-800">Site</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {leads.map((lead, index) => (
              <tr key={index} className="bg-gray-900 hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="text-white font-medium">{lead.company_name || '--'}</div>
                  {lead.email && (
                    <div className="text-gray-500 text-xs mt-0.5">{lead.email}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <TradeBadge trade={lead.trade_category} />
                </td>
                <td className="px-4 py-3 text-gray-300">{lead.city || '--'}</td>
                <td className="px-4 py-3 text-gray-300">{lead.state || '--'}</td>
                <td className="px-4 py-3 text-gray-300">{lead.phone || '--'}</td>
                <td className="px-4 py-3">
                  <ScoreBadge score={lead.qualification_score} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={lead.status} />
                </td>
                <td className="px-4 py-3">
                  <OutreachBadge status={lead.outreach_status} />
                </td>
                <td className="px-4 py-3">
                  {lead.site_url ? (
                    <a
                      href={lead.site_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      <ExternalLinkIcon />
                    </a>
                  ) : (
                    <span className="text-gray-600">--</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
