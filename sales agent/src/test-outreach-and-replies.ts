/**
 * Test script: generates outreach messages and negotiation replies without sending.
 * Run: npm run test:outreach
 * Requires: ANTHROPIC_API_KEY (and optionally STRIPE_PAYMENT_LINK for payment links in replies).
 */
import "dotenv/config";
import { Lead } from "./types";
import {
  generateInitialEmail,
  generateFollowUpEmail,
  generateSms,
  generateNegotiationReply,
} from "./agent";

const FIXTURE_LEAD: Lead = {
  id: 1,
  businessName: "Cool Breeze HVAC",
  industry: "hvac",
  location: "Austin, TX",
  hasWebsite: false,
  email: "owner@coolbreezehvac.com",
  phone: "+15125551234",
  status: "contacted",
  sequenceStep: 1,
  nextFollowUpAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Set ANTHROPIC_API_KEY in .env to run this test.");
    process.exit(1);
  }

  const lead = FIXTURE_LEAD;
  console.log("=== Sales agent outreach & reply test ===\n");
  console.log("Fixture lead:", lead.businessName, `(${lead.industry}, ${lead.location})\n`);

  // --- Outreach ---
  console.log("--- OUTREACH (no emails/SMS sent) ---\n");

  console.log("1. Initial email");
  const initialEmail = await generateInitialEmail(lead);
  console.log("   Subject:", initialEmail.subject);
  console.log("   Body:", initialEmail.body);
  if (initialEmail.paymentLink) console.log("   Payment link:", initialEmail.paymentLink);
  console.log();

  console.log("2. Follow-up #1 email");
  const followUp1 = await generateFollowUpEmail(lead, 1);
  console.log("   Subject:", followUp1.subject);
  console.log("   Body:", followUp1.body);
  if (followUp1.paymentLink) console.log("   Payment link:", followUp1.paymentLink);
  console.log();

  console.log("3. Follow-up #2 (final) email");
  const followUp2 = await generateFollowUpEmail(lead, 2);
  console.log("   Subject:", followUp2.subject);
  console.log("   Body:", followUp2.body);
  if (followUp2.paymentLink) console.log("   Payment link:", followUp2.paymentLink);
  console.log();

  console.log("4. Initial SMS");
  try {
    const initialSms = await generateSms(lead, false);
    console.log("   Body:", initialSms.body);
    console.log(`   Length: ${initialSms.body.length} chars`);
  } catch (e) {
    console.log("   Error:", e instanceof Error ? e.message : e);
  }
  console.log();

  console.log("5. Follow-up SMS");
  try {
    const followUpSms = await generateSms(lead, true);
    console.log("   Body:", followUpSms.body);
    console.log(`   Length: ${followUpSms.body.length} chars`);
  } catch (e) {
    console.log("   Error:", e instanceof Error ? e.message : e);
  }
  console.log();

  // --- Replies (negotiation) ---
  console.log("--- REPLIES (negotiation) ---\n");

  const prospectMessages: { label: string; text: string; channel: "email" | "sms" }[] = [
    { label: "Objection (price)", text: "What's this going to cost me? We're on a tight budget.", channel: "email" },
    { label: "Objection (existing vendor)", text: "We already have a guy who does our site.", channel: "sms" },
    { label: "Interest", text: "Sure, we could use more leads. When can we do a quick call?", channel: "email" },
  ];

  for (const { label, text, channel } of prospectMessages) {
    console.log(`Reply: ${label} [${channel}]`);
    console.log("  Prospect said:", JSON.stringify(text));
    try {
      const reply = await generateNegotiationReply(lead, text, channel);
      if (reply.subject) console.log("  Subject:", reply.subject);
      console.log("  Body:", reply.body);
      if (reply.paymentLink) console.log("  Payment link:", reply.paymentLink);
    } catch (e) {
      console.log("  Error:", e instanceof Error ? e.message : e);
    }
    console.log();
  }

  console.log("=== Done ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
