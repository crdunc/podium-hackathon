import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER ?? "";

export async function sendSms(params: {
  to: string;
  body: string;
}): Promise<void> {
  const message = await client.messages.create({
    from: FROM_NUMBER,
    to: params.to,
    body: params.body,
  });

  console.log(`  [sms] Sent to ${params.to} (sid: ${message.sid})`);
}
