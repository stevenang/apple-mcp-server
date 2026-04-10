# Apple Services MCP Server — Project Plan

## Overview

Build an MCP (Model Context Protocol) server that lets Claude (via Claude Code,
Claude.ai, or any MCP client) interact with your Apple iCloud services:
**Mail, Calendar, Contacts, and Reminders**.

There is **no official Apple MCP server** — Apple hasn't released one. Community
implementations exist but are fragmented and low-maintenance. We'll build a
solid, well-structured one from scratch.

---

## Decision: TypeScript vs Python

| Criteria                    | TypeScript                           | Python                              |
|-----------------------------|--------------------------------------|-------------------------------------|
| MCP SDK quality             | ★★★★★ First-class, recommended      | ★★★★ Good (FastMCP)                |
| CalDAV libraries            | `tsdav` — excellent, modern          | `caldav` — works but less maintained|
| IMAP libraries              | `imapflow` — modern, promise-based   | `imaplib` — stdlib, synchronous     |
| CardDAV libraries           | `tsdav` handles both CalDAV+CardDAV  | `vdirsyncer` (not a library)       |
| Claude Code compatibility   | ★★★★★ Native (Node.js based)        | ★★★★ Works via stdio               |
| Type safety                 | ★★★★★ Zod + TypeScript              | ★★★★ Pydantic                      |
| Deployment                  | npx / Docker / npm global            | pip install / Docker                |

### Recommendation: **TypeScript**

