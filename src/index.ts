#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Importing config eagerly validates credentials at startup.
// If .env is missing or incomplete, this throws with setup instructions.
import './config.js';

import { registerMailTools } from './tools/mail.js';
import { registerCalendarTools } from './tools/calendar.js';
import { registerContactsTools } from './tools/contacts.js';
import { registerRemindersTools } from './tools/reminders.js';

const server = new McpServer({
  name: 'apple-mcp-server',
  version: '1.0.0',
});

registerMailTools(server);
registerCalendarTools(server);
registerContactsTools(server);
registerRemindersTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  // Surface credential errors clearly without leaking passwords
  process.stderr.write(`\nFailed to start apple-mcp-server:\n${message}\n`);
  process.exit(1);
});

// Graceful shutdown — let imapflow / tsdav connections close cleanly
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
