import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { task } = body;

    if (!task || typeof task !== 'string' || task.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Task must be a non-empty string' },
        { status: 400 }
      );
    }

    const child = spawn('pnpm', ['hunt', task], {
      cwd: path.resolve(process.cwd(), '../..'), // monorepo root
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    });

    child.unref();

    return NextResponse.json(
      { success: true, message: 'Pipeline started' },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
