// ============================================================
// Agent 3: Enrichment Agent
// Visits business websites to extract additional data:
// email, services offered, social profiles, etc.
// ============================================================

import * as cheerio from 'cheerio';
import type { AgentResult, EnrichedLead, QualifiedLead } from '@podium/shared';
import { fetchPage } from '../utils/http';
import { log } from '../utils/logger';

const AGENT_NAME = 'EnrichAgent';

/** Extract email addresses from page text */
function extractEmails(text: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex) || [];
  return matches.filter(email =>
    !email.includes('example.com') &&
    !email.includes('sentry.io') &&
    !email.includes('wixpress.com') &&
    !email.endsWith('.png') &&
    !email.endsWith('.jpg')
  );
}

/** Extract social media profile URLs */
function extractSocialProfiles(html: string): EnrichedLead['social_profiles'] {
  const profiles: NonNullable<EnrichedLead['social_profiles']> = {};

  const patterns: Array<{ key: keyof typeof profiles; regex: RegExp }> = [
    { key: 'facebook', regex: /https?:\/\/(?:www\.)?facebook\.com\/[a-zA-Z0-9._-]+/i },
    { key: 'instagram', regex: /https?:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9._-]+/i },
    { key: 'yelp', regex: /https?:\/\/(?:www\.)?yelp\.com\/biz\/[a-zA-Z0-9._-]+/i },
    { key: 'google', regex: /https?:\/\/(?:www\.)?google\.com\/maps\/place\/[^\s"]+/i },
  ];

  for (const { key, regex } of patterns) {
    const match = html.match(regex);
    if (match) profiles[key] = match[0];
  }

  return Object.keys(profiles).length > 0 ? profiles : undefined;
}

/** Extract services from page content */
function extractServices(text: string, trade: string): string[] {
  const servicePatterns: Record<string, RegExp[]> = {
    hvac: [/ac\s*(?:repair|install|maintenance)/gi, /heating\s*(?:repair|install)/gi, /duct\s*(?:cleaning|repair)/gi, /furnace/gi],
    electrical: [/wiring/gi, /panel\s*(?:upgrade|replacement)/gi, /lighting/gi, /outlet/gi, /generator/gi, /ev\s*charger/gi],
    plumbing: [/drain\s*(?:cleaning|repair)/gi, /water\s*heater/gi, /pipe\s*(?:repair|replacement)/gi, /sewer/gi, /leak/gi],
    'lawn care': [/lawn\s*(?:mowing|maintenance)/gi, /landscaping/gi, /tree\s*(?:trimming|removal)/gi, /irrigation/gi, /mulch/gi],
    roofing: [/shingle/gi, /roof\s*(?:repair|replacement|inspection)/gi, /gutter/gi, /flashing/gi],
    painting: [/interior\s*paint/gi, /exterior\s*paint/gi, /staining/gi, /drywall/gi],
  };

  const patterns = servicePatterns[trade] || [];
  const services = new Set<string>();

  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        services.add(match.trim().toLowerCase().replace(/\s+/g, ' '));
      }
    }
  }

  return [...services].slice(0, 10);
}

