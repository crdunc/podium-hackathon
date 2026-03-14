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
    return db.leads;
  } catch {
    return [];
  }
}

export async function GET() {
  const leads = loadLeads();

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

  return NextResponse.json({
    total: leads.length,
    byTrade: byTrade.sort((a, b) => b.count - a.count),
    byStatus,
  });
}
