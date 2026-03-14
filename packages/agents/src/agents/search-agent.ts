// ============================================================
// Agent 1: Search Agent
// Scrapes live leads from Google Places API / Yelp / Yellow Pages.
// Returns raw leads as JSON — the orchestrator handles everything else.
// ============================================================

import { SEARCH_TEMPLATES } from '@podium/shared';
import type { AgentResult, Lead, SearchConfig, TradeCategory } from '@podium/shared';
import { scrapeLeads, type ScraperSource } from '../scrapers';
import { log } from '../utils/logger';

const AGENT_NAME = 'SearchAgent';

/** Generate search queries from config */
function generateQueries(config: SearchConfig): Array<{ query: string; trade: TradeCategory; location: string }> {
  const queries: Array<{ query: string; trade: TradeCategory; location: string }> = [];

  for (const trade of config.trades) {
    const templates = SEARCH_TEMPLATES[trade] || ['{trade} in {location}'];
    for (const location of config.locations) {
      const selected = config.rotateQueries
        ? [templates[Math.floor(Math.random() * templates.length)]]
        : templates;

      for (const template of selected) {
        const query = template
          .replace('{trade}', trade)
          .replace('{location}', location);
        queries.push({ query, trade, location });
      }
    }
  }

  return queries;
}

export interface SearchAgentOptions {
  googleApiKey?: string;
  sources?: ScraperSource[];
}

/** Main search agent — scrapes and returns leads */
export async function runSearchAgent(
  config: SearchConfig,
  options: SearchAgentOptions = {},
): Promise<AgentResult<Lead[]>> {
  const startTime = Date.now();
  const allLeads: Lead[] = [];
  const errors: string[] = [];

  const queries = generateQueries(config);
  log('agent', AGENT_NAME, `Scraping ${queries.length} queries across ${config.trades.length} trades × ${config.locations.length} locations`);

  for (const { query, trade, location } of queries) {
    try {
      const scraped = await scrapeLeads({
        trade,
        location,
        query,
        maxResults: config.maxResultsPerQuery,
        googleApiKey: options.googleApiKey,
        sources: options.sources,
      });

      if (scraped.length > 0) {
        log('success', AGENT_NAME, `${scraped.length} leads for "${query}"`);
        allLeads.push(...scraped);
      }
    } catch (err) {
      const errorMsg = `Failed "${query}": ${(err as Error).message}`;
      log('error', AGENT_NAME, errorMsg);
      errors.push(errorMsg);
    }
  }

  const durationMs = Date.now() - startTime;
  log('success', AGENT_NAME, `Done: ${allLeads.length} leads scraped in ${(durationMs / 1000).toFixed(1)}s`);

  return {
    agentName: AGENT_NAME,
    success: errors.length < queries.length || allLeads.length > 0,
    data: allLeads,
    itemsProcessed: queries.length,
    errors,
    durationMs,
  };
}
