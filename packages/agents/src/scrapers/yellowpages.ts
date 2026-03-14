// ============================================================
// Yellow Pages HTML Scraper
// Scrapes yellowpages.com for local business listings.
// No API key required — good structured data with phone + address.
// ============================================================

import * as cheerio from 'cheerio';
import type { Lead, TradeCategory } from '@podium/shared';
import { fetchPage } from '../utils/http';
import { log } from '../utils/logger';

const AGENT_NAME = 'YPScraper';

/** Map trade categories to Yellow Pages search terms */
const YP_SEARCH_TERMS: Record<string, string> = {
  hvac: 'hvac',
  electrical: 'electricians',
  plumbing: 'plumbers',
  'lawn care': 'lawn-care',
  roofing: 'roofing-contractors',
  painting: 'painting-contractors',
  'carpet cleaning': 'carpet-cleaning',
  'appliance repair': 'appliance-repair',
  handyman: 'handyman-services',
  'pest control': 'pest-control',
  fencing: 'fence-contractors',
  concrete: 'concrete-contractors',
  'tree service': 'tree-service',
  'garage door repair': 'garage-doors',
};

/** Convert "Salt Lake City, UT" → "salt-lake-city-ut" */
function locationToSlug(location: string): string {
  return location
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-');
}

/**
 * Scrape Yellow Pages for businesses matching a trade + location.
 * YP has well-structured HTML with clear business listing cards.
 */
export async function scrapeYellowPages(
  trade: TradeCategory,
  location: string,
  maxResults = 10
): Promise<Lead[]> {
  const leads: Lead[] = [];
  const searchTerm = YP_SEARCH_TERMS[trade] || trade.replace(/\s+/g, '-');
  const locationSlug = locationToSlug(location);

  const url = `https://www.yellowpages.com/${locationSlug}/${searchTerm}`;

  log('info', AGENT_NAME, `Scraping: ${url}`);

  try {
    const html = await fetchPage(url);
    const $ = cheerio.load(html);

    // Yellow Pages uses .result class for each listing
    const listings = $('.result').toArray();

    if (listings.length === 0) {
      // Fallback: try .organic class or .srp-listing
      const altListings = $('.organic, .srp-listing, [class*="listing"]').toArray();
      log('info', AGENT_NAME, `No .result found, trying alternatives: ${altListings.length} listings`);
    }

    for (const listing of listings.slice(0, maxResults)) {
      const $listing = $(listing);

      // Extract business name
      const name = $listing.find('.business-name, .n a, a.business-name').text().trim();
      if (!name || name.length < 3) continue;

      // Extract phone number
      const phone = $listing.find('.phones, .phone, [class*="phone"]').first().text().trim() || null;

      // Extract address
      const street = $listing.find('.street-address, .adr .street-address').text().trim();
      const locality = $listing.find('.locality, .adr .locality').text().trim();
      const address = [street, locality].filter(Boolean).join(', ') || null;

      // Extract website link
      const websiteLink = $listing.find('a.track-visit-website, a[href*="website"]').attr('href') || null;
      const hasWebsite = !!websiteLink;

      // Extract categories/description
      const categories = $listing.find('.categories a').map((_, el) => $(el).text().trim()).get();

      // Generate a stable ID from the listing
      const nameSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 40);
      const id = `yp_${locationSlug}_${nameSlug}`;

      leads.push({
        id,
        company_name: name,
        trade_category: trade,
        description: categories.length > 0 ? categories.join(', ') : null,
        address,
        phone,
        email: null,
        website: websiteLink,
        has_website: hasWebsite,
        contacts: [],
        google_place_id: null,
        business_status: 'OPERATIONAL',
        collected_at: new Date().toISOString(),
        metadata: {
          search_query: `${trade} in ${location}`,
          location,
          source: 'yellowpages_scrape',
        },
      });
    }

    log('success', AGENT_NAME, `Found ${leads.length} businesses from Yellow Pages`);
  } catch (err) {
    log('error', AGENT_NAME, `Yellow Pages scrape failed: ${(err as Error).message}`);
  }

  return leads;
}
