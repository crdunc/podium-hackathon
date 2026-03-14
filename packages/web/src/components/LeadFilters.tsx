'use client';

import { useLeadFilterOptions, LeadFilters as LeadFiltersType } from '../hooks/useLeads';

interface LeadFiltersProps {
  filters: LeadFiltersType;
  onFilterChange: (filters: LeadFiltersType) => void;
}

const STATUS_OPTIONS = ['new', 'qualified', 'unqualified', 'contacted', 'converted'];
const OUTREACH_OPTIONS = ['pending', 'contacted', 'responded', 'no_response', 'opted_out'];

export default function LeadFilters({ filters, onFilterChange }: LeadFiltersProps) {
  const { options, loading } = useLeadFilterOptions();

  const handleChange = (key: keyof LeadFiltersType, value: string | number | undefined) => {
    onFilterChange({ ...filters, [key]: value || undefined });
  };

  const clearFilters = () => {
    onFilterChange({});
  };

  const hasActiveFilters = Object.values(filters).some(
    (v) => v !== undefined && v !== '' && v !== 0
  );

  const selectClasses =
    'bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-md px-3 py-2 ' +
    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ' +
    'appearance-none cursor-pointer min-w-[140px]';

  const inputClasses =
    'bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-md px-3 py-2 ' +
    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-[100px]';

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* State */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">
            State
          </label>
          <select
            className={selectClasses}
            value={filters.state || ''}
            onChange={(e) => handleChange('state', e.target.value)}
            disabled={loading}
          >
            <option value="">All states</option>
            {options.states.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </div>

        {/* City */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">
            City
          </label>
          <select
            className={selectClasses}
            value={filters.city || ''}
            onChange={(e) => handleChange('city', e.target.value)}
            disabled={loading}
          >
            <option value="">All cities</option>
            {options.cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </div>

        {/* Trade */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">
            Trade
          </label>
          <select
            className={selectClasses}
            value={filters.trade || ''}
            onChange={(e) => handleChange('trade', e.target.value)}
            disabled={loading}
          >
            <option value="">All trades</option>
            {options.trades.map((trade) => (
              <option key={trade} value={trade}>
                {trade}
              </option>
            ))}
          </select>
        </div>

        {/* Status */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">
            Status
          </label>
          <select
            className={selectClasses}
            value={filters.status || ''}
            onChange={(e) => handleChange('status', e.target.value)}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>

        {/* Outreach Status */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">
            Outreach
          </label>
          <select
            className={selectClasses}
            value={filters.outreach_status || ''}
            onChange={(e) => handleChange('outreach_status', e.target.value)}
          >
            <option value="">All outreach</option>
            {OUTREACH_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>

        {/* Min Score */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">
            Min Score
          </label>
          <input
            type="text"
            className={inputClasses}
            placeholder="e.g. 50"
            value={filters.minScore === undefined ? '' : String(filters.minScore)}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9]/g, '');
              onFilterChange({ ...filters, minScore: raw === '' ? undefined : Number(raw) });
            }}
          />
        </div>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-transparent select-none">Clear</label>
            <button
              onClick={clearFilters}
              className="text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 rounded-md px-3 py-2 transition-colors"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
