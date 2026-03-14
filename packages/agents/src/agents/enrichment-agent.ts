// ============================================================
// Agent 3: Enrichment Agent (AI-Powered)
// Visits business websites and uses Claude to intelligently
// extract email, owner name, services, social profiles, etc.
// Falls back to regex extraction if no API key.
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import * as cheerio from 'cheerio';
import type { AgentResult, EnrichedLead, QualifiedLead } from '@podium/shared';
import { fetchPage } from '../utils/http';
import { log } from '../utils/logger';

const AGENT_NAME = 'EnrichAgent';
const ENRICHMENT_CONCURRENCY = 5;

const ENRICHMENT_PROMPT = `You are a business data extraction expert. You've been given the HTML text content of a local trade business website.

Extract the following information if available. Be precise — only extract what you can clearly find, don't guess.

Return a JSON object with this exact shape:
{
  "email": "contact@example.com or null",
  "owner_name": "First Last or null",
  "services": ["list", "of", "services", "they", "offer"],
  "social_profiles": {
    "facebook": "url or null",
    "instagram": "url or null",
    "yelp": "url or null",
    "google": "url or null"
  },
  "years_in_business": 15,
  "is_franchise": false,
  "service_area": "description of their service area or null",
  "summary": "One sentence summary of the business"
}

Rules:
- For email: look for contact emails, not noreply@ or wordpress@ addresses
- For owner: look for "owner", "founded by", "operated by" mentions
- For services: extract specific services they list (e.g. "drain cleaning", "AC repair"), not generic categories
- For social profiles: extract actual URLs, not just icons
- For years: look for "X years experience", "since 20XX", "established 19XX"
- If you can't find something, set it to null (or empty array for services)

Only return the JSON object, nothing else.`;

