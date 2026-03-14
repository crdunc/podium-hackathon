// ============================================================
// HTTP Server for Railway deployment
// Exposes the orchestrator as a REST API
// ============================================================

import 'dotenv/config';
import { createServer } from 'http';
import { runOrchestrator } from './orchestrator';

const PORT = parseInt(process.env.PORT || '3001');

const server = createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // Run pipeline
  if (req.method === 'POST' && req.url === '/run') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { task } = JSON.parse(body);

        if (!task || typeof task !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Task is required' }));
          return;
        }

        // Start pipeline in background (don't block the response)
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Pipeline started' }));

        // Run after response is sent
        runOrchestrator({ task }).catch(err => {
          console.error('Pipeline error:', err);
        });
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`Pipeline server listening on port ${PORT}`);
});
