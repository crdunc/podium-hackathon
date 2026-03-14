// ============================================================
// Scraper Registry
// Routes scraping requests to the right source based on config.
// Priority: Google Places → Claude Web Search → Yelp → Yellow Pages
// ============================================================

import type { Lead, TradeCategory } from '@podium/shared';
import { searchGooglePlaces } from './google-places';
import { searchWithClaude } from './claude-search';
import { scrapeYelp } from './yelp';
import { scrapeYellowPages } from './yellowpages';
import { log } from '../utils/logger';

const AGENT_NAME = 'Scraper';

export type ScraperSource = 'google_places' | 'claude_search' | 'yelp' | 'yellowpages';

export interface ScrapeOptions {
  trade: TradeCategory;
  location: string;
  query: string;
  maxResults?: number;
  googleApiKey?: string;
  /** Which sources to use, in priority order. Defaults to all. */
  sources?: ScraperSource[];
}

/**
 * Scrape for leads using available sources.
 * Tries sources in order until one returns results.
 * If a Google API key is set, uses that first (most reliable).
 * Claude web search is the primary fallback — no scraping, no 403s.
 */
export async function scrapeLeads(options: ScrapeOptions): Promise<Lead[]> {
  const {
    trade,
    location,
    query,
    maxResults = 10,
    googleApiKey,
    sources = googleApiKey
      ? ['google_places', 'claude_search', 'yelp', 'yellowpages']
      : ['claude_search', 'yelp', 'yellowpages'],
  } = options;

  for (const source of sources) {
    try {
      let leads: Lead[] = [];

      switch (source) {
        case 'google_places':
          if (!googleApiKey) {
            log('info', AGENT_NAME, 'Skipping Google Places — no API key');
            continue;
          }
          leads = await searchGooglePlaces(query, trade, location, googleApiKey, maxResults);
          break;

        case 'claude_search':
          leads = await searchWithClaude(trade, location, maxResults);
          break;

        case 'yelp':
          leads = await scrapeYelp(trade, location, maxResults);
          break;

        case 'yellowpages':
          leads = await scrapeYellowPages(trade, location, maxResults);
          break;
      }

      if (leads.length > 0) {
        log('success', AGENT_NAME, `${source} returned ${leads.length} leads for "${query}"`);
        return leads;
      }

      log('info', AGENT_NAME, `${source} returned 0 results, trying next source...`);
    } catch (err) {
      log('warn', AGENT_NAME, `${source} failed: ${(err as Error).message}, trying next...`);
    }
  }

  log('warn', AGENT_NAME, `All sources exhausted for "${query}" — 0 leads`);
  return [];
}

export { searchGooglePlaces } from './google-places';
export { searchWithClaude } from './claude-search';
export { scrapeYelp } from './yelp';
export { scrapeYellowPages } from './yellowpages';
