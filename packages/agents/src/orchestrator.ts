// ============================================================
// Pipeline Orchestrator
// Chains all 5 agents in sequence:
//   Search → Qualify → Enrich → Store → Report
// ============================================================

import { randomUUID } from 'crypto';
import type { PipelineRun, SearchConfig } from '@podium/shared';
import { runSearchAgent } from './agents/search-agent';
import { runQualificationAgent } from './agents/qualification-agent';
import { runEnrichmentAgent } from './agents/enrichment-agent';
import { runStorageAgent } from './agents/storage-agent';
import { runReportAgent } from './agents/report-agent';
import { log, logDivider } from './utils/logger';
import { LEADS_DIR, DB_PATH } from '@podium/shared';

const AGENT_NAME = 'Orchestrator';

export interface OrchestratorOptions {
  config: SearchConfig;
  useMock?: boolean;
  leadsDir?: string;
  dbPath?: string;
  reportDir?: string;
  skipEnrichment?: boolean;
  skipReport?: boolean;
}

export async function runPipeline(options: OrchestratorOptions): Promise<PipelineRun> {
  const {
    config,
    useMock = false,
    leadsDir = LEADS_DIR,
    dbPath = DB_PATH,
    reportDir,
    skipEnrichment = false,
    skipReport = false,
  } = options;

  const run: PipelineRun = {
    runId: randomUUID().slice(0, 8),
    startedAt: new Date().toISOString(),
    config,
    results: {
      searched: 0,
      qualified: 0,
      enriched: 0,
      stored: 0,
      duplicatesSkipped: 0,
    },
    agentResults: [],
  };

  logDivider(`LEAD HUNTER PIPELINE — Run ${run.runId}`);
  log('pipeline', AGENT_NAME, `Mode: ${useMock ? 'MOCK (demo data)' : 'LIVE (city files + web scraping)'}`);
  log('pipeline', AGENT_NAME, `Trades: ${config.trades.join(', ')}`);
  log('pipeline', AGENT_NAME, `Locations: ${config.locations.join(', ')}`);
  log('pipeline', AGENT_NAME, `Leads dir: ${leadsDir}`);

  // ── Stage 1: Search ─────────────────────────────────────────
  logDivider('STAGE 1: SEARCH');
  const searchResult = await runSearchAgent(config, useMock, leadsDir);
  run.agentResults.push(searchResult);
  run.results.searched = searchResult.data.length;

  if (searchResult.data.length === 0) {
    log('warn', AGENT_NAME, 'No leads found. Pipeline stopping.');
    run.completedAt = new Date().toISOString();
    return run;
  }

  // ── Stage 2: Qualify ────────────────────────────────────────
  logDivider('STAGE 2: QUALIFY');
  const qualifyResult = await runQualificationAgent(
    searchResult.data,
    config.minQualificationScore
  );
  run.agentResults.push(qualifyResult);
  run.results.qualified = qualifyResult.data.length;

  if (qualifyResult.data.length === 0) {
    log('warn', AGENT_NAME, 'No leads passed qualification. Pipeline stopping.');
    run.completedAt = new Date().toISOString();
    return run;
  }

  // ── Stage 3: Enrich ─────────────────────────────────────────
  let enrichedLeads = qualifyResult.data.map(l => ({
    ...l,
    enriched_at: new Date().toISOString(),
  }));

  if (!skipEnrichment) {
    logDivider('STAGE 3: ENRICH');
    const enrichResult = await runEnrichmentAgent(qualifyResult.data, useMock);
    run.agentResults.push(enrichResult);
    enrichedLeads = enrichResult.data;
    run.results.enriched = enrichResult.data.length;
  } else {
    log('info', AGENT_NAME, 'Skipping enrichment stage');
    run.results.enriched = enrichedLeads.length;
  }

  // ── Stage 4: Store ──────────────────────────────────────────
  logDivider('STAGE 4: STORE');
  const storageResult = await runStorageAgent(enrichedLeads, dbPath);
  run.agentResults.push(storageResult);
  run.results.stored = storageResult.data.stored;
  run.results.duplicatesSkipped = storageResult.data.duplicates;

  // ── Stage 5: Report ─────────────────────────────────────────
  if (!skipReport) {
    logDivider('STAGE 5: REPORT');
    run.completedAt = new Date().toISOString();
    const reportResult = await runReportAgent(run, reportDir);
    run.agentResults.push(reportResult);
  }

  run.completedAt = new Date().toISOString();

  logDivider('PIPELINE COMPLETE');
  log('pipeline', AGENT_NAME,
    `Finished run ${run.runId}: ` +
    `${run.results.searched} searched → ` +
    `${run.results.qualified} qualified → ` +
    `${run.results.enriched} enriched → ` +
    `${run.results.stored} stored ` +
    `(${run.results.duplicatesSkipped} dupes)`
  );

  return run;
}
