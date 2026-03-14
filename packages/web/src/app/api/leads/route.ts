import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { StoredLead } from '@podium/shared';

const DB_PATH = resolve(process.cwd(), '../../data/leads.json');

interface LeadDatabase {
  leads: StoredLead[];
  lastUpdated: string;
}

function loadLeads(): StoredLead[] {
  if (!existsSync(DB_PATH)) return [];
  try {
    const raw = readFileSync(DB_PATH, 'utf-8');
    const db: LeadDatabase = JSON.parse(raw);
    return db.leads.sort((a, b) => b.qualification_score - a.qualification_score);
  } catch {
    return [];
  }
}

export async function GET() {
  const leads = loadLeads();
  return NextResponse.json({ leads, total: leads.length });
}
