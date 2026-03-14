// ============================================================
// Agent 1: Search Agent
// Searches for local trade businesses. In mock mode, generates
// realistic data matching the teammate's Google Places schema.
// In live mode, scrapes Google or reads existing city files.
// ============================================================

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import * as cheerio from 'cheerio';
import { SEARCH_TEMPLATES, LEADS_DIR } from '@podium/shared';
import type { AgentResult, Lead, CityLeadsFile, SearchConfig, TradeCategory } from '@podium/shared';
import { fetchPage, buildGoogleSearchUrl } from '../utils/http';
import { log } from '../utils/logger';

const AGENT_NAME = 'SearchAgent';

/** Load leads from existing city JSON files (teammate's data) */
function loadExistingLeads(leadsDir: string): Lead[] {
  const allLeads: Lead[] = [];

  if (!existsSync(leadsDir)) return allLeads;

  const files = readdirSync(leadsDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    try {
      const raw = readFileSync(join(leadsDir, file), 'utf-8');
      const cityData: CityLeadsFile = JSON.parse(raw);
      log('info', AGENT_NAME, `Loaded ${cityData.leads.length} leads from ${file} (${cityData.city})`);
      allLeads.push(...cityData.leads);
    } catch (err) {
      log('error', AGENT_NAME, `Failed to load ${file}: ${(err as Error).message}`);
    }
  }

  return allLeads;
}

/** Generate search queries from config */
function generateQueries(config: SearchConfig): Array<{ query: string; trade: TradeCategory }> {
  const queries: Array<{ query: string; trade: TradeCategory }> = [];

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
        queries.push({ query, trade });
      }
    }
  }

  return queries;
}

/** Generate a Google Places-style ID */
function generatePlaceId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  let id = 'ChIJ';
  for (let i = 0; i < 24; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

/** Generate mock leads matching the teammate's schema */
function generateMockResults(trade: TradeCategory, location: string, query: string): Lead[] {
  const mockNames: Record<string, string[]> = {
    hvac: ['Comfort Air Systems', 'Arctic Breeze HVAC', 'Summit Heating & Cooling', 'Peak Climate Control', 'Mountain Air Services'],
    electrical: ['Bright Spark Electric', 'PowerLine Electrical', 'Volt Masters Inc', 'Circuit Pro Electric', 'Ampere Solutions'],
    plumbing: ['FlowMaster Plumbing', 'Aqua Fix Services', 'Pipeline Pros', 'ClearDrain Plumbing', 'TrueFlow Plumbing Co'],
    'lawn care': ['Green Valley Lawns', 'PrimeTurf Care', 'Nature\'s Edge Landscaping', 'Evergreen Lawn Service', 'Utah Yard Masters'],
    roofing: ['Summit Roofing Co', 'Alpine Roof Repair', 'TopShield Roofing', 'Peak Roofing Solutions'],
    painting: ['Fresh Coat Painters', 'ColorPro Painting', 'Precision Paint Co'],
    'carpet cleaning': ['Deep Clean Carpets', 'Sparkle Carpet Care'],
    'appliance repair': ['FixIt Appliance Pros', 'QuickFix Appliances'],
    handyman: ['HandyPro Services', 'Mr Fix-It Handyman'],
    'pest control': ['BugShield Pest Control', 'Critter Guard Services'],
    fencing: ['Solid Fence Co', 'Mountain Fence Builders'],
    concrete: ['Rock Solid Concrete', 'Utah Concrete Works'],
    'tree service': ['TallTimber Tree Service', 'Canopy Tree Care'],
    'garage door repair': ['LiftRight Garage Doors', 'ProDoor Repair'],
  };

  const names = mockNames[trade] || [`${trade} Services`];
  const city = location.split(',')[0].trim();

  return names.map((name) => {
    const placeId = generatePlaceId();
    const areaCode = ['801', '385', '435'][Math.floor(Math.random() * 3)];
    const hasPhone = Math.random() > 0.1;
    const hasWebsite = Math.random() > 0.6;

    return {
      id: `google_places_${placeId}`,
      company_name: name,
      trade_category: trade,
      description: null,
      address: `${100 + Math.floor(Math.random() * 9000)} Main St, ${location}`,
      phone: hasPhone ? `(${areaCode}) ${100 + Math.floor(Math.random() * 900)}-${1000 + Math.floor(Math.random() * 9000)}` : null,
      email: null,
      website: hasWebsite ? `https://www.${name.toLowerCase().replace(/[^a-z]/g, '')}.com` : null,
      has_website: hasWebsite,
      contacts: [],
      google_place_id: placeId,
      business_status: 'OPERATIONAL',
      collected_at: new Date().toISOString(),
      metadata: {
        search_query: query,
        location,
      },
    };
  });
}

/** Main search agent execution */
export async function runSearchAgent(
  config: SearchConfig,
  useMock = false,
  leadsDir: string = LEADS_DIR,
): Promise<AgentResult<Lead[]>> {
  const startTime = Date.now();
  const allLeads: Lead[] = [];
  const errors: string[] = [];

  log('agent', AGENT_NAME, `Starting search across ${config.trades.length} trades × ${config.locations.length} locations`);

  // First: load any existing city files from teammate's data
  const existingLeads = loadExistingLeads(leadsDir);
  if (existingLeads.length > 0) {
    log('success', AGENT_NAME, `Loaded ${existingLeads.length} existing leads from city files`);
    allLeads.push(...existingLeads);
  }

  // Then: run additional searches (mock or live)
  const queries = generateQueries(config);
  log('info', AGENT_NAME, `Generated ${queries.length} search queries`);

  for (const { query, trade } of queries) {
    try {
      log('info', AGENT_NAME, `Searching: "${query}"`);

      let leads: Lead[];

      if (useMock) {
        const location = config.locations.find(l => query.includes(l)) || config.locations[0];
        leads = generateMockResults(trade, location, query);
      } else {
        // In live mode, we could scrape Google here.
        // For now, skip if we already have city file data for this location.
        const location = config.locations.find(l => query.includes(l)) || '';
        const alreadyHaveData = existingLeads.some(l => l.metadata.location === location);
        if (alreadyHaveData) {
          log('info', AGENT_NAME, `Skipping "${query}" — already have city file data`);
          continue;
        }
        // Placeholder for live scraping
        log('warn', AGENT_NAME, `Live scraping not yet wired — skipping "${query}"`);
        continue;
      }

      log('success', AGENT_NAME, `Found ${leads.length} leads for "${query}"`);
      allLeads.push(...leads);
    } catch (err) {
      const errorMsg = `Failed query "${query}": ${(err as Error).message}`;
      log('error', AGENT_NAME, errorMsg);
      errors.push(errorMsg);
    }
  }

  const durationMs = Date.now() - startTime;
  log('success', AGENT_NAME, `Completed: ${allLeads.length} total leads found in ${(durationMs / 1000).toFixed(1)}s`);

  return {
    agentName: AGENT_NAME,
    success: errors.length < queries.length || allLeads.length > 0,
    data: allLeads,
    itemsProcessed: queries.length,
    errors,
    durationMs,
  };
}
