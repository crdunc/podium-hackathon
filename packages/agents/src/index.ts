#!/usr/bin/env node
// ============================================================
// Lead Hunter Agents — CLI Entry Point
//
// Usage:
//   pnpm hunt                            # Run pipeline on existing city files
//   pnpm hunt -- --mock                  # Run with mock data
//   pnpm hunt -- --trades hvac,plumbing
//   pnpm hunt -- --leads-dir ../data/leads
//   pnpm run report                      # View current DB report
//   pnpm run stats                       # Quick stats from DB
// ============================================================

import { Command } from 'commander';
import { runPipeline } from './orchestrator';
import { getAllLeads, getLeadStats } from './agents/storage-agent';
import { DEFAULT_CONFIG, DB_PATH, LEADS_DIR } from '@podium/shared';
import { logDivider, logTable } from './utils/logger';
import type { TradeCategory } from '@podium/shared';
import chalk from 'chalk';

const program = new Command();

program
  .name('lead-hunter')
  .description('Autonomous multi-agent lead generation for local trade businesses')
  .version('1.0.0');

program
  .command('hunt')
  .description('Run the full lead hunting pipeline')
  .option('--mock', 'Use mock data instead of real city files', false)
  .option('--trades <trades>', 'Comma-separated trades: hvac,electrical,plumbing,lawn care,...')
  .option('--locations <locations>', 'Comma-separated locations (quote if spaces)')
  .option('--leads-dir <dir>', 'Directory containing city lead JSON files', LEADS_DIR)
  .option('--min-score <score>', 'Minimum qualification score (0-100)', '30')
  .option('--skip-enrich', 'Skip the enrichment stage', false)
  .option('--skip-report', 'Skip report generation', false)
  .option('--db <path>', 'Database file path', DB_PATH)
  .action(async (opts) => {
    const config = { ...DEFAULT_CONFIG };

    if (opts.trades) {
      config.trades = opts.trades.split(',').map((t: string) => t.trim() as TradeCategory);
    }
    if (opts.locations) {
      config.locations = opts.locations.split(',').map((l: string) => l.trim());
    }
    config.minQualificationScore = parseInt(opts.minScore);

    try {
      await runPipeline({
        config,
        useMock: opts.mock,
        leadsDir: opts.leadsDir,
        dbPath: opts.db,
        skipEnrichment: opts.skipEnrich,
        skipReport: opts.skipReport,
      });
    } catch (err) {
      console.error(chalk.red(`\nPipeline failed: ${(err as Error).message}`));
      process.exit(1);
    }
  });

program
  .command('report')
  .description('Generate a report from the current database')
  .option('--db <path>', 'Database file path', DB_PATH)
  .action(async (opts) => {
    try {
      const leads = getAllLeads(opts.db);
      if (leads.length === 0) {
        console.log(chalk.yellow('\nNo leads in database. Run "hunt" first.\n'));
        return;
      }

      logDivider(`ALL LEADS (${leads.length} total)`);
      logTable(
        ['#', 'Company', 'Trade', 'Score', 'Phone', 'Email', 'Location'],
        leads.map((l, i) => [
          String(i + 1),
          l.company_name.slice(0, 30),
          l.trade_category,
          String(l.qualification_score),
          l.phone || '-',
          l.email || '-',
          l.metadata.location || '-',
        ])
      );
    } catch (err) {
      console.error(chalk.red(`Failed to generate report: ${(err as Error).message}`));
    }
  });

program
  .command('stats')
  .description('Show quick database statistics')
  .option('--db <path>', 'Database file path', DB_PATH)
  .action(async (opts) => {
    try {
      const stats = getLeadStats(opts.db);

      if (stats.total === 0) {
        console.log(chalk.yellow('\nNo leads in database. Run "hunt" first.\n'));
        return;
      }

      logDivider('LEAD DATABASE STATS');

      console.log(`  Total leads: ${chalk.bold(String(stats.total))}\n`);

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

      logTable(
        ['Status', 'Count'],
        (stats.byStatus as any[]).map(s => [s.status, String(s.count)])
      );
    } catch (err) {
      console.error(chalk.red(`Failed to get stats: ${(err as Error).message}`));
    }
  });

program.parse();
