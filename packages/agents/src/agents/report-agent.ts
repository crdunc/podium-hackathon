// ============================================================
// Agent 5: Report Agent (AI-Powered)
// Uses Claude to analyze lead data and generate strategic insights.
// Outputs: console summary, markdown report with AI analysis, JSON export.
// Falls back to deterministic tables if no API key.
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync, mkdirSync } from 'fs';
import type { AgentResult, PipelineRun, StoredLead } from '@podium/shared';
import { getAllLeads, getLeadStats } from './storage-agent';
import { log, logDivider, logTable } from '../utils/logger';

const AGENT_NAME = 'ReportAgent';

const REPORT_PROMPT = `You are a business intelligence analyst for a local trade business lead generation system.

You've been given structured data about leads collected from web scraping. Analyze the data and provide actionable insights.

Return a JSON object with this exact shape:
{
  "executive_summary": "2-3 sentence overview of the lead database health and quality",
  "key_findings": [
    "Finding 1 — specific, data-backed insight",
    "Finding 2 — ...",
    "Finding 3 — ..."
  ],
  "opportunities": [
    {
      "title": "Short title",
      "description": "What the opportunity is and why it matters",
      "priority": "high|medium|low"
    }
  ],
  "risks": [
    {
      "title": "Short title",
      "description": "What the risk is",
      "severity": "high|medium|low"
    }
  ],
  "recommendations": [
    "Specific action item 1",
    "Specific action item 2",
    "Specific action item 3"
  ],
  "trade_analysis": {
    "strongest_trade": "trade name — why it's strongest",
    "weakest_trade": "trade name — why it needs attention",
    "best_opportunity": "which trade + city combo has the most untapped potential"
  },
  "data_quality_score": 75,
  "data_quality_reasoning": "Why this score — what's good and what's lacking"
}

Rules:
- Be specific — reference actual numbers, cities, and trades from the data
- Identify gaps (e.g., "Pocatello has 12 HVAC leads but none have emails — enrichment opportunity")
- Flag anomalies (e.g., "5 leads share the same phone number — possible duplicates or franchise")
- Compare across cities and trades — where is data strongest/weakest?
- Prioritize actionable insights over generic observations
- data_quality_score should be 0-100 based on completeness (emails, phones, websites, scores)

Only return the JSON object, nothing else.`;

/** AI-powered report analysis */
async function analyzeWithAI(
  leads: StoredLead[],
  stats: ReturnType<typeof getLeadStats>
): Promise<{
  executive_summary: string;
  key_findings: string[];
  opportunities: Array<{ title: string; description: string; priority: string }>;
  risks: Array<{ title: string; description: string; severity: string }>;
  recommendations: string[];
  trade_analysis: { strongest_trade: string; weakest_trade: string; best_opportunity: string };
  data_quality_score: number;
  data_quality_reasoning: string;
} | null> {
  const client = new Anthropic();

  // Build a compact data summary for Claude (avoid blowing context)
  const tradeBreakdown = (stats.byTrade as any[]).map(t => ({
    trade: t.trade,
    count: t.count,
    avg_score: Math.round(t.avg_score),
    with_email: t.with_email,
    with_phone: t.with_phone,
    email_rate: t.count > 0 ? `${Math.round((t.with_email / t.count) * 100)}%` : '0%',
    phone_rate: t.count > 0 ? `${Math.round((t.with_phone / t.count) * 100)}%` : '0%',
  }));

  const cityBreakdown = (stats.byCity as any[] || []).map(c => ({
    city: c.city,
    count: c.count,
  }));

  // Sample top and bottom leads for analysis
  const sorted = [...leads].sort((a, b) => b.qualification_score - a.qualification_score);
  const topLeads = sorted.slice(0, 10).map(l => ({
    name: l.company_name,
    trade: l.trade_category,
    score: l.qualification_score,
    has_email: !!l.email,
    has_phone: !!l.phone,
    has_website: !!l.website || !!l.has_website,
    has_socials: !!l.social_profiles,
    services_count: l.services?.length || 0,
    location: l.metadata.location,
  }));

  const bottomLeads = sorted.slice(-5).map(l => ({
    name: l.company_name,
    trade: l.trade_category,
    score: l.qualification_score,
    has_email: !!l.email,
    has_phone: !!l.phone,
    location: l.metadata.location,
  }));

  // Compute extra stats
  const withWebsite = leads.filter(l => l.website || l.has_website).length;
  const withServices = leads.filter(l => l.services?.length).length;
  const withOwner = leads.filter(l => l.owner_name).length;
  const avgScore = leads.length > 0
    ? Math.round(leads.reduce((s, l) => s + l.qualification_score, 0) / leads.length)
    : 0;

  const dataPayload = {
    total_leads: stats.total,
    avg_qualification_score: avgScore,
    with_email: leads.filter(l => l.email).length,
    with_phone: leads.filter(l => l.phone).length,
    with_website: withWebsite,
    with_services: withServices,
    with_owner_name: withOwner,
    by_trade: tradeBreakdown,
    by_city: cityBreakdown,
    top_leads: topLeads,
    bottom_leads: bottomLeads,
    by_status: stats.byStatus,
  };

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `Analyze this lead database and provide strategic insights:\n\n${JSON.stringify(dataPayload, null, 2)}`,
      }],
      system: REPORT_PROMPT,
    });

    const text = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    log('warn', AGENT_NAME, `AI analysis failed: ${(err as Error).message}`);
  }

  return null;
}

