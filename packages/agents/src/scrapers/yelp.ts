// ============================================================
// Yelp HTML Scraper
// Scrapes Yelp search results pages to find local businesses.
// No API key required — parses public search result HTML.
// ============================================================

import * as cheerio from 'cheerio';
import type { Lead, TradeCategory } from '@podium/shared';
import { fetchPage } from '../utils/http';
import { log } from '../utils/logger';

const AGENT_NAME = 'YelpScraper';

/** Map our trade categories to Yelp search terms */
const YELP_SEARCH_TERMS: Record<string, string> = {
  hvac: 'HVAC',
  electrical: 'Electricians',
  plumbing: 'Plumbers',
  'lawn care': 'Lawn Services',
  roofing: 'Roofing',
  painting: 'Painters',
  'carpet cleaning': 'Carpet Cleaning',
  'appliance repair': 'Appliance Repair',
  handyman: 'Handyman',
  'pest control': 'Pest Control',
  fencing: 'Fencing',
  concrete: 'Concrete',
  'tree service': 'Tree Services',
  'garage door repair': 'Garage Door Services',
};

/**
 * Scrape Yelp search results for a given trade + location.
 * Parses the HTML to extract business names, phone numbers, etc.
 */
export async function scrapeYelp(
  trade: TradeCategory,
  location: string,
  maxResults = 10
): Promise<Lead[]> {
  const leads: Lead[] = [];
  const searchTerm = YELP_SEARCH_TERMS[trade] || trade;

  // Build Yelp search URL
  const encodedDesc = encodeURIComponent(searchTerm);
  const encodedLoc = encodeURIComponent(location);
  const url = `https://www.yelp.com/search?find_desc=${encodedDesc}&find_loc=${encodedLoc}`;

  log('info', AGENT_NAME, `Scraping: ${searchTerm} in ${location}`);

  try {
    const html = await fetchPage(url);
    const $ = cheerio.load(html);

    // Yelp uses various CSS structures — try multiple selectors
    // The main search results are in divs with data-testid or specific class patterns
    const businessCards = $('[data-testid="serp-ia-card"]').toArray();

    // Fallback: look for links to /biz/ pages
    if (businessCards.length === 0) {
      const bizLinks = $('a[href*="/biz/"]').toArray();
      const seenNames = new Set<string>();

      for (const link of bizLinks) {
        if (leads.length >= maxResults) break;

        const $link = $(link);
        const href = $link.attr('href') || '';
        const name = $link.text().trim();

        // Skip navigation/footer links, duplicates, and short names
        if (!href.startsWith('/biz/') || name.length < 3 || seenNames.has(name)) continue;
        if (/^(Write a Review|Yelp|Sign Up|Log In|More|About)/i.test(name)) continue;
        seenNames.add(name);

        // Try to find phone and address near the business link
        const $parent = $link.closest('[class*="container"]').length
          ? $link.closest('[class*="container"]')
          : $link.parent().parent().parent();

        const parentText = $parent.text();
        const phoneMatch = parentText.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
        const phone = phoneMatch ? phoneMatch[0] : null;

        // Extract address — look for state abbreviations
        const addressMatch = parentText.match(/\d+[^,]+,\s*[A-Z]{2}\s*\d{5}/);
        const address = addressMatch ? addressMatch[0] : null;

        leads.push({
          id: `yelp_${href.replace('/biz/', '').split('?')[0]}`,
          company_name: name,
          trade_category: trade,
          description: null,
          address,
          phone,
          email: null,
          website: null,
          has_website: false,
          contacts: [],
          google_place_id: null,
          business_status: 'OPERATIONAL',
          collected_at: new Date().toISOString(),
          metadata: {
            search_query: `${searchTerm} in ${location}`,
            location,
            source: 'yelp_scrape',
            yelp_url: `https://www.yelp.com${href.split('?')[0]}`,
          },
        });
      }
    } else {
      // Parse structured cards
      for (const card of businessCards.slice(0, maxResults)) {
        const $card = $(card);
        const name = $card.find('a[href*="/biz/"] span').first().text().trim()
          || $card.find('h3').first().text().trim();
        const href = $card.find('a[href*="/biz/"]').first().attr('href') || '';
        const phoneEl = $card.find('[class*="phone"], [class*="Phone"]').text().trim();
        const phoneMatch = $card.text().match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);

        if (!name || name.length < 3) continue;

        leads.push({
          id: `yelp_${href.replace('/biz/', '').split('?')[0] || name.toLowerCase().replace(/\s+/g, '-')}`,
          company_name: name,
          trade_category: trade,
          description: null,
          address: null,
          phone: phoneEl || (phoneMatch ? phoneMatch[0] : null),
          email: null,
          website: null,
          has_website: false,
          contacts: [],
          google_place_id: null,
          business_status: 'OPERATIONAL',
          collected_at: new Date().toISOString(),
          metadata: {
            search_query: `${searchTerm} in ${location}`,
            location,
            source: 'yelp_scrape',
            yelp_url: href ? `https://www.yelp.com${href.split('?')[0]}` : undefined,
          },
        });
      }
    }

    log('success', AGENT_NAME, `Found ${leads.length} businesses from Yelp`);
  } catch (err) {
    log('error', AGENT_NAME, `Yelp scrape failed: ${(err as Error).message}`);
  }

  return leads;
}
