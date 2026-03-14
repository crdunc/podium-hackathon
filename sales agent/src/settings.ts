/**
 * Shared config for the sales agent (env-driven).
 */
export const COMPANY_NAME =
  process.env.YOUR_COMPANY_NAME ?? "WebPros";
export const YOUR_WEBSITE =
  process.env.YOUR_WEBSITE ?? "https://webpros.com";
export const YOUR_CALENDLY =
  process.env.YOUR_CALENDLY ?? "https://calendly.com/yourname";
export const MAX_DISCOUNT_PERCENT = Number(
  process.env.MAX_DISCOUNT_PERCENT ?? "15"
);
