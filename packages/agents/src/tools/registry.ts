// ============================================================
// Agent Tool Registry
// Each agent is registered as a tool that the ReAct orchestrator
// can invoke. Claude sees these as available actions.
// ============================================================

import type Anthropic from '@anthropic-ai/sdk';
import type { Lead, QualifiedLead, EnrichedLead, SearchConfig } from '@podium/shared';
import { DEFAULT_CONFIG, LEADS_DIR } from '@podium/shared';
import { runSearchAgent, type SearchAgentOptions } from '../agents/search-agent';
import { runQualificationAgent } from '../agents/qualification-agent';
import { runEnrichmentAgent } from '../agents/enrichment-agent';
import { runStorageAgent } from '../agents/storage-agent';
import { runReportAgent } from '../agents/report-agent';
import { getAllLeads, getLeadStats } from '../agents/storage-agent';
import { log } from '../utils/logger';

// ── Types ───────────────────────────────────────────────────

export interface ToolContext {
  leadsDir: string;
  reportDir?: string;
  searchOptions: SearchAgentOptions;
  /** In-memory state passed between tool calls within a single run */
  state: PipelineState;
}

export interface PipelineState {
  rawLeads: Lead[];
  qualifiedLeads: QualifiedLead[];
  enrichedLeads: EnrichedLead[];
}

// ── Tool Definitions (what Claude sees) ─────────────────────

