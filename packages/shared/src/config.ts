// ============================================================
// Lead Hunter Agents — Configuration
// ============================================================

import type { SearchConfig, TradeCategory } from './types';

/** Search query templates per trade — matches teammate's query format "{trade} in {location}" */
export const SEARCH_TEMPLATES: Record<string, string[]> = {
  hvac: [
    '{trade} in {location}',
    'air conditioning contractors in {location}',
    'heating and cooling companies in {location}',
  ],
  electrical: [
    '{trade} in {location}',
    'electricians in {location}',
    'electrical contractors in {location}',
  ],
  plumbing: [
    '{trade} in {location}',
    'plumbers in {location}',
    'plumbing companies in {location}',
  ],
  'lawn care': [
    '{trade} in {location}',
    'landscaping in {location}',
    'lawn mowing services in {location}',
  ],
  roofing: [
    '{trade} in {location}',
    'roof repair in {location}',
  ],
  painting: [
    '{trade} in {location}',
    'house painters in {location}',
  ],
  'carpet cleaning': [
    '{trade} in {location}',
  ],
  'appliance repair': [
    '{trade} in {location}',
  ],
  handyman: [
    '{trade} in {location}',
  ],
  'pest control': [
    '{trade} in {location}',
  ],
  fencing: [
    '{trade} in {location}',
  ],
  concrete: [
    '{trade} in {location}',
  ],
  'tree service': [
    '{trade} in {location}',
  ],
  'garage door repair': [
    '{trade} in {location}',
  ],
};

/** Default pipeline configuration */
export const DEFAULT_CONFIG: SearchConfig = {
  trades: [
    'hvac', 'electrical', 'plumbing', 'lawn care',
    'roofing', 'painting', 'carpet cleaning', 'appliance repair',
    'handyman', 'pest control', 'fencing', 'concrete',
    'tree service', 'garage door repair',
  ],
  locations: [
    'Salt Lake City, UT',
    'Provo, UT',
    'Ogden, UT',
  ],
  maxResultsPerQuery: 10,
  minQualificationScore: 30,
  rotateQueries: true,
};

/** Qualification weights */
export const QUALIFICATION_WEIGHTS = {
  hasPhone: 35,
  hasWebsite: 20,
  hasAddress: 15,
  hasEmail: 15,
  isOperational: 10,
  hasContacts: 5,
};

/** Rate limiting */
export const RATE_LIMITS = {
  delayBetweenRequests: 2000,  // ms
  maxConcurrent: 2,
  maxRetriesPerRequest: 2,
};

/** Paths — resolve from monorepo root */
import { resolve } from 'path';
import { existsSync } from 'fs';

function findMonorepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = resolve(dir, '..');
  }
  return process.cwd();
}

export const LEADS_DIR = resolve(findMonorepoRoot(), 'data', 'leads');
