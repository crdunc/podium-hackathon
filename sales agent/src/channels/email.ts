import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = `${process.env.FROM_NAME ?? "WebPros"} <${process.env.FROM_EMAIL ?? "outreach@webpros.com"}>`;

export async function sendEmail(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<void> {
  const { data, error } = await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: params.subject,
    text: params.body,
  });

  if (error) {
    throw new Error(`Resend error: ${JSON.stringify(error)}`);
  }

  console.log(`  [email] Sent to ${params.to} (id: ${data?.id})`);
}