export const TOOL_DEFINITIONS: Anthropic.Messages.Tool[] = [
  {
    name: 'search_leads',
    description:
      'Scrape the web for new business leads. Uses Google Places API (if key available), Yelp, and Yellow Pages. ' +
      'Returns raw leads with company name, phone, address, website. ' +
      'Call this first to find new businesses.',
    input_schema: {
      type: 'object' as const,
      properties: {
        trades: {
          type: 'array',
          items: { type: 'string' },
          description: 'Trade categories to search for. E.g. ["plumbing", "hvac", "electrical"]',
        },
        locations: {
          type: 'array',
          items: { type: 'string' },
          description: 'Cities to search in. E.g. ["Mesa, AZ", "Denver, CO"]',
        },
        max_results_per_query: {
          type: 'number',
          description: 'Max results per search query. Default 10.',
        },
      },
      required: ['trades', 'locations'],
    },
  },
  {
    name: 'qualify_leads',
    description:
      'Score and filter leads based on data quality (phone, website, address, email, operational status). ' +
      'Scores each lead 0-100 and removes junk entries. ' +
      'Call this after search_leads to filter out low-quality results.',
    input_schema: {
      type: 'object' as const,
      properties: {
        min_score: {
          type: 'number',
          description: 'Minimum qualification score (0-100). Default 30. Leads below this are dropped.',
        },
      },
      required: [],
    },
  },
  {
    name: 'enrich_leads',
    description:
      'Visit each lead\'s website to extract additional data: email addresses, social media profiles, ' +
      'services offered, owner name, and years in business. Processes 5 leads concurrently. ' +
      'Call this after qualify_leads to add depth to the lead data.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'store_leads',
    description:
      'Save leads to per-city JSON files in data/leads/. Deduplicates by Google Place ID and by ' +
      'company name + trade category. Merges new data into existing leads (keeps non-null values). ' +
      'Call this after qualify_leads or enrich_leads to persist results.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'generate_report',
    description:
      'Generate a summary report of all stored leads. Outputs a console table, a markdown report, ' +
      'and a JSON export. Shows stats by trade, by city, and top leads by score. ' +
      'Call this at the end of a pipeline run, or on its own to see current database state.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_database_stats',
    description:
      'Quick look at what\'s currently stored in data/leads/. Returns total lead count, ' +
      'breakdown by trade and city, and how many have emails/phones. ' +
      'Useful for understanding what data you already have before deciding what to scrape.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

// ── Tool Executors (what actually runs) ─────────────────────

export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  switch (toolName) {
    case 'search_leads':
      return await executeSearch(toolInput, context);
    case 'qualify_leads':
      return await executeQualify(toolInput, context);
    case 'enrich_leads':
      return await executeEnrich(context);
    case 'store_leads':
      return await executeStore(context);
    case 'generate_report':
      return await executeReport(context);
    case 'get_database_stats':
      return await executeStats(context);
    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

async function executeSearch(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const trades = (input.trades as string[]) || DEFAULT_CONFIG.trades;
  const locations = (input.locations as string[]) || DEFAULT_CONFIG.locations;
  const maxResults = (input.max_results_per_query as number) || 10;

  const config: SearchConfig = {
    trades,
    locations,
    maxResultsPerQuery: maxResults,
    minQualificationScore: 30,
    rotateQueries: true,
  };

  const result = await runSearchAgent(config, context.searchOptions);

  // Store in pipeline state for next agent
  context.state.rawLeads = result.data;

  return JSON.stringify({
    success: result.success,
    leads_found: result.data.length,
    duration_ms: result.durationMs,
    errors: result.errors,
    sample: result.data.slice(0, 3).map(l => ({
      name: l.company_name,
      trade: l.trade_category,
      phone: l.phone,
      location: l.metadata.location,
    })),
  });
}

async function executeQualify(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const minScore = (input.min_score as number) || 30;

  if (context.state.rawLeads.length === 0) {
    return JSON.stringify({ error: 'No leads to qualify. Run search_leads first.' });
  }

  const result = await runQualificationAgent(context.state.rawLeads, minScore);

  // Store in pipeline state
  context.state.qualifiedLeads = result.data;

  return JSON.stringify({
    success: result.success,
    input_count: context.state.rawLeads.length,
    qualified_count: result.data.length,
    filtered_out: context.state.rawLeads.length - result.data.length,
    duration_ms: result.durationMs,
    score_distribution: {
      above_80: result.data.filter(l => l.qualification_score >= 80).length,
      above_60: result.data.filter(l => l.qualification_score >= 60).length,
      above_40: result.data.filter(l => l.qualification_score >= 40).length,
      below_40: result.data.filter(l => l.qualification_score < 40).length,
    },
    top_leads: result.data.slice(0, 5).map(l => ({
      name: l.company_name,
      score: l.qualification_score,
      reasons: l.qualification_reasons,
    })),
  });
}

async function executeEnrich(context: ToolContext): Promise<string> {
  if (context.state.qualifiedLeads.length === 0) {
    return JSON.stringify({ error: 'No qualified leads to enrich. Run qualify_leads first.' });
  }

  const result = await runEnrichmentAgent(context.state.qualifiedLeads);

  // Store in pipeline state
  context.state.enrichedLeads = result.data;

  const withEmail = result.data.filter(l => l.email).length;
  const withSocials = result.data.filter(l => l.social_profiles).length;
  const withOwner = result.data.filter(l => l.owner_name).length;
  const withServices = result.data.filter(l => l.services?.length).length;

  return JSON.stringify({
    success: result.success,
    enriched_count: result.data.length,
    duration_ms: result.durationMs,
    enrichment_stats: {
      with_email: withEmail,
      with_social_profiles: withSocials,
      with_owner_name: withOwner,
      with_services: withServices,
    },
    errors: result.errors,
  });
}

async function executeStore(context: ToolContext): Promise<string> {
  // Use enriched leads if available, otherwise qualified leads
  const leadsToStore = context.state.enrichedLeads.length > 0
    ? context.state.enrichedLeads
    : context.state.qualifiedLeads.map(l => ({ ...l, enriched_at: new Date().toISOString() }));

  if (leadsToStore.length === 0) {
    return JSON.stringify({ error: 'No leads to store. Run search_leads and qualify_leads first.' });
  }

  const result = await runStorageAgent(leadsToStore, context.leadsDir);

  return JSON.stringify({
    success: result.success,
    new_stored: result.data.stored,
    duplicates_updated: result.data.duplicates,
    total_in_database: result.data.totalInDb,
    duration_ms: result.durationMs,
  });
}

async function executeReport(context: ToolContext): Promise<string> {
  const run = {
    runId: 'report',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    config: DEFAULT_CONFIG,
    results: { searched: 0, qualified: 0, enriched: 0, stored: 0, duplicatesSkipped: 0 },
    agentResults: [],
  };

  const result = await runReportAgent(run, context.reportDir, context.leadsDir);

  return JSON.stringify({
    success: result.success,
    leads_in_report: result.itemsProcessed,
    report_path: result.data.reportPath,
    json_path: result.data.jsonPath,
  });
}

async function executeStats(context: ToolContext): Promise<string> {
  const stats = getLeadStats(context.leadsDir);

  return JSON.stringify({
    total_leads: stats.total,
    by_trade: stats.byTrade,
    by_city: stats.byCity,
    by_status: stats.byStatus,
  });
}
