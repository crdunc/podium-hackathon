import Anthropic from "@anthropic-ai/sdk";
import { Lead, OutreachMessage } from "./types";
import { PAYMENT_LINK } from "./stripe";

const client = new Anthropic();

const COMPANY_NAME = process.env.YOUR_COMPANY_NAME ?? "WebPros";
const YOUR_WEBSITE = process.env.YOUR_WEBSITE ?? "https://webpros.com";
const YOUR_CALENDLY = process.env.YOUR_CALENDLY ?? "https://calendly.com/yourname";
const MAX_DISCOUNT_PERCENT = Number(
  process.env.MAX_DISCOUNT_PERCENT ?? "15"
);

// ---------------------------------------------------------------------------
// Resolve-Ace-Close methodology prompt
// ---------------------------------------------------------------------------
const RAC_METHODOLOGY = `
You follow the Resolve-Ace-Close (RAC) sales methodology in every message:

1. RESOLVE — Lead with empathy. Name a specific pain the prospect likely faces
   (e.g., losing jobs to competitors with websites, missing calls because there's
   no online booking). Show you understand their world before pitching anything.

2. ACE — Position the solution with authority. Share a concrete proof point: a
   relevant stat, a mini case study ("we helped a plumber in Dallas 3x his
   inbound leads"), or a specific feature that maps to the pain you just named.
   Make it clear why YOU are the right fit for THEIR business.

3. CLOSE — End with one unambiguous next step. Never give two CTAs. The close
   should feel like a natural extension of the value you just showed, not a
   pressure tactic.

Tone rules:
- Write like a human, not a template. Vary sentence length. No filler phrases
  like "I hope this email finds you well."
- Mention the prospect's business name and location naturally.
- No exclamation marks in subject lines.
- Sign off as "The ${COMPANY_NAME} Team".
`.trim();

// ---------------------------------------------------------------------------
// Negotiation skills prompt
// ---------------------------------------------------------------------------
const NEGOTIATION_SKILLS = `
You are an expert sales negotiator for ${COMPANY_NAME}. When replying to prospects:

Core principles:
- Stay calm, empathetic, and respectful — never defensive or pushy.
- Acknowledge and LABEL their concern before responding (price, timing, trust, "we already have someone", etc.).
- Ask short, sincere QUESTIONS when helpful to uncover the real blocker (budget, authority, timing, competing priorities).
- Use specific proof points or mini case studies to reduce perceived risk.

Pricing and discounts:
- You may position flexible payment options and scope trade-offs.
- You may offer up to ${MAX_DISCOUNT_PERCENT}% off as a limited-time incentive, but ONLY when the prospect is meaningfully engaged or close to a yes.
- Never undermine the value by apologizing for the price — frame any discount as a partnership gesture, not desperation.

Closing behavior:
- Every reply should move the conversation ONE clear step forward: clarify requirements, propose a package, or agree on a concrete next step (usually a call or a payment link).
- Avoid long paragraphs; prefer short, skimmable chunks.
- Mirror the prospect's channel and level of formality (SMS vs email, casual vs professional) while still sounding like a trustworthy pro.
`.trim();

// ---------------------------------------------------------------------------
// Tool definitions for Claude tool_use
// ---------------------------------------------------------------------------
const TOOLS: Anthropic.Tool[] = [
  {
    name: "create_payment_link",
    description:
      "Generate a unique Stripe payment link for this prospect. Use this when the message should include a way for the prospect to purchase directly — typically in follow-up messages or when making a special offer, NOT in the very first cold outreach.",
    input_schema: {
      type: "object" as const,
      properties: {
        reason: {
          type: "string",
          description:
            "Brief reason for including a payment link (e.g., 'limited-time offer in final follow-up')",
        },
      },
      required: ["reason"],
    },
  },
];

