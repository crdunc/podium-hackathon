'use client';

import { useState } from 'react';

interface PipelineConfigProps {
  onSwitchToAgents?: () => void;
}

export default function PipelineConfig({ onSwitchToAgents }: PipelineConfigProps) {
  const [task, setTask] = useState('');
  const [minScore, setMinScore] = useState('30');
  const [maxResults, setMaxResults] = useState('10');
  const [enrichment, setEnrichment] = useState(true);
  const [websiteGen, setWebsiteGen] = useState(true);
  const [outreach, setOutreach] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'running' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit() {
    const trimmed = task.trim();
    if (!trimmed) {
      setErrorMsg('Describe what you want the pipeline to do.');
      setStatus('error');
      return;
    }

    // Append config + toggle instructions to the task
    let fullTask = trimmed;
    if (maxResults) fullTask += ` Limit to ${maxResults} results per search.`;
    if (minScore) fullTask += ` Minimum qualification score of ${minScore}.`;
    if (enrichment) fullTask += ' Enrich leads with contact details and website data.';
    if (websiteGen) fullTask += ' Generate websites for the leads.';
    if (outreach) fullTask += ' Start outreach for the leads.';

    setSubmitting(true);
    setStatus('idle');
    setErrorMsg('');

    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: fullTask }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }

      setStatus('running');
    } catch (err: unknown) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  function Toggle({
    label,
    enabled,
    onChange,
    warning,
  }: {
    label: string;
    enabled: boolean;
    onChange: (v: boolean) => void;
    warning?: string;
  }) {
    return (
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-gray-200">{label}</span>
          {warning && enabled && (
            <p className="mt-0.5 text-xs text-orange-400">{warning}</p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => onChange(!enabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            enabled ? 'bg-blue-600' : 'bg-gray-700'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
              enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 space-y-6">
        {/* Task prompt */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-200">
            What should the pipeline do?
          </label>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder='e.g. "Find 5 plumbers and HVAC companies in Austin, TX and Denver, CO"'
            rows={3}
            className="w-full rounded-md border border-gray-700 bg-gray-800/50 px-4 py-3 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500 resize-none"
          />
          <p className="mt-1.5 text-xs text-gray-500">
            Describe trades, cities, limits, or any instructions. The AI orchestrator will figure out the rest.
          </p>
        </div>

        {/* Configuration */}
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-200">
              Min Qualification Score
            </label>
            <input
              type="text"
              placeholder="e.g. 30"
              value={minScore}
              onChange={(e) => setMinScore(e.target.value.replace(/[^0-9]/g, ''))}
              className="w-24 rounded-md border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-200">
              Max Results Per Search
            </label>
            <input
              type="text"
              placeholder="e.g. 10"
              value={maxResults}
              onChange={(e) => setMaxResults(e.target.value.replace(/[^0-9]/g, ''))}
              className="w-24 rounded-md border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">Per trade/city combination</p>
          </div>
        </div>

        {/* Toggles */}
        <div className="space-y-4 rounded-md border border-gray-800 bg-gray-800/30 p-4">
          <Toggle label="Enrichment" enabled={enrichment} onChange={setEnrichment} />
          <Toggle label="Website Generation" enabled={websiteGen} onChange={setWebsiteGen} />
          <Toggle
            label="Outreach"
            enabled={outreach}
            onChange={setOutreach}
            warning="Will send real emails"
          />
        </div>

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Starting Pipeline...' : 'Run Pipeline'}
        </button>

        {/* Status messages */}
        {status === 'error' && (
          <p className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            {errorMsg}
          </p>
        )}
        {status === 'running' && (
          <p className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm text-green-400">
            Pipeline started!
          </p>
        )}
      </div>

      {/* Pipeline running status */}
      {status === 'running' && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 px-5 py-4">
          <div className="flex items-center gap-3">
            <svg className="h-4 w-4 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <span className="text-sm text-gray-300">Pipeline is running...</span>
            {onSwitchToAgents && (
              <button
                type="button"
                onClick={onSwitchToAgents}
                className="ml-auto text-sm text-blue-400 hover:text-blue-300 hover:underline"
              >
                View Agent Activity
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
