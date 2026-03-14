'use client';

import { useEffect, useState, useCallback } from 'react';
import { useLeads, type LeadFilters as LeadFilterState } from '../hooks/useLeads';
import LeadFilters from '../components/LeadFilters';
import LeadsTable from '../components/LeadsTable';
import ReportsPanel from '../components/ReportsPanel';
import PipelineConfig from '../components/PipelineConfig';

// ── Types ───────────────────────────────────────────────────

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

type Tab = 'leads' | 'reports' | 'pipeline' | 'agents';

// ── Dashboard ───────────────────────────────────────────────

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>('leads');
  const [filters, setFilters] = useState<LeadFilterState>({});
  const { leads, total, stats, loading, refetch } = useLeads(filters);

  // Agent polling
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<AgentRun | null>(null);

  const fetchRuns = useCallback(() => {
    fetch('/api/agents/events')
      .then(r => r.json())
      .then(data => setRuns(data.runs || []))
      .catch(() => {});
  }, []);

  const fetchRunDetail = useCallback((runId: string) => {
    fetch(`/api/agents/events?runId=${runId}`)
      .then(r => r.json())
      .then(data => { if (data.run) setSelectedRun(data.run); })
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

  const hasRunningAgents = runs.some(r => r.status === 'running');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'leads', label: 'Leads' },
    { key: 'reports', label: 'Reports' },
    { key: 'pipeline', label: 'Pipeline' },
    { key: 'agents', label: 'Agent Activity' },
  ];

  return (
    <div className="min-h-screen p-8 max-w-7xl mx-auto">
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">Podium Lead Hunter</h1>
            <p className="text-gray-400">
              {total} leads across {stats?.byTrade?.length || 0} trades
              {stats?.byCity && ` in ${stats.byCity.length} cities`}
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
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              tab === t.key ? 'text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
            {t.key === 'agents' && hasRunningAgents && (
              <span className="ml-2 inline-flex h-2 w-2 rounded-full bg-green-500"></span>
            )}
            {tab === t.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"></span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'leads' && (
        <>
          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard label="Total Leads" value={total} />
              <StatCard label="Trades" value={stats.byTrade.length} />
              <StatCard
                label="With Phone"
                value={stats.byTrade.reduce((s: number, t: any) => s + t.with_phone, 0)}
              />
              <StatCard
                label="With Email"
                value={stats.byTrade.reduce((s: number, t: any) => s + t.with_email, 0)}
              />
            </div>
          )}

          <LeadFilters filters={filters} onFilterChange={setFilters} />
          <LeadsTable leads={leads} loading={loading} total={total} />
        </>
      )}

      {tab === 'reports' && <ReportsPanel />}

      {tab === 'pipeline' && (
        <PipelineConfig onSwitchToAgents={() => setTab('agents')} />
      )}

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
    </div>
  );
}

// ── Agent Monitor ───────────────────────────────────────────

function AgentMonitor({
  runs, selectedRun, onSelectRun, onDeselectRun,
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
            Run <code className="bg-gray-800 px-1.5 py-0.5 rounded">pnpm hunt</code> or use the Pipeline tab
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
                <span className="text-xs text-gray-500 shrink-0">{formatTime(run.startedAt)}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>Step {run.currentStep}/{run.maxSteps}</span>
                <span>{run.model}</span>
                <span>{run.totalEvents || run.events.length} events</span>
                {run.completedAt && <span>Duration: {formatDuration(run.startedAt, run.completedAt)}</span>}
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

function RunDetail({ run, onBack }: { run: AgentRun; onBack: () => void }) {
  return (
    <div>
      <button onClick={onBack} className="text-sm text-blue-400 hover:text-blue-300 mb-4 flex items-center gap-1">
        &larr; All Runs
      </button>
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-5 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <RunStatusIndicator status={run.status} />
          <h2 className="text-lg font-semibold text-white">{run.task}</h2>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
          <span>Model: {run.model}</span>
          <span>Step {run.currentStep}/{run.maxSteps}</span>
          <span>Started {formatTime(run.startedAt)}</span>
          {run.completedAt && <span>Duration: {formatDuration(run.startedAt, run.completedAt)}</span>}
        </div>
        <ProgressBar current={run.currentStep} max={run.maxSteps} />
      </div>
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

function EventRow({ event, isLast }: { event: AgentEvent; isLast: boolean }) {
  const icons: Record<string, string> = {
    run_started: '🚀', step_started: '📍', thinking: '🧠', tool_called: '🔧',
    tool_completed: '✅', tool_error: '❌', run_completed: '🏁', run_error: '💥',
  };
  const borderColors: Record<string, string> = {
    run_started: 'border-l-blue-500', step_started: 'border-l-gray-600', thinking: 'border-l-purple-500',
    tool_called: 'border-l-yellow-500', tool_completed: 'border-l-green-500', tool_error: 'border-l-red-500',
    run_completed: 'border-l-green-500', run_error: 'border-l-red-500',
  };

  return (
    <div className={`flex items-start gap-3 py-2 px-3 border-l-2 ${borderColors[event.type] || 'border-l-gray-700'} ${isLast ? 'bg-gray-800/30' : ''}`}>
      <span className="text-sm shrink-0 mt-0.5">{icons[event.type] || '•'}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-white">{event.message}</span>
          {event.tool && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-yellow-300 font-mono">{event.tool}</span>
          )}
        </div>
        {event.detail && (
          <div className="text-xs text-gray-500 mt-0.5 font-mono truncate max-w-2xl">{event.detail}</div>
        )}
      </div>
      <span className="text-xs text-gray-600 shrink-0 font-mono">{event.timestamp.slice(11, 19)}</span>
    </div>
  );
}

// ── Shared UI ───────────────────────────────────────────────

function RunStatusIndicator({ status }: { status: string }) {
  if (status === 'running') {
    return (
      <span className="relative flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
      </span>
    );
  }
  if (status === 'completed') return <span className="inline-flex h-3 w-3 rounded-full bg-blue-500"></span>;
  return <span className="inline-flex h-3 w-3 rounded-full bg-red-500"></span>;
}

function ProgressBar({ current, max }: { current: number; max: number }) {
  const pct = max > 0 ? Math.round((current / max) * 100) : 0;
  return (
    <div className="w-full bg-gray-800 rounded-full h-1.5">
      <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
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

// ── Helpers ─────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(start: string, end: string): string {
  const secs = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}
