export type Industry = "hvac" | "electrical" | "plumbing" | "other";

export type LeadStatus =
  | "pending"
  | "contacted"
  | "responded"
  | "converted"
  | "unsubscribed";

export interface Lead {
  id?: number;
  businessName: string;
  industry: Industry;
  location: string;
  hasWebsite: boolean;
  email: string;
  phone: string; // E.164 format: +1XXXXXXXXXX
  status: LeadStatus;
  sequenceStep: number; // 0 = not started, 1 = initial sent, 2 = day-3 sent, 3 = day-7 sent
  nextFollowUpAt: string | null; // ISO timestamp
  createdAt?: string;
  updatedAt?: string;
}

export interface OutreachMessage {
  subject?: string; // email only
  body: string;
}

export type SequenceStep = {
  stepNumber: number;
  delayDays: number;
  channels: ("email" | "sms")[];
  label: string;
};

export const SEQUENCE_STEPS: SequenceStep[] = [
  { stepNumber: 1, delayDays: 0, channels: ["email", "sms"], label: "Initial outreach" },
  { stepNumber: 2, delayDays: 3, channels: ["email"], label: "Follow-up #1" },
  { stepNumber: 3, delayDays: 7, channels: ["email", "sms"], label: "Final follow-up" },
];
