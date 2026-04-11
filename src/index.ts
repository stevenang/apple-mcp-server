#!/usr/bin/env node
import { createServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

// Importing config eagerly validates credentials at startup.
// If .env is missing or incomplete, this throws with setup instructions.
import './config.js';

import { registerMailTools } from './tools/mail.js';
import { registerCalendarTools } from './tools/calendar.js';
import { registerContactsTools } from './tools/contacts.js';
import { registerRemindersTools } from './tools/reminders.js';

function buildServer(): McpServer {
  const server = new McpServer({
    name: 'apple-mcp-server',
    version: '1.0.0',
  });
  registerMailTools(server);
  registerCalendarTools(server);
  registerContactsTools(server);
  registerRemindersTools(server);
  return server;
}

async function startStdio(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function startHttp(port: number): Promise<void> {
  const server = buildServer();
  // Stateless mode: no session tracking, each request handled independently
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);

  const httpServer = createServer(async (req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' }).end('OK');
      return;
    }
    if (req.url === '/mcp') {
      const chunks: Buffer[] = [];
      for await (const chunk of req as AsyncIterable<Buffer>) {
        chunks.push(chunk);
      }
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
      await transport.handleRequest(req, res, body);
      return;
    }
    res.writeHead(404).end('Not found. Use POST /mcp');
  });

  httpServer.listen(port, () => {
    process.stderr.write(`apple-mcp-server listening on http://localhost:${port}/mcp\n`);
  });

  process.on('SIGINT', () => { httpServer.close(); process.exit(0); });
  process.on('SIGTERM', () => { httpServer.close(); process.exit(0); });
}

function parseArgs(): { transport: 'stdio' | 'http'; port: number } {
  const argv = process.argv;
  const transportIdx = argv.indexOf('--transport');
  const transport =
    transportIdx !== -1 && argv[transportIdx + 1] === 'http' ? 'http' : 'stdio';
  const portIdx = argv.indexOf('--port');
  const port =
    portIdx !== -1 && argv[portIdx + 1]
      ? parseInt(argv[portIdx + 1], 10)
      : 8000;
  return { transport, port };
}

async function main(): Promise<void> {
  const { transport, port } = parseArgs();

  if (transport === 'http') {
    await startHttp(port);
  } else {
    await startStdio();
    process.on('SIGINT', () => process.exit(0));
    process.on('SIGTERM', () => process.exit(0));
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  // Surface credential errors clearly without leaking passwords
  process.stderr.write(`\nFailed to start apple-mcp-server:\n${message}\n`);
  process.exit(1);
});