- `tsdav` handles CalDAV + CardDAV + iCloud auth quirks in one library
- `imapflow` is a modern async IMAP client (vs Python's sync `imaplib`)
- TypeScript SDK is Anthropic's recommended choice for MCP
- Claude Code is Node.js-based, so TypeScript MCPs run natively

---

## Apple Service Endpoints

All access uses **app-specific passwords** (no OAuth, no REST API from Apple):

| Service    | Protocol | Endpoint                          |
|------------|----------|-----------------------------------|
| Mail       | IMAP     | `imap.mail.me.com:993` (SSL)     |
| Mail Send  | SMTP     | `smtp.mail.me.com:587` (STARTTLS)|
| Calendar   | CalDAV   | `https://caldav.icloud.com/`     |
| Contacts   | CardDAV  | `https://contacts.icloud.com/`   |
| Reminders  | CalDAV   | Same as Calendar (VTODO items)   |

**Note:** iCloud Notes and iCloud Drive are NOT accessible via standard
protocols — they require CloudKit (Apple Developer account + iCloud container).
We'll skip those.

---

## Tools to Implement (22 tools)

### Mail (IMAP/SMTP) — 6 tools
| Tool Name              | Action   | Description                                    |
|------------------------|----------|------------------------------------------------|
| `apple_mail_list`      | Read     | List recent emails from a folder               |
| `apple_mail_search`    | Read     | Search emails by subject/body/sender/date      |
| `apple_mail_read`      | Read     | Read full email content by ID                  |
| `apple_mail_folders`   | Read     | List available IMAP folders                    |
| `apple_mail_send`      | Write    | Send a new email via SMTP                      |
| `apple_mail_move`      | Write    | Move email between folders (archive, trash)    |

### Calendar (CalDAV) — 6 tools
| Tool Name              | Action   | Description                                    |
|------------------------|----------|------------------------------------------------|
| `apple_cal_list`       | Read     | List calendars (names, colors, types)          |
| `apple_cal_events`     | Read     | Get events in a date range                     |
| `apple_cal_get_event`  | Read     | Get full event details by ID                   |
| `apple_cal_create`     | Write    | Create a new calendar event                    |
| `apple_cal_update`     | Write    | Update an existing event                       |
| `apple_cal_delete`     | Write    | Delete a calendar event                        |

### Contacts (CardDAV) — 5 tools
| Tool Name                 | Action | Description                                 |
|---------------------------|--------|---------------------------------------------|
| `apple_contacts_list`     | Read   | List all contacts with basic info            |
| `apple_contacts_search`   | Read   | Search contacts by name/email/phone          |
| `apple_contacts_get`      | Read   | Get full contact details (vCard)             |
| `apple_contacts_create`   | Write  | Create a new contact                         |
| `apple_contacts_update`   | Write  | Update an existing contact                   |

### Reminders (CalDAV VTODO) — 5 tools
| Tool Name                  | Action | Description                                |
|----------------------------|--------|--------------------------------------------|
| `apple_reminders_lists`    | Read   | List reminder lists                         |
| `apple_reminders_items`    | Read   | Get reminders from a list                   |
| `apple_reminders_create`   | Write  | Create a new reminder                       |
| `apple_reminders_complete` | Write  | Mark a reminder as complete                 |
| `apple_reminders_delete`   | Write  | Delete a reminder                           |

---

## Project Structure

```
apple-mcp-server/
├── package.json
├── tsconfig.json
├── README.md
├── .env.example
├── .gitignore
├── src/
│   ├── index.ts              # Entry point — server init, transport setup
│   ├── constants.ts          # Server endpoints, defaults, limits
│   ├── types.ts              # Shared TypeScript interfaces
│   ├── auth.ts               # Credential management + validation
│   ├── services/
│   │   ├── imap-client.ts    # IMAP connection pool + helpers (imapflow)
│   │   ├── smtp-client.ts    # SMTP send helper (nodemailer)
│   │   ├── caldav-client.ts  # CalDAV client wrapper (tsdav)
│   │   └── carddav-client.ts # CardDAV client wrapper (tsdav)
│   ├── tools/
│   │   ├── mail.ts           # 6 mail tools
│   │   ├── calendar.ts       # 6 calendar tools
│   │   ├── contacts.ts       # 5 contacts tools
│   │   └── reminders.ts      # 5 reminder tools
│   ├── schemas/
│   │   ├── mail.ts           # Zod schemas for mail tool inputs
│   │   ├── calendar.ts       # Zod schemas for calendar tool inputs
│   │   ├── contacts.ts       # Zod schemas for contacts tool inputs
│   │   └── reminders.ts      # Zod schemas for reminders tool inputs
│   └── utils/
│       ├── formatters.ts     # Markdown/JSON response formatting
│       ├── errors.ts         # Centralized error handler
│       └── pagination.ts     # Shared pagination logic
└── dist/                     # Compiled JS output
```

---

## Step-by-Step Build Plan

### Phase 0: Prerequisites (before you start)

```bash
# 1. Generate an App-Specific Password
#    Go to https://appleid.apple.com
#    → Sign-In and Security → App-Specific Passwords → "+"
#    Save the password (format: xxxx-xxxx-xxxx-xxxx)

# 2. Make sure you have Node.js 18+ and Claude Code installed
node --version    # Should be 18+
claude --version  # Claude Code CLI
```

### Phase 1: Scaffold the Project

Open your terminal and use Claude Code to scaffold:

```bash
# Create project directory
mkdir apple-mcp-server && cd apple-mcp-server

# Initialize with Claude Code — it can do the scaffolding
claude "Initialize a TypeScript MCP server project called apple-mcp-server.
  Create package.json with dependencies:
    @modelcontextprotocol/sdk, tsdav, imapflow, nodemailer, zod, dotenv
  Create tsconfig.json targeting ES2022 with NodeNext module resolution.
  Create .env.example with ICLOUD_EMAIL and ICLOUD_APP_PASSWORD placeholders.
  Create .gitignore ignoring node_modules, dist, .env.
  Create the src/ directory structure from the plan."
```

Alternatively, do it manually:

```bash
npm init -y
npm install @modelcontextprotocol/sdk tsdav imapflow nodemailer zod dotenv
npm install -D typescript @types/node @types/nodemailer
npx tsc --init
```

### Phase 2: Build Core Infrastructure

Build these files first — every tool depends on them:

```bash
claude "Read the project plan in PROJECT_PLAN.md.
  Build these core files:
  1. src/constants.ts — IMAP/SMTP/CalDAV/CardDAV server URLs and ports
  2. src/auth.ts — credential loader from env vars with validation
  3. src/utils/errors.ts — centralized error handler
  4. src/utils/formatters.ts — markdown + JSON response formatters
  5. src/utils/pagination.ts — shared offset/limit pagination
  6. src/types.ts — shared interfaces (EmailMessage, CalendarEvent, etc.)
  7. src/index.ts — McpServer initialization with stdio transport"
```

### Phase 3: Build Service Clients

These wrap the protocol libraries into clean async interfaces:

```bash
# Start with mail — easiest to test
claude "Build src/services/imap-client.ts:
  - Use imapflow to connect to imap.mail.me.com:993
  - Implement: connect, listFolders, listMessages, searchMessages,
    getMessage, moveMessage
  - Connection pooling with auto-reconnect
  - Return clean TypeScript objects, not raw IMAP data"

claude "Build src/services/smtp-client.ts:
  - Use nodemailer with SMTP transport to smtp.mail.me.com:587
  - Implement: sendEmail(to, subject, body, cc?, bcc?)
  - STARTTLS authentication"

claude "Build src/services/caldav-client.ts:
  - Use tsdav to connect to caldav.icloud.com
  - Implement: listCalendars, getEvents(dateRange), getEvent(id),
    createEvent, updateEvent, deleteEvent
  - Also handle VTODO for reminders: listTodoLists, getTodos,
    createTodo, completeTodo, deleteTodo
  - Parse .ics responses into clean TypeScript objects"

claude "Build src/services/carddav-client.ts:
  - Use tsdav to connect to contacts.icloud.com
  - Implement: listContacts, searchContacts, getContact,
    createContact, updateContact
  - Parse vCard responses into clean objects"
```

### Phase 4: Build Tools (Domain by Domain)

Register each tool group on the McpServer:

```bash
# Mail tools first (most useful, easiest to verify)
claude "Build src/schemas/mail.ts and src/tools/mail.ts:
  Register 6 tools on the McpServer: apple_mail_list, apple_mail_search,
  apple_mail_read, apple_mail_folders, apple_mail_send, apple_mail_move.
  Use Zod schemas for input validation.
  Follow MCP best practices: annotations, descriptive names, pagination.
  Each tool should support response_format: 'markdown' | 'json'."

# Then calendar
claude "Build src/schemas/calendar.ts and src/tools/calendar.ts:
  Register 6 calendar tools. Parse iCalendar data into readable summaries."

# Then contacts
claude "Build src/schemas/contacts.ts and src/tools/contacts.ts:
  Register 5 contacts tools. Parse vCard data into readable format."

# Then reminders
claude "Build src/schemas/reminders.ts and src/tools/reminders.ts:
  Register 5 reminders tools using CalDAV VTODO components."
```

### Phase 5: Wire Everything Together

```bash
claude "Update src/index.ts to:
  1. Load dotenv config
  2. Initialize McpServer with name 'apple-mcp-server', version '1.0.0'
  3. Import and register all tool groups
  4. Support both stdio (default) and streamable HTTP (--http flag) transports
  5. Add graceful shutdown handling"
```

### Phase 6: Test

#### 6a. Compile and check for errors
```bash
npx tsc --noEmit              # Type-check without emitting
npm run build                  # Full build to dist/
```

#### 6b. Test with MCP Inspector
```bash
# The MCP Inspector is a visual tool for testing MCP servers
npx @modelcontextprotocol/inspector node dist/index.js

# This opens a web UI where you can:
# - See all registered tools
# - Call tools with sample inputs
# - Inspect responses
```

#### 6c. Test with Claude Code directly
```bash
# Add to Claude Code's MCP config (~/.claude/claude_code_config.json):
#
# {
#   "mcpServers": {
#     "apple": {
#       "command": "node",
#       "args": ["/path/to/apple-mcp-server/dist/index.js"],
#       "env": {
#         "ICLOUD_EMAIL": "you@icloud.com",
#         "ICLOUD_APP_PASSWORD": "xxxx-xxxx-xxxx-xxxx"
#       }
#     }
#   }
# }

# Then in Claude Code:
claude "List my recent iCloud emails from today"
claude "What events do I have this week on my iCloud calendar?"
claude "Search my contacts for John"
claude "Show my incomplete reminders"
```

#### 6d. Write automated tests
```bash
claude "Create a tests/ directory with:
  1. tests/services/imap-client.test.ts — mock imapflow, test parsing
  2. tests/services/caldav-client.test.ts — mock tsdav, test ICS parsing
  3. tests/tools/mail.test.ts — test tool input validation via Zod
  4. tests/tools/calendar.test.ts — test date range validation
  Use vitest as the test runner."
```

### Phase 7: Documentation

```bash
claude "Create a comprehensive README.md covering:
  1. What this MCP server does (with screenshots/examples)
  2. Prerequisites (Node 18+, app-specific password)
  3. Installation (npm install / npx)
  4. Configuration (env vars, .env file)
  5. Usage with Claude Code (config snippet)
  6. Usage with Claude.ai (if applicable via HTTP transport)
  7. Available tools table with descriptions
  8. Troubleshooting (common IMAP/CalDAV errors)
  9. Development (how to build, test, contribute)"
```

### Phase 8: Deploy / Distribute

#### Option A: Local (stdio) — simplest, use with Claude Code
```bash
# Just build and point Claude Code at the compiled JS
npm run build
# Add to ~/.claude/claude_code_config.json as shown in Phase 6c
```

#### Option B: npm package — shareable
```bash
# Add bin entry to package.json:
#   "bin": { "apple-mcp-server": "dist/index.js" }
# Users install globally:
npm install -g apple-mcp-server
# Then configure Claude Code to use: "command": "apple-mcp-server"
```

#### Option C: Docker — isolated, reproducible
```bash
# Create Dockerfile:
#   FROM node:20-slim
#   WORKDIR /app
#   COPY package*.json ./
#   RUN npm ci --production
#   COPY dist/ ./dist/
#   CMD ["node", "dist/index.js"]

docker build -t apple-mcp-server .
docker run --env-file .env apple-mcp-server
```

#### Option D: Streamable HTTP — remote access
```bash
# Run with HTTP transport for remote access:
node dist/index.js --transport http --port 8000

# Then any MCP client can connect to:
# http://your-server:8000/mcp
```

---

## Testing Checklist

| Test                                      | Command / Method                        |
|-------------------------------------------|-----------------------------------------|
| TypeScript compiles                       | `npx tsc --noEmit`                      |
| All tools appear in MCP Inspector         | `npx @modelcontextprotocol/inspector`   |
| IMAP auth works                           | Call `apple_mail_folders` in Inspector   |
| CalDAV auth works                         | Call `apple_cal_list` in Inspector       |
| CardDAV auth works                        | Call `apple_contacts_list` in Inspector  |
| Email search returns results              | Call `apple_mail_search` with a keyword  |
| Calendar events parse correctly           | Call `apple_cal_events` for this week    |
| Send email works                          | Call `apple_mail_send` to yourself       |
| Create/complete reminder round-trips      | Create then complete in Inspector        |
| Claude Code integration works             | `claude "list my iCloud emails"`         |
| Unit tests pass                           | `npm test`                              |
| Error messages are helpful                | Test with wrong password                 |

---

## Key Libraries

| Library                           | Purpose                               | Docs                                      |
|-----------------------------------|---------------------------------------|-------------------------------------------|
| `@modelcontextprotocol/sdk`       | MCP server framework                  | modelcontextprotocol.io                   |
| `tsdav`                           | CalDAV + CardDAV client               | github.com/natelindev/tsdav               |
| `imapflow`                        | Modern async IMAP client              | github.com/postalsys/imapflow             |
| `nodemailer`                      | SMTP email sending                    | nodemailer.com                            |
| `zod`                             | Runtime input validation              | zod.dev                                   |
| `dotenv`                          | Environment variable loading          | npmjs.com/package/dotenv                  |
| `vitest`                          | Unit test runner                      | vitest.dev                                |

---

## Security Considerations

1. **Never commit `.env`** — it contains your app-specific password
2. **App-specific password scope** — it has full iCloud access; treat it like
   a master password
3. **Read-only by default** — write tools (send, create, delete) should require
   explicit confirmation in the MCP client
4. **No credential logging** — never log passwords, even to stderr
5. **Connection encryption** — IMAP uses SSL (993), SMTP uses STARTTLS (587),
   CalDAV/CardDAV use HTTPS

---

## What This Won't Cover (Apple Limitations)

| Service         | Why Not                                                    |
|-----------------|------------------------------------------------------------|
| iCloud Drive    | Requires CloudKit + Apple Developer account                |
| iCloud Notes    | No standard protocol access (proprietary sync)             |
| iCloud Keychain | End-to-end encrypted, no API                               |
| Messages/iMessage| macOS-only via AppleScript (not cross-platform)           |
| Find My         | No public API                                             |

---

## Quick-Start Summary (TL;DR)

```bash
# 1. Scaffold
mkdir apple-mcp-server && cd apple-mcp-server
npm init -y
npm install @modelcontextprotocol/sdk tsdav imapflow nodemailer zod dotenv
npm install -D typescript @types/node @types/nodemailer vitest

# 2. Build with Claude Code
claude "Read PROJECT_PLAN.md and build Phase 2 (core infrastructure)"
claude "Build Phase 3 (service clients)"
claude "Build Phase 4 (tools)"
claude "Build Phase 5 (wire up index.ts)"

# 3. Compile
npx tsc

# 4. Test
npx @modelcontextprotocol/inspector node dist/index.js

# 5. Use
# Add to ~/.claude/claude_code_config.json and start asking Claude about your email
```
