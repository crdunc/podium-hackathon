// ============================================================
// Agent 6: Website Generation Agent
// Generates professional single-page websites for leads that
// have no website. Uses Jinja2-style template rendering via
// inline HTML generation with per-company variant selection
// for unique layouts, copy, and styling.
// ============================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import type { AgentResult, Lead } from '@podium/shared';
import { log } from '../utils/logger';
import { getAllLeads, updateSiteUrl } from '../utils/supabase';
import { TRADE_CONFIG, type TradeConfig } from './website-trade-config';
import { renderSiteHtml } from './website-template';

const AGENT_NAME = 'WebsiteAgent';

// Resolve to monorepo root sites/ directory (not packages/agents/sites/)
function findMonorepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = resolve(dir, '..');
  }
  return process.cwd();
}
export const SITES_DIR = resolve(findMonorepoRoot(), 'sites');
export const GITHUB_PAGES_BASE = 'https://crdunc.github.io/podium-hackathon/sites';

// ── Utilities ───────────────────────────────────────────────

/** Convert company name to URL-safe slug */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Deterministic hash-based variant picker */
function computeVariants(companyName: string) {
  const h = BigInt('0x' + createHash('sha256').update(companyName).digest('hex'));
  return {
    heroVariant:          Number(h % 4n),
    navVariant:           Number((h >> 4n) % 2n),
    servicesVariant:      Number((h >> 8n) % 3n),
    aboutVariant:         Number((h >> 12n) % 2n),
    testimonialsVariant:  Number((h >> 16n) % 3n),
    formVariant:          Number((h >> 20n) % 2n),
    fontVariant:          Number((h >> 24n) % 4n),
    taglineVariant:       Number((h >> 28n) % 6n),
    subtitleVariant:      Number((h >> 32n) % 6n),
    aboutCopyVariant:     Number((h >> 36n) % 4n),
  };
}

/** Pick N testimonials deterministically from pool */
function pickTestimonials(
  companyName: string,
  testimonials: TradeConfig['testimonials'],
  count = 3
): TradeConfig['testimonials'] {
  const seed = parseInt(createHash('md5').update(companyName).digest('hex').slice(0, 8), 16);
  const n = testimonials.length;
  const seen = new Set<number>();
  const result: TradeConfig['testimonials'] = [];

  for (let i = 0; i < count && result.length < count; i++) {
    const idx = (seed + i * 7) % n;
    if (!seen.has(idx)) {
      seen.add(idx);
      result.push(testimonials[idx]);
    }
  }
  // Fill if dedup removed some
  for (let i = 0; result.length < count && i < n; i++) {
    if (!seen.has(i)) {
      seen.add(i);
      result.push(testimonials[i]);
    }
  }
  return result.slice(0, count);
}

/** Load all leads from Supabase */
async function loadAllLeadsFromDb(): Promise<Array<{ city: string; lead: Lead }>> {
  const leads = await getAllLeads();
  return leads.map(lead => ({
    city: (lead as any).city || lead.metadata?.location || 'Unknown',
    lead,
  }));
}

// ── Index Page Generator ────────────────────────────────────