// ---------------------------------------------------------------------------
// Lead context builder
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Agentic message generation with tool loop
// ---------------------------------------------------------------------------
async function generateWithTools(
  lead: Lead,
  system: string,
  userPrompt: string,
  enablePaymentLink: boolean
): Promise<OutreachMessage> {
  const tools = enablePaymentLink ? TOOLS : [];
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userPrompt },
  ];

  // Tool-use loop: let the model call tools, then feed results back
  let response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 800,
    thinking: { type: "adaptive" },
    system,
    tools,
    messages,
  });

  let paymentLink: string | undefined;

  while (response.stop_reason === "tool_use") {
    const toolBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolCall of toolBlocks) {
      if (toolCall.name === "create_payment_link") {
        paymentLink = PAYMENT_LINK;
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolCall.id,
          content: JSON.stringify({ paymentLink: PAYMENT_LINK }),
        });
      } else {
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolCall.id,
          content: JSON.stringify({ error: "Unknown tool" }),
          is_error: true,
        });
      }
    }

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });

    response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 800,
      thinking: { type: "adaptive" },
      system,
      tools,
      messages,
    });
  }

  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  const parsed = parseJson<OutreachMessage>(text);
  if (paymentLink) parsed.paymentLink = paymentLink;
  return parsed;
}

// ---------------------------------------------------------------------------
// Public generators
// ---------------------------------------------------------------------------

export async function generateInitialEmail(lead: Lead): Promise<OutreachMessage> {
  const system = `You are a sales rep for ${COMPANY_NAME}, a web design agency that builds websites for local service businesses.

${RAC_METHODOLOGY}

For this INITIAL outreach email:
- Keep it under 150 words
- The CLOSE should be: schedule a free 15-minute call at ${YOUR_CALENDLY}
- Do NOT include a payment link in the first email — build the relationship first`;

  const userPrompt = `Write an initial outreach email for this business:

${buildContext(lead)}

Return ONLY a JSON object with keys "subject" and "body". No markdown, no extra text.`;

  return generateWithTools(lead, system, userPrompt, false);
}

export async function generateFollowUpEmail(
  lead: Lead,
  followUpNumber: number
): Promise<OutreachMessage> {
  const isLastFollowUp = followUpNumber >= 2;

  const system = `You are a sales rep for ${COMPANY_NAME}, a web design agency for local trades businesses.

${RAC_METHODOLOGY}

For this FOLLOW-UP #${followUpNumber} email:
- Keep it under 120 words
- Reference that you've reached out before, but do NOT guilt them
- The RESOLVE should name a NEW pain point (don't repeat the first email)
${isLastFollowUp
    ? `- This is the FINAL follow-up. You may use the create_payment_link tool to include a special introductory offer (e.g., discounted first month or setup fee). Frame it as a limited-time opportunity.`
    : `- The CLOSE should be: schedule a free call at ${YOUR_CALENDLY}`
  }`;

  const userPrompt = `Write follow-up #${followUpNumber} for this business (they haven't replied yet):

${buildContext(lead)}

Return ONLY a JSON object with keys "subject" and "body". No markdown, no extra text.`;

  return generateWithTools(lead, system, userPrompt, isLastFollowUp);
}

export async function generateSms(
  lead: Lead,
  isFollowUp: boolean
): Promise<OutreachMessage> {
  const system = `You are a sales rep for ${COMPANY_NAME}, a web design agency for local trades businesses.

${RAC_METHODOLOGY}

For this SMS:
- Under 160 characters (one SMS segment)
- Casual and personal — mention their business name and location
- RESOLVE in one short phrase, then go straight to the CLOSE
- Include this link: ${YOUR_WEBSITE}
- No emojis, no sign-off`;

  const userPrompt = `Write ${isFollowUp ? "a follow-up" : "an initial"} SMS for:

${buildContext(lead)}

Return ONLY a JSON object with key "body". No markdown, no extra text.`;

  return generateWithTools(lead, system, userPrompt, false);
}

export async function generateNegotiationReply(
  lead: Lead,
  prospectMessage: string,
  channel: "email" | "sms"
): Promise<OutreachMessage> {
  const isEmail = channel === "email";

  const system = `You are a negotiation-focused sales rep for ${COMPANY_NAME}, a web design agency for local service businesses.

${RAC_METHODOLOGY}

${NEGOTIATION_SKILLS}

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

  // For SMS we ignore any subject the model might try to return.
  if (!isEmail) {
    return { body: reply.body, paymentLink: reply.paymentLink };
  }

  return reply;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJson<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```(?:json)?\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();
  if (!cleaned) {
    throw new Error("Agent returned empty response");
  }
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Try to extract a JSON object from the response (model sometimes adds extra text)
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]) as T;
    }
    throw new Error(`Agent returned invalid JSON: ${raw.slice(0, 200)}`);
  }
}
