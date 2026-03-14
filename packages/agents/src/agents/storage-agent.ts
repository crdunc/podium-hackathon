// ============================================================
// Agent 4: Storage Agent
// Stores leads in a local JSON file with deduplication.
// Dedup logic: match on id (google_place_id) first, then
// normalized company_name + trade_category.
// ============================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { AgentResult, EnrichedLead, StoredLead } from '@podium/shared';
import { log } from '../utils/logger';

const AGENT_NAME = 'StorageAgent';

const DEFAULT_DB_PATH = './data/leads.json';

interface LeadDatabase {
  leads: StoredLead[];
  nextId: number;
  lastUpdated: string;
}

/** Load or create the database */
function loadDatabase(dbPath: string): LeadDatabase {
  if (existsSync(dbPath)) {
    try {
      const raw = readFileSync(dbPath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      log('warn', AGENT_NAME, 'Corrupt database file, creating new one');
    }
  }
  return { leads: [], nextId: 1, lastUpdated: new Date().toISOString() };
}

/** Save the database */
function saveDatabase(db: LeadDatabase, dbPath: string) {
  mkdirSync(dirname(dbPath), { recursive: true });
  db.lastUpdated = new Date().toISOString();
  writeFileSync(dbPath, JSON.stringify(db, null, 2));
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
    updated_at: new Date().toISOString(),
  };
}

/** Main storage agent */
export async function runStorageAgent(
  leads: EnrichedLead[],
  dbPath: string = DEFAULT_DB_PATH
): Promise<AgentResult<{ stored: number; duplicates: number; totalInDb: number }>> {
  const startTime = Date.now();
  const errors: string[] = [];
  let stored = 0;
  let duplicates = 0;

  log('agent', AGENT_NAME, `Storing ${leads.length} enriched leads`);

  const db = loadDatabase(dbPath);

  // Build lookup indices for dedup
  const idIndex = new Map<string, number>();
  const nameTradeIndex = new Map<string, number>();
  for (let i = 0; i < db.leads.length; i++) {
    idIndex.set(db.leads[i].id, i);
    const key = `${normalizeName(db.leads[i].company_name)}::${db.leads[i].trade_category}`;
    nameTradeIndex.set(key, i);
  }

  for (const lead of leads) {
    try {
      // Check dedup by ID first (strongest match), then by name+trade
      let existingIdx = idIndex.get(lead.id);
      if (existingIdx === undefined) {
        const key = `${normalizeName(lead.company_name)}::${lead.trade_category}`;
        existingIdx = nameTradeIndex.get(key);
      }

      if (existingIdx !== undefined) {
        db.leads[existingIdx] = mergeLeadData(db.leads[existingIdx], lead);
        duplicates++;
        log('info', AGENT_NAME, `Updated existing: "${lead.company_name}" (dedup)`);
      } else {
        const storedLead: StoredLead = {
          ...lead,
          status: 'new',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const idx = db.leads.length;
        db.leads.push(storedLead);
        idIndex.set(lead.id, idx);
        const key = `${normalizeName(lead.company_name)}::${lead.trade_category}`;
        nameTradeIndex.set(key, idx);
        stored++;
        log('success', AGENT_NAME, `Stored new lead: "${lead.company_name}" (score: ${lead.qualification_score})`);
      }
    } catch (err) {
      const errorMsg = `Failed to store "${lead.company_name}": ${(err as Error).message}`;
      log('error', AGENT_NAME, errorMsg);
      errors.push(errorMsg);
    }
  }

  saveDatabase(db, dbPath);

  const durationMs = Date.now() - startTime;
  log('success', AGENT_NAME,
    `Storage complete: ${stored} new, ${duplicates} updated, ${db.leads.length} total in DB`
  );

  return {
    agentName: AGENT_NAME,
    success: true,
    data: { stored, duplicates, totalInDb: db.leads.length },
    itemsProcessed: leads.length,
    errors,
    durationMs,
  };
}

/** Utility: get all leads from the database */
export function getAllLeads(dbPath: string = DEFAULT_DB_PATH): StoredLead[] {
  const db = loadDatabase(dbPath);
  return db.leads.sort((a, b) => b.qualification_score - a.qualification_score);
}

/** Utility: get lead stats by trade */
export function getLeadStats(dbPath: string = DEFAULT_DB_PATH) {
  const db = loadDatabase(dbPath);
  const leads = db.leads;

  const tradeMap = new Map<string, { count: number; totalScore: number; withEmail: number; withPhone: number }>();
  const statusMap = new Map<string, number>();

  for (const lead of leads) {
    const t = tradeMap.get(lead.trade_category) || { count: 0, totalScore: 0, withEmail: 0, withPhone: 0 };
    t.count++;
    t.totalScore += lead.qualification_score;
    if (lead.email) t.withEmail++;
    if (lead.phone) t.withPhone++;
    tradeMap.set(lead.trade_category, t);

    statusMap.set(lead.status, (statusMap.get(lead.status) || 0) + 1);
  }

  const byTrade = [...tradeMap.entries()].map(([trade, data]) => ({
    trade,
    count: data.count,
    avg_score: data.count > 0 ? data.totalScore / data.count : 0,
    with_email: data.withEmail,
    with_phone: data.withPhone,
  }));

  const byStatus = [...statusMap.entries()].map(([status, count]) => ({ status, count }));

  return { byTrade, byStatus, total: leads.length };
}
