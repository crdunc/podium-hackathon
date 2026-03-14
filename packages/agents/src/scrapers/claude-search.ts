// ============================================================
// Claude Web Search Scraper
// Uses Claude's built-in web search tool to find local businesses.
// No scraping needed — Claude searches the web and returns structured data.
// Requires ANTHROPIC_API_KEY (already needed for the orchestrator).
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import type { Lead, TradeCategory } from '@podium/shared';
import { log } from '../utils/logger';

const AGENT_NAME = 'ClaudeSearch';
const SEARCH_TIMEOUT_MS = 45_000; // 45s per search

/**
 * Use Claude with web search to find local trade businesses.
 * Returns structured Lead objects parsed from search results.
 */
export async function searchWithClaude(
  trade: TradeCategory,
  location: string,
  maxResults = 10
): Promise<Lead[]> {
  const client = new Anthropic();

  log('info', AGENT_NAME, `Searching: ${trade} in ${location} (max ${maxResults})`);

  const response = await Promise.race([
    client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5,
        } as any,
      ],
      messages: [
        {
          role: 'user',
          content: `Search the web for ${trade} businesses in ${location}. Find up to ${maxResults} real local businesses.

For each business, I need:
- Company name
- Phone number
- Street address
- Website URL (if available)
- A brief description if available

Return ONLY a JSON array, no other text. Each object should have these exact fields:
{
  "company_name": "string",
  "phone": "string or null",
  "address": "string or null",
  "website": "string or null",
  "description": "string or null"
}

Important: Only include REAL businesses that you found via web search. Do not make up data.`,
        },
      ],
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Claude web search timed out after 45s')), SEARCH_TIMEOUT_MS)
    ),
  ]);

  // Extract text from response
  const textBlocks = response.content.filter(
    (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
  );
  const responseText = textBlocks.map(b => b.text).join('\n');

  // Parse JSON from response — handle markdown code blocks
  let businesses: Array<{
    company_name: string;
    phone: string | null;
    address: string | null;
    website: string | null;
    description: string | null;
  }> = [];

  try {
    // Try to extract JSON array from the response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      businesses = JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    log('error', AGENT_NAME, `Failed to parse response: ${(err as Error).message}`);
    return [];
  }

  // Convert to Lead objects
  const leads: Lead[] = businesses.slice(0, maxResults).map((biz, i) => {
    const nameSlug = biz.company_name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .slice(0, 40);

    return {
      id: `claude_search_${nameSlug}_${Date.now()}_${i}`,
      company_name: biz.company_name,
      trade_category: trade,
      description: biz.description || null,
      address: biz.address || null,
      phone: biz.phone || null,
      email: null,
      website: biz.website || null,
      has_website: !!biz.website,
      contacts: [],
      google_place_id: null,
      business_status: 'OPERATIONAL',
      collected_at: new Date().toISOString(),
      metadata: {
        search_query: `${trade} in ${location}`,
        location,
        source: 'claude_web_search',
      },
    };
  });

  log('success', AGENT_NAME, `Found ${leads.length} businesses via Claude web search`);
  return leads;
}
