// ============================================================
// Simple colored logger for agent output
// ============================================================

import chalk from 'chalk';

type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'agent' | 'pipeline';

const PREFIXES: Record<LogLevel, string> = {
  info:     chalk.blue('ℹ'),
  success:  chalk.green('✓'),
  warn:     chalk.yellow('⚠'),
  error:    chalk.red('✗'),
  agent:    chalk.magenta('🤖'),
  pipeline: chalk.cyan('⚡'),
};

export function log(level: LogLevel, agentName: string, message: string, data?: unknown) {
  const prefix = PREFIXES[level];
  const name = chalk.bold(`[${agentName}]`);
  const timestamp = chalk.gray(new Date().toISOString().slice(11, 19));

  console.log(`${timestamp} ${prefix} ${name} ${message}`);

  if (data && level === 'error') {
    console.log(chalk.gray(JSON.stringify(data, null, 2)));
  }
}

export function logDivider(title: string) {
  console.log(chalk.cyan(`\n${'═'.repeat(60)}`));
  console.log(chalk.cyan.bold(`  ${title}`));
  console.log(chalk.cyan(`${'═'.repeat(60)}\n`));
}

export function logTable(headers: string[], rows: string[][]) {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => (r[i] || '').length)) + 2
  );

  const headerRow = headers.map((h, i) => h.padEnd(colWidths[i])).join(' │ ');
  const separator = colWidths.map(w => '─'.repeat(w)).join('─┼─');

  console.log(chalk.bold(headerRow));
  console.log(chalk.gray(separator));
  for (const row of rows) {
    console.log(row.map((cell, i) => cell.padEnd(colWidths[i])).join(' │ '));
  }
  console.log();
}
