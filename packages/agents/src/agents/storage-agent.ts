// ============================================================
// Agent 4: Storage Agent
// Stores leads back into per-city JSON files in data/leads/.
// Maintains teammate's CityLeadsFile format with enriched fields.
// Dedup logic: match on id (google_place_id) first, then
// normalized company_name + trade_category.
// ============================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import type { AgentResult, EnrichedLead, StoredLead, CityLeadsFile } from '@podium/shared';
import { LEADS_DIR } from '@podium/shared';
import { log } from '../utils/logger';

const AGENT_NAME = 'StorageAgent';

/** Normalize a city name into a filename slug (e.g. "Salt Lake City, UT" → "salt-lake-city-ut") */
function cityToFilename(city: string): string {
  return city
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .trim() + '.json';
}

/** Extract city from a lead's metadata.location */
function getLeadCity(lead: EnrichedLead | StoredLead): string {
  return (lead.metadata?.location as string) || 'unknown';
}

/** Normalize a business name for dedup matching */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\b(llc|inc|corp|co|ltd|the|of)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Merge new data into existing lead (keep non-null values) */
function mergeLeadData(existing: StoredLead, incoming: EnrichedLead): StoredLead {
  return {
    ...existing,
    phone: incoming.phone || existing.phone,
    email: incoming.email || existing.email,
    website: incoming.website || existing.website,
    address: incoming.address || existing.address,
    has_website: incoming.has_website || existing.has_website,
    description: incoming.description || existing.description,
    owner_name: incoming.owner_name || existing.owner_name,
    social_profiles: {
      ...existing.social_profiles,
      ...incoming.social_profiles,
    },
    contacts: incoming.contacts.length > 0 ? incoming.contacts : existing.contacts,
    services: incoming.services?.length ? incoming.services : existing.services,
    years_in_business: incoming.years_in_business ?? existing.years_in_business,
    qualification_score: Math.max(existing.qualification_score, incoming.qualification_score),
    qualification_reasons: incoming.qualification_score >= existing.qualification_score
      ? incoming.qualification_reasons
      : existing.qualification_reasons,
    updated_at: new Date().toISOString(),
  };
}

/** Load all stored leads from per-city JSON files */
function loadAllCityLeads(leadsDir: string): Map<string, StoredLead[]> {
  const cityMap = new Map<string, StoredLead[]>();

  if (!existsSync(leadsDir)) return cityMap;

  const files = readdirSync(leadsDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    try {
      const raw = readFileSync(join(leadsDir, file), 'utf-8');
      const cityData: CityLeadsFile = JSON.parse(raw);
      // Treat existing leads as StoredLead (add defaults for missing pipeline fields)
      const stored: StoredLead[] = cityData.leads.map(l => ({
        ...l,
        qualification_score: (l as any).qualification_score ?? 0,
        qualification_reasons: (l as any).qualification_reasons ?? [],
        enriched_at: (l as any).enriched_at ?? l.collected_at,
        status: (l as any).status ?? 'new',
        created_at: (l as any).created_at ?? l.collected_at,
        updated_at: (l as any).updated_at ?? l.collected_at,
      }));
      cityMap.set(cityData.city, stored);
    } catch (err) {
      log('warn', AGENT_NAME, `Could not load ${file}: ${(err as Error).message}`);
    }
  }

  return cityMap;
}

/** Save city leads back to their JSON file */
function saveCityFile(leadsDir: string, city: string, leads: StoredLead[]) {
  mkdirSync(leadsDir, { recursive: true });
  const filename = cityToFilename(city);
  const cityFile: CityLeadsFile & { leads: StoredLead[] } = {
    city,
    leads,
    updated_at: new Date().toISOString(),
  };
  writeFileSync(join(leadsDir, filename), JSON.stringify(cityFile, null, 2));
}

