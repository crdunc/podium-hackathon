import Anthropic from "@anthropic-ai/sdk";
import { Lead, OutreachMessage } from "./types";

const client = new Anthropic();

const COMPANY_NAME = process.env.YOUR_COMPANY_NAME ?? "WebPros";
const YOUR_WEBSITE = process.env.YOUR_WEBSITE ?? "https://webpros.com";
const YOUR_CALENDLY = process.env.YOUR_CALENDLY ?? "https://calendly.com/yourname";

function buildContext(lead: Lead): string {
  const websiteNote = lead.hasWebsite
    ? `They currently have a website, but we can help upgrade or improve it.`
    : `They do NOT have a website yet — this is a strong opportunity.`;

  return `
Business name: ${lead.businessName}
Industry: ${lead.industry}
Location: ${lead.location}
Website status: ${websiteNote}
`.trim();
}

export async function generateInitialEmail(lead: Lead): Promise<OutreachMessage> {
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 600,
    thinking: { type: "adaptive" },
    system: `You are a friendly, professional sales rep for ${COMPANY_NAME}, a web design agency that builds websites for local service businesses (HVAC, plumbing, electrical, etc.).

Your job is to write outreach emails to small business owners. Keep emails:
- Short (under 150 words)
- Personal and specific to their business/location
- Conversational, NOT corporate/spammy
- One clear call to action: schedule a free call at ${YOUR_CALENDLY}
- No exclamation marks in the subject line
- Sign off as "The ${COMPANY_NAME} Team"`,
    messages: [
      {
        role: "user",
        content: `Write an initial outreach email for this business:

${buildContext(lead)}

Return ONLY a JSON object with keys "subject" and "body". No markdown, no extra text.`,
      },
    ],
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  return parseJson<OutreachMessage>(text);
}

export async function generateFollowUpEmail(
  lead: Lead,
  followUpNumber: number
): Promise<OutreachMessage> {
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 500,
    thinking: { type: "adaptive" },
    system: `You are a friendly, professional sales rep for ${COMPANY_NAME}, a web design agency for local trades businesses.

Write brief follow-up emails. Be warm but direct. Reference that this is a follow-up to a previous email. Keep it under 100 words. One CTA: schedule a free call at ${YOUR_CALENDLY}. Sign off as "The ${COMPANY_NAME} Team".`,
    messages: [
      {
        role: "user",
        content: `Write follow-up #${followUpNumber} for this business (they haven't replied yet):

${buildContext(lead)}

Return ONLY a JSON object with keys "subject" and "body". No markdown, no extra text.`,
      },
    ],
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  return parseJson<OutreachMessage>(text);
}

export async function generateSms(
  lead: Lead,
  isFollowUp: boolean
): Promise<OutreachMessage> {
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 200,
    system: `You are a friendly sales rep for ${COMPANY_NAME}, a web design agency for local trades businesses.

Write an SMS message. Rules:
- Under 160 characters (one SMS)
- Casual and personal, mention their business name and location
- Include this link: ${YOUR_WEBSITE}
- No emojis
- No sign-off needed`,
    messages: [
      {
        role: "user",
        content: `Write ${isFollowUp ? "a follow-up" : "an initial"} SMS for:

${buildContext(lead)}

Return ONLY a JSON object with key "body". No markdown, no extra text.`,
      },
    ],
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  return parseJson<OutreachMessage>(text);
}

function parseJson<T>(raw: string): T {
  // Strip any markdown code fences if present
  const cleaned = raw
    .replace(/^```(?:json)?\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();
  return JSON.parse(cleaned) as T;
}
