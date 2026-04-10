# Apple MCP Server

TypeScript MCP server connecting Claude to Apple iCloud services (Mail, Calendar, Contacts, Reminders) via standard protocols (IMAP/SMTP/CalDAV/CardDAV).

## Quick Reference

```bash
npm run build          # Compile TypeScript → dist/
npm run dev            # Watch mode (tsx --watch src/index.ts)
npm run test           # Run vitest
npm run test:watch     # Vitest in watch mode
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm run inspect        # Launch MCP Inspector against dist/index.js
```

## Tech Stack

- **Runtime:** Node.js 18+ with ES modules (NOT CommonJS)
- **Language:** TypeScript 5.x, strict mode, ES2022 target, NodeNext module resolution
- **MCP SDK:** `@modelcontextprotocol/sdk` — use `McpServer` class and `server.registerTool()` (NOT deprecated `server.tool()`)
- **IMAP:** `imapflow` — async IMAP client
- **SMTP:** `nodemailer` — email sending
- **CalDAV/CardDAV:** `tsdav` — handles both calendar and contacts for iCloud
- **Validation:** `zod` — runtime input schemas for all tool inputs
- **Testing:** `vitest`
- **Config:** `dotenv` — loads `.env` file at startup via `src/config.ts` (the ONLY file that reads `process.env`)

## Architecture

See @PROJECT_PLAN.md for full tool list and design rationale.

```
src/
├── index.ts              # Entry point: McpServer init, transport, tool registration
├── constants.ts          # IMAP_SERVER, SMTP_SERVER, CALDAV_URL, CARDDAV_URL, ports
├── types.ts              # Shared interfaces: EmailMessage, CalendarEvent, Contact, Reminder
├── config.ts             # Single source for credentials: reads .env via dotenv, validates, exports
├── auth.ts               # Auth helpers: builds IMAP/SMTP/CalDAV/CardDAV auth objects from config
├── services/
│   ├── imap-client.ts    # IMAP wrapper (imapflow): connect, list, search, fetch, move
│   ├── smtp-client.ts    # SMTP wrapper (nodemailer): sendEmail
│   ├── caldav-client.ts  # CalDAV wrapper (tsdav): calendars, events, reminders (VTODO)
│   └── carddav-client.ts # CardDAV wrapper (tsdav): contacts CRUD
├── tools/
│   ├── mail.ts           # 6 tools: apple_mail_{list,search,read,folders,send,move}
│   ├── calendar.ts       # 6 tools: apple_cal_{list,events,get_event,create,update,delete}
│   ├── contacts.ts       # 5 tools: apple_contacts_{list,search,get,create,update}
│   └── reminders.ts      # 5 tools: apple_reminders_{lists,items,create,complete,delete}
├── schemas/
│   ├── mail.ts           # Zod schemas for mail tool inputs
│   ├── calendar.ts       # Zod schemas for calendar tool inputs
│   ├── contacts.ts       # Zod schemas for contacts tool inputs
│   └── reminders.ts      # Zod schemas for reminders tool inputs
└── utils/
    ├── formatters.ts     # toMarkdown() / toJSON() response formatting
    ├── errors.ts         # handleError() — maps protocol errors to actionable messages
    └── pagination.ts     # Shared offset/limit/has_more logic
```

## Code Conventions

- **ES modules only.** Use `import/export`, never `require()`. All imports must include `.js` extension for local files (e.g., `import { auth } from './auth.js'`).
- **Tool naming:** `apple_{service}_{action}` in snake_case (e.g., `apple_mail_list`, `apple_cal_create`).
- **Every tool must have:** `name`, `title`, `description`, `inputSchema` (Zod), and `annotations` (readOnlyHint, destructiveHint, idempotentHint, openWorldHint).
- **Every tool must support** `response_format: 'markdown' | 'json'` parameter. Default to markdown.
- **Zod schemas** go in `src/schemas/`, tool registration in `src/tools/`. Do not inline large schemas in tool files.
- **Service clients** receive credentials from `src/config.ts` via import. Do NOT call `process.env` anywhere except `config.ts`.
- **Error messages must be actionable.** Bad: `"Error: 403"`. Good: `"Permission denied. Verify your app-specific password at https://appleid.apple.com"`.
- **No credential logging.** Never log passwords or tokens, even to stderr.
- **async/await** for all I/O. No callbacks, no `.then()` chains.
- **Centralize shared logic.** Formatting, error handling, and pagination are in `src/utils/`. Do not duplicate.

