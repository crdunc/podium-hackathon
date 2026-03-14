import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { resolve } from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const { task } = await request.json();

  if (!task || typeof task !== 'string' || task.trim().length === 0) {
    return NextResponse.json({ error: 'Task is required' }, { status: 400 });
  }

  const monorepoRoot = resolve(process.cwd(), '../..');

  // Use shell: true so pnpm is found via PATH even in detached mode
  const child = spawn('pnpm', ['hunt', task.trim()], {
    cwd: monorepoRoot,
    detached: true,
    shell: true,
    stdio: ['ignore', 'ignore', 'ignore'],
    env: { ...process.env, PATH: process.env.PATH },
  });

  // Wait briefly to catch immediate spawn errors
  const spawnResult = await new Promise<{ ok: boolean; error?: string }>((res) => {
    child.on('error', (err) => {
      res({ ok: false, error: err.message });
    });
    // If no error after 500ms, assume spawned successfully
    setTimeout(() => {
      child.unref();
      res({ ok: true });
    }, 500);
  });

  if (!spawnResult.ok) {
    return NextResponse.json(
      { error: `Failed to spawn: ${spawnResult.error}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: `Pipeline started: ${task.trim()}`,
    pid: child.pid,
  });
}
