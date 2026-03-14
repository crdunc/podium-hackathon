// ============================================================
// ReAct Orchestrator
// Uses Claude to reason about which agent to invoke next.
// Loop: Observe → Think → Act → Observe → Think → Act...
//
// The orchestrator IS the AI. Each agent is a tool it can call.
// Claude decides the flow based on the task and results.
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { LEADS_DIR } from '@podium/shared';
import {
  TOOL_DEFINITIONS,
  executeTool,
  type ToolContext,
  type PipelineState,
} from './tools/registry';
import { log, logDivider } from './utils/logger';
import type { ScraperSource } from './scrapers';

const AGENT_NAME = 'Orchestrator';
const MAX_ITERATIONS = 15;

export interface OrchestratorOptions {
  task: string;
  leadsDir?: string;
  reportDir?: string;
  googleApiKey?: string;
  sources?: ScraperSource[];
  model?: string;
}

const SYSTEM_PROMPT = `You are Lead Hunter, an autonomous lead generation system for local trade businesses (HVAC, Electrical, Plumbing, Lawn Care, Roofing, Painting, etc.).

You have these tools available:
- search_leads: Scrape the web for new business leads in specific trades and cities
- qualify_leads: Score and filter leads by data quality (0-100)
- enrich_leads: Visit business websites to extract emails, socials, owner names, services
- store_leads: Save leads to the database (per-city JSON files with deduplication)
- generate_report: Create a summary report of all stored leads
- get_database_stats: Check what's currently in the database

IMPORTANT RULES:
- You are a ReAct agent. Think step by step about what to do, then act.
- Always check database stats first if you need to understand current state.
- search_leads returns raw data → qualify_leads filters it → enrich_leads adds depth → store_leads persists it.
- You must qualify before enriching (enrichment only works on qualified leads).
- You must qualify or enrich before storing (storage needs scored leads).
- After storing, generate a report so the user can see results.
- If a tool returns an error, reason about what went wrong and adapt.
- Be efficient — don't re-scrape cities/trades you already have data for unless asked.`;

export async function runOrchestrator(options: OrchestratorOptions) {
  const {
    task,
    leadsDir = LEADS_DIR,
    reportDir,
    googleApiKey = process.env.GOOGLE_PLACES_API_KEY,
    sources,
    model = 'claude-sonnet-4-20250514',
  } = options;

  const client = new Anthropic();

  // Pipeline state — shared across tool calls within this run
  const state: PipelineState = {
    rawLeads: [],
    qualifiedLeads: [],
    enrichedLeads: [],
  };

  const context: ToolContext = {
    leadsDir,
    reportDir,
    searchOptions: { googleApiKey, sources },
    state,
  };

  logDivider('LEAD HUNTER — ReAct Orchestrator');
  log('pipeline', AGENT_NAME, `Task: ${task}`);
  log('pipeline', AGENT_NAME, `Model: ${model}`);
  log('pipeline', AGENT_NAME, `Storage: ${leadsDir}`);
  log('pipeline', AGENT_NAME, `Google API: ${googleApiKey ? 'YES' : 'NO'}`);

  // Initialize conversation with the user's task
  const messages: Anthropic.Messages.MessageParam[] = [
    { role: 'user', content: task },
  ];

  // ── ReAct Loop ──────────────────────────────────────────────
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    log('info', AGENT_NAME, `Step ${i + 1}/${MAX_ITERATIONS}`);

    // Ask Claude what to do next
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      messages,
    });

    // Process Claude's response
    const assistantContent = response.content;
    messages.push({ role: 'assistant', content: assistantContent });

    // Check if Claude is done (no more tool calls)
    if (response.stop_reason === 'end_turn') {
      // Extract final text response
      const textBlocks = assistantContent.filter(
        (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
      );
      const finalMessage = textBlocks.map(b => b.text).join('\n');

      logDivider('ORCHESTRATOR COMPLETE');
      console.log('\n' + finalMessage + '\n');
      return { message: finalMessage, steps: i + 1 };
    }

    // Execute tool calls
    const toolUseBlocks = assistantContent.filter(
      (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
    );

    if (toolUseBlocks.length === 0) {
      // No tools and not end_turn — shouldn't happen, but break to be safe
      break;
    }

    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      log('agent', AGENT_NAME, `Calling: ${toolUse.name}`);

      // Print Claude's reasoning if it came before the tool call
      const textBefore = assistantContent.filter(
        (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
      );
      if (textBefore.length > 0 && i === 0) {
        // Only print reasoning on first step to avoid noise
        for (const t of textBefore) {
          log('info', AGENT_NAME, `Thinking: ${t.text.slice(0, 200)}...`);
        }
      }

      try {
        const result = await executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          context
        );

        log('success', AGENT_NAME, `${toolUse.name} complete`);

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result,
        });
      } catch (err) {
        const errorMsg = `Tool ${toolUse.name} failed: ${(err as Error).message}`;
        log('error', AGENT_NAME, errorMsg);

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify({ error: errorMsg }),
          is_error: true,
        });
      }
    }

    // Feed tool results back to Claude
    messages.push({ role: 'user', content: toolResults });
  }

  log('warn', AGENT_NAME, `Hit max iterations (${MAX_ITERATIONS})`);
  return { message: 'Reached maximum iterations', steps: MAX_ITERATIONS };
}
