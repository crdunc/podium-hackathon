// ============================================================
// Outreach Message Generator — Claude-powered, traditional sales process
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import type { OutreachLead, OutreachMessage } from './types';
import { TRADITIONAL_SALES_PROCESS, RAC_METHODOLOGY } from './skills/salesMethodology';
import { OBJECTION_HANDLING_SKILLS } from './skills/objectionHandling';


const COMPANY_NAME = process.env.YOUR_COMPANY_NAME ?? 'WebPros';
const YOUR_WEBSITE = process.env.YOUR_WEBSITE ?? 'https://webpros.com';
const YOUR_CALENDLY = process.env.YOUR_CALENDLY ?? 'https://calendly.com/yourname';
const PAYMENT_LINK = process.env.STRIPE_PAYMENT_LINK ?? '';

// ── Tool definitions ────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'create_payment_link',
    description:
      'Generate a Stripe payment link for this prospect. Use in follow-up messages or special offers, NOT in first cold outreach.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reason: {
          type: 'string',
          description: 'Brief reason for including a payment link',
        },
      },
      required: ['reason'],
    },
  },
];

// ── Context builder ─────────────────────────────────────────

function buildContext(lead: OutreachLead): string {
  const websiteNote = lead.has_website
    ? 'They currently have a website, but we can help upgrade or improve it.'
    : 'They do NOT have a website yet — this is a strong opportunity.';

  const siteUrlNote = lead.site_url
    ? `\nDemo site: We already built a free demo site for them: ${lead.site_url} — mention this in outreach!`
    : '';

  return `
Business name: ${lead.company_name}
Industry: ${lead.trade_category}
Location: ${lead.city}${lead.state ? `, ${lead.state}` : ''}
Website status: ${websiteNote}${siteUrlNote}
`.trim();
}

// ── Agentic message generation with tool loop ───────────────

async function generateWithTools(
  lead: OutreachLead,
  system: string,
  userPrompt: string,
  enablePaymentLink: boolean
): Promise<OutreachMessage> {
  const tools = enablePaymentLink ? TOOLS : [];
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userPrompt },
  ];

  const client = new Anthropic();
  let response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    system,
    tools,
    messages,
  });

  let paymentLink: string | undefined;

  while (response.stop_reason === 'tool_use') {
    const toolBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolCall of toolBlocks) {
      if (toolCall.name === 'create_payment_link') {
        paymentLink = PAYMENT_LINK;
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: JSON.stringify({ paymentLink: PAYMENT_LINK }),
        });
      } else {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: JSON.stringify({ error: 'Unknown tool' }),
          is_error: true,
        });
      }
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });

    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system,
      tools,
      messages,
    });
  }

  const text = response.content.find((b) => b.type === 'text')?.text ?? '';
  const parsed = parseJson<OutreachMessage>(text);
  if (paymentLink) parsed.paymentLink = paymentLink;
  return parsed;
}

// ── Public generators ───────────────────────────────────────

export async function generateInitialEmail(lead: OutreachLead): Promise<OutreachMessage> {
  const system = `You are a sales rep for ${COMPANY_NAME}, a web design agency that builds websites for local service businesses.

${TRADITIONAL_SALES_PROCESS}

${RAC_METHODOLOGY}

For this message you are in PROSPECTING: cold outreach. Goal is to get a response or a meeting.
For this INITIAL outreach email:
- Keep it under 150 words
- The CLOSE should be: schedule a free 15-minute call at ${YOUR_CALENDLY}
- Do NOT include a payment link in the first email — build the relationship first
- If the lead context includes a demo site URL, include that link in the email body so the prospect can click through to see their demo`;

  const userPrompt = `Write an initial outreach email for this business:

${buildContext(lead)}

Return ONLY a JSON object with keys "subject" and "body". No markdown, no extra text.`;

  return generateWithTools(lead, system, userPrompt, false);
}