/** AI-powered enrichment — Claude reads the webpage and extracts data */
async function enrichWithAI(
  lead: QualifiedLead,
  pageText: string,
  pageHtml: string
): Promise<Partial<EnrichedLead>> {
  const client = new Anthropic();

  // Truncate to avoid blowing context — most useful info is in first ~8k chars
  const truncatedText = pageText.slice(0, 8000);

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Extract business info for "${lead.company_name}" (${lead.trade_category}) from their website:\n\n${truncatedText}`,
      }],
      system: ENRICHMENT_PROMPT,
    });

    const text = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const extracted = JSON.parse(jsonMatch[0]);
      return {
        email: extracted.email || undefined,
        owner_name: extracted.owner_name || undefined,
        services: extracted.services?.length > 0 ? extracted.services : undefined,
        social_profiles: extracted.social_profiles && Object.values(extracted.social_profiles).some(Boolean)
          ? extracted.social_profiles
          : undefined,
        years_in_business: extracted.years_in_business || undefined,
      };
    }
  } catch (err) {
    log('warn', AGENT_NAME, `AI enrichment failed for ${lead.company_name}: ${(err as Error).message}`);
  }

  return {};
}

/** Deterministic enrichment — regex fallback */
function enrichDeterministic(
  lead: QualifiedLead,
  bodyText: string,
  html: string
): Partial<EnrichedLead> {
  const result: Partial<EnrichedLead> = {};

  // Extract email
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = (bodyText.match(emailRegex) || []).filter(e =>
    !e.includes('example.com') && !e.includes('sentry.io') &&
    !e.includes('wixpress.com') && !e.endsWith('.png') && !e.endsWith('.jpg')
  );
  if (emails.length > 0) result.email = emails[0];

  // Mailto fallback
  if (!result.email) {
    const $ = cheerio.load(html);
    const mailto = $('a[href^="mailto:"]').first().attr('href');
    if (mailto) result.email = mailto.replace('mailto:', '').split('?')[0];
  }

  // Social profiles
  const profiles: Record<string, string> = {};
  const socialPatterns = [
    { key: 'facebook', regex: /https?:\/\/(?:www\.)?facebook\.com\/[a-zA-Z0-9._-]+/i },
    { key: 'instagram', regex: /https?:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9._-]+/i },
    { key: 'yelp', regex: /https?:\/\/(?:www\.)?yelp\.com\/biz\/[a-zA-Z0-9._-]+/i },
    { key: 'google', regex: /https?:\/\/(?:www\.)?google\.com\/maps\/place\/[^\s"]+/i },
  ];
  for (const { key, regex } of socialPatterns) {
    const match = html.match(regex);
    if (match) profiles[key] = match[0];
  }
  if (Object.keys(profiles).length > 0) result.social_profiles = profiles;

  // Services
  const servicePatterns: Record<string, RegExp[]> = {
    hvac: [/ac\s*(?:repair|install|maintenance)/gi, /heating\s*(?:repair|install)/gi, /duct\s*(?:cleaning|repair)/gi, /furnace/gi],
    electrical: [/wiring/gi, /panel\s*(?:upgrade|replacement)/gi, /lighting/gi, /generator/gi, /ev\s*charger/gi],
    plumbing: [/drain\s*(?:cleaning|repair)/gi, /water\s*heater/gi, /pipe\s*(?:repair|replacement)/gi, /sewer/gi, /leak/gi],
    'lawn care': [/lawn\s*(?:mowing|maintenance)/gi, /landscaping/gi, /tree\s*(?:trimming|removal)/gi, /irrigation/gi],
    roofing: [/shingle/gi, /roof\s*(?:repair|replacement|inspection)/gi, /gutter/gi],
    painting: [/interior\s*paint/gi, /exterior\s*paint/gi, /staining/gi, /drywall/gi],
  };
  const patterns = servicePatterns[lead.trade_category] || [];
  const services = new Set<string>();
  for (const pattern of patterns) {
    const matches = bodyText.match(pattern);
    if (matches) matches.forEach(m => services.add(m.trim().toLowerCase()));
  }
  if (services.size > 0) result.services = [...services].slice(0, 10);

  // Owner name
  const ownerMatch = bodyText.match(/(?:owner|founded by|operated by|managed by)\s*:?\s*([A-Z][a-z]+ [A-Z][a-z]+)/i);
  if (ownerMatch) result.owner_name = ownerMatch[1];

  // Years in business
  const yearPatterns = [
    /(\d+)\+?\s*years?\s*(?:of\s+)?(?:experience|in business|serving)/i,
    /since\s+(\d{4})/i,
    /established\s+(?:in\s+)?(\d{4})/i,
  ];
  for (const pattern of yearPatterns) {
    const match = bodyText.match(pattern);
    if (match) {
      const val = parseInt(match[1]);
      result.years_in_business = val > 100 ? new Date().getFullYear() - val : val;
      break;
    }
  }

  return result;
}

/** Process leads in batches with controlled concurrency */
async function processInBatches<T, R>(
  items: T[], concurrency: number, fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    results.push(...await Promise.allSettled(batch.map(fn)));
  }
  return results;
}

/** Enrich a single lead */
async function enrichSingleLead(lead: QualifiedLead): Promise<EnrichedLead> {
  const enriched: EnrichedLead = { ...lead, enriched_at: new Date().toISOString() };

  if (!lead.website) return enriched;

  try {
    const html = await fetchPage(lead.website);
    const $ = cheerio.load(html);
    const bodyText = $('body').text();

    const useAI = !!process.env.ANTHROPIC_API_KEY;
    const extracted = useAI
      ? await enrichWithAI(lead, bodyText, html)
      : enrichDeterministic(lead, bodyText, html);

    if (extracted.email) enriched.email = extracted.email;
    if (extracted.owner_name) enriched.owner_name = extracted.owner_name;
    if (extracted.services) enriched.services = extracted.services;
    if (extracted.social_profiles) enriched.social_profiles = extracted.social_profiles;
    if (extracted.years_in_business) enriched.years_in_business = extracted.years_in_business;
  } catch (err) {
    log('warn', AGENT_NAME, `Could not enrich ${lead.company_name}: ${(err as Error).message}`);
  }

  return enriched;
}

/** Main enrichment agent */
export async function runEnrichmentAgent(
  leads: QualifiedLead[],
): Promise<AgentResult<EnrichedLead[]>> {
  const startTime = Date.now();
  const enriched: EnrichedLead[] = [];
  const errors: string[] = [];
  const useAI = !!process.env.ANTHROPIC_API_KEY;

  log('agent', AGENT_NAME, `Enriching ${leads.length} leads (concurrency: ${ENRICHMENT_CONCURRENCY}, mode: ${useAI ? 'AI' : 'regex'})`);

  const results = await processInBatches(leads, ENRICHMENT_CONCURRENCY, async (lead) => {
    const result = await enrichSingleLead(lead);
    const extras = [
      result.email && 'email', result.owner_name && 'owner',
      result.social_profiles && 'socials', result.services?.length && `${result.services.length} services`,
    ].filter(Boolean);
    if (extras.length > 0) log('success', AGENT_NAME, `Enriched "${lead.company_name}": ${extras.join(', ')}`);
    return result;
  });

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      enriched.push(result.value);
    } else {
      const lead = leads[i];
      errors.push(`Failed "${lead.company_name}": ${result.reason?.message || result.reason}`);
      enriched.push({ ...lead, enriched_at: new Date().toISOString() });
    }
  }

  const durationMs = Date.now() - startTime;
  const withEmail = enriched.filter(l => l.email).length;
  const withSocials = enriched.filter(l => l.social_profiles).length;

  log('success', AGENT_NAME,
    `Enriched ${enriched.length} leads: ${withEmail} with email, ${withSocials} with socials (${(durationMs / 1000).toFixed(1)}s)`
  );

  return {
    agentName: AGENT_NAME, success: true, data: enriched,
    itemsProcessed: leads.length, errors, durationMs,
  };
}
