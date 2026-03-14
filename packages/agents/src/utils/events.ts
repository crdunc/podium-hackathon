// ============================================================
// Agent Event Logger
// Writes structured events to a JSON file so the web dashboard
// can display real-time agent activity.
// ============================================================

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const DATA_DIR = resolve(process.cwd(), '../../data');
const EVENTS_PATH = resolve(DATA_DIR, 'agent-runs.json');

export type AgentEventType =
  | 'run_started'
  | 'step_started'
  | 'thinking'
  | 'tool_called'
  | 'tool_completed'
  | 'tool_error'
  | 'run_completed'
  | 'run_error';

export interface AgentEvent {
  id: string;
  type: AgentEventType;
  timestamp: string;
  runId: string;
  step?: number;
  maxSteps?: number;
  agent?: string;
  tool?: string;
  message: string;
  detail?: string;
}

export interface AgentRun {
  runId: string;
  task: string;
  model: string;
  status: 'running' | 'completed' | 'error';
  startedAt: string;
  completedAt?: string;
  currentStep: number;
  maxSteps: number;
  events: AgentEvent[];
}

interface EventStore {
  runs: AgentRun[];
}

function loadStore(): EventStore {
  if (!existsSync(EVENTS_PATH)) return { runs: [] };
  try {
    return JSON.parse(readFileSync(EVENTS_PATH, 'utf-8'));
  } catch {
    return { runs: [] };
  }
}

function saveStore(store: EventStore) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  // Keep only last 10 runs to avoid unbounded growth
  store.runs = store.runs.slice(-10);
  writeFileSync(EVENTS_PATH, JSON.stringify(store, null, 2));
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createRun(task: string, model: string, maxSteps: number): string {
  const runId = makeId();
  const store = loadStore();
  store.runs.push({
    runId,
    task,
    model,
    status: 'running',
    startedAt: new Date().toISOString(),
    currentStep: 0,
    maxSteps,
    events: [],
  });
  saveStore(store);
  return runId;
}

export function emitEvent(
  runId: string,
  type: AgentEventType,
  message: string,
  extra?: Partial<Pick<AgentEvent, 'step' | 'maxSteps' | 'agent' | 'tool' | 'detail'>>
) {
  const store = loadStore();
  const run = store.runs.find(r => r.runId === runId);
  if (!run) return;

  const event: AgentEvent = {
    id: makeId(),
    type,
    timestamp: new Date().toISOString(),
    runId,
    message,
    ...extra,
  };

  run.events.push(event);

  if (extra?.step !== undefined) run.currentStep = extra.step;
  if (type === 'run_completed') {
    run.status = 'completed';
    run.completedAt = new Date().toISOString();
  }
  if (type === 'run_error') {
    run.status = 'error';
    run.completedAt = new Date().toISOString();
  }

  saveStore(store);
}
