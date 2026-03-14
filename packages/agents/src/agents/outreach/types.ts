// ============================================================
// Outreach Agent — Types
// Migrated from sales agent/src/types.ts
// ============================================================

export type LeadStatus =
  | 'pending'
  | 'contacted'
  | 'responded'
  | 'converted'
  | 'unsubscribed';

export interface OutreachLead {
  id: string;                // uuid from leads table
  source_id: string;
  company_name: string;
  trade_category: string;
  city: string;
  state: string | null;
  has_website: boolean;
  email: string | null;
  phone: string | null;
  website: string | null;
  // Outreach-specific
  site_url?: string;         // Generated demo site on GitHub Pages
  outreach_status: LeadStatus;
  sequence_step: number;     // 0 = not started, 1 = initial, 2 = day-3, 3 = day-7
  next_follow_up_at: string | null;
}

export interface OutreachMessage {
  subject?: string;
  body: string;
  paymentLink?: string;
}

export interface SequenceStep {
  stepNumber: number;
  delayDays: number;
  channels: ('email' | 'sms')[];
  label: string;
}

export const SEQUENCE_STEPS: SequenceStep[] = [
  { stepNumber: 1, delayDays: 0, channels: ['email', 'sms'], label: 'Initial outreach' },
  { stepNumber: 2, delayDays: 3, channels: ['email'], label: 'Follow-up #1' },
  { stepNumber: 3, delayDays: 7, channels: ['email', 'sms'], label: 'Final follow-up' },
];
