'use client';

import { useState, type KeyboardEvent } from 'react';

const TRADES = [
  'hvac',
  'electrical',
  'plumbing',
  'lawn care',
  'roofing',
  'painting',
  'carpet cleaning',
  'appliance repair',
  'tree service',
  'fencing',
  'concrete',
  'handyman',
  'pest control',
  'garage door repair',
] as const;

interface PipelineConfigProps {
  onSwitchToAgents?: () => void;
}

export default function PipelineConfig({ onSwitchToAgents }: PipelineConfigProps) {
  const [selectedTrades, setSelectedTrades] = useState<Set<string>>(new Set());
  const [locations, setLocations] = useState<string[]>([]);
  const [locationInput, setLocationInput] = useState('');
  const [minScore, setMinScore] = useState(30);
  const [enrichment, setEnrichment] = useState(true);
  const [websiteGen, setWebsiteGen] = useState(false);
  const [outreach, setOutreach] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error' | 'running'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // --- Trade selection ---
  function toggleTrade(trade: string) {
    setSelectedTrades((prev) => {
      const next = new Set(prev);
      if (next.has(trade)) next.delete(trade);
      else next.add(trade);
      return next;
    });
  }

  function selectAllTrades() {
    if (selectedTrades.size === TRADES.length) {
      setSelectedTrades(new Set());
    } else {
      setSelectedTrades(new Set(TRADES));
    }
  }

  // --- Location chips ---
  function handleLocationKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = locationInput.trim();
      if (value && !locations.includes(value)) {
        setLocations((prev) => [...prev, value]);
      }
      setLocationInput('');
    }
  }

  function removeLocation(loc: string) {
    setLocations((prev) => prev.filter((l) => l !== loc));
  }

  // --- Submit ---
  async function handleSubmit() {
    if (selectedTrades.size === 0) {
      setErrorMsg('Select at least one trade.');
      setStatus('error');
      return;
    }
    if (locations.length === 0) {
      setErrorMsg('Add at least one location.');
      setStatus('error');
      return;
    }

    const trades = Array.from(selectedTrades).join(', ');
    const locs = locations.join('; ');

    let task = `Find ${trades} businesses in ${locs} with a minimum qualification score of ${minScore}.`;
    if (enrichment) task += ' Enrich leads with contact details and website data.';
    if (websiteGen) task += ' Generate website content for qualified leads.';
    if (outreach) task += ' Send outreach emails to qualified leads.';

    setSubmitting(true);
    setStatus('idle');
    setErrorMsg('');

    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
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

  // --- Toggle component ---
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
        {/* Trades */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-200">Trades</label>
            <button
              type="button"
              onClick={selectAllTrades}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              {selectedTrades.size === TRADES.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {TRADES.map((trade) => (
              <label
                key={trade}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                  selectedTrades.has(trade)
                    ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                    : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedTrades.has(trade)}
                  onChange={() => toggleTrade(trade)}
                  className="h-3.5 w-3.5 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                />
                <span className="capitalize">{trade}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Locations */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-200">Locations</label>
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-gray-700 bg-gray-800/50 px-3 py-2">
            {locations.map((loc) => (
              <span
                key={loc}
                className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2.5 py-0.5 text-xs font-medium text-blue-300"
              >
                {loc}
                <button
                  type="button"
                  onClick={() => removeLocation(loc)}
                  className="ml-0.5 text-blue-300/60 hover:text-blue-200"
                >
                  &times;
                </button>
              </span>
            ))}
            <input
              type="text"
              value={locationInput}
              onChange={(e) => setLocationInput(e.target.value)}
              onKeyDown={handleLocationKeyDown}
              placeholder={locations.length === 0 ? 'Type a city, e.g. "Austin, TX" and press Enter' : 'Add another...'}
              className="min-w-[180px] flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-500 outline-none"
            />
          </div>
        </div>

        {/* Min Score */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-200">
            Minimum Qualification Score
          </label>
          <input
            type="number"
            min={0}
            max={100}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="w-24 rounded-md border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
          />
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
