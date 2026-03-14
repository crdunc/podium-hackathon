// ============================================================
// Outreach Agent
// Executes the 3-step outreach sequence for leads.
// Migrated from sales agent/ — uses Supabase instead of SQLite.
// ============================================================

import type { AgentResult } from '@podium/shared';
import type { OutreachLead } from './types';
import { SEQUENCE_STEPS } from './types';
import { generateInitialEmail, generateFollowUpEmail, generateSms } from './message-generator';
import { sendEmail, sendSms } from './channels';
import { log } from '../../utils/logger';
import { getClient as getSupabase } from '../../utils/supabase';

const AGENT_NAME = 'OutreachAgent';

// ── Supabase helpers ────────────────────────────────────────

async function getLeadsForOutreach(leadIds?: string[]): Promise<OutreachLead[]> {
  const supabase = getSupabase();
  let query = supabase
    .from('leads')
    .select('*')
    .not('email', 'is', null);

  if (leadIds && leadIds.length > 0) {
    query = query.in('id', leadIds);
  }

  // Get leads that haven't started outreach yet
  query = query.or('outreach_status.is.null,outreach_status.eq.pending');

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as OutreachLead[];
}

async function getLeadsDueForFollowUp(): Promise<OutreachLead[]> {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .not('outreach_status', 'in', '("converted","unsubscribed")')
    .lt('sequence_step', 3)
    .lte('next_follow_up_at', now)
    .not('next_follow_up_at', 'is', null);

  if (error) throw error;
  return (data || []) as OutreachLead[];
}

async function updateLeadSequence(
  leadId: string,
  sequenceStep: number,
  nextFollowUpAt: string | null,
  outreachStatus: string
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('leads')
    .update({
      sequence_step: sequenceStep,
      next_follow_up_at: nextFollowUpAt,
      outreach_status: outreachStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId);

  if (error) throw error;
}

async function logOutreachToDb(
  leadId: string,
  sequenceStep: number,
  channel: string,
  body: string,
  subject?: string
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('outreach_log').insert({
    lead_id: leadId,
    sequence_step: sequenceStep,
    channel,
    subject: subject || null,
    body,
  });

  if (error) {
    log('warn', AGENT_NAME, `Failed to log outreach: ${error.message}`);
  }
}

// ── Step execution ──────────────────────────────────────────

async function executeStep(lead: OutreachLead, stepNumber: number): Promise<void> {
  const step = SEQUENCE_STEPS.find(s => s.stepNumber === stepNumber);
  if (!step) {
    log('info', AGENT_NAME, `Sequence complete for ${lead.company_name}`);
    return;
  }

  log('agent', AGENT_NAME, `${lead.company_name} | Step ${stepNumber}: ${step.label}`);

  for (const channel of step.channels) {
    if (channel === 'email') {
      if (!lead.email) {
        log('info', AGENT_NAME, `Skipping email (no address) for ${lead.company_name}`);
        continue;
      }
      const msg = stepNumber === 1
        ? await generateInitialEmail(lead)
        : await generateFollowUpEmail(lead, stepNumber - 1);

      await sendEmail({ to: lead.email, subject: msg.subject!, body: msg.body });
      await logOutreachToDb(lead.id, stepNumber, 'email', msg.body, msg.subject);

      if (msg.paymentLink) {
        log('info', AGENT_NAME, `Payment link included for ${lead.company_name}`);
      }
    }

    if (channel === 'sms') {
      if (!lead.phone) {
        log('info', AGENT_NAME, `Skipping SMS (no phone) for ${lead.company_name}`);
        continue;
      }
      const msg = await generateSms(lead, stepNumber > 1);
      await sendSms({ to: lead.phone, body: msg.body });
      await logOutreachToDb(lead.id, stepNumber, 'sms', msg.body);
    }
  }

  // Schedule next step or mark complete
  const nextStep = SEQUENCE_STEPS.find(s => s.stepNumber === stepNumber + 1);
  const nextFollowUpAt = nextStep
    ? new Date(Date.now() + nextStep.delayDays * 86400000).toISOString()
    : null;

  await updateLeadSequence(
    lead.id,
    stepNumber,
    nextFollowUpAt,
    stepNumber === 1 ? 'contacted' : lead.outreach_status
  );

  if (nextFollowUpAt) {
    log('info', AGENT_NAME, `Next follow-up for ${lead.company_name}: ${nextFollowUpAt}`);
  }
}

// ── Public API ──────────────────────────────────────────────

export interface OutreachResult {
  contacted: number;
  skipped: number;
  followUpsProcessed: number;
}

/** Start outreach for leads (new leads get step 1, due leads get their next step) */
export async function runOutreachAgent(
  leadIds?: string[]
): Promise<AgentResult<OutreachResult>> {
  const startTime = Date.now();
  const errors: string[] = [];
  let contacted = 0;
  let skipped = 0;
  let followUpsProcessed = 0;

  log('agent', AGENT_NAME, 'Starting outreach sequence');

  // Process new leads (step 1)
  try {
    const newLeads = await getLeadsForOutreach(leadIds);
    log('info', AGENT_NAME, `${newLeads.length} leads ready for initial outreach`);

    for (const lead of newLeads) {
      try {
        if (!lead.email && !lead.phone) {
          log('info', AGENT_NAME, `Skipping ${lead.company_name} — no contact info`);
          skipped++;
          continue;
        }
        await executeStep(lead, 1);
        contacted++;
      } catch (err) {
        const msg = `Failed outreach for ${lead.company_name}: ${(err as Error).message}`;
        log('error', AGENT_NAME, msg);
        errors.push(msg);
      }
    }
  } catch (err) {
    errors.push(`Failed to fetch leads: ${(err as Error).message}`);
  }

  // Process follow-ups
  try {
    const dueLeads = await getLeadsDueForFollowUp();
    log('info', AGENT_NAME, `${dueLeads.length} leads due for follow-up`);

    for (const lead of dueLeads) {
      try {
        await executeStep(lead, lead.sequence_step + 1);
        followUpsProcessed++;
      } catch (err) {
        const msg = `Follow-up failed for ${lead.company_name}: ${(err as Error).message}`;
        log('error', AGENT_NAME, msg);
        errors.push(msg);
      }
    }
  } catch (err) {
    errors.push(`Failed to fetch follow-ups: ${(err as Error).message}`);
  }

  const durationMs = Date.now() - startTime;
  log('success', AGENT_NAME,
    `Outreach complete: ${contacted} contacted, ${followUpsProcessed} follow-ups, ${skipped} skipped`
  );

  return {
    agentName: AGENT_NAME,
    success: errors.length === 0,
    data: { contacted, skipped, followUpsProcessed },
    itemsProcessed: contacted + followUpsProcessed,
    errors,
    durationMs,
  };
}
