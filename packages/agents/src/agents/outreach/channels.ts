// ============================================================
// Outreach Channels — Email (Resend) + SMS (Twilio)
// Migrated from sales agent/src/channels/
// ============================================================

import { Resend } from 'resend';
import twilio from 'twilio';
import { log } from '../../utils/logger';

const AGENT_NAME = 'Outreach';

// ── Email via Resend ────────────────────────────────────────

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is required for email outreach');
    }
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<void> {
  const from = `${process.env.FROM_NAME ?? 'WebPros'} <${process.env.FROM_EMAIL ?? 'outreach@webpros.com'}>`;
  const { data, error } = await getResend().emails.send({
    from,
    to: params.to,
    subject: params.subject,
    text: params.body,
  });

  if (error) {
    throw new Error(`Resend error: ${JSON.stringify(error)}`);
  }

  log('success', AGENT_NAME, `Email sent to ${params.to} (id: ${data?.id})`);
}

// ── SMS via Twilio ──────────────────────────────────────────

let twilioClient: ReturnType<typeof twilio> | null = null;

function getTwilio() {
  if (!twilioClient) {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required for SMS outreach');
    }
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

export async function sendSms(params: {
  to: string;
  body: string;
}): Promise<void> {
  const fromNumber = process.env.TWILIO_PHONE_NUMBER ?? '';
  const message = await getTwilio().messages.create({
    from: fromNumber,
    to: params.to,
    body: params.body,
  });

  log('success', AGENT_NAME, `SMS sent to ${params.to} (sid: ${message.sid})`);
}
