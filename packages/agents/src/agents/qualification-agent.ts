// ============================================================
// Agent 2: Qualification Agent (AI-Powered)
// Uses Claude to reason about lead quality instead of fixed weights.
// Claude evaluates each batch of leads and provides scores + reasoning.
// Falls back to deterministic scoring if no API key.
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { QUALIFICATION_WEIGHTS } from '@podium/shared';
import type { AgentResult, Lead, QualifiedLead } from '@podium/shared';
import { log } from '../utils/logger';

const AGENT_NAME = 'QualifyAgent';
const BATCH_SIZE = 20;

const QUALIFICATION_PROMPT = `You are a lead qualification expert for a local trade business lead generation system.

Evaluate each lead and assign a qualification_score (0-100) with reasoning.

Scoring guidelines:
- 80-100: High value — has phone, website, address, operational, likely real local business
- 60-79: Medium value — has most contact info, operational, but missing some signals
- 40-59: Low value — minimal info, may be hard to reach
- 0-39: Junk — closed, fake, duplicate name patterns, or clearly not a real business

Consider these factors:
- Has phone number? (critical for outreach)
- Has website? (shows they invest in their business)
- Has physical address? (confirms legitimacy)
- Is operational? (closed businesses are worthless)
- Company name quality (generic names like "Electrician Salt Lake City" are likely SEO pages, not real businesses)
- Does the name suggest a franchise vs independent? (note this in reasoning)
- Does the address match the listed city? (catches misattributed leads)

Return a JSON array of objects with this exact shape:
[
  {
    "id": "the lead's id",
    "qualification_score": 75,
    "qualification_reasons": ["Has phone and address", "Name suggests independent business", "No website — room to improve"]
  }
]

Only return the JSON array, nothing else.`;

/** AI-powered qualification — Claude reasons about lead quality */
async function qualifyWithAI(leads: Lead[]): Promise<Map<string, { score: number; reasons: string[] }>> {
  const client = new Anthropic();
  const results = new Map<string, { score: number; reasons: string[] }>();

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(leads.length / BATCH_SIZE);

    log('info', AGENT_NAME, `AI qualifying batch ${batchNum}/${totalBatches} (${batch.length} leads)`);

    const leadsData = batch.map(l => ({
      id: l.id,
      company_name: l.company_name,
      trade_category: l.trade_category,
      phone: l.phone,
      email: l.email,
      website: l.website,
      has_website: l.has_website,
      address: l.address,
      business_status: l.business_status,
      metadata_location: l.metadata.location,
    }));

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: `Qualify these ${batch.length} leads:\n\n${JSON.stringify(leadsData, null, 2)}`,
        }],
        system: QUALIFICATION_PROMPT,
      });

      const text = response.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const scored: Array<{ id: string; qualification_score: number; qualification_reasons: string[] }> =
          JSON.parse(jsonMatch[0]);

        for (const s of scored) {
          results.set(s.id, {
            score: Math.max(0, Math.min(100, s.qualification_score)),
            reasons: s.qualification_reasons,
          });
        }
      }
    } catch (err) {
      log('warn', AGENT_NAME, `AI failed for batch ${batchNum}: ${(err as Error).message}. Falling back.`);
      for (const lead of batch) {
        const { score, reasons } = scoreLeadDeterministic(lead);
        results.set(lead.id, { score, reasons });
      }
    }
  }

  return results;
}

/** Deterministic scoring — fallback */
function scoreLeadDeterministic(lead: Lead): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (lead.phone) { score += QUALIFICATION_WEIGHTS.hasPhone; reasons.push(`Has phone: ${lead.phone}`); }
  if (lead.has_website || lead.website) { score += QUALIFICATION_WEIGHTS.hasWebsite; reasons.push('Has website'); }
  if (lead.address) { score += QUALIFICATION_WEIGHTS.hasAddress; reasons.push('Has physical address'); }
  if (lead.email) { score += QUALIFICATION_WEIGHTS.hasEmail; reasons.push('Has email'); }
  if (lead.business_status === 'OPERATIONAL') { score += QUALIFICATION_WEIGHTS.isOperational; reasons.push('Business is operational'); }
  if (lead.contacts && lead.contacts.length > 0) { score += QUALIFICATION_WEIGHTS.hasContacts; reasons.push(`${lead.contacts.length} contact(s)`); }

  return { score, reasons };
}

/** Exported for re-qualification in orchestrator */
export function scoreLead(lead: Lead): { score: number; reasons: string[] } {
  return scoreLeadDeterministic(lead);
}

function isJunkLead(lead: Lead): boolean {
  const junkPatterns = [/^(home|about|contact|services|privacy|terms)/i, /wikipedia/i, /^[\d\s]+$/];
  return (
    !lead.company_name ||
    lead.company_name.length < 2 ||
    lead.business_status === 'CLOSED_PERMANENTLY' ||
    junkPatterns.some(pattern => pattern.test(lead.company_name))
  );
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1') return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return phone;
}

/** Main qualification agent */
export async function runQualificationAgent(
  leads: Lead[],
  minScore: number
): Promise<AgentResult<QualifiedLead[]>> {
  const startTime = Date.now();
  const qualified: QualifiedLead[] = [];
  const errors: string[] = [];

  log('agent', AGENT_NAME, `Qualifying ${leads.length} leads (min score: ${minScore})`);

  let junkCount = 0;
  const validLeads: Lead[] = [];
  for (const lead of leads) {
    if (isJunkLead(lead)) { junkCount++; } else { validLeads.push(lead); }
  }
  if (junkCount > 0) log('info', AGENT_NAME, `Filtered ${junkCount} junk leads`);

  // AI if available, deterministic fallback
  let scoreMap: Map<string, { score: number; reasons: string[] }>;
  const useAI = !!process.env.ANTHROPIC_API_KEY;

  if (useAI) {
    log('info', AGENT_NAME, 'Using AI-powered qualification');
    scoreMap = await qualifyWithAI(validLeads);
  } else {
    log('info', AGENT_NAME, 'Using deterministic qualification (no ANTHROPIC_API_KEY)');
    scoreMap = new Map();
    for (const lead of validLeads) {
      scoreMap.set(lead.id, scoreLeadDeterministic(lead));
    }
  }

  let belowThreshold = 0;
  for (const lead of validLeads) {
    const scoring = scoreMap.get(lead.id);
    if (!scoring) continue;
    if (scoring.score < minScore) { belowThreshold++; continue; }

    qualified.push({
      ...lead,
      company_name: lead.company_name.trim().replace(/\s+/g, ' '),
      phone: lead.phone ? normalizePhone(lead.phone) : null,
      qualification_score: scoring.score,
      qualification_reasons: scoring.reasons,
    });
  }

  qualified.sort((a, b) => b.qualification_score - a.qualification_score);

  const durationMs = Date.now() - startTime;
  log('success', AGENT_NAME,
    `Qualified ${qualified.length}/${leads.length} leads ` +
    `(${junkCount} junk, ${belowThreshold} below threshold, ${useAI ? 'AI' : 'deterministic'})`
  );

  return {
    agentName: AGENT_NAME, success: true, data: qualified,
    itemsProcessed: leads.length, errors, durationMs,
  };
}
