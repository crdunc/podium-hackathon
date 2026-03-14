// ============================================================
// Agent 2: Qualification Agent
// Scores and filters leads based on data completeness
// and quality signals. Only qualified leads move forward.
// ============================================================

import { QUALIFICATION_WEIGHTS } from '@podium/shared';
import type { AgentResult, Lead, QualifiedLead } from '@podium/shared';
import { log } from '../utils/logger';

const AGENT_NAME = 'QualifyAgent';

/** Score a single lead based on available data */
function scoreLead(lead: Lead): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (lead.phone) {
    score += QUALIFICATION_WEIGHTS.hasPhone;
    reasons.push(`Has phone: ${lead.phone}`);
  }

  if (lead.has_website || lead.website) {
    score += QUALIFICATION_WEIGHTS.hasWebsite;
    reasons.push('Has website');
  }

  if (lead.address) {
    score += QUALIFICATION_WEIGHTS.hasAddress;
    reasons.push('Has physical address');
  }

  if (lead.email) {
    score += QUALIFICATION_WEIGHTS.hasEmail;
    reasons.push('Has email');
  }

  if (lead.business_status === 'OPERATIONAL') {
    score += QUALIFICATION_WEIGHTS.isOperational;
    reasons.push('Business is operational');
  }

  if (lead.contacts && lead.contacts.length > 0) {
    score += QUALIFICATION_WEIGHTS.hasContacts;
    reasons.push(`${lead.contacts.length} contact(s)`);
  }

  return { score, reasons };
}

/** Check for obvious junk / non-business entries */
function isJunkLead(lead: Lead): boolean {
  const junkPatterns = [
    /^(home|about|contact|services|privacy|terms)/i,
    /wikipedia/i,
    /^[\d\s]+$/,
  ];

  return (
    !lead.company_name ||
    lead.company_name.length < 2 ||
    lead.business_status === 'CLOSED_PERMANENTLY' ||
    junkPatterns.some(pattern => pattern.test(lead.company_name))
  );
}

/** Normalize phone numbers to a consistent format */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
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
  let belowThreshold = 0;

  for (const lead of leads) {
    try {
      if (isJunkLead(lead)) {
        junkCount++;
        continue;
      }

      const { score, reasons } = scoreLead(lead);

      if (score < minScore) {
        belowThreshold++;
        continue;
      }

      const qualifiedLead: QualifiedLead = {
        ...lead,
        company_name: lead.company_name.trim().replace(/\s+/g, ' '),
        phone: lead.phone ? normalizePhone(lead.phone) : null,
        qualification_score: score,
        qualification_reasons: reasons,
      };

      qualified.push(qualifiedLead);
    } catch (err) {
      errors.push(`Error qualifying "${lead.company_name}": ${(err as Error).message}`);
    }
  }

  qualified.sort((a, b) => b.qualification_score - a.qualification_score);

  const durationMs = Date.now() - startTime;

  log('success', AGENT_NAME,
    `Qualified ${qualified.length}/${leads.length} leads ` +
    `(${junkCount} junk, ${belowThreshold} below threshold)`
  );

  return {
    agentName: AGENT_NAME,
    success: true,
    data: qualified,
    itemsProcessed: leads.length,
    errors,
    durationMs,
  };
}
