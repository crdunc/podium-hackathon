import { Lead, SEQUENCE_STEPS } from "./types";
import {
  insertLead,
  updateLeadSequence,
  logOutreach,
  getLeadsDueForFollowUp,
  getLeadById,
} from "./db";
import {
  generateInitialEmail,
  generateFollowUpEmail,
  generateSms,
} from "./agent";
import { sendEmail } from "./channels/email";
import { sendSms } from "./channels/sms";

/**
 * Add a new lead and immediately send the first outreach (step 1).
 */
export async function addLeadAndContact(
  leadData: Omit<Lead, "id" | "status" | "sequenceStep" | "nextFollowUpAt" | "createdAt" | "updatedAt">
): Promise<Lead> {
  const lead = insertLead({
    ...leadData,
    status: "pending",
    sequenceStep: 0,
    nextFollowUpAt: null,
  });

  console.log(`\nAdded lead: ${lead.businessName} (id: ${lead.id})`);
  await executeStep(lead, 1);
  return getLeadById(lead.id!)!;
}

/**
 * Run all leads that are due for a follow-up.
 */
export async function processFollowUps(): Promise<void> {
  const leads = getLeadsDueForFollowUp();
  if (leads.length === 0) {
    console.log("No follow-ups due.");
    return;
  }
  console.log(`Processing ${leads.length} follow-up(s)...`);
  for (const lead of leads) {
    const nextStep = lead.sequenceStep + 1;
    await executeStep(lead, nextStep);
  }
}

async function executeStep(lead: Lead, stepNumber: number): Promise<void> {
  const step = SEQUENCE_STEPS.find((s) => s.stepNumber === stepNumber);
  if (!step) {
    console.log(`  No step ${stepNumber} defined, sequence complete for ${lead.businessName}`);
    return;
  }

  console.log(`\n→ ${lead.businessName} | Step ${stepNumber}: ${step.label}`);

  for (const channel of step.channels) {
    if (channel === "email") {
      const msg =
        stepNumber === 1
          ? await generateInitialEmail(lead)
          : await generateFollowUpEmail(lead, stepNumber - 1);

      await sendEmail({
        to: lead.email,
        subject: msg.subject!,
        body: msg.body,
      });
      logOutreach(lead.id!, stepNumber, "email", msg.body, msg.subject);
    }

    if (channel === "sms") {
      const msg = await generateSms(lead, stepNumber > 1);
      await sendSms({ to: lead.phone, body: msg.body });
      logOutreach(lead.id!, stepNumber, "sms", msg.body);
    }
  }

  // Schedule next step or mark complete
  const nextStep = SEQUENCE_STEPS.find((s) => s.stepNumber === stepNumber + 1);
  const nextFollowUpAt = nextStep
    ? addDays(new Date(), nextStep.delayDays).toISOString()
    : null;

  updateLeadSequence(
    lead.id!,
    stepNumber,
    nextFollowUpAt,
    stepNumber === 1 ? "contacted" : lead.status
  );

  if (nextFollowUpAt) {
    console.log(`  Next follow-up scheduled: ${nextFollowUpAt}`);
  } else {
    console.log(`  Sequence complete for ${lead.businessName}`);
  }
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