/** Enrich a single lead by visiting its website */
async function enrichSingleLead(lead: QualifiedLead, useMock: boolean): Promise<EnrichedLead> {
  const enriched: EnrichedLead = {
    ...lead,
    enriched_at: new Date().toISOString(),
  };

  if (useMock) {
    const mockEmails = ['info@', 'contact@', 'service@', 'hello@'];
    const domain = lead.company_name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 15);
    if (Math.random() > 0.4) {
      enriched.email = `${mockEmails[Math.floor(Math.random() * mockEmails.length)]}${domain}.com`;
    }
    if (Math.random() > 0.5) {
      enriched.owner_name = ['Mike Johnson', 'Sarah Williams', 'David Chen', 'Maria Garcia', 'James Brown'][Math.floor(Math.random() * 5)];
    }
    if (Math.random() > 0.3) {
      enriched.social_profiles = { facebook: `https://facebook.com/${domain}` };
    }
    enriched.services = extractServices(
      'ac repair heating install duct cleaning wiring panel upgrade drain cleaning landscaping lawn mowing roof repair interior paint',
      lead.trade_category
    ).slice(0, 3);
    if (Math.random() > 0.5) {
      enriched.years_in_business = Math.floor(Math.random() * 25) + 1;
    }
    return enriched;
  }

  // Real enrichment: visit the website
  if (!lead.website) return enriched;

  try {
    const html = await fetchPage(lead.website);
    const $ = cheerio.load(html);
    const bodyText = $('body').text();

    // Extract email
    const emails = extractEmails(bodyText);
    if (emails.length > 0) enriched.email = emails[0];

    if (!enriched.email) {
      const mailtoLink = $('a[href^="mailto:"]').first().attr('href');
      if (mailtoLink) enriched.email = mailtoLink.replace('mailto:', '').split('?')[0];
    }

    // Extract social profiles
    enriched.social_profiles = extractSocialProfiles(html);

    // Extract services
    enriched.services = extractServices(bodyText, lead.trade_category);

    // Try to find owner name
    const ownerPatterns = /(?:owner|founded by|operated by|managed by)\s*:?\s*([A-Z][a-z]+ [A-Z][a-z]+)/i;
    const ownerMatch = bodyText.match(ownerPatterns);
    if (ownerMatch) enriched.owner_name = ownerMatch[1];

    // Try to find years in business
    const yearPatterns = [
      /(\d+)\+?\s*years?\s*(?:of\s+)?(?:experience|in business|serving)/i,
      /since\s+(\d{4})/i,
      /established\s+(?:in\s+)?(\d{4})/i,
    ];
    for (const pattern of yearPatterns) {
      const match = bodyText.match(pattern);
      if (match) {
        const val = parseInt(match[1]);
        enriched.years_in_business = val > 100 ? new Date().getFullYear() - val : val;
        break;
      }
    }
  } catch (err) {
    log('warn', AGENT_NAME, `Could not enrich ${lead.company_name}: ${(err as Error).message}`);
  }

  return enriched;
}

/** Main enrichment agent */
export async function runEnrichmentAgent(
  leads: QualifiedLead[],
  useMock = false
): Promise<AgentResult<EnrichedLead[]>> {
  const startTime = Date.now();
  const enriched: EnrichedLead[] = [];
  const errors: string[] = [];

  log('agent', AGENT_NAME, `Enriching ${leads.length} qualified leads`);

  for (const lead of leads) {
    try {
      const result = await enrichSingleLead(lead, useMock);
      enriched.push(result);

      const extras = [
        result.email && 'email',
        result.owner_name && 'owner',
        result.social_profiles && 'socials',
        result.services?.length && `${result.services.length} services`,
      ].filter(Boolean);

      if (extras.length > 0) {
        log('success', AGENT_NAME, `Enriched "${lead.company_name}": found ${extras.join(', ')}`);
      }
    } catch (err) {
      const errorMsg = `Failed to enrich "${lead.company_name}": ${(err as Error).message}`;
      log('error', AGENT_NAME, errorMsg);
      errors.push(errorMsg);
      enriched.push({ ...lead, enriched_at: new Date().toISOString() });
    }
  }

  const durationMs = Date.now() - startTime;
  const withEmail = enriched.filter(l => l.email).length;
  const withSocials = enriched.filter(l => l.social_profiles).length;

  log('success', AGENT_NAME,
    `Enriched ${enriched.length} leads: ${withEmail} with email, ${withSocials} with socials`
  );

  return {
    agentName: AGENT_NAME,
    success: true,
    data: enriched,
    itemsProcessed: leads.length,
    errors,
    durationMs,
  };
}