/** Generate a console report */
function printConsoleReport(run: PipelineRun, leads: StoredLead[], leadsDir?: string) {
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

  const stats = getLeadStats(leadsDir);
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

  if (stats.byCity) {
    logDivider('LEADS BY CITY');
    logTable(
      ['City', 'Count'],
      (stats.byCity as any[]).map(c => [c.city, String(c.count)])
    );
  }

  console.log(`  Total leads in database: ${stats.total}\n`);
}

/** Generate AI-enhanced markdown report */
function generateMarkdownReport(
  run: PipelineRun,
  leads: StoredLead[],
  aiAnalysis: Awaited<ReturnType<typeof analyzeWithAI>>,
  leadsDir?: string
): string {
  const stats = getLeadStats(leadsDir);
  const now = new Date().toISOString().slice(0, 10);

  let md = `# Lead Hunter Report\n\n`;
  md += `**Date:** ${now}  \n`;
  md += `**Run ID:** ${run.runId}  \n`;
  md += `**Trades:** ${run.config.trades.join(', ')}  \n`;
  md += `**Locations:** ${run.config.locations.join(', ')}  \n`;
  md += `**Total Leads:** ${stats.total}  \n\n`;

  // AI-generated insights section
  if (aiAnalysis) {
    md += `## Executive Summary\n\n`;
    md += `${aiAnalysis.executive_summary}\n\n`;
    md += `**Data Quality Score:** ${aiAnalysis.data_quality_score}/100 — ${aiAnalysis.data_quality_reasoning}\n\n`;

    md += `## Key Findings\n\n`;
    for (const finding of aiAnalysis.key_findings) {
      md += `- ${finding}\n`;
    }
    md += `\n`;

    md += `## Opportunities\n\n`;
    for (const opp of aiAnalysis.opportunities) {
      md += `### ${opp.priority === 'high' ? '🔥' : opp.priority === 'medium' ? '⚡' : '💡'} ${opp.title} (${opp.priority} priority)\n\n`;
      md += `${opp.description}\n\n`;
    }

    md += `## Risks\n\n`;
    for (const risk of aiAnalysis.risks) {
      md += `### ${risk.severity === 'high' ? '🚨' : risk.severity === 'medium' ? '⚠️' : 'ℹ️'} ${risk.title} (${risk.severity})\n\n`;
      md += `${risk.description}\n\n`;
    }

    md += `## Recommendations\n\n`;
    for (let i = 0; i < aiAnalysis.recommendations.length; i++) {
      md += `${i + 1}. ${aiAnalysis.recommendations[i]}\n`;
    }
    md += `\n`;

    md += `## Trade Analysis\n\n`;
    md += `- **Strongest Trade:** ${aiAnalysis.trade_analysis.strongest_trade}\n`;
    md += `- **Weakest Trade:** ${aiAnalysis.trade_analysis.weakest_trade}\n`;
    md += `- **Best Opportunity:** ${aiAnalysis.trade_analysis.best_opportunity}\n\n`;
  }

  // Standard data tables
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

  if (stats.byCity) {
    md += `## Leads by City\n\n`;
    md += `| City | Count |\n|------|-------|\n`;
    for (const c of stats.byCity as any[]) {
      md += `| ${c.city} | ${c.count} |\n`;
    }
    md += '\n';
  }

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
  outputDir: string = './data/reports',
  leadsDir?: string
): Promise<AgentResult<{ reportPath: string; jsonPath: string }>> {
  const startTime = Date.now();
  const errors: string[] = [];

  log('agent', AGENT_NAME, 'Generating pipeline report');

  const leads = getAllLeads(leadsDir);
  const useAI = !!process.env.ANTHROPIC_API_KEY;

  // AI analysis
  let aiAnalysis: Awaited<ReturnType<typeof analyzeWithAI>> = null;
  if (useAI && leads.length > 0) {
    log('info', AGENT_NAME, 'Running AI analysis on lead data...');
    const stats = getLeadStats(leadsDir);
    aiAnalysis = await analyzeWithAI(leads, stats);
    if (aiAnalysis) {
      log('success', AGENT_NAME, `AI analysis complete — Data Quality: ${aiAnalysis.data_quality_score}/100`);

      // Print AI insights to console
      logDivider('AI INSIGHTS');
      console.log(`\n  ${aiAnalysis.executive_summary}\n`);
      console.log(`  Data Quality: ${aiAnalysis.data_quality_score}/100\n`);

      logDivider('KEY FINDINGS');
      for (const finding of aiAnalysis.key_findings) {
        console.log(`  • ${finding}`);
      }

      logDivider('RECOMMENDATIONS');
      for (let i = 0; i < aiAnalysis.recommendations.length; i++) {
        console.log(`  ${i + 1}. ${aiAnalysis.recommendations[i]}`);
      }
      console.log('');
    }
  } else if (!useAI) {
    log('info', AGENT_NAME, 'Using deterministic report (no ANTHROPIC_API_KEY)');
  }

  // Console report (always deterministic for reliability)
  printConsoleReport(run, leads, leadsDir);

  // Write files
  mkdirSync(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');

  const reportPath = `${outputDir}/report-${timestamp}.md`;
  const jsonPath = `${outputDir}/leads-${timestamp}.json`;

  try {
    writeFileSync(reportPath, generateMarkdownReport(run, leads, aiAnalysis, leadsDir));
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
