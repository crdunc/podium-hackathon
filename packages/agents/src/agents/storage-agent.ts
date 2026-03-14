// ============================================================
// Agent 4: Storage Agent
// Stores leads directly to Supabase. Handles dedup by merging
// new data into existing leads (keeps non-null values).
// ============================================================

import type { AgentResult, EnrichedLead, StoredLead } from '@podium/shared';
import { log } from '../utils/logger';
import {
  upsertLeads,
  getAllLeads as dbGetAllLeads,
  getLeadStats as dbGetLeadStats,
} from '../utils/supabase';

const AGENT_NAME = 'StorageAgent';

/** Extract city from a lead's metadata.location */
function getLeadCity(lead: EnrichedLead | StoredLead): string {
  return (lead.metadata?.location as string) || 'unknown';
}

/** Main storage agent — upserts leads to Supabase */
export async function runStorageAgent(
  leads: EnrichedLead[],
): Promise<AgentResult<{ stored: number; duplicates: number; totalInDb: number }>> {
  const startTime = Date.now();
  const errors: string[] = [];
  let stored = 0;

  log('agent', AGENT_NAME, `Storing ${leads.length} leads to Supabase`);

  // Group leads by city
  const byCity = new Map<string, StoredLead[]>();
  for (const lead of leads) {
    const city = getLeadCity(lead);
    if (!byCity.has(city)) byCity.set(city, []);

    const storedLead: StoredLead = {
      ...lead,
      status: 'new',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    byCity.get(city)!.push(storedLead);
  }

  // Upsert each city batch to Supabase
  for (const [city, cityLeads] of byCity) {
    try {
      const count = await upsertLeads(cityLeads, city);
      stored += count;
      log('success', AGENT_NAME, `Stored ${count} leads for ${city}`);
    } catch (err) {
      const msg = `Failed to store leads for ${city}: ${(err as Error).message}`;
      log('error', AGENT_NAME, msg);
      errors.push(msg);
    }
  }

  // Get total count from Supabase
  let totalInDb = 0;
  try {
    const stats = await dbGetLeadStats();
    totalInDb = stats.total;
  } catch {
    // non-critical
  }

  const durationMs = Date.now() - startTime;
  log('success', AGENT_NAME,
    `Storage complete: ${stored} upserted across ${byCity.size} cities, ${totalInDb} total in database`
  );

  return {
    agentName: AGENT_NAME,
    success: errors.length === 0,
    data: { stored, duplicates: 0, totalInDb },
    itemsProcessed: leads.length,
    errors,
    durationMs,
  };
}

/** Utility: get all leads from Supabase */
export async function getAllLeads(): Promise<StoredLead[]> {
  return dbGetAllLeads();
}

/** Utility: get lead stats from Supabase */
export async function getLeadStats() {
  return dbGetLeadStats();
}
