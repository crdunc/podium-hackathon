// ============================================================
// Outreach Channels — Email (Resend) + SMS (Twilio)
// Migrated from sales agent/src/channels/
// ============================================================

import { Resend } from 'resend';
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

// ── SMS via Twilio (disabled — pending verification) ────────

export async function sendSms(params: {
  to: string;
  body: string;
}): Promise<void> {
  log('warn', AGENT_NAME, `SMS skipped (Twilio pending verification) — would send to ${params.to}`);
}