/** Main storage agent */
export async function runStorageAgent(
  leads: EnrichedLead[],
  leadsDir: string = LEADS_DIR
): Promise<AgentResult<{ stored: number; duplicates: number; totalInDb: number }>> {
  const startTime = Date.now();
  const errors: string[] = [];
  let stored = 0;
  let duplicates = 0;

  log('agent', AGENT_NAME, `Storing ${leads.length} enriched leads into ${leadsDir}`);

  // Load existing city data
  const cityMap = loadAllCityLeads(leadsDir);

  // Build global dedup indices across all cities
  const idIndex = new Map<string, { city: string; idx: number }>();
  const nameTradeIndex = new Map<string, { city: string; idx: number }>();

  for (const [city, cityLeads] of cityMap) {
    for (let i = 0; i < cityLeads.length; i++) {
      idIndex.set(cityLeads[i].id, { city, idx: i });
      const key = `${normalizeName(cityLeads[i].company_name)}::${cityLeads[i].trade_category}`;
      nameTradeIndex.set(key, { city, idx: i });
    }
  }

  // Track which cities were modified
  const modifiedCities = new Set<string>();

  for (const lead of leads) {
    try {
      const city = getLeadCity(lead);

      // Check dedup by ID first (strongest match), then by name+trade
      let existing = idIndex.get(lead.id);
      if (!existing) {
        const key = `${normalizeName(lead.company_name)}::${lead.trade_category}`;
        existing = nameTradeIndex.get(key);
      }

      if (existing) {
        // Update existing lead in its current city
        const cityLeads = cityMap.get(existing.city)!;
        cityLeads[existing.idx] = mergeLeadData(cityLeads[existing.idx], lead);
        modifiedCities.add(existing.city);
        duplicates++;
        log('info', AGENT_NAME, `Updated existing: "${lead.company_name}" in ${existing.city} (dedup)`);
      } else {
        // New lead — add to appropriate city bucket
        if (!cityMap.has(city)) cityMap.set(city, []);
        const cityLeads = cityMap.get(city)!;

        const storedLead: StoredLead = {
          ...lead,
          status: 'new',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const idx = cityLeads.length;
        cityLeads.push(storedLead);

        // Update indices
        idIndex.set(lead.id, { city, idx });
        const key = `${normalizeName(lead.company_name)}::${lead.trade_category}`;
        nameTradeIndex.set(key, { city, idx });

        modifiedCities.add(city);
        stored++;
        log('success', AGENT_NAME, `Stored new lead: "${lead.company_name}" in ${city} (score: ${lead.qualification_score})`);
      }
    } catch (err) {
      const errorMsg = `Failed to store "${lead.company_name}": ${(err as Error).message}`;
      log('error', AGENT_NAME, errorMsg);
      errors.push(errorMsg);
    }
  }

  // Write only modified city files back to disk
  for (const city of modifiedCities) {
    saveCityFile(leadsDir, city, cityMap.get(city)!);
    log('info', AGENT_NAME, `Saved ${cityMap.get(city)!.length} leads to ${cityToFilename(city)}`);
  }

  // Count total across all cities
  let totalInDb = 0;
  for (const cityLeads of cityMap.values()) {
    totalInDb += cityLeads.length;
  }

  const durationMs = Date.now() - startTime;
  log('success', AGENT_NAME,
    `Storage complete: ${stored} new, ${duplicates} updated, ${totalInDb} total across ${cityMap.size} cities`
  );

  return {
    agentName: AGENT_NAME,
    success: true,
    data: { stored, duplicates, totalInDb },
    itemsProcessed: leads.length,
    errors,
    durationMs,
  };
}

/** Utility: get all leads from all city files */
export function getAllLeads(leadsDir: string = LEADS_DIR): StoredLead[] {
  const cityMap = loadAllCityLeads(leadsDir);
  const all: StoredLead[] = [];
  for (const cityLeads of cityMap.values()) {
    all.push(...cityLeads);
  }
  return all.sort((a, b) => b.qualification_score - a.qualification_score);
}

/** Utility: get lead stats by trade */
export function getLeadStats(leadsDir: string = LEADS_DIR) {
  const leads = getAllLeads(leadsDir);

  const tradeMap = new Map<string, { count: number; totalScore: number; withEmail: number; withPhone: number }>();
  const statusMap = new Map<string, number>();
  const cityMap = new Map<string, number>();

  for (const lead of leads) {
    const t = tradeMap.get(lead.trade_category) || { count: 0, totalScore: 0, withEmail: 0, withPhone: 0 };
    t.count++;
    t.totalScore += lead.qualification_score;
    if (lead.email) t.withEmail++;
    if (lead.phone) t.withPhone++;
    tradeMap.set(lead.trade_category, t);

    statusMap.set(lead.status, (statusMap.get(lead.status) || 0) + 1);

    const city = getLeadCity(lead);
    cityMap.set(city, (cityMap.get(city) || 0) + 1);
  }

  const byTrade = [...tradeMap.entries()].map(([trade, data]) => ({
    trade,
    count: data.count,
    avg_score: data.count > 0 ? data.totalScore / data.count : 0,
    with_email: data.withEmail,
    with_phone: data.withPhone,
  }));

  const byStatus = [...statusMap.entries()].map(([status, count]) => ({ status, count }));
  const byCity = [...cityMap.entries()].map(([city, count]) => ({ city, count }));

  return { byTrade, byStatus, byCity, total: leads.length };
}
