// ============================================================
// HTTP utilities with rate limiting and user-agent rotation
// ============================================================

import { RATE_LIMITS } from '@podium/shared';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];

let lastRequestTime = 0;

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMITS.delayBetweenRequests) {
    await new Promise(resolve =>
      setTimeout(resolve, RATE_LIMITS.delayBetweenRequests - elapsed)
    );
  }
  lastRequestTime = Date.now();
}

export async function fetchPage(url: string, retries = RATE_LIMITS.maxRetriesPerRequest): Promise<string> {
  await rateLimit();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.text();
    } catch (err) {
      if (attempt === retries) throw err;
      // Exponential backoff
      await new Promise(resolve =>
        setTimeout(resolve, RATE_LIMITS.delayBetweenRequests * (attempt + 1) * 2)
      );
    }
  }

  throw new Error('Unreachable');
}

/** Build a Google search URL */
export function buildGoogleSearchUrl(query: string): string {
  const encoded = encodeURIComponent(query);
  return `https://www.google.com/search?q=${encoded}&num=10`;
}

/** Build a Google Maps/Places search URL */
export function buildGoogleMapsSearchUrl(query: string): string {
  const encoded = encodeURIComponent(query);
  return `https://www.google.com/maps/search/${encoded}`;
}