export async function generateFollowUpEmail(
  lead: OutreachLead,
  followUpNumber: number
): Promise<OutreachMessage> {
  const isLastFollowUp = followUpNumber >= 2;

  const system = `You are a sales rep for ${COMPANY_NAME}, a web design agency for local trades businesses.

${TRADITIONAL_SALES_PROCESS}

${RAC_METHODOLOGY}

For this message you are in PROSPECTING: follow-up. Goal is to get a response or a meeting.
For this FOLLOW-UP #${followUpNumber} email:
- Keep it under 120 words
- Reference that you've reached out before, but do NOT guilt them
- The RESOLVE should name a NEW pain point (don't repeat the first email)
${isLastFollowUp
    ? '- This is the FINAL follow-up. You may use the create_payment_link tool to include a special introductory offer. Frame it as a limited-time opportunity.'
    : `- The CLOSE should be: schedule a free call at ${YOUR_CALENDLY}`
  }`;

  const userPrompt = `Write follow-up #${followUpNumber} for this business (they haven't replied yet):

${buildContext(lead)}

Return ONLY a JSON object with keys "subject" and "body". No markdown, no extra text.`;

  return generateWithTools(lead, system, userPrompt, isLastFollowUp);
}

export async function generateSms(
  lead: OutreachLead,
  isFollowUp: boolean
): Promise<OutreachMessage> {
  const system = `You are a sales rep for ${COMPANY_NAME}, a web design agency for local trades businesses.

${TRADITIONAL_SALES_PROCESS}

${RAC_METHODOLOGY}

For this message you are in PROSPECTING. Goal is to get a response or a meeting.
For this SMS:
- Under 160 characters (one SMS segment)
- Casual and personal — mention their business name and location
- RESOLVE in one short phrase, then go straight to the CLOSE
- Include this link: ${YOUR_WEBSITE}
- No emojis, no sign-off`;

  const userPrompt = `Write ${isFollowUp ? 'a follow-up' : 'an initial'} SMS for:

${buildContext(lead)}

Return ONLY a JSON object with key "body". No markdown, no extra text.`;

  return generateWithTools(lead, system, userPrompt, false);
}

// ── Negotiation reply (objection handling) ───────────────────

export async function generateNegotiationReply(
  lead: OutreachLead,
  prospectMessage: string,
  channel: 'email' | 'sms'
): Promise<OutreachMessage> {
  const isEmail = channel === 'email';

  const system = `You are a sales rep for ${COMPANY_NAME}, a web design agency for local service businesses. When replying to prospects, you follow the traditional tech sales process and use objection-handling playbooks.

${TRADITIONAL_SALES_PROCESS}

${RAC_METHODOLOGY}

${OBJECTION_HANDLING_SKILLS}

When replying: identify whether the prospect is asking about price, asking for a call, deflecting ("send info"), saying they have someone, or pushing on timing/trust. Use the matching playbook above. Stay calm and empathetic; one CTA per message.

Channel rules:
- Channel: ${channel.toUpperCase()}
- Keep replies appropriate for the channel (shorter and more conversational for SMS; more structured and detailed for email).
- For SMS: no subject, under 160 characters, no sign-off, no emojis.
- For email: include a clear subject and a concise, skimmable body.
- Only suggest or use a payment link if the prospect is showing clear intent to move forward (e.g., asking about next steps, pricing details, or timeline).`;

  const context = buildContext(lead);

  const userPrompt = `You are replying to a prospect who just sent this message:

"${prospectMessage}"

Lead context:
${context}

Your goal is to:
- Acknowledge their objection or question.
- Briefly reframe value in their terms.
- If appropriate, ask one clarifying question OR propose a concrete next step.

Return ONLY a JSON object with keys:
${isEmail ? '- "subject" and "body" for email replies' : '- "body" for SMS replies only'}
No markdown, no extra text.`;

  const reply = await generateWithTools(
    lead,
    system,
    userPrompt,
    isEmail
  );

  if (!isEmail) {
    return { body: reply.body, paymentLink: reply.paymentLink };
  }

  return reply;
}

// ── Helpers ─────────────────────────────────────────────────

function parseJson<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```(?:json)?\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim();
  if (!cleaned) throw new Error('Agent returned empty response');
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error(`Agent returned invalid JSON: ${raw.slice(0, 200)}`);
  }
}