function generateIndexHtml(
  sites: Array<{ city: string; companyName: string; slug: string; tradeCategory: string }>
): string {
  // Group by city
  const byCity = new Map<string, typeof sites>();
  for (const site of sites) {
    const list = byCity.get(site.city) || [];
    list.push(site);
    byCity.set(site.city, list);
  }

  const rows: string[] = [];
  for (const city of [...byCity.keys()].sort()) {
    const cityList = byCity.get(city)!.sort((a, b) => a.companyName.localeCompare(b.companyName));
    for (const { companyName, slug, tradeCategory } of cityList) {
      const trade = TRADE_CONFIG[tradeCategory];
      const icon = trade?.icon ?? '';
      const displayTrade = trade?.displayName ?? tradeCategory;
      rows.push(
        `<tr class="border-b border-gray-100 hover:bg-gray-50">` +
        `<td class="px-4 py-3 font-medium"><a href="${slug}/" class="text-blue-600 hover:underline">${companyName}</a></td>` +
        `<td class="px-4 py-3">${icon} ${displayTrade}</td>` +
        `<td class="px-4 py-3">${city}</td>` +
        `</tr>`
      );
    }
  }

  const cityCount = byCity.size;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Generated Sites Directory</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config={theme:{extend:{fontFamily:{sans:['Inter','system-ui','sans-serif']}}}}</script>
</head>
<body class="bg-gray-50 min-h-screen font-sans antialiased">
<div class="max-w-5xl mx-auto px-4 py-12">
<h1 class="text-3xl font-bold mb-2">Generated Sites Directory</h1>
<p class="text-gray-500 mb-8">${sites.length} sites generated across ${cityCount} cities</p>
<div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
<table class="w-full text-left text-sm">
<thead class="bg-gray-100 text-gray-600 uppercase text-xs">
<tr><th class="px-4 py-3">Company</th><th class="px-4 py-3">Trade</th><th class="px-4 py-3">City</th></tr>
</thead>
<tbody>${rows.join('')}</tbody>
</table>
</div>
</div>
</body>
</html>`;
}

// ── Main Agent ──────────────────────────────────────────────

export interface WebsiteAgentOptions {
  formspreeId?: string;
  sitesDir?: string;
  /** If provided, only generate websites for these leads instead of all leads in the database */
  leads?: Lead[];
}

export interface WebsiteAgentResult {
  sitesGenerated: number;
  leadsSkipped: number;
  sitesDir: string;
  githubPagesUrl: string;
}

export async function runWebsiteAgent(
  options: WebsiteAgentOptions = {}
): Promise<AgentResult<WebsiteAgentResult>> {
  const startTime = Date.now();
  const errors: string[] = [];
  const sitesDir = options.sitesDir || SITES_DIR;
  const formspreeId = options.formspreeId || process.env.FORMSPREE_FORM_ID || 'YOUR_FORM_ID';
  const year = new Date().getFullYear();

  mkdirSync(sitesDir, { recursive: true });

  // Use provided leads or load all from Supabase
  let allLeads: Array<{ city: string; lead: Lead }>;
  if (options.leads && options.leads.length > 0) {
    log('agent', AGENT_NAME, `Generating websites for ${options.leads.length} specific leads`);
    allLeads = options.leads.map(lead => ({
      city: lead.metadata.location || 'Unknown',
      lead,
    }));
  } else {
    log('agent', AGENT_NAME, 'Loading all leads from Supabase');
    allLeads = await loadAllLeadsFromDb();
  }

  if (allLeads.length === 0) {
    log('warn', AGENT_NAME, 'No leads found');
    return {
      agentName: AGENT_NAME,
      success: false,
      data: { sitesGenerated: 0, leadsSkipped: 0, sitesDir, githubPagesUrl: GITHUB_PAGES_BASE },
      itemsProcessed: 0,
      errors: ['No lead files found'],
      durationMs: Date.now() - startTime,
    };
  }

  log('info', AGENT_NAME, `Processing ${allLeads.length} leads`);

  // Load photo manifest if exists
  const manifestPath = join(sitesDir, 'photo_manifest.json');
  let photoManifest: Record<string, string | null> = {};
  if (existsSync(manifestPath)) {
    try {
      photoManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    } catch { /* ignore */ }
  }

  const generatedSites: Array<{ city: string; companyName: string; slug: string; tradeCategory: string }> = [];
  const usedSlugs = new Map<string, number>();
  let skipped = 0;

  for (const { city, lead } of allLeads) {
    try {
      // Skip non-operational or no-phone leads
      if (lead.business_status && lead.business_status !== 'OPERATIONAL') {
        skipped++;
        continue;
      }
      if (!lead.phone) {
        skipped++;
        continue;
      }

      const trade = TRADE_CONFIG[lead.trade_category];
      if (!trade) {
        log('warn', AGENT_NAME, `No trade config for '${lead.trade_category}', skipping ${lead.company_name}`);
        skipped++;
        continue;
      }

      // Generate slug with dedup
      let baseSlug = slugify(lead.company_name) || 'business';
      let slug = baseSlug;
      const count = usedSlugs.get(baseSlug);
      if (count !== undefined) {
        usedSlugs.set(baseSlug, count + 1);
        slug = `${baseSlug}-${count + 1}`;
      } else {
        usedSlugs.set(baseSlug, 1);
      }

      // Compute layout & copy variants
      const variants = computeVariants(lead.company_name);
      const testimonials = pickTestimonials(lead.company_name, trade.testimonials);
      const hasPhoto = !!photoManifest[slug];

      // Resolve copy
      const tagline = trade.taglines[variants.taglineVariant % trade.taglines.length];
      const subtitle = trade.subtitles[variants.subtitleVariant % trade.subtitles.length]
        .replace('{city}', city);
      const aboutCopy = trade.aboutParagraphs[variants.aboutCopyVariant % trade.aboutParagraphs.length];
      const aboutP1 = aboutCopy.p1
        .replace('{company_name}', lead.company_name)
        .replace('{city}', city)
        .replace('{trade}', trade.displayName.toLowerCase());
      const aboutP2 = aboutCopy.p2
        .replace('{company_name}', lead.company_name)
        .replace('{city}', city)
        .replace('{trade}', trade.displayName.toLowerCase());

      // Render HTML
      const html = renderSiteHtml({
        companyName: lead.company_name,
        trade,
        city,
        phone: lead.phone,
        address: lead.address || '',
        testimonials,
        formspreeId,
        year,
        hasPhoto,
        tagline,
        subtitle,
        aboutP1,
        aboutP2,
        ...variants,
      });

      // Write site
      const siteDir = join(sitesDir, slug);
      mkdirSync(siteDir, { recursive: true });
      writeFileSync(join(siteDir, 'index.html'), html, 'utf-8');

      // Save site_url to Supabase so outreach can reference it
      const siteUrl = `${GITHUB_PAGES_BASE}/${slug}/`;
      try {
        await updateSiteUrl(lead.id, siteUrl);
        log('success', AGENT_NAME, `Saved site_url for ${lead.company_name}: ${siteUrl}`);
      } catch (err) {
        log('warn', AGENT_NAME, `Could not update site_url in DB for ${lead.company_name}: ${(err as Error).message}`);
      }

      generatedSites.push({ city, companyName: lead.company_name, slug, tradeCategory: lead.trade_category });
    } catch (err) {
      const msg = `Failed to generate site for "${lead.company_name}": ${(err as Error).message}`;
      log('error', AGENT_NAME, msg);
      errors.push(msg);
    }
  }

  // Generate index page
  const indexHtml = generateIndexHtml(generatedSites);
  writeFileSync(join(sitesDir, 'index.html'), indexHtml, 'utf-8');

  // Generate manifest.json for outreach system
  const manifest: Record<string, { company_name: string; url: string; trade: string; city: string; phone: string }> = {};
  for (const { city, companyName, slug, tradeCategory } of generatedSites) {
    const lead = allLeads.find(l => l.lead.company_name === companyName);
    manifest[slug] = {
      company_name: companyName,
      url: `${GITHUB_PAGES_BASE}/${slug}/`,
      trade: tradeCategory,
      city,
      phone: lead?.lead.phone || '',
    };
  }
  writeFileSync(join(sitesDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  log('info', AGENT_NAME, `Manifest written: ${Object.keys(manifest).length} entries`);

  // Push to GitHub so GitHub Pages deploys the new sites
  if (generatedSites.length > 0) {
    try {
      log('info', AGENT_NAME, 'Pushing sites to GitHub for Pages deployment...');
      execSync(`git add ${sitesDir}`, { stdio: 'pipe' });
      const commitMsg = `Add ${generatedSites.length} generated site(s)`;
      execSync(`git commit -m "${commitMsg}"`, { stdio: 'pipe' });
      execSync('git push origin main', { stdio: 'pipe' });
      log('success', AGENT_NAME, `Pushed ${generatedSites.length} sites to GitHub — Pages will redeploy`);
    } catch (err) {
      const msg = `Git push failed: ${(err as Error).message}`;
      log('warn', AGENT_NAME, msg);
      errors.push(msg);
    }
  }

  const durationMs = Date.now() - startTime;
  log('success', AGENT_NAME,
    `Generated ${generatedSites.length} sites, skipped ${skipped} leads in ${(durationMs / 1000).toFixed(1)}s`
  );

  return {
    agentName: AGENT_NAME,
    success: true,
    data: {
      sitesGenerated: generatedSites.length,
      leadsSkipped: skipped,
      sitesDir,
      githubPagesUrl: GITHUB_PAGES_BASE,
    },
    itemsProcessed: allLeads.length,
    errors,
    durationMs,
  };
}