## Apple iCloud Endpoints

| Protocol | Server                        | Port | Auth                    |
|----------|-------------------------------|------|-------------------------|
| IMAP     | `imap.mail.me.com`           | 993  | SSL + app-specific pwd  |
| SMTP     | `smtp.mail.me.com`           | 587  | STARTTLS + app-specific pwd |
| CalDAV   | `https://caldav.icloud.com/` | 443  | Basic auth (app-specific pwd) |
| CardDAV  | `https://contacts.icloud.com/` | 443 | Basic auth (app-specific pwd) |

## Gotchas & Warnings

- **IMPORTANT:** `tsdav` requires `authMethod: 'basic'` and `defaultAccountType: 'caldav'` (or `'carddav'`) when connecting to iCloud. Do NOT use digest auth.
- **IMPORTANT:** iCloud CalDAV returns VTODO items (reminders) on the same endpoint as VCALENDAR. Filter by component type, not by URL.
- **IMPORTANT:** IMAP folder names for iCloud use the format `INBOX`, `Sent Messages`, `Drafts`, `Deleted Messages`, `Junk`, `Archive`. Note the spaces — always quote folder names in IMAP SELECT commands.
- `imapflow` connections must be explicitly closed after each operation. Use try/finally or the client's built-in connection management.
- iCloud CalDAV calendar discovery requires a PROPFIND on the principal URL first. `tsdav`'s `fetchCalendars()` handles this automatically.
- vCard 3.0 (iCloud's format) uses `\n` for line breaks inside field values and `;` for structured name components. Parse carefully.
- When creating events/todos via CalDAV, you MUST generate a unique UID (use `crypto.randomUUID()`).

## Credential Configuration

Credentials are loaded from a `.env` file in the project root via `dotenv`. This file is **never committed to Git**.

**Three files work together:**

| File              | Git tracked? | Purpose                                          |
|-------------------|--------------|--------------------------------------------------|
| `.env.example`    | YES          | Template showing required keys (no real values)  |
| `.env`            | **NO**       | User's actual credentials — loaded at runtime    |
| `.gitignore`      | YES          | Blocks `.env` from being committed               |

**IMPORTANT:** `src/config.ts` is the single module that reads `.env` via `dotenv`. All other code imports credentials from `config.ts` — never call `process.env` directly outside of `config.ts`. This keeps credential access centralized and testable.

**IMPORTANT:** `src/config.ts` must call `dotenv.config()` at import time and export a validated config object. If required keys are missing, throw immediately with a message that tells the user to copy `.env.example` to `.env` and fill in values.

**Config pattern:**
```typescript
// src/config.ts
import dotenv from 'dotenv';
dotenv.config();

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(
      `Missing ${key}. Copy .env.example to .env and fill in your credentials.\n` +
      `  cp .env.example .env\n` +
      `Generate an app-specific password at https://appleid.apple.com`
    );
  }
  return val;
}

export const config = {
  icloud: {
    email: requireEnv('ICLOUD_EMAIL'),
    appPassword: requireEnv('ICLOUD_APP_PASSWORD'),
  },
} as const;
```

**User setup flow (documented in README):**
```bash
cp .env.example .env        # Step 1: copy template
# Step 2: edit .env with real values
# Step 3: npm run build && npm run inspect
```

## Testing

- Unit tests go in `tests/` mirroring `src/` structure (e.g., `tests/services/imap-client.test.ts`).
- Mock all external connections (`imapflow`, `tsdav`, `nodemailer`) — tests must not hit real iCloud servers.
- Test Zod schemas with both valid and invalid inputs.
- For integration testing against real iCloud: `npm run inspect` to open MCP Inspector, call tools manually.

## Git Workflow

- Branch per feature: `feat/mail-tools`, `feat/calendar-tools`, etc.
- Commit messages: `feat:`, `fix:`, `docs:`, `test:`, `refactor:` prefixes.
- Never commit `.env` — it contains the app-specific password.

## When Compacting

Preserve: the full file tree, which tools are implemented vs. pending, any failing tests, and the current build status.
