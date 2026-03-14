'use client';

import { useEffect, useState, useCallback } from 'react';
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

interface AgentEvent {
  id: string;
  type: string;
  timestamp: string;
  runId: string;
  step?: number;
  maxSteps?: number;
  agent?: string;
  tool?: string;
  message: string;
  detail?: string;
}

interface AgentRun {
  runId: string;
  task: string;
  model: string;
  status: 'running' | 'completed' | 'error';
  startedAt: string;
  completedAt?: string;
  currentStep: number;
  maxSteps: number;
  events: AgentEvent[];
  totalEvents?: number;
}

type Tab = 'leads' | 'agents';

export default function Dashboard() {
  const [leads, setLeads] = useState<StoredLead[]>([]);
  const [stats, setStats] = useState<LeadStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [tab, setTab] = useState<Tab>('agents');
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<AgentRun | null>(null);

  // Load leads data
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

  // Poll agent events
  const fetchRuns = useCallback(() => {
    fetch('/api/agents/events')
      .then(r => r.json())
      .then(data => setRuns(data.runs || []))
      .catch(() => {});
  }, []);

  const fetchRunDetail = useCallback((runId: string) => {
    fetch(`/api/agents/events?runId=${runId}`)
      .then(r => r.json())
      .then(data => {
        if (data.run) setSelectedRun(data.run);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchRuns();
    const interval = setInterval(() => {
      fetchRuns();
      if (selectedRun?.status === 'running') {
        fetchRunDetail(selectedRun.runId);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchRuns, fetchRunDetail, selectedRun?.runId, selectedRun?.status]);

  const filteredLeads = filter === 'all'
    ? leads
    : leads.filter(l => l.trade_category === filter);

  const hasRunningAgents = runs.some(r => r.status === 'running');

  return (
    <div className="min-h-screen p-8 max-w-7xl mx-auto">
      <header className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">Podium Lead Hunter</h1>
            <p className="text-gray-400">
              {stats?.total || 0} leads across {stats?.byTrade?.length || 0} trades
            </p>
          </div>
          {hasRunningAgents && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-900/30 border border-green-800 rounded-full">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
              </span>
              <span className="text-sm text-green-300">Agents Running</span>
            </div>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 mb-8 border-b border-gray-800">
        <button
          onClick={() => setTab('agents')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
            tab === 'agents'
              ? 'text-white'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Agent Activity
          {hasRunningAgents && (
            <span className="ml-2 inline-flex h-2 w-2 rounded-full bg-green-500"></span>
          )}
          {tab === 'agents' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"></span>
          )}
        </button>
        <button
          onClick={() => setTab('leads')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
            tab === 'leads'
              ? 'text-white'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Leads Database
          {tab === 'leads' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"></span>
          )}
        </button>
      </div>

      {tab === 'agents' && (
        <AgentMonitor
          runs={runs}
          selectedRun={selectedRun}
          onSelectRun={(run) => {
            setSelectedRun(run);
            fetchRunDetail(run.runId);
          }}
          onDeselectRun={() => setSelectedRun(null)}
        />
      )}

      {tab === 'leads' && (
        <>
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
                  {filteredLeads.map((lead) => (
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
        </>
      )}
    </div>
  );
}

// ── Agent Monitor Component ───────────────────────────────────

function AgentMonitor({
  runs,
  selectedRun,
  onSelectRun,
  onDeselectRun,
}: {
  runs: AgentRun[];
  selectedRun: AgentRun | null;
  onSelectRun: (run: AgentRun) => void;
  onDeselectRun: () => void;
}) {
  if (selectedRun) {
    return <RunDetail run={selectedRun} onBack={onDeselectRun} />;
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-4">Agent Runs</h2>
      {runs.length === 0 ? (
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-12 text-center">
          <div className="text-gray-500 text-lg mb-2">No agent runs yet</div>
          <p className="text-gray-600 text-sm">
            Run <code className="bg-gray-800 px-1.5 py-0.5 rounded">pnpm hunt</code> to start the pipeline
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map(run => (
            <button
              key={run.runId}
              onClick={() => onSelectRun(run)}
              className="w-full bg-gray-900 rounded-lg border border-gray-800 p-4 text-left hover:border-gray-700 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <RunStatusIndicator status={run.status} />
                  <span className="text-white font-medium truncate max-w-lg">
                    {run.task.slice(0, 80)}{run.task.length > 80 ? '...' : ''}
                  </span>
                </div>
                <span className="text-xs text-gray-500 shrink-0">
                  {formatTime(run.startedAt)}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>Step {run.currentStep}/{run.maxSteps}</span>
                <span>{run.model}</span>
                <span>{run.totalEvents || run.events.length} events</span>
                {run.status === 'running' && (
                  <span className="text-green-400">
                    {run.events[run.events.length - 1]?.message || 'Running...'}
                  </span>
                )}
                {run.completedAt && (
                  <span>Duration: {formatDuration(run.startedAt, run.completedAt)}</span>
                )}
              </div>
              {run.status === 'running' && (
                <div className="mt-3">
                  <ProgressBar current={run.currentStep} max={run.maxSteps} />
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Run Detail View ───────────────────────────────────────────

function RunDetail({ run, onBack }: { run: AgentRun; onBack: () => void }) {
  return (
    <div>
      <button
        onClick={onBack}
        className="text-sm text-blue-400 hover:text-blue-300 mb-4 flex items-center gap-1"
      >
        &larr; All Runs
      </button>

      <div className="bg-gray-900 rounded-lg border border-gray-800 p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <RunStatusIndicator status={run.status} />
            <h2 className="text-lg font-semibold text-white">{run.task}</h2>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
          <span>Model: {run.model}</span>
          <span>Step {run.currentStep}/{run.maxSteps}</span>
          <span>Started {formatTime(run.startedAt)}</span>
          {run.completedAt && (
            <span>Duration: {formatDuration(run.startedAt, run.completedAt)}</span>
          )}
        </div>
        <ProgressBar current={run.currentStep} max={run.maxSteps} />
      </div>

      {/* Event Timeline */}
      <h3 className="text-lg font-semibold text-white mb-3">Event Timeline</h3>
      <div className="space-y-1">
        {run.events.map((event, i) => (
          <EventRow key={event.id} event={event} isLast={i === run.events.length - 1 && run.status === 'running'} />
        ))}
        {run.events.length === 0 && (
          <div className="text-gray-500 text-sm py-4 text-center">Waiting for events...</div>
        )}
      </div>
    </div>
  );
}

// ── Event Row ─────────────────────────────────────────────────

function EventRow({ event, isLast }: { event: AgentEvent; isLast: boolean }) {
  const icons: Record<string, string> = {
    run_started: '🚀',
    step_started: '📍',
    thinking: '🧠',
    tool_called: '🔧',
    tool_completed: '✅',
    tool_error: '❌',
    run_completed: '🏁',
    run_error: '💥',
  };

  const bgColors: Record<string, string> = {
    run_started: 'border-l-blue-500',
    step_started: 'border-l-gray-600',
    thinking: 'border-l-purple-500',
    tool_called: 'border-l-yellow-500',
    tool_completed: 'border-l-green-500',
    tool_error: 'border-l-red-500',
    run_completed: 'border-l-green-500',
    run_error: 'border-l-red-500',
  };

  return (
    <div className={`flex items-start gap-3 py-2 px-3 border-l-2 ${bgColors[event.type] || 'border-l-gray-700'} ${isLast ? 'bg-gray-800/30' : ''}`}>
      <span className="text-sm shrink-0 mt-0.5">{icons[event.type] || '•'}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-white">{event.message}</span>
          {event.tool && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-yellow-300 font-mono">
              {event.tool}
            </span>
          )}
        </div>
        {event.detail && (
          <div className="text-xs text-gray-500 mt-0.5 font-mono truncate max-w-2xl">
            {event.detail}
          </div>
        )}
      </div>
      <span className="text-xs text-gray-600 shrink-0 font-mono">
        {event.timestamp.slice(11, 19)}
      </span>
    </div>
  );
}

// ── Shared UI Components ──────────────────────────────────────

function RunStatusIndicator({ status }: { status: string }) {
  if (status === 'running') {
    return (
      <span className="relative flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
      </span>
    );
  }
  if (status === 'completed') {
    return <span className="inline-flex h-3 w-3 rounded-full bg-blue-500"></span>;
  }
  return <span className="inline-flex h-3 w-3 rounded-full bg-red-500"></span>;
}

function ProgressBar({ current, max }: { current: number; max: number }) {
  const pct = max > 0 ? Math.round((current / max) * 100) : 0;
  return (
    <div className="w-full bg-gray-800 rounded-full h-1.5">
      <div
        className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
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

// ── Helpers ───────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}
