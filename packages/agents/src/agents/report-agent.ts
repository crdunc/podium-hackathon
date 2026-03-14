// ============================================================
// Agent 5: Report Agent
// Generates structured reports from pipeline runs.
// Outputs: console summary, JSON report, and markdown report.
// ============================================================

import { writeFileSync, mkdirSync } from 'fs';
import type { AgentResult, PipelineRun, StoredLead } from '@podium/shared';
import { getAllLeads, getLeadStats } from './storage-agent';
import { log, logDivider, logTable } from '../utils/logger';

const AGENT_NAME = 'ReportAgent';

/** Generate a console report */
function printConsoleReport(run: PipelineRun, leads: StoredLead[]) {
  logDivider('PIPELINE RUN REPORT');

  console.log(`  Run ID:    ${run.runId}`);
  console.log(`  Started:   ${run.startedAt}`);
  console.log(`  Completed: ${run.completedAt || 'N/A'}`);
  console.log(`  Duration:  ${run.agentResults.reduce((sum, r) => sum + r.durationMs, 0) / 1000}s total\n`);

  logDivider('PIPELINE RESULTS');
  logTable(
    ['Metric', 'Count'],
    [
      ['Leads Searched', String(run.results.searched)],
      ['Qualified', String(run.results.qualified)],
      ['Enriched', String(run.results.enriched)],
      ['New Stored', String(run.results.stored)],
      ['Duplicates Skipped', String(run.results.duplicatesSkipped)],
    ]
  );

  logDivider('AGENT PERFORMANCE');
  logTable(
    ['Agent', 'Items', 'Duration', 'Errors', 'Status'],
    run.agentResults.map(r => [
      r.agentName,
      String(r.itemsProcessed),
      `${(r.durationMs / 1000).toFixed(1)}s`,
      String(r.errors.length),
      r.success ? 'OK' : 'FAILED',
    ])
  );

  if (leads.length > 0) {
    logDivider('TOP LEADS (by score)');
    const topLeads = leads.slice(0, 15);
    logTable(
      ['Name', 'Trade', 'Score', 'Phone', 'Email', 'Location'],
      topLeads.map(l => [
        l.company_name.slice(0, 35),
        l.trade_category,
        String(l.qualification_score),
        l.phone ? 'Yes' : '-',
        l.email ? 'Yes' : '-',
        l.metadata.location || '-',
      ])
    );
  }

  const stats = getLeadStats();
  logDivider('DATABASE STATS');
  logTable(
    ['Trade', 'Count', 'Avg Score', 'With Email', 'With Phone'],
    (stats.byTrade as any[]).map(t => [
      t.trade,
      String(t.count),
      (t.avg_score as number).toFixed(0),
      String(t.with_email),
      String(t.with_phone),
    ])
  );
  console.log(`  Total leads in database: ${stats.total}\n`);
}

/** Generate a markdown report file */
function generateMarkdownReport(run: PipelineRun, leads: StoredLead[]): string {
  const stats = getLeadStats();
  const now = new Date().toISOString().slice(0, 10);

  let md = `# Lead Hunter Report\n\n`;
  md += `**Date:** ${now}  \n`;
  md += `**Run ID:** ${run.runId}  \n`;
  md += `**Trades:** ${run.config.trades.join(', ')}  \n`;
  md += `**Locations:** ${run.config.locations.join(', ')}  \n\n`;

  md += `## Pipeline Summary\n\n`;
  md += `| Metric | Count |\n|--------|-------|\n`;
  md += `| Leads Found | ${run.results.searched} |\n`;
  md += `| Qualified | ${run.results.qualified} |\n`;
  md += `| Enriched | ${run.results.enriched} |\n`;
  md += `| New Stored | ${run.results.stored} |\n`;
  md += `| Duplicates | ${run.results.duplicatesSkipped} |\n\n`;

  md += `## Database Overview\n\n`;
  md += `| Trade | Count | Avg Score | With Email | With Phone |\n`;
  md += `|-------|-------|-----------|------------|------------|\n`;
  for (const t of stats.byTrade as any[]) {
    md += `| ${t.trade} | ${t.count} | ${(t.avg_score as number).toFixed(0)} | ${t.with_email} | ${t.with_phone} |\n`;
  }
  md += `\n**Total leads in database:** ${stats.total}\n\n`;

  md += `## All Leads\n\n`;
  md += `| # | Company | Trade | Score | Phone | Email | Location |\n`;
  md += `|---|---------|-------|-------|-------|-------|----------|\n`;
  leads.forEach((l, i) => {
    md += `| ${i + 1} | ${l.company_name} | ${l.trade_category} | ${l.qualification_score} | ${l.phone || '-'} | ${l.email || '-'} | ${l.metadata.location || '-'} |\n`;
  });
  md += '\n';

  return md;
}

/** Generate a JSON export matching teammate's schema */
function generateJsonExport(run: PipelineRun, leads: StoredLead[]): string {
  // Group leads by city for compatibility with teammate's format
  const byCity = new Map<string, StoredLead[]>();
  for (const lead of leads) {
    const city = lead.metadata.location || 'Unknown';
    if (!byCity.has(city)) byCity.set(city, []);
    byCity.get(city)!.push(lead);
  }

  const cityFiles = [...byCity.entries()].map(([city, cityLeads]) => ({
    city,
    leads: cityLeads.map(l => ({
      id: l.id,
      company_name: l.company_name,
      trade_category: l.trade_category,
      description: l.description,
      address: l.address,
      phone: l.phone,
      email: l.email,
      website: l.website,
      has_website: l.has_website,
      contacts: l.contacts,
      google_place_id: l.google_place_id,
      business_status: l.business_status,
      collected_at: l.collected_at,
      metadata: l.metadata,
      // Extra fields from our pipeline
      qualification_score: l.qualification_score,
      owner_name: l.owner_name,
      social_profiles: l.social_profiles,
      services: l.services,
      status: l.status,
    })),
    updated_at: new Date().toISOString(),
  }));

  return JSON.stringify({
    pipeline_run: {
      run_id: run.runId,
      started_at: run.startedAt,
      completed_at: run.completedAt,
      results: run.results,
    },
    cities: cityFiles,
    total_leads: leads.length,
  }, null, 2);
}

/** Main report agent */
export async function runReportAgent(
  run: PipelineRun,
  outputDir: string = './data/reports'
): Promise<AgentResult<{ reportPath: string; jsonPath: string }>> {
  const startTime = Date.now();
  const errors: string[] = [];

  log('agent', AGENT_NAME, 'Generating pipeline report');

  const leads = getAllLeads();

  printConsoleReport(run, leads);

  mkdirSync(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');

  const reportPath = `${outputDir}/report-${timestamp}.md`;
  const jsonPath = `${outputDir}/leads-${timestamp}.json`;

  try {
    writeFileSync(reportPath, generateMarkdownReport(run, leads));
    log('success', AGENT_NAME, `Markdown report: ${reportPath}`);
  } catch (err) {
    errors.push(`Failed to write markdown report: ${(err as Error).message}`);
  }

  try {
    writeFileSync(jsonPath, generateJsonExport(run, leads));
    log('success', AGENT_NAME, `JSON export: ${jsonPath}`);
  } catch (err) {
    errors.push(`Failed to write JSON report: ${(err as Error).message}`);
  }

  const durationMs = Date.now() - startTime;

  return {
    agentName: AGENT_NAME,
    success: errors.length === 0,
    data: { reportPath, jsonPath },
    itemsProcessed: leads.length,
    errors,
    durationMs,
  };
}
