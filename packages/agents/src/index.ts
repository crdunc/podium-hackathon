#!/usr/bin/env node
// ============================================================
// Lead Hunter Agents — CLI Entry Point
//
// Usage:
//   pnpm hunt "Find plumbers in Mesa, AZ"
//   pnpm hunt "Scrape HVAC and electrical in Denver, CO"
//   pnpm hunt "What leads do we have? Generate a report"
//   pnpm hunt (uses default task — full pipeline for all configured cities)
//   pnpm stats (quick stats, no AI needed)
//
// Environment variables (or .env file):
//   ANTHROPIC_API_KEY=sk-ant-...          # Required
//   GOOGLE_PLACES_API_KEY=AIza...         # Optional
// ============================================================

import dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env from monorepo root (two levels up from packages/agents/)
dotenv.config({ path: resolve(process.cwd(), '../../.env') });
// Also try cwd in case we're already at root
dotenv.config();
import { Command } from 'commander';
import { runOrchestrator } from './orchestrator';
import { getLeadStats } from './agents/storage-agent';
import { LEADS_DIR } from '@podium/shared';
import { logDivider, logTable } from './utils/logger';
import type { ScraperSource } from './scrapers';
import chalk from 'chalk';

const program = new Command();

program
  .name('lead-hunter')
  .description('AI-powered autonomous lead generation for local trade businesses')
  .version('1.0.0');

program
  .command('hunt', { isDefault: true })
  .description('Run the AI orchestrator with a task')
  .argument('[task...]', 'What you want the agent to do (in natural language)')
  .option('--leads-dir <dir>', 'Storage directory for city JSON files', LEADS_DIR)
  .option('--google-api-key <key>', 'Google Places API key (overrides env var)')
  .option('--sources <sources>', 'Comma-separated scraper sources: google_places,yelp,yellowpages')
  .option('--model <model>', 'Claude model to use', 'claude-sonnet-4-20250514')
  .action(async (taskParts: string[], opts) => {
    const task = taskParts.join(' ') ||
      'Find new leads for all trade categories in the configured cities. ' +
      'Scrape, qualify, enrich, store, and generate a report.';

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error(chalk.red(
        '\nMissing ANTHROPIC_API_KEY. Set it in .env or as an environment variable.\n' +
        'Get one at: https://console.anthropic.com/settings/keys\n'
      ));
      process.exit(1);
    }

    const sources = opts.sources
      ? opts.sources.split(',').map((s: string) => s.trim() as ScraperSource)
      : undefined;

    try {
      await runOrchestrator({
        task,
        leadsDir: opts.leadsDir,
        googleApiKey: opts.googleApiKey,
        sources,
        model: opts.model,
      });
    } catch (err) {
      console.error(chalk.red(`\nOrchestrator failed: ${(err as Error).message}`));
      process.exit(1);
    }
  });

program
  .command('stats')
  .description('Show database statistics (no AI needed)')
  .option('--leads-dir <dir>', 'Directory containing city lead JSON files', LEADS_DIR)
  .action(async (opts) => {
    try {
      const stats = getLeadStats(opts.leadsDir);

      if (stats.total === 0) {
        console.log(chalk.yellow('\nNo leads found. Run "hunt" first.\n'));
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

      if (stats.byCity) {
        logTable(
          ['City', 'Count'],
          (stats.byCity as any[]).map(c => [c.city, String(c.count)])
        );
      }

      logTable(
        ['Status', 'Count'],
        (stats.byStatus as any[]).map(s => [s.status, String(s.count)])
      );
    } catch (err) {
      console.error(chalk.red(`Failed: ${(err as Error).message}`));
    }
  });

program.parse();
