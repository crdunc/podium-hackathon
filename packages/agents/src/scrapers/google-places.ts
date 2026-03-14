// ============================================================
// Google Places API Scraper
// Uses the Places API (Text Search) to find local businesses.
// Requires GOOGLE_PLACES_API_KEY in .env
// Free tier: $200/month = ~10,000 searches
// ============================================================

import type { Lead, TradeCategory } from '@podium/shared';
import { log } from '../utils/logger';

const AGENT_NAME = 'GooglePlaces';

interface PlaceResult {
  place_id: string;
  name: string;
  formatted_address?: string;
  formatted_phone_number?: string;
  international_phone_number?: string;
  website?: string;
  business_status?: string;
  types?: string[];
}

interface TextSearchResponse {
  results: Array<{
    place_id: string;
    name: string;
    formatted_address?: string;
    business_status?: string;
    types?: string[];
  }>;
  next_page_token?: string;
  status: string;
}

interface PlaceDetailsResponse {
  result: PlaceResult;
  status: string;
}

/**
 * Search Google Places API for businesses matching a query.
 * Returns leads in our canonical schema.
 */
export async function searchGooglePlaces(
  query: string,
  trade: TradeCategory,
  location: string,
  apiKey: string,
  maxResults = 10
): Promise<Lead[]> {
  const leads: Lead[] = [];

  try {
    // Step 1: Text Search to find places
    const searchUrl = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
    searchUrl.searchParams.set('query', query);
    searchUrl.searchParams.set('key', apiKey);

    log('info', AGENT_NAME, `Searching: "${query}"`);

    const searchRes = await fetch(searchUrl.toString());
    const searchData: TextSearchResponse = await searchRes.json();

    if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
      log('error', AGENT_NAME, `API error: ${searchData.status}`);
      return leads;
    }

    const places = searchData.results.slice(0, maxResults);
    log('info', AGENT_NAME, `Found ${places.length} places for "${query}"`);

    // Step 2: Get details for each place (phone, website, etc.)
    for (const place of places) {
      try {
        const detailsUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json');
        detailsUrl.searchParams.set('place_id', place.place_id);
        detailsUrl.searchParams.set('fields', 'place_id,name,formatted_address,formatted_phone_number,international_phone_number,website,business_status');
        detailsUrl.searchParams.set('key', apiKey);

        const detailsRes = await fetch(detailsUrl.toString());
        const detailsData: PlaceDetailsResponse = await detailsRes.json();

        if (detailsData.status !== 'OK') {
          log('warn', AGENT_NAME, `Details failed for ${place.name}: ${detailsData.status}`);
          // Still create a lead from the basic search data
          leads.push(placeToLead(place, null, trade, location, query));
          continue;
        }

        leads.push(placeToLead(place, detailsData.result, trade, location, query));
      } catch (err) {
        log('warn', AGENT_NAME, `Could not get details for ${place.name}: ${(err as Error).message}`);
        leads.push(placeToLead(place, null, trade, location, query));
      }

      // Small delay between detail requests to be nice to the API
      await new Promise(r => setTimeout(r, 200));
    }
  } catch (err) {
    log('error', AGENT_NAME, `Search failed: ${(err as Error).message}`);
  }

  return leads;
}

/** Convert a Google Places result into our Lead schema */
function placeToLead(
  searchResult: TextSearchResponse['results'][0],
  details: PlaceResult | null,
  trade: TradeCategory,
  location: string,
  query: string
): Lead {
  const phone = details?.formatted_phone_number || details?.international_phone_number || null;
  const website = details?.website || null;

  return {
    id: `google_places_${searchResult.place_id}`,
    company_name: searchResult.name,
    trade_category: trade,
    description: null,
    address: details?.formatted_address || searchResult.formatted_address || null,
    phone,
    email: null,
    website,
    has_website: !!website,
    contacts: [],
    google_place_id: searchResult.place_id,
    business_status: details?.business_status || searchResult.business_status || 'OPERATIONAL',
    collected_at: new Date().toISOString(),
    metadata: {
      search_query: query,
      location,
      source: 'google_places_api',
    },
  };
}
