import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const EVENTS_PATH = resolve(process.cwd(), '../../data/agent-runs.json');

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get('runId');

  if (!existsSync(EVENTS_PATH)) {
    return NextResponse.json({ runs: [] });
  }

  try {
    const store = JSON.parse(readFileSync(EVENTS_PATH, 'utf-8'));

    if (runId) {
      const run = store.runs?.find((r: any) => r.runId === runId);
      return NextResponse.json({ run: run || null });
    }

    // Return all runs (most recent first), events trimmed for list view
    const runs = (store.runs || [])
      .map((r: any) => ({
        ...r,
        events: r.events?.slice(-5) || [], // only last 5 events in list view
        totalEvents: r.events?.length || 0,
      }))
      .reverse();

    return NextResponse.json({ runs });
  } catch {
    return NextResponse.json({ runs: [] });
  }
}
