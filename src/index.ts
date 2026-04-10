#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({
  name: 'apple-mcp-server',
  version: '1.0.0',
});

// Tool groups will be registered here in Phase 4
// import { registerMailTools } from './tools/mail.js';
// import { registerCalendarTools } from './tools/calendar.js';
// import { registerContactsTools } from './tools/contacts.js';
// import { registerRemindersTools } from './tools/reminders.js';
//
// registerMailTools(server);
// registerCalendarTools(server);
// registerContactsTools(server);
// registerRemindersTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
