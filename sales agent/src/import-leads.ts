/**
 * Import leads from Supabase into the agent's add-batch format.
 *
 * Usage:
 *   npx tsx src/import-leads.ts [city-slug]
 *
 * If [city-slug] is provided, only rows with `city_slug = [city-slug]`
 * will be imported. Otherwise, all rows in the table are imported.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { addLeadAndContact } from "./outreach";
import { Industry } from "./types";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_LEADS_TABLE =
  process.env.SUPABASE_LEADS_TABLE_NAME ?? "leads";

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is not set in the environment");
}

const SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY ?? SUPABASE_ANON_KEY;

if (!SUPABASE_KEY) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY must be set in the environment"
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const KNOWN_INDUSTRIES: Industry[] = [
  "hvac",
  "electrical",
  "plumbing",
  "roofing",
  "lawn care",
  "pest control",
  "carpet cleaning",
  "handyman",
  "garage door repair",
  "appliance repair",
  "concrete",
  "painting",
  "fencing",
  "landscaping",
  "cleaning",
];

function toIndustry(raw: string | null | undefined): Industry {
  if (!raw) return "other";
  const normalized = raw.toLowerCase().trim();
  return (
    KNOWN_INDUSTRIES.includes(normalized as Industry) ? normalized : "other"
  ) as Industry;
}

function toE164(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

type SupabaseLead = {
  id: number;
  company_name: string;
  trade_category: string | null;
  has_website: boolean | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  city_slug?: string | null;
  metadata?: {
    location?: string;
  } | null;
};

async function importFromSupabase(citySlug?: string) {
  console.log(
    `\nImporting leads from Supabase table "${SUPABASE_LEADS_TABLE}"${
      citySlug ? ` for city_slug="${citySlug}"` : ""
    }...`
  );

  let query = supabase.from(SUPABASE_LEADS_TABLE).select("*");

  if (citySlug) {
    query = query.eq("city_slug", citySlug);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching leads from Supabase:", error.message);
    process.exit(1);
  }

  const leads = (data ?? []) as SupabaseLead[];
  console.log(`Found ${leads.length} lead(s) to import.`);

  for (const lead of leads) {
    const phone = toE164(lead.phone);
    if (!phone) {
      console.log(`  Skipping ${lead.company_name} — no valid phone`);
      continue;
    }

    await addLeadAndContact({
      businessName: lead.company_name,
      industry: toIndustry(lead.trade_category ?? undefined),
      location:
        lead.metadata?.location ??
        lead.city ??
        citySlug ??
        "Unknown",
      hasWebsite: lead.has_website ?? false,
      email: lead.email ?? "",
      phone,
    });
  }
}

async function main() {
  const citySlug = process.argv[2];
  await importFromSupabase(citySlug);
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
